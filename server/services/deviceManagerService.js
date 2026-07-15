const {
  listDevices,
  getDeviceSummaryById,
  getLatestHealthRecord,
  getTotalDistressCount,
  getTotalMessageCount,
  getTotalAuditCount
} = require('../repositories/deviceManagerRepository');

const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;
const STALE_THRESHOLD_MS = 30 * 60 * 1000;

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

async function getDeviceSummaries() {
  const rows = await listDevices();
  return rows.map(summaryResponse);
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
  getDeviceDetails
};
