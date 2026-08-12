const { all, get } = require('../database/postgres');

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
      mnl.rssi AS signalStrengthDbm,
      mnl.reporting_node_id AS signalReportedByNodeId,
      mnl.last_seen_at AS signalLastSeenAt,
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
    LEFT JOIN mesh_node_links mnl
      ON mnl.id = (
        SELECT inner_mnl.id
        FROM mesh_node_links inner_mnl
        WHERE inner_mnl.neighbor_node_id = sd.node_id
        ORDER BY COALESCE(inner_mnl.last_seen_at, inner_mnl.updated_at, inner_mnl.created_at) DESC, inner_mnl.id DESC
        LIMIT 1
      )
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
          ORDER BY COALESCE(inner_d.updated_at, inner_d.created_at) DESC, inner_d.id DESC
          LIMIT 1
        )
      WHERE m.deleted = 0
        AND COALESCE(d.updated_at, m.updated_at, m.created_at) >= CURRENT_TIMESTAMP - INTERVAL '1 day'
      GROUP BY m.origin_node_id
    ) md ON md.origin_node_id = sd.node_id
    LEFT JOIN (
      SELECT origin_node_id, COUNT(*) AS recentMessageCount
      FROM mesh_messages
      WHERE COALESCE(message_timestamp, uploaded_at) >= CURRENT_TIMESTAMP - INTERVAL '1 day'
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
          ORDER BY COALESCE(inner_d.updated_at, inner_d.created_at) DESC, inner_d.id DESC
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
      WHERE COALESCE(event_timestamp, uploaded_at) >= CURRENT_TIMESTAMP - INTERVAL '1 day'
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
      mnl.rssi AS signalStrengthDbm,
      mnl.reporting_node_id AS signalReportedByNodeId,
      mnl.last_seen_at AS signalLastSeenAt,
      hl.battery_voltage AS batteryVoltage,
      hl.gps_status AS gpsStatus,
      hl.cpu_temp AS cpuTemp,
      hl.storage_remaining AS storageRemaining,
      hl.ram_usage AS ramUsage,
      hl.recorded_at AS healthRecordedAt,
      COALESCE(mc.pendingCommandCount, 0) AS pendingCommandCount,
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
    LEFT JOIN mesh_node_links mnl
      ON mnl.id = (
        SELECT inner_mnl.id
        FROM mesh_node_links inner_mnl
        WHERE inner_mnl.neighbor_node_id = sd.node_id
        ORDER BY COALESCE(inner_mnl.last_seen_at, inner_mnl.updated_at, inner_mnl.created_at) DESC, inner_mnl.id DESC
        LIMIT 1
      )
    LEFT JOIN mesh_node_health_logs hl
      ON hl.id = (
        SELECT inner_hl.id
        FROM mesh_node_health_logs inner_hl
        WHERE inner_hl.node_id = sd.node_id
        ORDER BY inner_hl.recorded_at DESC, inner_hl.id DESC
        LIMIT 1
      )
    LEFT JOIN (
      SELECT target_node_id, COUNT(*) AS pendingCommandCount
      FROM mesh_commands
      WHERE status = 'pending'
      GROUP BY target_node_id
    ) mc ON mc.target_node_id = sd.node_id
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
        ORDER BY COALESCE(inner_mds.updated_at, inner_mds.timestamp, inner_mds.created_at) DESC, inner_mds.id DESC
        LIMIT 1
      )
    ORDER BY COALESCE(sd.last_sync_at, sd.last_seen_at, sd.created_at) DESC, sd.id DESC
  `);
}

function listActiveDeviceMapRoutes() {
  return all(`
    SELECT *
    FROM (
    SELECT
      d.id AS deploymentId,
      d.deployment_code AS deploymentCode,
      d.mesh_distress_signal_id AS distressId,
      d.distress_source AS distressSource,
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
      m.user_code AS userCode,
      m.reason AS distressReason,
      m.latitude AS distressLatitude,
      m.longitude AS distressLongitude,
      m.first_name AS civilianFirstName,
      m.last_name AS civilianLastName,
      m.phone AS civilianPhone,
      m.blood_type AS civilianBloodType,
      m.age AS civilianAge,
      NULL AS civilianOccupation,
      m.origin_node_id AS distressOriginNodeId,
      n.node_name AS originNodeName,
      lc.latitude AS leaderLatitude,
      lc.longitude AS leaderLongitude,
      lc.recorded_at AS leaderRecordedAt,
      s.distance_m AS distanceM,
      s.duration_s AS durationS,
      s.eta_minutes AS etaMinutes,
      s.geometry_json AS geometryJson,
      s.provider AS routeProvider,
      s.updated_at AS routeUpdatedAt
    FROM distress_deployments d
    LEFT JOIN deployment_route_snapshots s ON s.deployment_id = d.id
    INNER JOIN mesh_distress_signals m ON m.id = d.mesh_distress_signal_id
    LEFT JOIN rescue_teams t ON t.id = d.team_id
    LEFT JOIN rescuers r ON r.id = d.team_leader_rescuer_id
    LEFT JOIN mesh_nodes n ON n.node_id = d.origin_node_id
    LEFT JOIN rescuer_locations_current lc ON lc.rescuer_id = d.team_leader_rescuer_id
    WHERE d.status = 'deployed'
      AND d.distress_source = 'mesh'
      AND m.deleted = 0
    UNION ALL
    SELECT
      d.id AS deploymentId,
      d.deployment_code AS deploymentCode,
      d.online_distress_signal_id AS distressId,
      d.distress_source AS distressSource,
      NULL AS originNodeId,
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
      o.distress_code AS distressCode,
      o.user_code AS userCode,
      o.reason AS distressReason,
      o.latitude AS distressLatitude,
      o.longitude AS distressLongitude,
      o.first_name AS civilianFirstName,
      o.last_name AS civilianLastName,
      o.phone AS civilianPhone,
      o.blood_type AS civilianBloodType,
      o.age AS civilianAge,
      o.occupation AS civilianOccupation,
      NULL AS distressOriginNodeId,
      'Civilian online location' AS originNodeName,
      lc.latitude AS leaderLatitude,
      lc.longitude AS leaderLongitude,
      lc.recorded_at AS leaderRecordedAt,
      s.distance_m AS distanceM,
      s.duration_s AS durationS,
      s.eta_minutes AS etaMinutes,
      s.geometry_json AS geometryJson,
      s.provider AS routeProvider,
      s.updated_at AS routeUpdatedAt
    FROM distress_deployments d
    LEFT JOIN deployment_route_snapshots s ON s.deployment_id = d.id
    INNER JOIN online_distress_signals o ON o.id = d.online_distress_signal_id
    LEFT JOIN rescue_teams t ON t.id = d.team_id
    LEFT JOIN rescuers r ON r.id = d.team_leader_rescuer_id
    LEFT JOIN rescuer_locations_current lc ON lc.rescuer_id = d.team_leader_rescuer_id
    WHERE d.status = 'deployed'
      AND d.distress_source = 'online'
      AND o.deleted = 0
      AND LOWER(COALESCE(o.status, 'active')) = 'active'
    ) routes
    ORDER BY COALESCE("deployedAt", "deploymentUpdatedAt") DESC, "deploymentId" DESC
  `);
}

function listActiveOnlineDistressMapMarkers() {
  return all(`
    SELECT
      o.id,
      o.distress_code AS distressCode,
      o.user_id AS userId,
      o.user_code AS userCode,
      o.first_name AS firstName,
      o.last_name AS lastName,
      o.phone,
      o.blood_type AS bloodType,
      o.age,
      o.occupation,
      o.reason,
      o.latitude,
      o.longitude,
      o.recorded_at AS recordedAt,
      o.updated_at AS updatedAt,
      d.id AS deploymentId,
      d.deployment_code AS deploymentCode,
      d.status AS deploymentStatus,
      t.team_code AS teamCode,
      t.name AS teamName
    FROM online_distress_signals o
    LEFT JOIN distress_deployments d
      ON d.id = (
        SELECT inner_d.id
        FROM distress_deployments inner_d
        WHERE inner_d.online_distress_signal_id = o.id
        ORDER BY COALESCE(inner_d.updated_at, inner_d.created_at) DESC, inner_d.id DESC
        LIMIT 1
      )
    LEFT JOIN rescue_teams t ON t.id = d.team_id
    WHERE o.deleted = 0
      AND LOWER(COALESCE(o.status, 'active')) = 'active'
    ORDER BY COALESCE(o.updated_at, o.recorded_at) DESC, o.id DESC
  `);
}

function listSharedRescuerMapMarkers(cutoffTimestamp) {
  return all(`
    SELECT
      r.id,
      r.rescuer_code AS rescuerCode,
      r.first_name_enc AS firstNameEnc,
      r.last_name_enc AS lastNameEnc,
      r.phone_enc AS phoneEnc,
      r.agency,
      t.team_code AS teamCode,
      t.name AS teamName,
      l.latitude,
      l.longitude,
      l.accuracy_m AS accuracyM,
      l.recorded_at AS recordedAt,
      l.updated_at AS updatedAt
    FROM rescuer_location_sharing_settings s
    INNER JOIN rescuers r ON r.id = s.rescuer_id
    INNER JOIN rescuer_locations_current l ON l.rescuer_id = r.id
    LEFT JOIN rescue_teams t ON t.id = r.team_id
    WHERE s.sharing_enabled = TRUE
      AND r.access_status = 'active'
      AND l.recorded_at >= ?
    ORDER BY l.recorded_at DESC, r.id ASC
  `, [cutoffTimestamp]);
}

function listMeshNodeMapLinks() {
  return all(`
    SELECT
      l.reporting_node_id AS reportingNodeId,
      l.neighbor_node_id AS neighborNodeId,
      l.rssi,
      l.last_seen_at AS lastSeenAt,
      source.node_name AS sourceNodeName,
      source.latitude AS sourceLatitude,
      source.longitude AS sourceLongitude,
      target.node_name AS targetNodeName,
      target.latitude AS targetLatitude,
      target.longitude AS targetLongitude
    FROM mesh_node_links l
    LEFT JOIN mesh_nodes source ON source.node_id = l.reporting_node_id
    LEFT JOIN mesh_nodes target ON target.node_id = l.neighbor_node_id
    WHERE source.latitude IS NOT NULL
      AND source.longitude IS NOT NULL
      AND target.latitude IS NOT NULL
      AND target.longitude IS NOT NULL
    ORDER BY COALESCE(l.last_seen_at, l.updated_at, l.created_at) DESC, l.id DESC
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
      mnl.rssi AS signalStrengthDbm,
      mnl.reporting_node_id AS signalReportedByNodeId,
      mnl.last_seen_at AS signalLastSeenAt,
      COALESCE(mc.pendingCommandCount, 0) AS pendingCommandCount,
      COALESCE(md.recentActiveDistressCount, 0) AS recentActiveDistressCount,
      COALESCE(md.recentSolvedDistressCount, 0) AS recentSolvedDistressCount,
      COALESCE(md.recentCanceledDistressCount, 0) AS recentCanceledDistressCount,
      COALESCE(mm.recentMessageCount, 0) AS recentMessageCount,
      COALESCE(ma.recentAuditCount, 0) AS recentAuditCount
    FROM sync_devices sd
    LEFT JOIN mesh_nodes mn ON mn.node_id = sd.node_id
    LEFT JOIN mesh_node_links mnl
      ON mnl.id = (
        SELECT inner_mnl.id
        FROM mesh_node_links inner_mnl
        WHERE inner_mnl.neighbor_node_id = sd.node_id
        ORDER BY COALESCE(inner_mnl.last_seen_at, inner_mnl.updated_at, inner_mnl.created_at) DESC, inner_mnl.id DESC
        LIMIT 1
      )
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
          ORDER BY COALESCE(inner_d.updated_at, inner_d.created_at) DESC, inner_d.id DESC
          LIMIT 1
        )
      WHERE m.deleted = 0
        AND COALESCE(d.updated_at, m.updated_at, m.created_at) >= CURRENT_TIMESTAMP - INTERVAL '1 day'
      GROUP BY m.origin_node_id
    ) md ON md.origin_node_id = sd.node_id
    LEFT JOIN (
      SELECT origin_node_id, COUNT(*) AS recentMessageCount
      FROM mesh_messages
      WHERE COALESCE(message_timestamp, uploaded_at) >= CURRENT_TIMESTAMP - INTERVAL '1 day'
      GROUP BY origin_node_id
    ) mm ON mm.origin_node_id = sd.node_id
    LEFT JOIN (
      SELECT origin_node_id, COUNT(*) AS recentAuditCount
      FROM mesh_audit_logs
      WHERE COALESCE(event_timestamp, uploaded_at) >= CURRENT_TIMESTAMP - INTERVAL '1 day'
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
    ORDER BY recorded_at DESC, id DESC
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
        ORDER BY COALESCE(inner_d.updated_at, inner_d.created_at) DESC, inner_d.id DESC
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
    ORDER BY COALESCE(message_timestamp, uploaded_at) DESC, id DESC
    LIMIT ?
  `, [nodeId, limit]);
}

function listMeshMessageFeed(limit = 120, offset = 0) {
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
    ORDER BY COALESCE(message_timestamp, uploaded_at) DESC, id DESC
    LIMIT ?
    OFFSET ?
  `, [limit, offset]);
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
  listMeshMessageFeed,
  listActiveOnlineDistressMapMarkers,
  listSharedRescuerMapMarkers,
  listMeshNodeMapLinks
};
