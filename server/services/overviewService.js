const {
  getOverviewCounts,
  listDeviceActivityRows,
  listDistressTrendRows,
  listRecentEmergencyRows,
  listRecentNotificationRows
} = require('../repositories/overviewRepository');

const ONLINE_THRESHOLD_MS = 2 * 60 * 1000;
const STALE_THRESHOLD_MS = 10 * 60 * 1000;

function numberValue(value) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeTimestampValue(value) {
  if (!value || typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.includes('T') || /[zZ]$/.test(trimmed)) return trimmed;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(trimmed)) {
    return `${trimmed.replace(' ', 'T')}Z`;
  }

  return trimmed;
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(normalizeTimestampValue(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIsoTimestamp(value) {
  const date = parseDate(value);
  return date ? date.toISOString() : null;
}

function latestDeviceActivityAt(row) {
  const candidates = [
    parseDate(row.lastSyncAt),
    parseDate(row.nodeLastSeenAt),
    parseDate(row.deviceLastSeenAt)
  ].filter(Boolean);

  if (candidates.length === 0) return null;
  return new Date(Math.max(...candidates.map((date) => date.getTime())));
}

function getConnectivityStatus(row) {
  if (row.deviceStatus === 'revoked') return 'revoked';

  const latest = latestDeviceActivityAt(row);
  if (!latest) return 'offline';

  const ageMs = Date.now() - latest.getTime();
  if (ageMs <= ONLINE_THRESHOLD_MS) return 'online';
  if (ageMs <= STALE_THRESHOLD_MS) return 'stale';
  return 'offline';
}

function labelFromValue(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return 'Unknown';

  return normalized
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function titleCaseStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'Unknown';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function dateLabel(value) {
  const date = parseDate(value);
  if (!date) return 'Not available';

  return date.toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function buildStatCards(counts, deviceSummary) {
  return [
    {
      key: 'activeDistress',
      label: 'Active emergencies',
      value: numberValue(counts.activeDistressCount),
      detail: `${numberValue(counts.deployedDeploymentCount)} deployed response${numberValue(counts.deployedDeploymentCount) === 1 ? '' : 's'}`,
      tone: 'danger',
      icon: 'fa-triangle-exclamation'
    },
    {
      key: 'meshOnline',
      label: 'Online mesh nodes',
      value: deviceSummary.online,
      detail: `${deviceSummary.stale} stale, ${deviceSummary.offline} offline`,
      tone: 'success',
      icon: 'fa-tower-broadcast'
    },
    {
      key: 'responders',
      label: 'Available rescuers',
      value: numberValue(counts.availableRescuerCount),
      detail: `${numberValue(counts.dispatchedRescuerCount)} dispatched, ${numberValue(counts.unavailableRescuerCount)} unavailable`,
      tone: 'neutral',
      icon: 'fa-user-shield'
    },
    {
      key: 'accounts',
      label: 'Pending accounts',
      value: numberValue(counts.pendingUserCount),
      detail: `${numberValue(counts.approvedUserCount)} approved civilians`,
      tone: 'warning',
      icon: 'fa-users-gear'
    }
  ];
}

function buildDonut(counts) {
  return [
    { key: 'active', label: 'Active', value: numberValue(counts.activeDistressCount), color: '#e54b31' },
    { key: 'canceled', label: 'Canceled', value: numberValue(counts.canceledDistressCount), color: '#64717f' },
    { key: 'accomplished', label: 'Accomplished', value: numberValue(counts.accomplishedDeploymentCount), color: '#0e8b70' }
  ];
}

function buildReadinessBars(counts) {
  return [
    { key: 'availableRescuers', label: 'Available rescuers', value: numberValue(counts.availableRescuerCount), color: '#0e8b70' },
    { key: 'dispatchedRescuers', label: 'Dispatched rescuers', value: numberValue(counts.dispatchedRescuerCount), color: '#e54b31' },
    { key: 'unavailableRescuers', label: 'Unavailable rescuers', value: numberValue(counts.unavailableRescuerCount), color: '#64717f' },
    { key: 'activeTeams', label: 'Active teams', value: numberValue(counts.activeTeamCount), color: '#144f9d' },
    { key: 'dispatchedTeams', label: 'Dispatched teams', value: numberValue(counts.dispatchedTeamCount), color: '#ed8a19' },
    { key: 'inactiveTeams', label: 'Inactive teams', value: numberValue(counts.inactiveTeamCount), color: '#9aa5b1' }
  ];
}

function buildDeviceSummary(rows) {
  const summary = {
    online: 0,
    stale: 0,
    offline: 0,
    revoked: 0,
    total: rows.length,
    latestSyncAt: null
  };

  rows.forEach((row) => {
    const status = getConnectivityStatus(row);
    if (summary[status] !== undefined) summary[status] += 1;

    const latest = latestDeviceActivityAt(row);
    if (!latest) return;
    const currentLatest = parseDate(summary.latestSyncAt);
    if (!currentLatest || latest.getTime() > currentLatest.getTime()) {
      summary.latestSyncAt = latest.toISOString();
    }
  });

  return summary;
}

function shapeTrendRows(rows) {
  return rows.map((row) => ({
    day: row.day,
    label: parseDate(`${row.day}T00:00:00Z`)?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) || row.day,
    distressCount: numberValue(row.distressCount),
    messageCount: numberValue(row.messageCount)
  }));
}

function shapeEmergency(row) {
  const deploymentStatus = row.deploymentStatus || null;
  const signalStatus = String(row.status || 'active').toLowerCase();
  const status = deploymentStatus || (signalStatus === 'cancelled' ? 'canceled' : signalStatus);

  return {
    id: row.id,
    distressCode: row.distressCode || `#${row.id}`,
    reason: labelFromValue(row.reason),
    status,
    statusLabel: titleCaseStatus(status),
    priority: titleCaseStatus(row.priority || 'high'),
    nodeId: row.nodeId,
    nodeName: row.nodeName || row.nodeId || 'Unknown node',
    deploymentCode: row.deploymentCode || null,
    teamCode: row.teamCode || null,
    teamName: row.teamName || null,
    timestamp: toIsoTimestamp(row.timestamp || row.updatedAt),
    displayTime: dateLabel(row.timestamp || row.updatedAt)
  };
}

function shapeNotification(row) {
  return {
    id: row.id,
    type: row.type || 'info',
    title: row.title || 'Notification',
    message: row.message || '',
    createdAt: toIsoTimestamp(row.createdAt),
    displayTime: dateLabel(row.createdAt),
    isRead: Boolean(row.readAt)
  };
}

async function getOverviewDashboard() {
  const [counts, deviceRows, trendRows, emergencyRows, notificationRows] = await Promise.all([
    getOverviewCounts(),
    listDeviceActivityRows(),
    listDistressTrendRows(),
    listRecentEmergencyRows(),
    listRecentNotificationRows()
  ]);

  const safeCounts = counts || {};
  const deviceSummary = buildDeviceSummary(deviceRows || []);

  return {
    generatedAt: new Date().toISOString(),
    stats: buildStatCards(safeCounts, deviceSummary),
    summaries: {
      emergencies: {
        active: numberValue(safeCounts.activeDistressCount),
        deployed: numberValue(safeCounts.deployedDeploymentCount),
        canceled: numberValue(safeCounts.canceledDistressCount),
        accomplished: numberValue(safeCounts.accomplishedDeploymentCount)
      },
      mesh: deviceSummary,
      responders: {
        rescuers: {
          available: numberValue(safeCounts.availableRescuerCount),
          dispatched: numberValue(safeCounts.dispatchedRescuerCount),
          unavailable: numberValue(safeCounts.unavailableRescuerCount)
        },
        teams: {
          active: numberValue(safeCounts.activeTeamCount),
          dispatched: numberValue(safeCounts.dispatchedTeamCount),
          inactive: numberValue(safeCounts.inactiveTeamCount)
        }
      },
      accounts: {
        pending: numberValue(safeCounts.pendingUserCount),
        approved: numberValue(safeCounts.approvedUserCount)
      },
      sync: {
        totalMessages: numberValue(safeCounts.totalMessageCount),
        healthLogs24h: numberValue(safeCounts.healthLog24hCount),
        latestSyncAt: deviceSummary.latestSyncAt
      }
    },
    charts: {
      emergencyOutcomes: buildDonut(safeCounts),
      readiness: buildReadinessBars(safeCounts),
      networkTrend: shapeTrendRows(trendRows || [])
    },
    recentEmergencies: (emergencyRows || []).map(shapeEmergency),
    recentNotifications: (notificationRows || []).map(shapeNotification)
  };
}

module.exports = {
  getOverviewDashboard
};
