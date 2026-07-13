const { all, get, run } = require('../database/sqlite');
const { USER_STATUSES } = require('../models/userModel');

function listUsersForSync(cursor, limit) {
  return all(`
    SELECT
      id,
      user_code AS userCode,
      first_name_enc AS firstNameEnc,
      middle_name_enc AS middleNameEnc,
      last_name_enc AS lastNameEnc,
      birth_date_enc AS birthDateEnc,
      street_address_enc AS streetAddressEnc,
      barangay_enc AS barangayEnc,
      occupation_enc AS occupationEnc,
      blood_type_enc AS bloodTypeEnc,
      phone_enc AS phoneEnc,
      password_hash AS passwordHash,
      status,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM users
    WHERE status IN (?, ?)
      AND (
        updated_at > ?
        OR (updated_at = ? AND id > ?)
      )
    ORDER BY updated_at ASC, id ASC
    LIMIT ?
  `, [
    USER_STATUSES.APPROVED,
    USER_STATUSES.SUSPENDED,
    cursor.updatedAt,
    cursor.updatedAt,
    cursor.id,
    limit
  ]);
}

function listRescuersForSync(cursor, limit) {
  return all(`
    SELECT
      id,
      rescuer_code AS rescuerCode,
      first_name_enc AS firstNameEnc,
      middle_name_enc AS middleNameEnc,
      last_name_enc AS lastNameEnc,
      birth_date_enc AS birthDateEnc,
      phone_enc AS phoneEnc,
      password_hash AS passwordHash,
      agency,
      status,
      access_status AS accessStatus,
      team_id AS teamId,
      created_at AS createdAt,
      updated_at AS updatedAt,
      archived_at AS archivedAt
    FROM rescuers
    WHERE updated_at > ?
      OR (updated_at = ? AND id > ?)
    ORDER BY updated_at ASC, id ASC
    LIMIT ?
  `, [
    cursor.updatedAt,
    cursor.updatedAt,
    cursor.id,
    limit
  ]);
}

function listRescueTeamsForSync(cursor, limit) {
  return all(`
    SELECT
      id,
      team_code AS teamCode,
      name,
      agency,
      status,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM rescue_teams
    WHERE updated_at > ?
      OR (updated_at = ? AND id > ?)
    ORDER BY updated_at ASC, id ASC
    LIMIT ?
  `, [
    cursor.updatedAt,
    cursor.updatedAt,
    cursor.id,
    limit
  ]);
}

function upsertMeshNode(node) {
  return run(`
    INSERT INTO mesh_nodes (
      node_id,
      node_name,
      latitude,
      longitude,
      status,
      last_seen_at,
      users_connected,
      deleted,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), COALESCE(?, CURRENT_TIMESTAMP))
    ON CONFLICT(node_id) DO UPDATE SET
      node_name = excluded.node_name,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      status = excluded.status,
      last_seen_at = excluded.last_seen_at,
      users_connected = excluded.users_connected,
      deleted = excluded.deleted,
      updated_at = excluded.updated_at
  `, [
    node.nodeId,
    node.nodeName,
    node.latitude,
    node.longitude,
    node.status,
    node.lastSeenAt,
    node.usersConnected,
    node.deleted ? 1 : 0,
    node.createdAt || null,
    node.updatedAt || null
  ]);
}

function upsertMeshNodeHealthLog(item) {
  return run(`
    INSERT INTO mesh_node_health_logs (
      node_id,
      battery_voltage,
      signal_strength,
      gps_status,
      cpu_temp,
      storage_remaining,
      ram_usage,
      recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(node_id, recorded_at) DO UPDATE SET
      battery_voltage = excluded.battery_voltage,
      signal_strength = excluded.signal_strength,
      gps_status = excluded.gps_status,
      cpu_temp = excluded.cpu_temp,
      storage_remaining = excluded.storage_remaining,
      ram_usage = excluded.ram_usage
  `, [
    item.nodeId,
    item.batteryVoltage,
    item.signalStrength,
    item.gpsStatus,
    item.cpuTemp,
    item.storageRemaining,
    item.ramUsage,
    item.recordedAt
  ]);
}

function upsertMeshDistressSignal(item) {
  return run(`
    INSERT INTO mesh_distress_signals (
      origin_node_id,
      origin_distress_id,
      distress_code,
      user_code,
      first_name,
      last_name,
      phone,
      blood_type,
      age,
      node_id,
      reason,
      latitude,
      longitude,
      timestamp,
      status,
      priority,
      ack_received,
      updated_at,
      deleted
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(origin_node_id, origin_distress_id) DO UPDATE SET
      distress_code = excluded.distress_code,
      user_code = excluded.user_code,
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      phone = excluded.phone,
      blood_type = excluded.blood_type,
      age = excluded.age,
      node_id = excluded.node_id,
      reason = excluded.reason,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      timestamp = excluded.timestamp,
      status = excluded.status,
      priority = excluded.priority,
      ack_received = excluded.ack_received,
      updated_at = excluded.updated_at,
      deleted = excluded.deleted
  `, [
    item.originNodeId,
    item.originDistressId,
    item.distressCode,
    item.userCode,
    item.firstName,
    item.lastName,
    item.phone,
    item.bloodType,
    item.age,
    item.nodeId,
    item.reason,
    item.latitude,
    item.longitude,
    item.timestamp,
    item.status,
    item.priority,
    item.ackReceived ? 1 : 0,
    item.updatedAt,
    item.deleted ? 1 : 0
  ]);
}

function upsertMeshMessage(item) {
  return run(`
    INSERT INTO mesh_messages (
      origin_node_id,
      local_message_id,
      message_code,
      msg_type,
      source_node_id,
      destination_node_id,
      conversation_node_id,
      sender_local_user_id,
      sender_code,
      sender_first_name,
      sender_last_name,
      sender_role,
      content,
      status,
      priority,
      message_timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(origin_node_id, local_message_id) DO UPDATE SET
      message_code = excluded.message_code,
      msg_type = excluded.msg_type,
      source_node_id = excluded.source_node_id,
      destination_node_id = excluded.destination_node_id,
      conversation_node_id = excluded.conversation_node_id,
      sender_local_user_id = excluded.sender_local_user_id,
      sender_code = excluded.sender_code,
      sender_first_name = excluded.sender_first_name,
      sender_last_name = excluded.sender_last_name,
      sender_role = excluded.sender_role,
      content = excluded.content,
      status = excluded.status,
      priority = excluded.priority,
      message_timestamp = excluded.message_timestamp,
      uploaded_at = CURRENT_TIMESTAMP
  `, [
    item.originNodeId,
    item.localMessageId,
    item.messageCode,
    item.msgType,
    item.sourceNodeId,
    item.destinationNodeId,
    item.conversationNodeId,
    item.senderLocalUserId,
    item.senderCode,
    item.senderFirstName,
    item.senderLastName,
    item.senderRole,
    item.content,
    item.status,
    item.priority,
    item.messageTimestamp
  ]);
}

function upsertMeshAuditLog(item) {
  return run(`
    INSERT INTO mesh_audit_logs (
      origin_node_id,
      local_audit_id,
      local_user_id,
      user_code,
      user_role,
      user_first_name,
      user_last_name,
      action,
      target_type,
      target_id,
      ip_address,
      event_timestamp,
      metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(origin_node_id, local_audit_id) DO UPDATE SET
      local_user_id = excluded.local_user_id,
      user_code = excluded.user_code,
      user_role = excluded.user_role,
      user_first_name = excluded.user_first_name,
      user_last_name = excluded.user_last_name,
      action = excluded.action,
      target_type = excluded.target_type,
      target_id = excluded.target_id,
      ip_address = excluded.ip_address,
      event_timestamp = excluded.event_timestamp,
      metadata_json = excluded.metadata_json,
      uploaded_at = CURRENT_TIMESTAMP
  `, [
    item.originNodeId,
    item.localAuditId,
    item.localUserId,
    item.userCode,
    item.userRole,
    item.userFirstName,
    item.userLastName,
    item.action,
    item.targetType,
    item.targetId,
    item.ipAddress,
    item.eventTimestamp,
    item.metadataJson || null
  ]);
}

function listPendingMeshCommands(nodeId) {
  return all(`
    SELECT
      id,
      target_node_id AS targetNodeId,
      command_type AS commandType,
      payload_json AS payloadJson,
      status,
      created_at AS createdAt,
      processed_at AS processedAt,
      updated_at AS updatedAt
    FROM mesh_commands
    WHERE target_node_id = ?
      AND status = 'pending'
    ORDER BY created_at ASC, id ASC
  `, [nodeId]);
}

function markMeshCommandProcessed(id, nodeId) {
  return run(`
    UPDATE mesh_commands
    SET
      status = 'processed',
      processed_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND target_node_id = ? AND status = 'pending'
  `, [id, nodeId]);
}

function createServerAuditLog(entry) {
  const localAuditId = Number(entry.localAuditId);

  return upsertMeshAuditLog({
    originNodeId: entry.originNodeId,
    localAuditId,
    localUserId: null,
    userCode: null,
    userRole: 'system',
    userFirstName: null,
    userLastName: null,
    action: entry.action,
    targetType: entry.targetType || null,
    targetId: entry.targetId || null,
    ipAddress: entry.ipAddress || null,
    eventTimestamp: entry.eventTimestamp,
    metadataJson: entry.metadata ? JSON.stringify(entry.metadata) : null
  });
}

module.exports = {
  listUsersForSync,
  listRescuersForSync,
  listRescueTeamsForSync,
  upsertMeshNode,
  upsertMeshNodeHealthLog,
  upsertMeshDistressSignal,
  upsertMeshMessage,
  upsertMeshAuditLog,
  listPendingMeshCommands,
  markMeshCommandProcessed,
  createServerAuditLog
};
