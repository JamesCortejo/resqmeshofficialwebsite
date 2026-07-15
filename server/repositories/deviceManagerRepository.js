const { all, get } = require('../database/sqlite');

function listDevices() {
  return all(`
    SELECT
      sd.id,
      sd.node_id AS nodeId,
      sd.node_name AS nodeName,
      sd.status AS deviceStatus,
      sd.allowed_ip AS allowedIp,
      sd.last_seen_at AS deviceLastSeenAt,
      sd.last_sync_at AS lastSyncAt,
      sd.created_at AS createdAt,
      sd.updated_at AS updatedAt,
      mn.status AS nodeStatus,
      mn.latitude,
      mn.longitude,
      mn.last_seen_at AS nodeLastSeenAt,
      mn.users_connected AS usersConnected,
      COALESCE(mc.pendingCommandCount, 0) AS pendingCommandCount,
      COALESCE(md.recentDistressCount, 0) AS recentDistressCount,
      COALESCE(mm.recentMessageCount, 0) AS recentMessageCount,
      COALESCE(ma.recentAuditCount, 0) AS recentAuditCount
    FROM sync_devices sd
    LEFT JOIN mesh_nodes mn ON mn.node_id = sd.node_id
    LEFT JOIN (
      SELECT target_node_id, COUNT(*) AS pendingCommandCount
      FROM mesh_commands
      WHERE status = 'pending'
      GROUP BY target_node_id
    ) mc ON mc.target_node_id = sd.node_id
    LEFT JOIN (
      SELECT origin_node_id, COUNT(*) AS recentDistressCount
      FROM mesh_distress_signals
      WHERE datetime(COALESCE(updated_at, created_at)) >= datetime('now', '-1 day')
      GROUP BY origin_node_id
    ) md ON md.origin_node_id = sd.node_id
    LEFT JOIN (
      SELECT origin_node_id, COUNT(*) AS recentMessageCount
      FROM mesh_messages
      WHERE datetime(COALESCE(message_timestamp, uploaded_at)) >= datetime('now', '-1 day')
      GROUP BY origin_node_id
    ) mm ON mm.origin_node_id = sd.node_id
    LEFT JOIN (
      SELECT origin_node_id, COUNT(*) AS recentAuditCount
      FROM mesh_audit_logs
      WHERE datetime(COALESCE(event_timestamp, uploaded_at)) >= datetime('now', '-1 day')
      GROUP BY origin_node_id
    ) ma ON ma.origin_node_id = sd.node_id
    ORDER BY COALESCE(sd.last_sync_at, sd.last_seen_at, sd.created_at) DESC, sd.id DESC
  `);
}

function getDeviceSummaryById(id) {
  return get(`
    SELECT
      sd.id,
      sd.node_id AS nodeId,
      sd.node_name AS nodeName,
      sd.status AS deviceStatus,
      sd.allowed_ip AS allowedIp,
      sd.last_seen_at AS deviceLastSeenAt,
      sd.last_sync_at AS lastSyncAt,
      sd.created_at AS createdAt,
      sd.updated_at AS updatedAt,
      mn.status AS nodeStatus,
      mn.latitude,
      mn.longitude,
      mn.last_seen_at AS nodeLastSeenAt,
      mn.users_connected AS usersConnected,
      COALESCE(mc.pendingCommandCount, 0) AS pendingCommandCount,
      COALESCE(md.recentDistressCount, 0) AS recentDistressCount,
      COALESCE(mm.recentMessageCount, 0) AS recentMessageCount,
      COALESCE(ma.recentAuditCount, 0) AS recentAuditCount
    FROM sync_devices sd
    LEFT JOIN mesh_nodes mn ON mn.node_id = sd.node_id
    LEFT JOIN (
      SELECT target_node_id, COUNT(*) AS pendingCommandCount
      FROM mesh_commands
      WHERE status = 'pending'
      GROUP BY target_node_id
    ) mc ON mc.target_node_id = sd.node_id
    LEFT JOIN (
      SELECT origin_node_id, COUNT(*) AS recentDistressCount
      FROM mesh_distress_signals
      WHERE datetime(COALESCE(updated_at, created_at)) >= datetime('now', '-1 day')
      GROUP BY origin_node_id
    ) md ON md.origin_node_id = sd.node_id
    LEFT JOIN (
      SELECT origin_node_id, COUNT(*) AS recentMessageCount
      FROM mesh_messages
      WHERE datetime(COALESCE(message_timestamp, uploaded_at)) >= datetime('now', '-1 day')
      GROUP BY origin_node_id
    ) mm ON mm.origin_node_id = sd.node_id
    LEFT JOIN (
      SELECT origin_node_id, COUNT(*) AS recentAuditCount
      FROM mesh_audit_logs
      WHERE datetime(COALESCE(event_timestamp, uploaded_at)) >= datetime('now', '-1 day')
      GROUP BY origin_node_id
    ) ma ON ma.origin_node_id = sd.node_id
    WHERE sd.id = ?
    LIMIT 1
  `, [id]);
}

function getLatestHealthRecord(nodeId) {
  return get(`
    SELECT
      node_id AS nodeId,
      battery_voltage AS batteryVoltage,
      signal_strength AS signalStrength,
      gps_status AS gpsStatus,
      cpu_temp AS cpuTemp,
      storage_remaining AS storageRemaining,
      ram_usage AS ramUsage,
      recorded_at AS recordedAt
    FROM mesh_node_health_logs
    WHERE node_id = ?
    ORDER BY datetime(recorded_at) DESC, id DESC
    LIMIT 1
  `, [nodeId]);
}

function getTotalDistressCount(nodeId) {
  return get(`
    SELECT COUNT(*) AS count
    FROM mesh_distress_signals
    WHERE origin_node_id = ?
  `, [nodeId]);
}

function getTotalMessageCount(nodeId) {
  return get(`
    SELECT COUNT(*) AS count
    FROM mesh_messages
    WHERE origin_node_id = ?
  `, [nodeId]);
}

function getTotalAuditCount(nodeId) {
  return get(`
    SELECT COUNT(*) AS count
    FROM mesh_audit_logs
    WHERE origin_node_id = ?
  `, [nodeId]);
}

module.exports = {
  listDevices,
  getDeviceSummaryById,
  getLatestHealthRecord,
  getTotalDistressCount,
  getTotalMessageCount,
  getTotalAuditCount
};
