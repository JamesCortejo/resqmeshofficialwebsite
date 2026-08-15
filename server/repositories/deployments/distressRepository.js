const { all, get } = require('../../database/postgres');

function listDistressSignals() {
  return all(`
    SELECT *
    FROM (
    SELECT
      m.id,
      CONCAT('mesh:', m.id) AS sourceKey,
      'mesh' AS distressSource,
      'MESH' AS sourceLabel,
      m.distress_code AS distressCode,
      m.user_code AS userCode,
      m.first_name AS firstName,
      m.last_name AS lastName,
      m.phone,
      m.blood_type AS bloodType,
      m.age,
      m.node_id AS nodeId,
      m.origin_node_id AS originNodeId,
      COALESCE(n.node_name, m.node_id, m.origin_node_id) AS nodeName,
      m.origin_distress_id AS originDistressId,
      m.reason,
      m.latitude,
      m.longitude,
      m.timestamp,
      m.status AS distressStatus,
      m.priority,
      m.updated_at AS updatedAt,
      d.id AS deploymentId,
      d.deployment_code AS deploymentCode,
      d.team_id AS teamId,
      d.team_leader_rescuer_id AS teamLeaderRescuerId,
      d.status AS deploymentStatus,
      d.created_at AS deploymentCreatedAt,
      d.deployed_at AS deployedAt,
      d.canceled_at AS canceledAt,
      d.accomplished_at AS accomplishedAt,
      d.updated_at AS deploymentUpdatedAt,
      t.team_code AS teamCode,
      t.name AS teamName,
      t.status AS teamStatus,
      r.rescuer_code AS teamLeaderRescuerCode,
      r.first_name_enc AS leaderFirstNameEnc,
      r.middle_name_enc AS leaderMiddleNameEnc,
      r.last_name_enc AS leaderLastNameEnc
    FROM mesh_distress_signals m
    LEFT JOIN distress_deployments d
      ON d.id = (
        SELECT dd.id
        FROM distress_deployments dd
        WHERE dd.mesh_distress_signal_id = m.id
        ORDER BY
          CASE WHEN dd.status = 'deployed' THEN 0 ELSE 1 END,
          COALESCE(dd.updated_at, dd.created_at) DESC,
          dd.id DESC
        LIMIT 1
      )
    LEFT JOIN mesh_nodes n ON n.node_id = m.origin_node_id
    LEFT JOIN rescue_teams t ON t.id = d.team_id
    LEFT JOIN rescuers r ON r.id = d.team_leader_rescuer_id
    WHERE m.deleted = 0
    UNION ALL
    SELECT
      o.id,
      CONCAT('online:', o.id) AS sourceKey,
      'online' AS distressSource,
      'ONLINE' AS sourceLabel,
      o.distress_code AS distressCode,
      o.user_code AS userCode,
      o.first_name AS firstName,
      o.last_name AS lastName,
      o.phone,
      o.blood_type AS bloodType,
      o.age,
      NULL AS nodeId,
      NULL AS originNodeId,
      'Civilian online location' AS nodeName,
      o.id AS originDistressId,
      o.reason,
      o.latitude,
      o.longitude,
      o.recorded_at AS timestamp,
      o.status AS distressStatus,
      'high' AS priority,
      o.updated_at AS updatedAt,
      d.id AS deploymentId,
      d.deployment_code AS deploymentCode,
      d.team_id AS teamId,
      d.team_leader_rescuer_id AS teamLeaderRescuerId,
      d.status AS deploymentStatus,
      d.created_at AS deploymentCreatedAt,
      d.deployed_at AS deployedAt,
      d.canceled_at AS canceledAt,
      d.accomplished_at AS accomplishedAt,
      d.updated_at AS deploymentUpdatedAt,
      t.team_code AS teamCode,
      t.name AS teamName,
      t.status AS teamStatus,
      r.rescuer_code AS teamLeaderRescuerCode,
      r.first_name_enc AS leaderFirstNameEnc,
      r.middle_name_enc AS leaderMiddleNameEnc,
      r.last_name_enc AS leaderLastNameEnc
    FROM online_distress_signals o
    LEFT JOIN distress_deployments d
      ON d.id = (
        SELECT dd.id
        FROM distress_deployments dd
        WHERE dd.online_distress_signal_id = o.id
          AND dd.distress_source = 'online'
        ORDER BY
          CASE WHEN dd.status = 'deployed' THEN 0 ELSE 1 END,
          COALESCE(dd.updated_at, dd.created_at) DESC,
          dd.id DESC
        LIMIT 1
      )
    LEFT JOIN rescue_teams t ON t.id = d.team_id
    LEFT JOIN rescuers r ON r.id = d.team_leader_rescuer_id
    WHERE o.deleted = 0
    ) combined
    ORDER BY
      CASE
        WHEN "deploymentStatus" = 'deployed' THEN 0
        WHEN LOWER(COALESCE("distressStatus", '')) = 'active' THEN 1
        WHEN "deploymentStatus" = 'accomplished' THEN 2
        WHEN "deploymentStatus" = 'canceled' THEN 3
        WHEN LOWER(COALESCE("distressStatus", '')) IN ('canceled', 'cancelled') THEN 4
        ELSE 5
      END,
      COALESCE("deploymentUpdatedAt", "updatedAt", timestamp) DESC,
      id DESC
  `);
}

function countUnresolvedDistressSignals() {
  return get(`
    SELECT COUNT(*) AS count
    FROM (
      SELECT
        m.status AS distress_status,
        d.status AS deployment_status
      FROM mesh_distress_signals m
      LEFT JOIN distress_deployments d
        ON d.id = (
          SELECT dd.id
          FROM distress_deployments dd
          WHERE dd.mesh_distress_signal_id = m.id
          ORDER BY
            CASE WHEN dd.status = 'deployed' THEN 0 ELSE 1 END,
            COALESCE(dd.updated_at, dd.created_at) DESC,
            dd.id DESC
          LIMIT 1
        )
      WHERE m.deleted = 0
      UNION ALL
      SELECT
        o.status AS distress_status,
        d.status AS deployment_status
      FROM online_distress_signals o
      LEFT JOIN distress_deployments d
        ON d.id = (
          SELECT dd.id
          FROM distress_deployments dd
          WHERE dd.online_distress_signal_id = o.id
            AND dd.distress_source = 'online'
          ORDER BY
            CASE WHEN dd.status = 'deployed' THEN 0 ELSE 1 END,
            COALESCE(dd.updated_at, dd.created_at) DESC,
            dd.id DESC
          LIMIT 1
        )
      WHERE o.deleted = 0
    ) combined
    WHERE LOWER(COALESCE(distress_status, '')) = 'active'
      AND (
        deployment_status IS NULL
        OR deployment_status = 'deployed'
      )
  `);
}

function getDistressSignalById(id) {
  return get(`
    SELECT
      m.id,
      CONCAT('mesh:', m.id) AS sourceKey,
      'mesh' AS distressSource,
      'MESH' AS sourceLabel,
      m.distress_code AS distressCode,
      m.user_code AS userCode,
      m.first_name AS firstName,
      m.last_name AS lastName,
      m.phone,
      m.blood_type AS bloodType,
      m.age,
      m.node_id AS nodeId,
      m.origin_node_id AS originNodeId,
      COALESCE(n.node_name, m.node_id, m.origin_node_id) AS nodeName,
      m.origin_distress_id AS originDistressId,
      m.reason,
      m.latitude,
      m.longitude,
      m.timestamp,
      m.status AS distressStatus,
      m.priority,
      m.updated_at AS updatedAt,
      d.id AS deploymentId,
      d.deployment_code AS deploymentCode,
      d.team_id AS teamId,
      d.team_leader_rescuer_id AS teamLeaderRescuerId,
      d.status AS deploymentStatus,
      d.created_at AS deploymentCreatedAt,
      d.deployed_at AS deployedAt,
      d.canceled_at AS canceledAt,
      d.accomplished_at AS accomplishedAt,
      d.updated_at AS deploymentUpdatedAt,
      t.team_code AS teamCode,
      t.name AS teamName,
      t.status AS teamStatus,
      r.rescuer_code AS teamLeaderRescuerCode,
      r.first_name_enc AS leaderFirstNameEnc,
      r.middle_name_enc AS leaderMiddleNameEnc,
      r.last_name_enc AS leaderLastNameEnc
    FROM mesh_distress_signals m
    LEFT JOIN distress_deployments d
      ON d.id = (
        SELECT dd.id
        FROM distress_deployments dd
        WHERE dd.mesh_distress_signal_id = m.id
        ORDER BY
          CASE WHEN dd.status = 'deployed' THEN 0 ELSE 1 END,
          COALESCE(dd.updated_at, dd.created_at) DESC,
          dd.id DESC
        LIMIT 1
      )
    LEFT JOIN mesh_nodes n ON n.node_id = m.origin_node_id
    LEFT JOIN rescue_teams t ON t.id = d.team_id
    LEFT JOIN rescuers r ON r.id = d.team_leader_rescuer_id
    WHERE m.id = ?
      AND m.deleted = 0
    LIMIT 1
  `, [id]);
}

function getActiveDistressSignalById(id) {
  return get(`
    SELECT
      id,
      distress_code AS distressCode,
      user_code AS userCode,
      first_name AS firstName,
      last_name AS lastName,
      phone,
      blood_type AS bloodType,
      age,
      node_id AS nodeId,
      origin_node_id AS originNodeId,
      origin_distress_id AS originDistressId,
      reason,
      latitude,
      longitude,
      timestamp,
      status AS distressStatus,
      priority,
      updated_at AS updatedAt
    FROM mesh_distress_signals
    WHERE id = ?
      AND deleted = 0
      AND LOWER(COALESCE(status, '')) = 'active'
    LIMIT 1
  `, [id]);
}

function getOnlineDistressSignalById(id) {
  return get(`
    SELECT
      o.id,
      CONCAT('online:', o.id) AS sourceKey,
      'online' AS distressSource,
      'ONLINE' AS sourceLabel,
      o.distress_code AS distressCode,
      o.user_code AS userCode,
      o.first_name AS firstName,
      o.last_name AS lastName,
      o.phone,
      o.blood_type AS bloodType,
      o.age,
      o.occupation,
      NULL AS nodeId,
      NULL AS originNodeId,
      'Civilian online location' AS nodeName,
      o.id AS originDistressId,
      o.reason,
      o.latitude,
      o.longitude,
      o.recorded_at AS timestamp,
      o.status AS distressStatus,
      'high' AS priority,
      o.updated_at AS updatedAt,
      d.id AS deploymentId,
      d.deployment_code AS deploymentCode,
      d.team_id AS teamId,
      d.team_leader_rescuer_id AS teamLeaderRescuerId,
      d.status AS deploymentStatus,
      d.created_at AS deploymentCreatedAt,
      d.deployed_at AS deployedAt,
      d.canceled_at AS canceledAt,
      d.accomplished_at AS accomplishedAt,
      d.updated_at AS deploymentUpdatedAt,
      t.team_code AS teamCode,
      t.name AS teamName,
      t.status AS teamStatus,
      r.rescuer_code AS teamLeaderRescuerCode,
      r.first_name_enc AS leaderFirstNameEnc,
      r.middle_name_enc AS leaderMiddleNameEnc,
      r.last_name_enc AS leaderLastNameEnc
    FROM online_distress_signals o
    LEFT JOIN distress_deployments d
      ON d.id = (
        SELECT dd.id
        FROM distress_deployments dd
        WHERE dd.online_distress_signal_id = o.id
          AND dd.distress_source = 'online'
        ORDER BY
          CASE WHEN dd.status = 'deployed' THEN 0 ELSE 1 END,
          COALESCE(dd.updated_at, dd.created_at) DESC,
          dd.id DESC
        LIMIT 1
      )
    LEFT JOIN rescue_teams t ON t.id = d.team_id
    LEFT JOIN rescuers r ON r.id = d.team_leader_rescuer_id
    WHERE o.id = ?
      AND o.deleted = 0
    LIMIT 1
  `, [id]);
}

function getActiveOnlineDistressSignalById(id) {
  return get(`
    SELECT
      id,
      CONCAT('online:', id) AS sourceKey,
      'online' AS distressSource,
      distress_code AS distressCode,
      user_code AS userCode,
      first_name AS firstName,
      last_name AS lastName,
      phone,
      blood_type AS bloodType,
      age,
      occupation,
      NULL AS originNodeId,
      id AS originDistressId,
      reason,
      latitude,
      longitude,
      recorded_at AS timestamp,
      status AS distressStatus,
      'high' AS priority,
      updated_at AS updatedAt
    FROM online_distress_signals
    WHERE id = ?
      AND deleted = 0
      AND status = 'active'
    LIMIT 1
  `, [id]);
}

function listPublicNodes() {
  return all(`
    SELECT
      n.node_id AS id,
      n.node_name AS name,
      n.latitude,
      n.longitude,
      n.status,
      n.last_seen_at AS lastSeen,
      n.battery_percent AS batteryPercent,
      n.battery_voltage AS batteryVoltage,
      sd.status AS deviceStatus,
      sd.last_seen_at AS deviceLastSeen,
      sd.last_sync_at AS lastSyncAt,
      COALESCE(mnl.rssi, lh.signal_strength) AS signal,
      COALESCE(mnl.rssi, lh.signal_strength) AS signalStrengthDbm,
      mnl.rssi AS rssi,
      mnl.reporting_node_id AS signalReportedByNodeId,
      mnl.last_seen_at AS signalLastSeenAt,
      lh.recorded_at AS signalHealthRecordedAt,
      n.users_connected AS users,
      CASE WHEN EXISTS (
        SELECT 1
        FROM mesh_distress_signals m
        WHERE m.origin_node_id = n.node_id
          AND m.deleted = 0
          AND LOWER(COALESCE(m.status, '')) = 'active'
      ) THEN 1 ELSE 0 END AS distress,
      (
        SELECT m.id
        FROM mesh_distress_signals m
        WHERE m.origin_node_id = n.node_id
          AND m.deleted = 0
          AND LOWER(COALESCE(m.status, '')) = 'active'
        ORDER BY COALESCE(m.updated_at, m.timestamp) DESC, m.id DESC
        LIMIT 1
      ) AS activeDistressId
    FROM mesh_nodes n
    LEFT JOIN sync_devices sd ON sd.node_id = n.node_id
    LEFT JOIN mesh_node_links mnl
      ON mnl.id = (
        SELECT inner_mnl.id
        FROM mesh_node_links inner_mnl
        WHERE inner_mnl.neighbor_node_id = n.node_id
        ORDER BY COALESCE(inner_mnl.last_seen_at, inner_mnl.updated_at, inner_mnl.created_at) DESC, inner_mnl.id DESC
        LIMIT 1
      )
    LEFT JOIN mesh_node_health_logs lh
      ON lh.id = (
        SELECT inner_lh.id
        FROM mesh_node_health_logs inner_lh
        WHERE inner_lh.node_id = n.node_id
        ORDER BY inner_lh.recorded_at DESC, inner_lh.id DESC
        LIMIT 1
      )
    WHERE n.deleted = 0
    ORDER BY COALESCE(n.updated_at, n.created_at) DESC, n.id DESC
  `);
}

function getNodeActiveDistress(nodeId) {
  return get(`
    SELECT
      id,
      distress_code AS distressCode,
      user_code AS userCode,
      first_name AS firstName,
      last_name AS lastName,
      phone,
      blood_type AS bloodType,
      age,
      origin_node_id AS originNodeId,
      origin_distress_id AS originDistressId,
      reason,
      latitude,
      longitude,
      timestamp,
      status,
      priority
    FROM mesh_distress_signals
    WHERE origin_node_id = ?
      AND deleted = 0
      AND LOWER(COALESCE(status, '')) = 'active'
    ORDER BY COALESCE(updated_at, timestamp) DESC, id DESC
    LIMIT 1
  `, [nodeId]);
}

module.exports = {
  listDistressSignals,
  countUnresolvedDistressSignals,
  getDistressSignalById,
  getActiveDistressSignalById,
  getOnlineDistressSignalById,
  getActiveOnlineDistressSignalById,
  listPublicNodes,
  getNodeActiveDistress
};
