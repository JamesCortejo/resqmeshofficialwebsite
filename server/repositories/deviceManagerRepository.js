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
      COALESCE(md.recentActiveDistressCount, 0) AS recentActiveDistressCount,
      COALESCE(md.recentSolvedDistressCount, 0) AS recentSolvedDistressCount,
      COALESCE(md.recentCanceledDistressCount, 0) AS recentCanceledDistressCount,
      COALESCE(mm.recentMessageCount, 0) AS recentMessageCount,
      COALESCE(td.totalDistressCount, 0) AS totalDistressCount,
      COALESCE(td.totalActiveDistressCount, 0) AS totalActiveDistressCount,
      COALESCE(td.totalSolvedDistressCount, 0) AS totalSolvedDistressCount,
      COALESCE(td.totalCanceledDistressCount, 0) AS totalCanceledDistressCount,
      COALESCE(tm.totalMessageCount, 0) AS totalMessageCount,
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
      SELECT
        m.origin_node_id,
        SUM(CASE WHEN LOWER(COALESCE(m.status, 'active')) = 'active' THEN 1 ELSE 0 END) AS recentActiveDistressCount,
        SUM(CASE WHEN LOWER(COALESCE(m.status, 'active')) = 'processed' OR d.status = 'accomplished' THEN 1 ELSE 0 END) AS recentSolvedDistressCount,
        SUM(CASE
          WHEN LOWER(COALESCE(m.status, 'active')) IN ('canceled', 'cancelled')
            AND COALESCE(d.status, '') <> 'accomplished'
          THEN 1 ELSE 0
        END) AS recentCanceledDistressCount
      FROM mesh_distress_signals m
      LEFT JOIN distress_deployments d
        ON d.id = (
          SELECT inner_d.id
          FROM distress_deployments inner_d
          WHERE inner_d.mesh_distress_signal_id = m.id
          ORDER BY datetime(COALESCE(inner_d.updated_at, inner_d.created_at)) DESC, inner_d.id DESC
          LIMIT 1
        )
      WHERE m.deleted = 0
        AND datetime(COALESCE(d.updated_at, m.updated_at, m.created_at)) >= datetime('now', '-1 day')
      GROUP BY m.origin_node_id
    ) md ON md.origin_node_id = sd.node_id
    LEFT JOIN (
      SELECT origin_node_id, COUNT(*) AS recentMessageCount
      FROM mesh_messages
      WHERE datetime(COALESCE(message_timestamp, uploaded_at)) >= datetime('now', '-1 day')
      GROUP BY origin_node_id
    ) mm ON mm.origin_node_id = sd.node_id
    LEFT JOIN (
      SELECT
        m.origin_node_id,
        COUNT(*) AS totalDistressCount,
        SUM(CASE WHEN LOWER(COALESCE(m.status, 'active')) = 'active' THEN 1 ELSE 0 END) AS totalActiveDistressCount,
        SUM(CASE WHEN LOWER(COALESCE(m.status, 'active')) = 'processed' OR d.status = 'accomplished' THEN 1 ELSE 0 END) AS totalSolvedDistressCount,
        SUM(CASE
          WHEN LOWER(COALESCE(m.status, 'active')) IN ('canceled', 'cancelled')
            AND COALESCE(d.status, '') <> 'accomplished'
          THEN 1 ELSE 0
        END) AS totalCanceledDistressCount
      FROM mesh_distress_signals m
      LEFT JOIN distress_deployments d
        ON d.id = (
          SELECT inner_d.id
          FROM distress_deployments inner_d
          WHERE inner_d.mesh_distress_signal_id = m.id
          ORDER BY datetime(COALESCE(inner_d.updated_at, inner_d.created_at)) DESC, inner_d.id DESC
          LIMIT 1
        )
      WHERE m.deleted = 0
      GROUP BY m.origin_node_id
    ) td ON td.origin_node_id = sd.node_id
    LEFT JOIN (
      SELECT origin_node_id, COUNT(*) AS totalMessageCount
      FROM mesh_messages
      GROUP BY origin_node_id
    ) tm ON tm.origin_node_id = sd.node_id
    LEFT JOIN (
      SELECT origin_node_id, COUNT(*) AS recentAuditCount
      FROM mesh_audit_logs
      WHERE datetime(COALESCE(event_timestamp, uploaded_at)) >= datetime('now', '-1 day')
      GROUP BY origin_node_id
    ) ma ON ma.origin_node_id = sd.node_id
    ORDER BY COALESCE(sd.last_sync_at, sd.last_seen_at, sd.created_at) DESC, sd.id DESC
  `);
}

function listDevicesForMap() {
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
      COALESCE(md.activeDistressCount, 0) AS activeDistressCount,
      ad.distress_code AS activeDistressCode,
      ad.user_code AS activeDistressUserCode,
      ad.first_name AS activeDistressFirstName,
      ad.last_name AS activeDistressLastName,
      ad.phone AS activeDistressPhone,
      ad.reason AS activeDistressReason,
      ad.priority AS activeDistressPriority,
      ad.timestamp AS activeDistressTimestamp
    FROM sync_devices sd
    LEFT JOIN mesh_nodes mn ON mn.node_id = sd.node_id
    LEFT JOIN (
      SELECT
        origin_node_id,
        COUNT(*) AS activeDistressCount
      FROM mesh_distress_signals
      WHERE deleted = 0
        AND LOWER(COALESCE(status, 'active')) = 'active'
      GROUP BY origin_node_id
    ) md ON md.origin_node_id = sd.node_id
    LEFT JOIN mesh_distress_signals ad
      ON ad.id = (
        SELECT inner_mds.id
        FROM mesh_distress_signals inner_mds
        WHERE inner_mds.origin_node_id = sd.node_id
          AND inner_mds.deleted = 0
          AND LOWER(COALESCE(inner_mds.status, 'active')) = 'active'
        ORDER BY datetime(COALESCE(inner_mds.updated_at, inner_mds.timestamp, inner_mds.created_at)) DESC, inner_mds.id DESC
        LIMIT 1
      )
    ORDER BY COALESCE(sd.last_sync_at, sd.last_seen_at, sd.created_at) DESC, sd.id DESC
  `);
}

function listActiveDeviceMapRoutes() {
  return all(`
    SELECT
      d.id AS deploymentId,
      d.deployment_code AS deploymentCode,
      d.mesh_distress_signal_id AS distressId,
      d.origin_node_id AS originNodeId,
      d.team_id AS teamId,
      d.team_leader_rescuer_id AS teamLeaderRescuerId,
      d.status AS deploymentStatus,
      d.deployed_at AS deployedAt,
      d.updated_at AS deploymentUpdatedAt,
      t.team_code AS teamCode,
      t.name AS teamName,
      t.status AS teamStatus,
      r.first_name_enc AS leaderFirstNameEnc,
      r.middle_name_enc AS leaderMiddleNameEnc,
      r.last_name_enc AS leaderLastNameEnc,
      m.distress_code AS distressCode,
      m.reason AS distressReason,
      m.latitude AS distressLatitude,
      m.longitude AS distressLongitude,
      m.origin_node_id AS distressOriginNodeId,
      n.node_name AS originNodeName,
      lc.latitude AS leaderLatitude,
      lc.longitude AS leaderLongitude,
      lc.recorded_at AS leaderRecordedAt,
      s.distance_m AS distanceM,
      s.duration_s AS durationS,
      s.eta_minutes AS etaMinutes,
      s.geometry_json AS geometryJson,
      s.updated_at AS routeUpdatedAt
    FROM distress_deployments d
    INNER JOIN deployment_route_snapshots s ON s.deployment_id = d.id
    INNER JOIN mesh_distress_signals m ON m.id = d.mesh_distress_signal_id
    LEFT JOIN rescue_teams t ON t.id = d.team_id
    LEFT JOIN rescuers r ON r.id = d.team_leader_rescuer_id
    LEFT JOIN mesh_nodes n ON n.node_id = d.origin_node_id
    LEFT JOIN rescuer_locations_current lc ON lc.rescuer_id = d.team_leader_rescuer_id
    WHERE d.status = 'deployed'
      AND m.deleted = 0
      AND s.geometry_json IS NOT NULL
      AND TRIM(s.geometry_json) <> ''
    ORDER BY COALESCE(d.deployed_at, d.created_at) DESC, d.id DESC
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
      COALESCE(md.recentActiveDistressCount, 0) AS recentActiveDistressCount,
      COALESCE(md.recentSolvedDistressCount, 0) AS recentSolvedDistressCount,
      COALESCE(md.recentCanceledDistressCount, 0) AS recentCanceledDistressCount,
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
      SELECT
        m.origin_node_id,
        SUM(CASE WHEN LOWER(COALESCE(m.status, 'active')) = 'active' THEN 1 ELSE 0 END) AS recentActiveDistressCount,
        SUM(CASE WHEN LOWER(COALESCE(m.status, 'active')) = 'processed' OR d.status = 'accomplished' THEN 1 ELSE 0 END) AS recentSolvedDistressCount,
        SUM(CASE
          WHEN LOWER(COALESCE(m.status, 'active')) IN ('canceled', 'cancelled')
            AND COALESCE(d.status, '') <> 'accomplished'
          THEN 1 ELSE 0
        END) AS recentCanceledDistressCount
      FROM mesh_distress_signals m
      LEFT JOIN distress_deployments d
        ON d.id = (
          SELECT inner_d.id
          FROM distress_deployments inner_d
          WHERE inner_d.mesh_distress_signal_id = m.id
          ORDER BY datetime(COALESCE(inner_d.updated_at, inner_d.created_at)) DESC, inner_d.id DESC
          LIMIT 1
        )
      WHERE m.deleted = 0
        AND datetime(COALESCE(d.updated_at, m.updated_at, m.created_at)) >= datetime('now', '-1 day')
      GROUP BY m.origin_node_id
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
    SELECT
      COUNT(*) AS count,
      SUM(CASE WHEN LOWER(COALESCE(m.status, 'active')) = 'active' THEN 1 ELSE 0 END) AS activeCount,
      SUM(CASE WHEN LOWER(COALESCE(m.status, 'active')) = 'processed' OR d.status = 'accomplished' THEN 1 ELSE 0 END) AS solvedCount,
      SUM(CASE
        WHEN LOWER(COALESCE(m.status, 'active')) IN ('canceled', 'cancelled')
          AND COALESCE(d.status, '') <> 'accomplished'
        THEN 1 ELSE 0
      END) AS canceledCount
    FROM mesh_distress_signals m
    LEFT JOIN distress_deployments d
      ON d.id = (
        SELECT inner_d.id
        FROM distress_deployments inner_d
        WHERE inner_d.mesh_distress_signal_id = m.id
        ORDER BY datetime(COALESCE(inner_d.updated_at, inner_d.created_at)) DESC, inner_d.id DESC
        LIMIT 1
      )
    WHERE m.origin_node_id = ?
      AND m.deleted = 0
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

function listRecentMeshMessages(nodeId, limit = 12) {
  return all(`
    SELECT
      id,
      origin_node_id AS originNodeId,
      local_message_id AS localMessageId,
      message_code AS messageCode,
      msg_type AS msgType,
      source_node_id AS sourceNodeId,
      destination_node_id AS destinationNodeId,
      conversation_node_id AS conversationNodeId,
      sender_code AS senderCode,
      sender_first_name AS senderFirstName,
      sender_last_name AS senderLastName,
      sender_role AS senderRole,
      SUBSTR(COALESCE(content, ''), 1, 600) AS content,
      status,
      priority,
      message_timestamp AS messageTimestamp,
      uploaded_at AS uploadedAt
    FROM mesh_messages
    WHERE origin_node_id = ?
    ORDER BY datetime(COALESCE(message_timestamp, uploaded_at)) DESC, id DESC
    LIMIT ?
  `, [nodeId, limit]);
}

function listMeshMessageFeed(limit = 120) {
  return all(`
    SELECT
      id,
      origin_node_id AS originNodeId,
      local_message_id AS localMessageId,
      message_code AS messageCode,
      msg_type AS msgType,
      source_node_id AS sourceNodeId,
      destination_node_id AS destinationNodeId,
      conversation_node_id AS conversationNodeId,
      sender_code AS senderCode,
      sender_first_name AS senderFirstName,
      sender_last_name AS senderLastName,
      sender_role AS senderRole,
      SUBSTR(COALESCE(content, ''), 1, 800) AS content,
      status,
      priority,
      message_timestamp AS messageTimestamp,
      uploaded_at AS uploadedAt
    FROM mesh_messages
    ORDER BY datetime(COALESCE(message_timestamp, uploaded_at)) DESC, id DESC
    LIMIT ?
  `, [limit]);
}

module.exports = {
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
};
