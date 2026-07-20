const {
  listDevices,
  listDevicesForMap,
  listActiveDeviceMapRoutes,
  getDeviceSummaryById,
  getLatestHealthRecord,
  getTotalDistressCount,
  getTotalMessageCount,
  getTotalAuditCount,
  listRecentMeshMessages,
  listMeshMessageFeed
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

function signalQuality(value) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric < -140 || numeric > -20) {
    return 'unknown';
  }

  if (numeric >= -70) return 'strong';
  if (numeric >= -85) return 'good';
  if (numeric >= -100) return 'weak';
  return 'poor';
}

function signalQualityLabel(value) {
  const quality = signalQuality(value);

  if (quality === 'strong') return 'Strong';
  if (quality === 'good') return 'Good';
  if (quality === 'weak') return 'Weak';
  if (quality === 'poor') return 'Poor';
  return 'Unknown';
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

function messageTypeLabel(value) {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'broadcast') return 'Broadcast';
  if (normalized === 'voice') return 'Voice';
  if (normalized === 'text') return 'Text';
  return normalized ? statusLabel(normalized) : 'Message';
}

function getConversationKey(message) {
  if (String(message.msgType || '').toLowerCase() === 'broadcast') {
    return 'BROADCAST';
  }

  return message.conversationNodeId || message.destinationNodeId || message.sourceNodeId || message.originNodeId || 'UNKNOWN';
}

function getConversationLabel(key) {
  if (key === 'BROADCAST') {
    return 'Broadcast channel';
  }

  if (key === 'UNKNOWN') {
    return 'Unknown mesh conversation';
  }

  return `Mesh node ${key}`;
}

function messageResponse(row) {
  const senderName = fullName(row.senderFirstName, null, row.senderLastName);
  const conversationKey = getConversationKey(row);
  const type = row.msgType || 'text';
  const normalizedType = String(type).toLowerCase();
  const sourceNodeId = row.sourceNodeId || row.originNodeId || null;
  const destinationNodeId = row.destinationNodeId || null;
  const fromNodeLabel = sourceNodeId ? `Mesh node ${sourceNodeId}` : 'Unknown source node';
  const toNodeLabel = normalizedType === 'broadcast'
    ? 'Broadcast channel'
    : destinationNodeId
      ? `Mesh node ${destinationNodeId}`
      : row.conversationNodeId
        ? `Mesh node ${row.conversationNodeId}`
        : 'Mesh network';

  return {
    id: row.id,
    localMessageId: row.localMessageId,
    messageCode: row.messageCode || `MSG-${row.localMessageId || row.id}`,
    hasSourceMessageCode: Boolean(row.messageCode),
    type,
    typeLabel: messageTypeLabel(type),
    conversationKey,
    conversationLabel: getConversationLabel(conversationKey),
    originNodeId: row.originNodeId,
    sourceNodeId,
    destinationNodeId,
    conversationNodeId: row.conversationNodeId || null,
    senderCode: row.senderCode || null,
    senderName: senderName || row.senderCode || 'Unknown sender',
    senderRole: row.senderRole || 'unknown',
    senderRoleLabel: statusLabel(row.senderRole),
    fromLabel: `${senderName || row.senderCode || 'Unknown sender'} from ${fromNodeLabel}`,
    toLabel: toNodeLabel,
    syncedFromLabel: row.originNodeId ? `Synced by ${row.originNodeId}` : 'Sync source unknown',
    content: row.content || '',
    status: row.status || 'unknown',
    statusLabel: statusLabel(row.status),
    priority: row.priority || 'normal',
    sentAt: toIsoTimestamp(row.messageTimestamp),
    uploadedAt: toIsoTimestamp(row.uploadedAt)
  };
}

function messageDedupeKey(message) {
  if (message.hasSourceMessageCode && message.messageCode) {
    return `code:${message.messageCode}`;
  }

  return [
    message.type || '',
    message.sourceNodeId || '',
    message.destinationNodeId || '',
    message.senderCode || '',
    message.sentAt || '',
    message.content || ''
  ].join('|');
}

function dedupeMessages(messages) {
  const seen = new Set();
  const deduped = [];

  messages.forEach((message) => {
    const key = messageDedupeKey(message);

    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    deduped.push(message);
  });

  return deduped;
}

function conversationSummaries(messages) {
  const map = new Map();

  messages.forEach((message) => {
    if (!map.has(message.conversationKey)) {
      map.set(message.conversationKey, {
        key: message.conversationKey,
        label: message.conversationLabel,
        latestAt: message.sentAt || message.uploadedAt,
        visibleMessageCount: 0,
        participants: new Set(),
        messageTypes: new Set(),
        latestMessage: message
      });
    }

    const summary = map.get(message.conversationKey);
    summary.visibleMessageCount += 1;
    if (message.senderCode) summary.participants.add(message.senderCode);
    summary.messageTypes.add(message.typeLabel);
  });

  return Array.from(map.values()).map((summary) => ({
    key: summary.key,
    label: summary.label,
    latestAt: summary.latestAt,
    visibleMessageCount: summary.visibleMessageCount,
    participantCount: summary.participants.size,
    messageTypes: Array.from(summary.messageTypes),
    latestMessage: summary.latestMessage
  }));
}

function summaryResponse(row) {
  const connectivityStatus = getConnectivityStatus(row);
  const signalStrengthDbm = Number(row.signalStrengthDbm);
  const hasValidSignalStrength = Number.isFinite(signalStrengthDbm) && signalStrengthDbm >= -140 && signalStrengthDbm <= -20;

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
    signalStrengthDbm: hasValidSignalStrength ? signalStrengthDbm : null,
    signalQuality: signalQuality(hasValidSignalStrength ? signalStrengthDbm : null),
    signalQualityLabel: signalQualityLabel(hasValidSignalStrength ? signalStrengthDbm : null),
    signalReportedByNodeId: row.signalReportedByNodeId || null,
    signalLastSeenAt: toIsoTimestamp(row.signalLastSeenAt),
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
    recentAuditCount: Number(row.recentAuditCount || 0),
    totalDistressCount: Number(row.totalDistressCount || 0),
    totalActiveDistressCount: Number(row.totalActiveDistressCount || row.recentActiveDistressCount || 0),
    totalSolvedDistressCount: Number(row.totalSolvedDistressCount || row.recentSolvedDistressCount || 0),
    totalCanceledDistressCount: Number(row.totalCanceledDistressCount || row.recentCanceledDistressCount || 0),
    totalMessageCount: Number(row.totalMessageCount || row.recentMessageCount || 0)
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
    signalStrengthDbm: summary.signalStrengthDbm,
    signalQuality: summary.signalQuality,
    signalQualityLabel: summary.signalQualityLabel,
    signalReportedByNodeId: summary.signalReportedByNodeId,
    signalLastSeenAt: summary.signalLastSeenAt,
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
      signalStrengthDbm: summary.signalStrengthDbm,
      signalQuality: summary.signalQuality,
      signalQualityLabel: summary.signalQualityLabel,
      signalReportedByNodeId: summary.signalReportedByNodeId,
      signalLastSeenAt: summary.signalLastSeenAt,
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

async function getDeviceMessages(id, limit = 30) {
  const row = await getDeviceSummaryById(id);

  if (!row) {
    return null;
  }

  const safeLimit = Math.max(1, Math.min(Number(limit) || 30, 50));
  const recentMessageRows = await listRecentMeshMessages(row.nodeId, safeLimit);
  const recentMessages = recentMessageRows.map(messageResponse);

  return {
    device: {
      id: row.id,
      nodeId: row.nodeId,
      nodeName: row.nodeName,
      connectivityStatus: getConnectivityStatus(row),
      connectivityStatusLabel: statusLabel(getConnectivityStatus(row))
    },
    limit: safeLimit,
    conversations: conversationSummaries(recentMessages),
    recentMessages
  };
}

async function getMeshMessageFeed(limit = 20, offset = 0) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 50));
  const safeOffset = Math.max(0, Number(offset) || 0);
  const rows = await listMeshMessageFeed(safeLimit + 1, safeOffset);
  const pageRows = rows.slice(0, safeLimit);
  const messages = dedupeMessages(pageRows.map(messageResponse));

  return {
    limit: safeLimit,
    offset: safeOffset,
    nextOffset: safeOffset + pageRows.length,
    hasMore: rows.length > safeLimit,
    rawCount: pageRows.length,
    totalVisible: messages.length,
    conversations: conversationSummaries(messages),
    messages
  };
}

module.exports = {
  getDeviceSummaries,
  getDeviceMapSummaries,
  getDeviceMapRoutes,
  getDeviceDetails,
  getDeviceMessages,
  getMeshMessageFeed
};
