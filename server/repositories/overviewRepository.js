const { all, get } = require('../database/sqlite');

function getOverviewCounts() {
  return get(`
    SELECT
      (SELECT COUNT(*) FROM mesh_distress_signals WHERE deleted = 0 AND LOWER(COALESCE(status, 'active')) = 'active') AS activeDistressCount,
      (SELECT COUNT(*) FROM mesh_distress_signals WHERE deleted = 0 AND LOWER(COALESCE(status, 'active')) IN ('canceled', 'cancelled')) AS canceledDistressCount,
      (SELECT COUNT(*) FROM distress_deployments WHERE status = 'deployed') AS deployedDeploymentCount,
      (SELECT COUNT(*) FROM distress_deployments WHERE status = 'accomplished') AS accomplishedDeploymentCount,
      (SELECT COUNT(*) FROM users WHERE status = 'pending') AS pendingUserCount,
      (SELECT COUNT(*) FROM users WHERE status = 'approved') AS approvedUserCount,
      (SELECT COUNT(*) FROM rescuers WHERE access_status = 'active' AND status = 'available') AS availableRescuerCount,
      (SELECT COUNT(*) FROM rescuers WHERE access_status = 'active' AND status = 'dispatched') AS dispatchedRescuerCount,
      (SELECT COUNT(*) FROM rescuers WHERE access_status = 'active' AND status = 'unavailable') AS unavailableRescuerCount,
      (SELECT COUNT(*) FROM rescue_teams WHERE status = 'active') AS activeTeamCount,
      (SELECT COUNT(*) FROM rescue_teams WHERE status = 'dispatched') AS dispatchedTeamCount,
      (SELECT COUNT(*) FROM rescue_teams WHERE status = 'inactive') AS inactiveTeamCount,
      (SELECT COUNT(*) FROM sync_devices WHERE status = 'active') AS activeDeviceCount,
      (SELECT COUNT(*) FROM sync_devices WHERE status = 'revoked') AS revokedDeviceCount,
      (SELECT COUNT(*) FROM mesh_messages) AS totalMessageCount,
      (SELECT COUNT(*) FROM mesh_node_health_logs WHERE datetime(COALESCE(recorded_at, created_at)) >= datetime('now', '-1 day')) AS healthLog24hCount
  `);
}

function listDeviceActivityRows() {
  return all(`
    SELECT
      sd.id,
      sd.node_id AS nodeId,
      sd.node_name AS nodeName,
      sd.status AS deviceStatus,
      sd.last_seen_at AS deviceLastSeenAt,
      sd.last_sync_at AS lastSyncAt,
      mn.last_seen_at AS nodeLastSeenAt
    FROM sync_devices sd
    LEFT JOIN mesh_nodes mn ON mn.node_id = sd.node_id
    ORDER BY COALESCE(sd.last_sync_at, sd.last_seen_at, mn.last_seen_at, sd.created_at) DESC, sd.id DESC
  `);
}

function listDistressTrendRows() {
  return all(`
    WITH RECURSIVE days(day, idx) AS (
      SELECT date('now', '-6 day'), 0
      UNION ALL
      SELECT date(day, '+1 day'), idx + 1 FROM days WHERE idx < 6
    )
    SELECT
      days.day,
      COALESCE(distress.count, 0) AS distressCount,
      COALESCE(messages.count, 0) AS messageCount
    FROM days
    LEFT JOIN (
      SELECT date(COALESCE(timestamp, created_at, updated_at)) AS day, COUNT(*) AS count
      FROM mesh_distress_signals
      WHERE deleted = 0
        AND date(COALESCE(timestamp, created_at, updated_at)) >= date('now', '-6 day')
      GROUP BY date(COALESCE(timestamp, created_at, updated_at))
    ) distress ON distress.day = days.day
    LEFT JOIN (
      SELECT date(COALESCE(message_timestamp, uploaded_at)) AS day, COUNT(*) AS count
      FROM mesh_messages
      WHERE date(COALESCE(message_timestamp, uploaded_at)) >= date('now', '-6 day')
      GROUP BY date(COALESCE(message_timestamp, uploaded_at))
    ) messages ON messages.day = days.day
    ORDER BY days.day ASC
  `);
}

function listRecentEmergencyRows() {
  return all(`
    SELECT
      m.id,
      m.distress_code AS distressCode,
      m.reason,
      m.status,
      m.priority,
      m.origin_node_id AS nodeId,
      COALESCE(n.node_name, sd.node_name, m.origin_node_id) AS nodeName,
      m.timestamp,
      m.updated_at AS updatedAt,
      d.deployment_code AS deploymentCode,
      d.status AS deploymentStatus,
      t.team_code AS teamCode,
      t.name AS teamName
    FROM mesh_distress_signals m
    LEFT JOIN distress_deployments d
      ON d.id = (
        SELECT inner_d.id
        FROM distress_deployments inner_d
        WHERE inner_d.mesh_distress_signal_id = m.id
        ORDER BY datetime(COALESCE(inner_d.updated_at, inner_d.created_at)) DESC, inner_d.id DESC
        LIMIT 1
      )
    LEFT JOIN rescue_teams t ON t.id = d.team_id
    LEFT JOIN mesh_nodes n ON n.node_id = m.origin_node_id
    LEFT JOIN sync_devices sd ON sd.node_id = m.origin_node_id
    WHERE m.deleted = 0
    ORDER BY datetime(COALESCE(m.updated_at, m.timestamp, m.created_at)) DESC, m.id DESC
    LIMIT 4
  `);
}

function listRecentNotificationRows() {
  return all(`
    SELECT
      id,
      type,
      title,
      message,
      created_at AS createdAt,
      read_at AS readAt
    FROM notifications
    WHERE hidden_at IS NULL
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT 4
  `);
}

module.exports = {
  getOverviewCounts,
  listDeviceActivityRows,
  listDistressTrendRows,
  listRecentEmergencyRows,
  listRecentNotificationRows
};
