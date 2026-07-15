const {
  getActiveDistressSignalById,
  findActiveDeploymentByDistressSignalId,
  getDeploymentById,
  listActiveAssignmentsForRescuer,
  findActiveAssignmentForRescuer,
  findActiveDeploymentByOrigin,
  getLatestDeployedAssignment,
  listPublicNodes,
  getNodeActiveDistress,
  upsertRescuerLocationCurrent,
  insertRescuerLocationHistory
} = require('../repositories/deploymentRepository');
const { accomplishDeployment } = require('./distressDeploymentService');
const {
  buildLiveRouteResponse,
  ensureDeploymentRouteSnapshot
} = require('./deploymentRouteService');

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

function assignmentSummary(row) {
  return {
    id: row.id,
    distress_id: row.meshDistressSignalId,
    status: row.status,
    assigned_at: row.deployedAt || row.createdAt,
    eta_minutes: row.etaMinutes ?? null,
    distress: {
      code: row.distressCode,
      reason: row.reason,
      latitude: row.latitude,
      longitude: row.longitude,
      timestamp: row.timestamp,
      priority: row.priority,
      user: {
        firstName: row.firstName,
        lastName: row.lastName,
        phone: row.phone,
        bloodType: row.bloodType,
        age: row.age
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

async function getRescuerAssignments(rescuer) {
  const rows = await listActiveAssignmentsForRescuer(rescuer.id);
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

  if (!assignment) {
    const error = new Error('No active deployment is assigned to this rescuer.');
    error.statusCode = 403;
    throw error;
  }

  const latitude = ensureCoordinate(payload.latitude, 'Latitude');
  const longitude = ensureCoordinate(payload.longitude, 'Longitude');
  const timestamp = new Date().toISOString();
  const location = {
    rescuerId: rescuer.id,
    deploymentId: assignment.id,
    teamId: assignment.teamId,
    latitude,
    longitude,
    accuracyM: payload.accuracy_m ?? payload.accuracy ?? null,
    headingDeg: payload.heading_deg ?? payload.heading ?? null,
    speedMps: payload.speed_mps ?? payload.speed ?? null,
    nodeId: payload.node_id ?? payload.nodeId ?? assignment.originNodeId,
    recordedAt: payload.recorded_at ?? payload.recordedAt ?? timestamp,
    receivedAt: timestamp,
    updatedAt: timestamp
  };

  await upsertRescuerLocationCurrent(location);
  await insertRescuerLocationHistory(location);

  const { snapshot } = await ensureDeploymentRouteSnapshot(assignment);

  return {
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
  return rows.map((row) => ({
    id: row.id,
    node_id: row.id,
    nodeId: row.id,
    name: row.name || row.id,
    latitude: row.latitude,
    longitude: row.longitude,
    status: row.status || 'offline',
    users: Number(row.users || 0),
    distress: Boolean(row.distress),
    active_distress_id: row.activeDistressId || null,
    lastSeen: row.lastSeen || null,
    last_seen: row.lastSeen || null
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
  getEtaByNodeId,
  getEtaByDistressId,
  getPublicNodes,
  getNodeDistress
};
