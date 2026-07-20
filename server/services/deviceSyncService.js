const config = require('../config/env');
const { decryptText } = require('./encryptionService');
const {
  listUsersForSync,
  listRescuersForSync,
  listRescueTeamsForSync,
  upsertMeshNode,
  upsertMeshNodeHealthLog,
  upsertMeshNodeLink,
  upsertMeshDistressSignal,
  getMeshDistressSignalByOrigin,
  upsertMeshMessage,
  upsertMeshAuditLog,
  listPendingMeshCommands,
  markMeshCommandProcessed,
  createServerAuditLog
} = require('../repositories/deviceSyncRepository');
const {
  listDeploymentsForSync,
  listDeploymentRouteSnapshotsForSync,
  listDeploymentMemberCodes,
  getLatestDeploymentByDistressSignalId
} = require('../repositories/deploymentRepository');
const { touchSyncDeviceLastSync } = require('../repositories/syncDeviceRepository');
const {
  notifyDistressSignalActive,
  notifyDistressSignalCanceled
} = require('./notificationService');

function nowAsIso() {
  return new Date().toISOString();
}

function createAuditId() {
  return Number(`${Date.now()}${Math.floor(Math.random() * 1000)}`);
}

function normalizeDistressStatus(status) {
  const normalized = normalizeString(status)?.toLowerCase();

  if (!normalized) {
    return null;
  }

  if (normalized === 'cancelled') {
    return 'canceled';
  }

  return normalized;
}

function isDistressActive(status) {
  return String(status || '').toLowerCase() === 'active';
}

function isDistressCanceled(status) {
  const normalized = String(status || '').toLowerCase();
  return normalized === 'canceled' || normalized === 'cancelled';
}

function normalizeLimit(rawLimit) {
  const parsed = Number.parseInt(String(rawLimit || ''), 10);
  const defaultLimit = config.deviceSync?.defaultPageLimit || 100;
  const maxLimit = config.deviceSync?.maxPageLimit || 250;

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return defaultLimit;
  }

  return Math.min(parsed, maxLimit);
}

function decodeCursor(cursorValue) {
  if (!cursorValue) {
    return {
      updatedAt: '1970-01-01 00:00:00',
      id: 0
    };
  }

  try {
    const parsed = JSON.parse(Buffer.from(String(cursorValue), 'base64url').toString('utf8'));
    return {
      updatedAt: String(parsed.updatedAt || '1970-01-01 00:00:00'),
      id: Number.parseInt(String(parsed.id || 0), 10) || 0
    };
  } catch (error) {
    const invalid = new Error('Invalid sync cursor.');
    invalid.statusCode = 400;
    throw invalid;
  }
}

function encodeCursor(row) {
  if (!row) {
    return null;
  }

  return Buffer.from(JSON.stringify({
    updatedAt: row.updatedAt,
    id: row.id
  })).toString('base64url');
}

function fullNameParts(...values) {
  return values.filter(Boolean).join(' ');
}

function mapUser(row) {
  const firstName = decryptText(row.firstNameEnc);
  const middleName = decryptText(row.middleNameEnc);
  const lastName = decryptText(row.lastNameEnc);

  return {
    id: row.id,
    sourceRecordId: row.id,
    userCode: row.userCode,
    firstName,
    middleName,
    lastName,
    fullName: fullNameParts(firstName, middleName, lastName),
    birthDate: decryptText(row.birthDateEnc),
    phone: decryptText(row.phoneEnc),
    streetAddress: decryptText(row.streetAddressEnc),
    barangay: decryptText(row.barangayEnc),
    occupation: decryptText(row.occupationEnc),
    bloodType: decryptText(row.bloodTypeEnc),
    passwordHash: row.passwordHash,
    accountStatus: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function mapRescuer(row) {
  const firstName = decryptText(row.firstNameEnc);
  const middleName = decryptText(row.middleNameEnc);
  const lastName = decryptText(row.lastNameEnc);

  return {
    id: row.id,
    sourceRecordId: row.id,
    rescuerCode: row.rescuerCode,
    firstName,
    middleName,
    lastName,
    fullName: fullNameParts(firstName, middleName, lastName),
    birthDate: decryptText(row.birthDateEnc),
    phone: decryptText(row.phoneEnc),
    passwordHash: row.passwordHash,
    agency: row.agency,
    status: row.status,
    accessStatus: row.accessStatus,
    teamId: row.teamId,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function mapRescueTeam(row) {
  return {
    id: row.id,
    sourceRecordId: row.id,
    teamCode: row.teamCode,
    name: row.name,
    agency: row.agency,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function mapDeployment(row, membersByDeploymentId) {
  return {
    id: row.id,
    sourceRecordId: row.id,
    deploymentCode: row.deploymentCode,
    meshDistressSignalId: row.meshDistressSignalId,
    originNodeId: row.originNodeId,
    originDistressId: row.originDistressId,
    teamId: row.teamId,
    teamCode: row.teamCode || '',
    teamLeaderRescuerId: row.teamLeaderRescuerId,
    teamLeaderRescuerCode: row.teamLeaderRescuerCode || '',
    memberRescuerCodes: membersByDeploymentId.get(row.id) || [],
    status: row.status,
    createdAt: row.createdAt,
    deployedAt: row.deployedAt,
    canceledAt: row.canceledAt,
    accomplishedAt: row.accomplishedAt,
    updatedAt: row.updatedAt
  };
}

function mapDeploymentRouteSnapshot(row) {
  return {
    id: row.id,
    sourceRecordId: row.id,
    deploymentId: row.deploymentId,
    originNodeId: row.originNodeId,
    originDistressId: row.originDistressId,
    teamId: row.teamId,
    teamLeaderRescuerId: row.leaderRescuerId,
    teamLeaderRescuerCode: row.leaderRescuerCode || '',
    leaderRecordedAt: row.leaderRecordedAt,
    distanceM: row.distanceM,
    durationS: row.durationS,
    etaMinutes: row.etaMinutes,
    coordinates: row.geometryJson ? JSON.parse(row.geometryJson) : [],
    provider: row.provider,
    computedAt: row.computedAt,
    updatedAt: row.updatedAt
  };
}

async function buildDeltaResponse(rows, mapper, limit) {
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const lastRow = pageRows.length > 0 ? pageRows[pageRows.length - 1] : null;

  return {
    data: pageRows.map(mapper),
    nextCursor: lastRow ? encodeCursor(lastRow) : null,
    hasMore
  };
}

async function getUsersDelta(query) {
  const limit = normalizeLimit(query?.limit);
  const cursor = decodeCursor(query?.cursor);
  const rows = await listUsersForSync(cursor, limit + 1);
  return buildDeltaResponse(rows, mapUser, limit);
}

async function getRescuersDelta(query) {
  const limit = normalizeLimit(query?.limit);
  const cursor = decodeCursor(query?.cursor);
  const rows = await listRescuersForSync(cursor, limit + 1);
  return buildDeltaResponse(rows, mapRescuer, limit);
}

async function getRescueTeamsDelta(query) {
  const limit = normalizeLimit(query?.limit);
  const cursor = decodeCursor(query?.cursor);
  const rows = await listRescueTeamsForSync(cursor, limit + 1);
  return buildDeltaResponse(rows, mapRescueTeam, limit);
}

async function getDeploymentsDelta(query) {
  const limit = normalizeLimit(query?.limit);
  const cursor = decodeCursor(query?.cursor);
  const rows = await listDeploymentsForSync(cursor, limit + 1);
  const pageRows = rows.length > limit ? rows.slice(0, limit) : rows;
  const memberRows = await listDeploymentMemberCodes(pageRows.map((row) => row.id));
  const membersByDeploymentId = memberRows.reduce((result, member) => {
    const current = result.get(member.deploymentId) || [];
    current.push(member.rescuerCode);
    result.set(member.deploymentId, current);
    return result;
  }, new Map());
  const lastRow = pageRows.length > 0 ? pageRows[pageRows.length - 1] : null;

  return {
    data: pageRows.map((row) => mapDeployment(row, membersByDeploymentId)),
    nextCursor: lastRow ? encodeCursor(lastRow) : null,
    hasMore: rows.length > limit
  };
}

async function getDeploymentRouteSnapshotsDelta(query) {
  const limit = normalizeLimit(query?.limit);
  const cursor = decodeCursor(query?.cursor);
  const rows = await listDeploymentRouteSnapshotsForSync(cursor, limit + 1);
  return buildDeltaResponse(rows, mapDeploymentRouteSnapshot, limit);
}

function requireItemsArray(payload) {
  const items = Array.isArray(payload?.items) ? payload.items : null;

  if (!items) {
    const error = new Error('Request body must include an items array.');
    error.statusCode = 400;
    throw error;
  }

  return items;
}

async function processBatch(items, handler, type) {
  const accepted = [];
  const rejected = [];

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];

    try {
      const result = await handler(item, index);
      accepted.push(result);
    } catch (error) {
      rejected.push({
        index,
        reason: error.message || `Invalid ${type} item.`
      });
    }
  }

  return {
    accepted,
    rejected,
    acceptedCount: accepted.length,
    rejectedCount: rejected.length
  };
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeInteger(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const number = Number.parseInt(String(value), 10);
  return Number.isInteger(number) ? number : null;
}

function normalizeRssiDbm(value) {
  const rssi = normalizeInteger(value);

  if (rssi === null) {
    return null;
  }

  return rssi >= -140 && rssi <= -20 ? rssi : null;
}

function normalizeBoolean(value) {
  return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';
}

function normalizeString(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized || null;
}

async function syncNodesBatch(payload, syncDevice, requestIp) {
  const items = requireItemsArray(payload);

  const result = await processBatch(items, async (item) => {
    const nodeId = normalizeString(item.nodeId || item.id);

    if (!nodeId) {
      throw new Error('nodeId is required.');
    }

    await upsertMeshNode({
      nodeId,
      nodeName: normalizeString(item.nodeName || item.name),
      latitude: normalizeNumber(item.latitude),
      longitude: normalizeNumber(item.longitude),
      status: normalizeString(item.status),
      lastSeenAt: normalizeString(item.lastSeenAt || item.last_seen),
      usersConnected: normalizeInteger(item.usersConnected ?? item.users_connected),
      updatedAt: normalizeString(item.updatedAt || item.updated_at) || nowAsIso(),
      createdAt: normalizeString(item.createdAt || item.created_at),
      deleted: normalizeBoolean(item.deleted)
    });

    return { nodeId };
  }, 'node');

  await finalizeBatchSync(syncDevice, requestIp, 'device_sync_nodes_batch', result);
  return result;
}

async function syncNodeHealthBatch(payload, syncDevice, requestIp) {
  const items = requireItemsArray(payload);

  const result = await processBatch(items, async (item) => {
    const nodeId = normalizeString(item.nodeId);
    const recordedAt = normalizeString(item.recordedAt || item.recorded_at);

    if (!nodeId || !recordedAt) {
      throw new Error('nodeId and recordedAt are required.');
    }

    await upsertMeshNodeHealthLog({
      nodeId,
      batteryVoltage: normalizeNumber(item.batteryVoltage ?? item.battery_voltage),
      signalStrength: normalizeInteger(item.signalStrength ?? item.signal_strength),
      gpsStatus: normalizeString(item.gpsStatus ?? item.gps_status),
      cpuTemp: normalizeNumber(item.cpuTemp ?? item.cpu_temp),
      storageRemaining: normalizeInteger(item.storageRemaining ?? item.storage_remaining),
      ramUsage: normalizeNumber(item.ramUsage ?? item.ram_usage),
      recordedAt
    });

    return { nodeId, recordedAt };
  }, 'node health');

  await finalizeBatchSync(syncDevice, requestIp, 'device_sync_node_health_batch', result);
  return result;
}

async function syncNodeNeighborsBatch(payload, syncDevice, requestIp) {
  const items = requireItemsArray(payload);

  const result = await processBatch(items, async (item) => {
    const reportingNodeId = normalizeString(item.reportingNodeId || item.nodeId || item.reporting_node_id);
    const neighborNodeId = normalizeString(item.neighborNodeId || item.neighborId || item.neighbor_node_id);
    const lastSeenAt = normalizeString(item.lastSeenAt || item.last_seen_at);

    if (!reportingNodeId || !neighborNodeId || !lastSeenAt) {
      throw new Error('reportingNodeId, neighborNodeId, and lastSeenAt are required.');
    }

    if (reportingNodeId !== syncDevice.nodeId) {
      throw new Error('reportingNodeId must match the authenticated sync device.');
    }

    await upsertMeshNodeLink({
      reportingNodeId,
      neighborNodeId,
      rssi: normalizeRssiDbm(item.rssi ?? item.signalStrength ?? item.signal_strength),
      lastSeenAt,
      updatedAt: normalizeString(item.updatedAt || item.updated_at) || nowAsIso()
    });

    return { reportingNodeId, neighborNodeId };
  }, 'node neighbor');

  await finalizeBatchSync(syncDevice, requestIp, 'device_sync_node_neighbors_batch', result);
  return result;
}

async function syncDistressSignalsBatch(payload, syncDevice, requestIp) {
  const items = requireItemsArray(payload);

  const result = await processBatch(items, async (item) => {
    const originNodeId = normalizeString(item.originNodeId);
    const originDistressId = normalizeInteger(item.originDistressId);

    if (!originNodeId || originDistressId === null) {
      throw new Error('originNodeId and originDistressId are required.');
    }

    const previous = await getMeshDistressSignalByOrigin(originNodeId, originDistressId);
    const normalized = {
      originNodeId,
      originDistressId,
      distressCode: normalizeString(item.distressCode || item.code),
      userCode: normalizeString(item.userCode || item.user_code),
      firstName: normalizeString(item.firstName || item.first_name),
      lastName: normalizeString(item.lastName || item.last_name),
      phone: normalizeString(item.phone),
      bloodType: normalizeString(item.bloodType || item.blood_type),
      age: normalizeInteger(item.age),
      nodeId: normalizeString(item.nodeId || item.node_id),
      reason: normalizeString(item.reason),
      latitude: normalizeNumber(item.latitude ?? item.lat),
      longitude: normalizeNumber(item.longitude ?? item.lng),
      timestamp: normalizeString(item.timestamp),
      status: normalizeDistressStatus(item.status),
      priority: normalizeString(item.priority),
      ackReceived: normalizeBoolean(item.ackReceived ?? item.ack_received),
      updatedAt: normalizeString(item.updatedAt || item.updated_at) || nowAsIso(),
      deleted: normalizeBoolean(item.deleted)
    };

    await upsertMeshDistressSignal(normalized);

    const current = await getMeshDistressSignalByOrigin(originNodeId, originDistressId);

    if (current && !current.deleted) {
      if ((!previous || !isDistressActive(previous.status) || previous.deleted) && isDistressActive(current.status)) {
        await notifyDistressSignalActive(current);
      } else if (
        previous &&
        !previous.deleted &&
        !isDistressCanceled(previous.status) &&
        isDistressCanceled(current.status)
      ) {
        const latestDeployment = current.id
          ? await getLatestDeploymentByDistressSignalId(current.id)
          : null;
        const suppressedByAccomplished = latestDeployment?.status === 'accomplished';

        if (!suppressedByAccomplished) {
          await notifyDistressSignalCanceled(current);
        }
      }
    }

    return { originNodeId, originDistressId };
  }, 'distress signal');

  await finalizeBatchSync(syncDevice, requestIp, 'device_sync_distress_batch', result);
  return result;
}

async function syncMessagesBatch(payload, syncDevice, requestIp) {
  const items = requireItemsArray(payload);

  const result = await processBatch(items, async (item) => {
    const originNodeId = normalizeString(item.originNodeId);
    const localMessageId = normalizeInteger(item.localMessageId);

    if (!originNodeId || localMessageId === null) {
      throw new Error('originNodeId and localMessageId are required.');
    }

    await upsertMeshMessage({
      originNodeId,
      localMessageId,
      messageCode: normalizeString(item.messageCode),
      msgType: normalizeString(item.msgType),
      sourceNodeId: normalizeString(item.sourceNodeId),
      destinationNodeId: normalizeString(item.destinationNodeId),
      conversationNodeId: normalizeString(item.conversationNodeId),
      senderLocalUserId: normalizeInteger(item.senderLocalUserId),
      senderCode: normalizeString(item.senderCode),
      senderFirstName: normalizeString(item.senderFirstName),
      senderLastName: normalizeString(item.senderLastName),
      senderRole: normalizeString(item.senderRole),
      content: normalizeString(item.content),
      status: normalizeString(item.status),
      priority: normalizeString(item.priority),
      messageTimestamp: normalizeString(item.messageTimestamp || item.timestamp)
    });

    return { originNodeId, localMessageId };
  }, 'message');

  await finalizeBatchSync(syncDevice, requestIp, 'device_sync_messages_batch', result);
  return result;
}

async function syncAuditLogsBatch(payload, syncDevice, requestIp) {
  const items = requireItemsArray(payload);

  const result = await processBatch(items, async (item) => {
    const originNodeId = normalizeString(item.originNodeId);
    const localAuditId = normalizeInteger(item.localAuditId);

    if (!originNodeId || localAuditId === null) {
      throw new Error('originNodeId and localAuditId are required.');
    }

    await upsertMeshAuditLog({
      originNodeId,
      localAuditId,
      localUserId: normalizeInteger(item.localUserId),
      userCode: normalizeString(item.userCode),
      userRole: normalizeString(item.userRole),
      userFirstName: normalizeString(item.userFirstName),
      userLastName: normalizeString(item.userLastName),
      action: normalizeString(item.action),
      targetType: normalizeString(item.targetType),
      targetId: normalizeString(item.targetId),
      ipAddress: normalizeString(item.ipAddress),
      eventTimestamp: normalizeString(item.eventTimestamp || item.timestamp),
      metadataJson: item.metadata ? JSON.stringify(item.metadata) : null
    });

    return { originNodeId, localAuditId };
  }, 'audit log');

  await finalizeBatchSync(syncDevice, requestIp, 'device_sync_audit_logs_batch', result);
  return result;
}

async function finalizeBatchSync(syncDevice, requestIp, action, result) {
  const timestamp = nowAsIso();
  await touchSyncDeviceLastSync(syncDevice.id, timestamp);
  await createServerAuditLog({
    originNodeId: syncDevice.nodeId,
    localAuditId: createAuditId(),
    action,
    targetType: 'sync_device',
    targetId: String(syncDevice.id),
    ipAddress: requestIp,
    eventTimestamp: timestamp,
    metadata: {
      acceptedCount: result.acceptedCount,
      rejectedCount: result.rejectedCount
    }
  });
}

async function getMeshCommands(syncDevice) {
  const rows = await listPendingMeshCommands(syncDevice.nodeId);

  return rows.map((row) => ({
    id: row.id,
    targetNodeId: row.targetNodeId,
    commandType: row.commandType,
    payload: row.payloadJson ? JSON.parse(row.payloadJson) : null,
    status: row.status,
    createdAt: row.createdAt,
    processedAt: row.processedAt,
    updatedAt: row.updatedAt
  }));
}

async function acknowledgeMeshCommand(commandId, syncDevice, requestIp) {
  const id = normalizeInteger(commandId);

  if (id === null) {
    const error = new Error('Invalid command id.');
    error.statusCode = 400;
    throw error;
  }

  const result = await markMeshCommandProcessed(id, syncDevice.nodeId);

  if (!result.changes) {
    const error = new Error('Mesh command not found for this device.');
    error.statusCode = 404;
    throw error;
  }
  await finalizeBatchSync(syncDevice, requestIp, 'device_sync_mesh_command_ack', {
    acceptedCount: 1,
    rejectedCount: 0
  });
}

module.exports = {
  getUsersDelta,
  getRescuersDelta,
  getRescueTeamsDelta,
  getDeploymentsDelta,
  getDeploymentRouteSnapshotsDelta,
  syncNodesBatch,
  syncNodeHealthBatch,
  syncNodeNeighborsBatch,
  syncDistressSignalsBatch,
  syncMessagesBatch,
  syncAuditLogsBatch,
  getMeshCommands,
  acknowledgeMeshCommand
};
