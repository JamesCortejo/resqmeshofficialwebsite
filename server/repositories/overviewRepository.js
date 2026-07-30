const { all, get } = require('../database/postgres');

function getOverviewCounts() {
  return get(`
    SELECT
      (SELECT COUNT(*) FROM mesh_distress_signals WHERE deleted = 0 AND LOWER(COALESCE(status, 'active')) = 'active') AS meshActiveDistressCount,
      (SELECT COUNT(*) FROM mesh_distress_signals WHERE deleted = 0 AND LOWER(COALESCE(status, 'active')) IN ('canceled', 'cancelled')) AS meshCanceledDistressCount,
      (SELECT COUNT(*) FROM online_distress_signals WHERE deleted = 0 AND status = 'active') AS onlineActiveDistressCount,
      (SELECT COUNT(*) FROM online_distress_signals WHERE deleted = 0 AND status = 'canceled') AS onlineCanceledDistressCount,
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
      (SELECT COUNT(*) FROM mesh_messages) AS totalMeshMessageCount,
      (SELECT COUNT(*) FROM mesh_node_health_logs WHERE recorded_at >= NOW() - INTERVAL '1 day') AS healthLog24hCount,
      (SELECT COUNT(*) FROM online_chat_departments WHERE status = 'active') AS activeDepartmentChatCount,
      (SELECT COUNT(*) FROM online_chat_conversations WHERE status = 'open') AS openConversationCount,
      (
        (SELECT COUNT(*) FROM online_chat_messages WHERE deleted = 0 AND created_at >= NOW() - INTERVAL '1 day')
        +
        (SELECT COUNT(*) FROM online_chat_global_messages WHERE deleted = 0 AND created_at >= NOW() - INTERVAL '1 day')
      ) AS chatMessage24hCount,
      (
        SELECT COUNT(*)
        FROM rescuer_location_sharing_settings s
        INNER JOIN rescuer_locations_current l ON l.rescuer_id = s.rescuer_id
        INNER JOIN rescuers r ON r.id = s.rescuer_id
        WHERE s.sharing_enabled = TRUE
          AND r.access_status = 'active'
          AND COALESCE(l.recorded_at, l.updated_at) >= NOW() - INTERVAL '2 minutes'
      ) AS sharedRescuerLiveCount
  `);
}

function listDeviceActivityRows() {
  return all(`
    SELECT
      sd.id,
      sd.node_id AS "nodeId",
      sd.node_name AS "nodeName",
      sd.status AS "deviceStatus",
      sd.last_seen_at AS "deviceLastSeenAt",
      sd.last_sync_at AS "lastSyncAt",
      mn.last_seen_at AS "nodeLastSeenAt"
    FROM sync_devices sd
    LEFT JOIN mesh_nodes mn ON mn.node_id = sd.node_id
    ORDER BY COALESCE(sd.last_sync_at, sd.last_seen_at, mn.last_seen_at, sd.created_at) DESC, sd.id DESC
  `);
}

function listDistressTrendRows() {
  return all(`
    WITH days AS (
      SELECT generate_series(
        CURRENT_DATE - INTERVAL '6 day',
        CURRENT_DATE,
        INTERVAL '1 day'
      )::date AS day
    ),
    distress AS (
      SELECT reported_day, COUNT(*) AS count
      FROM (
        SELECT DATE(COALESCE(timestamp, created_at, updated_at)) AS reported_day
        FROM mesh_distress_signals
        WHERE deleted = 0
          AND DATE(COALESCE(timestamp, created_at, updated_at)) >= CURRENT_DATE - INTERVAL '6 day'
        UNION ALL
        SELECT DATE(COALESCE(recorded_at, created_at, updated_at)) AS reported_day
        FROM online_distress_signals
        WHERE deleted = 0
          AND DATE(COALESCE(recorded_at, created_at, updated_at)) >= CURRENT_DATE - INTERVAL '6 day'
      ) merged
      GROUP BY reported_day
    ),
    mesh_messages AS (
      SELECT DATE(COALESCE(message_timestamp, uploaded_at)) AS activity_day, COUNT(*) AS count
      FROM mesh_messages
      WHERE DATE(COALESCE(message_timestamp, uploaded_at)) >= CURRENT_DATE - INTERVAL '6 day'
      GROUP BY DATE(COALESCE(message_timestamp, uploaded_at))
    ),
    online_chat AS (
      SELECT activity_day, COUNT(*) AS count
      FROM (
        SELECT DATE(created_at) AS activity_day
        FROM online_chat_messages
        WHERE deleted = 0
          AND DATE(created_at) >= CURRENT_DATE - INTERVAL '6 day'
        UNION ALL
        SELECT DATE(created_at) AS activity_day
        FROM online_chat_global_messages
        WHERE deleted = 0
          AND DATE(created_at) >= CURRENT_DATE - INTERVAL '6 day'
      ) merged
      GROUP BY activity_day
    )
    SELECT
      days.day::text AS day,
      COALESCE(distress.count, 0) AS "distressCount",
      COALESCE(mesh_messages.count, 0) AS "messageCount",
      COALESCE(online_chat.count, 0) AS "chatCount"
    FROM days
    LEFT JOIN distress ON distress.reported_day = days.day
    LEFT JOIN mesh_messages ON mesh_messages.activity_day = days.day
    LEFT JOIN online_chat ON online_chat.activity_day = days.day
    ORDER BY days.day ASC
  `);
}

function listRecentEmergencyRows() {
  return all(`
    WITH latest_mesh_deployments AS (
      SELECT DISTINCT ON (d.mesh_distress_signal_id)
        d.mesh_distress_signal_id,
        d.deployment_code,
        d.status,
        d.team_id,
        d.updated_at,
        d.created_at
      FROM distress_deployments d
      WHERE d.mesh_distress_signal_id IS NOT NULL
      ORDER BY d.mesh_distress_signal_id, COALESCE(d.updated_at, d.created_at) DESC, d.id DESC
    ),
    latest_online_deployments AS (
      SELECT DISTINCT ON (d.online_distress_signal_id)
        d.online_distress_signal_id,
        d.deployment_code,
        d.status,
        d.team_id,
        d.updated_at,
        d.created_at
      FROM distress_deployments d
      WHERE d.online_distress_signal_id IS NOT NULL
      ORDER BY d.online_distress_signal_id, COALESCE(d.updated_at, d.created_at) DESC, d.id DESC
    )
    SELECT *
    FROM (
      SELECT
        m.id,
        'mesh' AS "sourceType",
        m.distress_code AS "distressCode",
        m.reason,
        m.status,
        m.priority,
        m.origin_node_id AS "originLabel",
        COALESCE(n.node_name, sd.node_name, m.origin_node_id) AS "subjectName",
        m.timestamp AS "reportedAt",
        m.updated_at AS "updatedAt",
        d.deployment_code AS "deploymentCode",
        d.status AS "deploymentStatus",
        t.name AS "teamName"
      FROM mesh_distress_signals m
      LEFT JOIN latest_mesh_deployments d ON d.mesh_distress_signal_id = m.id
      LEFT JOIN rescue_teams t ON t.id = d.team_id
      LEFT JOIN mesh_nodes n ON n.node_id = m.origin_node_id
      LEFT JOIN sync_devices sd ON sd.node_id = m.origin_node_id
      WHERE m.deleted = 0

      UNION ALL

      SELECT
        o.id,
        'online' AS "sourceType",
        o.distress_code AS "distressCode",
        o.reason,
        o.status,
        'high' AS priority,
        o.user_code AS "originLabel",
        NULLIF(TRIM(CONCAT(COALESCE(o.first_name, ''), ' ', COALESCE(o.last_name, ''))), '') AS "subjectName",
        o.recorded_at AS "reportedAt",
        o.updated_at AS "updatedAt",
        d.deployment_code AS "deploymentCode",
        d.status AS "deploymentStatus",
        t.name AS "teamName"
      FROM online_distress_signals o
      LEFT JOIN latest_online_deployments d ON d.online_distress_signal_id = o.id
      LEFT JOIN rescue_teams t ON t.id = d.team_id
      WHERE o.deleted = 0
    ) incidents
    ORDER BY COALESCE("updatedAt", "reportedAt") DESC, id DESC
    LIMIT 5
  `);
}

function listRecentNotificationRows() {
  return all(`
    SELECT
      id,
      type,
      title,
      message,
      created_at AS "createdAt",
      read_at AS "readAt"
    FROM notifications
    WHERE hidden_at IS NULL
    ORDER BY created_at DESC, id DESC
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
