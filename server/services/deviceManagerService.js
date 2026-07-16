const {
  listDevices,
  listDevicesForMap,
  listActiveDeviceMapRoutes,
  getDeviceSummaryById,
  getLatestHealthRecord,
  getTotalDistressCount,
  getTotalMessageCount,
  getTotalAuditCount
} = require('../repositories/deviceManagerRepository');
const { decryptText } = require('./encryptionService');

const ONLINE_THRESHOLD_MS = 2 * 60 * 1000;
const STALE_THRESHOLD_MS = 10 * 60 * 1000;

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

  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)) {
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

function latestActivityAt(row) {
  const candidates = [
    parseDate(row.lastSyncAt),
    parseDate(row.nodeLastSeenAt),
    parseDate(row.deviceLastSeenAt)
  ].filter(Boolean);

  if (candidates.length === 0) {
    return null;
  }

  return new Date(Math.max(...candidates.map((date) => date.getTime())));
}

function getConnectivityStatus(row) {
  if (row.deviceStatus === 'revoked') {
    return 'revoked';
  }

  const latestActivity = latestActivityAt(row);

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

function statusLabel(value) {
  const normalized = String(value || '').toLowerCase();

  if (normalized === 'revoked') return 'Revoked';
  if (normalized === 'online') return 'Online';
  if (normalized === 'stale') return 'Stale';
  if (normalized === 'offline') return 'Offline';
  if (normalized === 'inactive') return 'Inactive';
  if (normalized === 'active') return 'Active';
  if (normalized === 'dispatched') return 'Dispatched';

  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : 'Unknown';
}

function parseCoordinates(value) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => Array.isArray(item) && item.length >= 2) : [];
  } catch (error) {
    return [];
  }
}

function fullName(firstName, middleName, lastName) {
  return [firstName, middleName, lastName].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

function summaryResponse(row) {
  const connectivityStatus = getConnectivityStatus(row);

  return {
    id: row.id,
    nodeId: row.nodeId,
    nodeName: row.nodeName,
    deviceStatus: row.deviceStatus,
    deviceStatusLabel: statusLabel(row.deviceStatus),
    nodeStatus: row.nodeStatus || 'unknown',
    nodeStatusLabel: statusLabel(row.nodeStatus),
    connectivityStatus,
    connectivityStatusLabel: statusLabel(connectivityStatus),
    lastSeenAt: toIsoTimestamp(row.nodeLastSeenAt || row.deviceLastSeenAt),
    lastSyncAt: toIsoTimestamp(row.lastSyncAt),
    latitude: row.latitude,
    longitude: row.longitude,
    usersConnected: Number(row.usersConnected || 0),
    pendingCommandCount: Number(row.pendingCommandCount || 0),
    recentActiveDistressCount: Number(row.recentActiveDistressCount || 0),
    recentSolvedDistressCount: Number(row.recentSolvedDistressCount || 0),
    recentCanceledDistressCount: Number(row.recentCanceledDistressCount || 0),
    recentDistressCount:
      Number(row.recentActiveDistressCount || 0) +
      Number(row.recentSolvedDistressCount || 0) +
      Number(row.recentCanceledDistressCount || 0),
    recentMessageCount: Number(row.recentMessageCount || 0),
    recentAuditCount: Number(row.recentAuditCount || 0)
  };
}

function mapStatusResponse(row) {
  const summary = summaryResponse(row);
  const activeDistressCount = Number(row.activeDistressCount || 0);
  const hasActiveDistress = activeDistressCount > 0;
  let mapStatus = 'offline';
  let mapStatusLabel = 'Offline';

  if (hasActiveDistress) {
    mapStatus = 'distressed';
    mapStatusLabel = 'Distressed';
  } else if (summary.connectivityStatus === 'online') {
    mapStatus = 'active';
    mapStatusLabel = 'Active';
  } else if (summary.connectivityStatus === 'stale') {
    mapStatus = 'stale';
    mapStatusLabel = 'Stale';
  }

  return {
    id: summary.id,
    nodeId: summary.nodeId,
    nodeName: summary.nodeName,
    latitude: row.latitude,
    longitude: row.longitude,
    deviceStatus: summary.deviceStatus,
    deviceStatusLabel: summary.deviceStatusLabel,
    connectivityStatus: summary.connectivityStatus,
    connectivityStatusLabel: summary.connectivityStatusLabel,
    mapStatus,
    mapStatusLabel,
    lastSeenAt: summary.lastSeenAt,
    lastSyncAt: summary.lastSyncAt,
    usersConnected: summary.usersConnected,
    hasActiveDistress,
    activeDistressCount,
    activeDistress: hasActiveDistress ? {
      distressCode: row.activeDistressCode || null,
      userCode: row.activeDistressUserCode || null,
      firstName: row.activeDistressFirstName || null,
      lastName: row.activeDistressLastName || null,
      fullName: [row.activeDistressFirstName, row.activeDistressLastName].filter(Boolean).join(' ').trim() || null,
      phone: row.activeDistressPhone || null,
      reason: row.activeDistressReason || null,
      priority: row.activeDistressPriority || null,
      timestamp: toIsoTimestamp(row.activeDistressTimestamp)
    } : null
  };
}

async function getDeviceSummaries() {
  const rows = await listDevices();
  return rows.map(summaryResponse);
}

async function getDeviceMapSummaries() {
  const rows = await listDevicesForMap();
  return rows.map(mapStatusResponse);
}

function routeOverlayResponse(row) {
  const coordinates = parseCoordinates(row.geometryJson);

  if (coordinates.length < 2) {
    return null;
  }

  const teamLeaderName = fullName(
    decryptText(row.leaderFirstNameEnc),
    decryptText(row.leaderMiddleNameEnc),
    decryptText(row.leaderLastNameEnc)
  );

  return {
    deploymentId: row.deploymentId,
    deploymentCode: row.deploymentCode,
    teamId: row.teamId,
    teamCode: row.teamCode || '',
    teamName: row.teamName || '',
    teamStatus: row.teamStatus || 'unknown',
    teamStatusLabel: statusLabel(row.teamStatus),
    teamLeaderRescuerId: row.teamLeaderRescuerId,
    teamLeaderName: teamLeaderName || row.teamCode || row.deploymentCode,
    distressId: row.distressId,
    distressCode: row.distressCode || '',
    distressReason: row.distressReason || '',
    originNodeId: row.originNodeId || row.distressOriginNodeId || '',
    originNodeName: row.originNodeName || row.originNodeId || row.distressOriginNodeId || 'Unknown node',
    distressLatitude: row.distressLatitude,
    distressLongitude: row.distressLongitude,
    leaderLatitude: row.leaderLatitude,
    leaderLongitude: row.leaderLongitude,
    leaderRecordedAt: toIsoTimestamp(row.leaderRecordedAt),
    etaMinutes: row.etaMinutes !== null && row.etaMinutes !== undefined ? Number(row.etaMinutes) : null,
    distanceM: row.distanceM !== null && row.distanceM !== undefined ? Number(row.distanceM) : null,
    durationS: row.durationS !== null && row.durationS !== undefined ? Number(row.durationS) : null,
    routeUpdatedAt: toIsoTimestamp(row.routeUpdatedAt || row.deploymentUpdatedAt || row.deployedAt),
    coordinates
  };
}

async function getDeviceMapRoutes() {
  const rows = await listActiveDeviceMapRoutes();
  return rows
    .map(routeOverlayResponse)
    .filter(Boolean);
}

async function getDeviceDetails(id) {
  const row = await getDeviceSummaryById(id);

  if (!row) {
    return null;
  }

  const [health, totalDistressCount, totalMessageCount, totalAuditCount] = await Promise.all([
    getLatestHealthRecord(row.nodeId),
    getTotalDistressCount(row.nodeId),
    getTotalMessageCount(row.nodeId),
    getTotalAuditCount(row.nodeId)
  ]);

  const summary = summaryResponse(row);

  return {
    ...summary,
    allowedIp: row.allowedIp || null,
    createdAt: toIsoTimestamp(row.createdAt),
    updatedAt: toIsoTimestamp(row.updatedAt),
    latestHealth: health ? {
      batteryVoltage: health.batteryVoltage,
      signalStrength: health.signalStrength,
      gpsStatus: health.gpsStatus || 'unknown',
      cpuTemp: health.cpuTemp,
      storageRemaining: health.storageRemaining,
      ramUsage: health.ramUsage,
      recordedAt: toIsoTimestamp(health.recordedAt)
    } : null,
    latestNode: {
      latitude: row.latitude,
      longitude: row.longitude,
      status: row.nodeStatus || 'unknown',
      statusLabel: statusLabel(row.nodeStatus),
      usersConnected: Number(row.usersConnected || 0),
      lastSeenAt: toIsoTimestamp(row.nodeLastSeenAt || row.deviceLastSeenAt)
    },
    activity: {
      recentActiveDistressCount: Number(row.recentActiveDistressCount || 0),
      recentSolvedDistressCount: Number(row.recentSolvedDistressCount || 0),
      recentCanceledDistressCount: Number(row.recentCanceledDistressCount || 0),
      recentDistressCount:
        Number(row.recentActiveDistressCount || 0) +
        Number(row.recentSolvedDistressCount || 0) +
        Number(row.recentCanceledDistressCount || 0),
      recentMessageCount: Number(row.recentMessageCount || 0),
      recentAuditCount: Number(row.recentAuditCount || 0),
      pendingCommandCount: Number(row.pendingCommandCount || 0),
      totalDistressCount: Number(totalDistressCount?.count || 0),
      totalActiveDistressCount: Number(totalDistressCount?.activeCount || 0),
      totalSolvedDistressCount: Number(totalDistressCount?.solvedCount || 0),
      totalCanceledDistressCount: Number(totalDistressCount?.canceledCount || 0),
      totalMessageCount: Number(totalMessageCount?.count || 0),
      totalAuditCount: Number(totalAuditCount?.count || 0)
    }
  };
}

module.exports = {
  getDeviceSummaries,
  getDeviceMapSummaries,
  getDeviceMapRoutes,
  getDeviceDetails
};
