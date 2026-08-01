const {
  getActiveDistressSignalById,
  findActiveDeploymentByDistressSignalId,
  getDeploymentById,
  listAssignmentsForRescuer,
  listActiveAssignmentsForRescuer,
  findActiveAssignmentForRescuer,
  findActiveDeploymentByOrigin,
  getLatestDeployedAssignment,
  listActiveDeployedAssignments,
  listPublicNodes,
  getNodeActiveDistress,
  upsertRescuerLocationCurrent,
  insertRescuerLocationHistory,
  getRescuerLocationSharingSettingByRescuerId,
  upsertRescuerLocationSharingSetting,
  disableRescuerLocationSharingByRescuerId,
  listPublicSharedRescuers
} = require('../repositories/deploymentRepository');
const { accomplishDeployment } = require('./distressDeploymentService');
const { listPublicOnlineDistressSignals } = require('./civilianDistressService');
const {
  buildLiveRouteResponse,
  ensureDeploymentRouteSnapshot
} = require('./deploymentRouteService');
const { decryptText } = require('./encryptionService');

const ONLINE_THRESHOLD_MS = 2 * 60 * 1000;
const STALE_THRESHOLD_MS = 10 * 60 * 1000;
const SHARED_RESCUER_STALE_TIMEOUT_MS = 2 * 60 * 1000;

function ensurePositiveInteger(value) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function ensureCoordinate(value, label) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    const error = new Error(`${label} must be a valid coordinate.`);
    error.statusCode = 400;
    throw error;
  }

  return parsed;
}

function normalizeTimestampValue(value) {
  if (!value || typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (trimmed.includes('T') || /[zZ]$/.test(trimmed)) {
    return trimmed;
  }

  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(trimmed)) {
    return `${trimmed.replace(' ', 'T')}Z`;
  }

  return trimmed;
}

function parseDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(normalizeTimestampValue(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIsoTimestamp(value) {
  const date = parseDate(value);
  return date ? date.toISOString() : null;
}

function latestNodeActivityAt(row) {
  const candidates = [
    parseDate(row.lastSyncAt),
    parseDate(row.lastSeen),
    parseDate(row.deviceLastSeen)
  ].filter(Boolean);

  if (!candidates.length) {
    return null;
  }

  return new Date(Math.max(...candidates.map((date) => date.getTime())));
}

function getPublicNodeConnectivity(row) {
  if (row.deviceStatus === 'revoked') {
    return 'offline';
  }

  const latestActivity = latestNodeActivityAt(row);

  if (!latestActivity) {
    return 'offline';
  }

  const ageMs = Date.now() - latestActivity.getTime();

  if (ageMs <= ONLINE_THRESHOLD_MS) {
    return 'online';
  }

  if (ageMs <= STALE_THRESHOLD_MS) {
    return 'stale';
  }

  return 'offline';
}

function assignmentSummary(row) {
  const statusTimestamp = row.status === 'accomplished'
    ? row.accomplishedAt
    : row.status === 'canceled'
      ? row.canceledAt
      : row.updatedAt;

  return {
    id: row.id,
    distress_id: row.meshDistressSignalId,
    online_distress_id: row.onlineDistressSignalId || null,
    distressSource: row.distressSource || 'mesh',
    status: row.status,
    assigned_at: row.deployedAt || row.createdAt,
    status_updated_at: statusTimestamp || row.updatedAt || row.deployedAt || row.createdAt,
    eta_minutes: row.etaMinutes ?? null,
    distress: {
      code: row.distressCode,
      reason: row.reason,
      latitude: row.latitude,
      longitude: row.longitude,
      timestamp: row.timestamp,
      priority: row.priority,
      distressSource: row.distressSource || 'mesh',
      user: {
        firstName: row.firstName,
        lastName: row.lastName,
        phone: row.phone,
        bloodType: row.bloodType,
        age: row.age,
        occupation: row.occupation || ''
      }
    },
    node: {
      id: row.originNodeId,
      name: row.nodeName || row.originNodeId
    },
    team: {
      id: row.teamId,
      code: row.teamCode || '',
      name: row.teamName || ''
    }
  };
}

function isRescuerSharingEligible(rescuer) {
  return Boolean(rescuer?.id) && String(rescuer?.accessStatus || '').trim().toLowerCase() === 'active';
}

function getAgencyLabel(agency) {
  switch (String(agency || '').trim().toLowerCase()) {
    case 'cdrrmo':
      return 'CDRRMO';
    case 'fire-department':
      return 'Fire Department';
    case 'police-department':
      return 'Police Department';
    default:
      return 'Rescue Department';
  }
}

async function getRescuerLocationSharingStatus(rescuer) {
  const setting = await getRescuerLocationSharingSettingByRescuerId(rescuer.id);
  const eligible = isRescuerSharingEligible(rescuer);

  return {
    rescuerId: rescuer.id,
    eligible,
    sharingEnabled: eligible && Boolean(setting?.sharingEnabled),
    enabledAt: eligible ? setting?.enabledAt || null : null,
    disabledAt: setting?.disabledAt || null,
    updatedAt: setting?.updatedAt || null,
    staleTimeoutSeconds: Math.floor(SHARED_RESCUER_STALE_TIMEOUT_MS / 1000),
  };
}

async function setRescuerLocationSharing(rescuer, enabled) {
  if (!isRescuerSharingEligible(rescuer)) {
    const error = new Error('This rescuer is not eligible for live location sharing.');
    error.statusCode = 403;
    throw error;
  }

  const timestamp = new Date().toISOString();
  await upsertRescuerLocationSharingSetting({
    rescuerId: rescuer.id,
    sharingEnabled: Boolean(enabled),
    enabledAt: enabled ? timestamp : null,
    disabledAt: enabled ? null : timestamp,
    updatedAt: timestamp,
    createdAt: timestamp,
  });

  return getRescuerLocationSharingStatus(rescuer);
}

async function disableRescuerLocationSharing(rescuerId) {
  if (!rescuerId) {
    return;
  }

  await disableRescuerLocationSharingByRescuerId(rescuerId, new Date().toISOString());
}

async function getRescuerAssignments(rescuer) {
  const rows = await listAssignmentsForRescuer(rescuer.id);
  return rows.map(assignmentSummary);
}

async function getRescuerLiveRoute(rescuer) {
  const assignment = await findActiveAssignmentForRescuer(rescuer.id);

  if (!assignment) {
    const error = new Error('No active assignment for this rescuer.');
    error.statusCode = 404;
    throw error;
  }

  const { location, snapshot } = await ensureDeploymentRouteSnapshot(assignment);
  return buildLiveRouteResponse(assignment, location, snapshot);
}

async function resolveRescuerAssignment(assignmentId, rescuer) {
  const requestedId = ensurePositiveInteger(assignmentId);

  if (!requestedId) {
    const error = new Error('Invalid assignment id.');
    error.statusCode = 400;
    throw error;
  }

  const assignments = await listActiveAssignmentsForRescuer(rescuer.id);
  const current = assignments.find((assignment) => assignment.id === requestedId);

  if (!current) {
    const error = new Error('Active assignment not found for this rescuer.');
    error.statusCode = 404;
    throw error;
  }

  return accomplishDeployment(requestedId);
}

async function updateRescuerLocation(rescuer, payload) {
  const assignment = await findActiveAssignmentForRescuer(rescuer.id);
  const sharingStatus = await getRescuerLocationSharingStatus(rescuer);

  if (!assignment && !sharingStatus.sharingEnabled) {
    return {
      accepted: false,
      trackingMode: 'idle',
      sharingEnabled: false,
      recordedAt: null,
      routeUpdatedAt: null
    };
  }

  const latitude = ensureCoordinate(payload.latitude, 'Latitude');
  const longitude = ensureCoordinate(payload.longitude, 'Longitude');
  const timestamp = new Date().toISOString();
  const location = {
    rescuerId: rescuer.id,
    deploymentId: assignment?.id || null,
    teamId: assignment?.teamId || rescuer.teamId || null,
    latitude,
    longitude,
    accuracyM: payload.accuracy_m ?? payload.accuracy ?? null,
    headingDeg: payload.heading_deg ?? payload.heading ?? null,
    speedMps: payload.speed_mps ?? payload.speed ?? null,
    nodeId: payload.node_id ?? payload.nodeId ?? assignment?.originNodeId ?? null,
    recordedAt: payload.recorded_at ?? payload.recordedAt ?? timestamp,
    receivedAt: timestamp,
    updatedAt: timestamp
  };

  await upsertRescuerLocationCurrent(location);
  await insertRescuerLocationHistory(location);

  let snapshot = null;
  if (assignment) {
    ({ snapshot } = await ensureDeploymentRouteSnapshot(assignment));
  }

  return {
    accepted: true,
    trackingMode: assignment ? 'assignment' : 'sharing',
    sharingEnabled: sharingStatus.sharingEnabled,
    recordedAt: location.recordedAt,
    routeUpdatedAt: snapshot?.updatedAt || null
  };
}

async function resolvePublicAssignment(nodeId, distressId) {
  if (distressId) {
    const distress = await getActiveDistressSignalById(distressId);

    if (distress) {
      return findActiveDeploymentByDistressSignalId(distress.id);
    }
  }

  if (nodeId) {
    const distress = await getNodeActiveDistress(nodeId);

    if (distress) {
      return findActiveDeploymentByOrigin(distress.originNodeId, distress.originDistressId);
    }
  }

  return getLatestDeployedAssignment();
}

async function getPublicLiveRoute({ nodeId = null, distressId = null } = {}) {
  const assignment = await resolvePublicAssignment(nodeId, distressId);

  if (!assignment) {
    const error = new Error('No active assignment found.');
    error.statusCode = 404;
    throw error;
  }

  const { location, snapshot } = await ensureDeploymentRouteSnapshot(assignment);
  return buildLiveRouteResponse(assignment, location, snapshot);
}

async function getPublicLiveRoutes() {
  const assignments = await listActiveDeployedAssignments();

  if (!assignments.length) {
    const error = new Error('No active assignment found.');
    error.statusCode = 404;
    throw error;
  }

  const routes = await Promise.all(assignments.map(async (assignment) => {
    const { location, snapshot } = await ensureDeploymentRouteSnapshot(assignment);
    return buildLiveRouteResponse(assignment, location, snapshot);
  }));

  return routes;
}

async function getEtaByNodeId(nodeId) {
  const route = await getPublicLiveRoute({ nodeId });
  return route.route.eta_minutes;
}

async function getEtaByDistressId(distressId) {
  const route = await getPublicLiveRoute({ distressId });
  return route.route.eta_minutes;
}

async function getPublicNodes() {
  const rows = await listPublicNodes();
  return rows.map((row) => {
    const connectivityStatus = getPublicNodeConnectivity(row);
    const latestActivity = latestNodeActivityAt(row);
    const latestActivityIso = latestActivity ? latestActivity.toISOString() : null;

    return {
      id: row.id,
      node_id: row.id,
      nodeId: row.id,
      name: row.name || row.id,
      latitude: row.latitude,
      longitude: row.longitude,
      status: connectivityStatus === 'online' ? 'active' : connectivityStatus,
      nodeStatus: row.status || 'unknown',
      deviceStatus: row.deviceStatus || null,
      connectivityStatus,
      users: Number(row.users || 0),
      signal: row.signal ?? null,
      rssi: row.rssi ?? null,
      signalStrengthDbm: row.signalStrengthDbm ?? null,
      signalReportedByNodeId: row.signalReportedByNodeId || null,
      signalLastSeenAt: toIsoTimestamp(row.signalLastSeenAt),
      signalHealthRecordedAt: toIsoTimestamp(row.signalHealthRecordedAt),
      distress: Boolean(row.distress),
      active_distress_id: row.activeDistressId || null,
      lastSeen: latestActivityIso,
      last_seen: latestActivityIso,
      nodeLastSeen: toIsoTimestamp(row.lastSeen),
      deviceLastSeen: toIsoTimestamp(row.deviceLastSeen),
      lastSyncAt: toIsoTimestamp(row.lastSyncAt)
    };
  });
}

async function getOnlineDistressMarkers() {
  return listPublicOnlineDistressSignals();
}

async function getPublicSharedRescuers() {
  const cutoffTimestamp = new Date(Date.now() - SHARED_RESCUER_STALE_TIMEOUT_MS).toISOString();
  const rows = await listPublicSharedRescuers(cutoffTimestamp);

  return rows.map((row) => ({
    id: row.id,
    rescuerCode: row.rescuerCode,
    firstName: decryptText(row.firstNameEnc) || 'Rescuer',
    phone: decryptText(row.phoneEnc) || '',
    department: getAgencyLabel(row.agency),
    latitude: row.latitude,
    longitude: row.longitude,
    accuracyM: row.accuracyM ?? null,
    headingDeg: row.headingDeg ?? null,
    speedMps: row.speedMps ?? null,
    nodeId: row.nodeId ?? null,
    lastUpdated: toIsoTimestamp(row.recordedAt) || toIsoTimestamp(row.updatedAt),
    staleTimeoutSeconds: Math.floor(SHARED_RESCUER_STALE_TIMEOUT_MS / 1000),
    team: row.teamId ? {
      id: row.teamId,
      code: row.teamCode || '',
      name: row.teamName || '',
    } : null,
  }));
}

async function getNodeDistress(nodeId) {
  const distress = await getNodeActiveDistress(nodeId);

  if (!distress) {
    return null;
  }

  return {
    id: distress.id,
    code: distress.distressCode,
    reason: distress.reason,
    lat: distress.latitude,
    lng: distress.longitude,
    timestamp: distress.timestamp,
    status: distress.status,
    priority: distress.priority,
    user: {
      firstName: distress.firstName,
      lastName: distress.lastName,
      phone: distress.phone,
      bloodType: distress.bloodType,
      age: distress.age
    }
  };
}

module.exports = {
  getRescuerAssignments,
  getRescuerLiveRoute,
  resolveRescuerAssignment,
  updateRescuerLocation,
  getPublicLiveRoute,
  getPublicLiveRoutes,
  getEtaByNodeId,
  getEtaByDistressId,
  getPublicNodes,
  getNodeDistress,
  getOnlineDistressMarkers,
  getRescuerLocationSharingStatus,
  setRescuerLocationSharing,
  disableRescuerLocationSharing,
  getPublicSharedRescuers
};
