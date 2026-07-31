const { all, get, run } = require('../database/postgres');

function buildIncidentUnionSql(sourceScope) {
  const parts = [];

  if (sourceScope === 'all' || sourceScope === 'mesh') {
    parts.push(`
      SELECT
        'mesh' AS "sourceType",
        m.id AS "incidentId",
        COALESCE(NULLIF(m.distress_code, ''), CONCAT('MDS-', m.id)) AS "distressCode",
        COALESCE(NULLIF(TRIM(m.reason), ''), 'Unknown') AS reason,
        CASE
          WHEN LOWER(COALESCE(d.status, '')) = 'accomplished' THEN 'accomplished'
          WHEN LOWER(COALESCE(d.status, '')) IN ('canceled', 'cancelled') THEN 'canceled'
          WHEN LOWER(COALESCE(m.status, 'active')) = 'accomplished' THEN 'accomplished'
          WHEN LOWER(COALESCE(m.status, 'active')) IN ('canceled', 'cancelled') THEN 'canceled'
          ELSE 'active'
        END AS "incidentStatus",
        m.timestamp AS "reportedAt",
        d.deployed_at AS "deployedAt",
        COALESCE(d.accomplished_at, d.canceled_at) AS "endedAt",
        d.deployment_code AS "deploymentCode",
        rt.name AS "teamName",
        d.status AS "deploymentStatus"
      FROM mesh_distress_signals m
      LEFT JOIN LATERAL (
        SELECT dd.*
        FROM distress_deployments dd
        WHERE dd.mesh_distress_signal_id = m.id
        ORDER BY COALESCE(dd.updated_at, dd.created_at) DESC, dd.id DESC
        LIMIT 1
      ) d ON TRUE
      LEFT JOIN rescue_teams rt ON rt.id = d.team_id
      WHERE m.deleted = 0
        AND m.timestamp IS NOT NULL
        AND m.timestamp >= ?
        AND m.timestamp < ?
    `);
  }

  if (sourceScope === 'all' || sourceScope === 'online') {
    parts.push(`
      SELECT
        'online' AS "sourceType",
        o.id AS "incidentId",
        o.distress_code AS "distressCode",
        COALESCE(NULLIF(TRIM(o.reason), ''), 'Unknown') AS reason,
        CASE
          WHEN LOWER(COALESCE(d.status, '')) = 'accomplished' THEN 'accomplished'
          WHEN LOWER(COALESCE(d.status, '')) IN ('canceled', 'cancelled') THEN 'canceled'
          WHEN LOWER(COALESCE(o.status, 'active')) = 'accomplished' THEN 'accomplished'
          WHEN LOWER(COALESCE(o.status, 'active')) IN ('canceled', 'cancelled') THEN 'canceled'
          ELSE 'active'
        END AS "incidentStatus",
        o.recorded_at AS "reportedAt",
        d.deployed_at AS "deployedAt",
        COALESCE(d.accomplished_at, d.canceled_at, o.accomplished_at, o.canceled_at) AS "endedAt",
        d.deployment_code AS "deploymentCode",
        rt.name AS "teamName",
        d.status AS "deploymentStatus"
      FROM online_distress_signals o
      LEFT JOIN LATERAL (
        SELECT dd.*
        FROM distress_deployments dd
        WHERE dd.online_distress_signal_id = o.id
        ORDER BY COALESCE(dd.updated_at, dd.created_at) DESC, dd.id DESC
        LIMIT 1
      ) d ON TRUE
      LEFT JOIN rescue_teams rt ON rt.id = d.team_id
      WHERE o.deleted = 0
        AND o.recorded_at >= ?
        AND o.recorded_at < ?
    `);
  }

  return parts.join('\nUNION ALL\n');
}

async function listIncidentSummaryRows({ sourceScope, rangeStartIso, rangeEndIso }) {
  const sql = buildIncidentUnionSql(sourceScope);

  if (!sql) {
    return [];
  }

  const params = [];
  if (sourceScope === 'all' || sourceScope === 'mesh') {
    params.push(rangeStartIso, rangeEndIso);
  }
  if (sourceScope === 'all' || sourceScope === 'online') {
    params.push(rangeStartIso, rangeEndIso);
  }

  return all(`
    WITH incidents AS (
      ${sql}
    )
    SELECT *
    FROM incidents
    ORDER BY "reportedAt" DESC, "distressCode" DESC
  `, params);
}

async function listRescueTeamActivityRows({ sourceScope, rangeStartIso, rangeEndIso }) {
  const params = [rangeStartIso, rangeEndIso];
  let sourceFilterSql = '';

  if (sourceScope === 'mesh') {
    sourceFilterSql = `AND COALESCE(NULLIF(LOWER(d.distress_source), ''), CASE WHEN d.online_distress_signal_id IS NOT NULL THEN 'online' ELSE 'mesh' END) = 'mesh'`;
  } else if (sourceScope === 'online') {
    sourceFilterSql = `AND COALESCE(NULLIF(LOWER(d.distress_source), ''), CASE WHEN d.online_distress_signal_id IS NOT NULL THEN 'online' ELSE 'mesh' END) = 'online'`;
  }

  return all(`
    SELECT
      d.id AS "deploymentId",
      d.deployment_code AS "deploymentCode",
      d.status AS "deploymentStatus",
      d.created_at AS "createdAt",
      d.deployed_at AS "deployedAt",
      COALESCE(d.accomplished_at, d.canceled_at) AS "endedAt",
      t.id AS "teamId",
      t.team_code AS "teamCode",
      t.name AS "teamName",
      t.agency AS "teamAgency",
      t.status AS "teamStatus",
      r.id AS "leaderRescuerId",
      r.rescuer_code AS "leaderRescuerCode",
      r.first_name_enc AS "leaderFirstNameEnc",
      r.middle_name_enc AS "leaderMiddleNameEnc",
      r.last_name_enc AS "leaderLastNameEnc",
      CASE
        WHEN COALESCE(NULLIF(LOWER(d.distress_source), ''), CASE WHEN d.online_distress_signal_id IS NOT NULL THEN 'online' ELSE 'mesh' END) = 'online'
          THEN 'online'
        ELSE 'mesh'
      END AS "sourceType",
      CASE
        WHEN COALESCE(NULLIF(LOWER(d.distress_source), ''), CASE WHEN d.online_distress_signal_id IS NOT NULL THEN 'online' ELSE 'mesh' END) = 'online'
          THEN o.distress_code
        ELSE COALESCE(NULLIF(m.distress_code, ''), CONCAT('MDS-', m.id))
      END AS "distressCode",
      CASE
        WHEN COALESCE(NULLIF(LOWER(d.distress_source), ''), CASE WHEN d.online_distress_signal_id IS NOT NULL THEN 'online' ELSE 'mesh' END) = 'online'
          THEN COALESCE(NULLIF(TRIM(o.reason), ''), 'Unknown')
        ELSE COALESCE(NULLIF(TRIM(m.reason), ''), 'Unknown')
      END AS reason,
      CASE
        WHEN COALESCE(NULLIF(LOWER(d.distress_source), ''), CASE WHEN d.online_distress_signal_id IS NOT NULL THEN 'online' ELSE 'mesh' END) = 'online'
          THEN o.recorded_at
        ELSE m.timestamp
      END AS "reportedAt"
    FROM distress_deployments d
    INNER JOIN rescue_teams t ON t.id = d.team_id
    LEFT JOIN rescuers r ON r.id = d.team_leader_rescuer_id
    LEFT JOIN mesh_distress_signals m ON m.id = d.mesh_distress_signal_id
    LEFT JOIN online_distress_signals o ON o.id = d.online_distress_signal_id
    WHERE COALESCE(d.deployed_at, d.created_at) >= ?
      AND COALESCE(d.deployed_at, d.created_at) < ?
      ${sourceFilterSql}
    ORDER BY COALESCE(d.deployed_at, d.created_at) DESC, d.id DESC
  `, params);
}

async function listRescueTeamRosterRows() {
  return all(`
    SELECT
      t.id AS "teamId",
      t.team_code AS "teamCode",
      t.name AS "teamName",
      t.agency AS "teamAgency",
      t.status AS "teamStatus",
      t.created_at AS "createdAt",
      t.updated_at AS "updatedAt",
      COUNT(rm.id) AS "memberCount",
      COUNT(rm.id) FILTER (WHERE rm.access_status = 'active') AS "activeMemberCount",
      COUNT(rm.id) FILTER (WHERE rm.access_status = 'active' AND LOWER(COALESCE(rm.status, '')) = 'dispatched') AS "dispatchedMemberCount",
      latest_leader.rescuerCode AS "latestLeaderRescuerCode",
      latest_leader.firstNameEnc AS "latestLeaderFirstNameEnc",
      latest_leader.middleNameEnc AS "latestLeaderMiddleNameEnc",
      latest_leader.lastNameEnc AS "latestLeaderLastNameEnc",
      fallback_leader.rescuerCode AS "fallbackLeaderRescuerCode",
      fallback_leader.firstNameEnc AS "fallbackLeaderFirstNameEnc",
      fallback_leader.middleNameEnc AS "fallbackLeaderMiddleNameEnc",
      fallback_leader.lastNameEnc AS "fallbackLeaderLastNameEnc"
    FROM rescue_teams t
    LEFT JOIN rescuers rm ON rm.team_id = t.id
    LEFT JOIN LATERAL (
      SELECT
        r.rescuer_code AS "rescuerCode",
        r.first_name_enc AS "firstNameEnc",
        r.middle_name_enc AS "middleNameEnc",
        r.last_name_enc AS "lastNameEnc"
      FROM distress_deployments d
      INNER JOIN rescuers r ON r.id = d.team_leader_rescuer_id
      WHERE d.team_id = t.id
      ORDER BY COALESCE(d.deployed_at, d.updated_at, d.created_at) DESC, d.id DESC
      LIMIT 1
    ) latest_leader ON TRUE
    LEFT JOIN LATERAL (
      SELECT
        r.rescuer_code AS "rescuerCode",
        r.first_name_enc AS "firstNameEnc",
        r.middle_name_enc AS "middleNameEnc",
        r.last_name_enc AS "lastNameEnc"
      FROM rescuers r
      WHERE r.team_id = t.id
      ORDER BY
        CASE WHEN r.access_status = 'active' THEN 0 ELSE 1 END,
        r.created_at ASC,
        r.id ASC
      LIMIT 1
    ) fallback_leader ON TRUE
    GROUP BY
      t.id,
      t.team_code,
      t.name,
      t.agency,
      t.status,
      t.created_at,
      t.updated_at,
      latest_leader.rescuerCode,
      latest_leader.firstNameEnc,
      latest_leader.middleNameEnc,
      latest_leader.lastNameEnc,
      fallback_leader.rescuerCode,
      fallback_leader.firstNameEnc,
      fallback_leader.middleNameEnc,
      fallback_leader.lastNameEnc
    ORDER BY t.name ASC, t.id ASC
  `);
}

function meshDeviceScopeWhereClause(nodeScope) {
  if (nodeScope === 'active') {
    return `WHERE db."deviceStatus" = 'active' AND db."isOnlineRecent" = TRUE`;
  }

  if (nodeScope === 'offline') {
    return `WHERE db."deviceStatus" = 'active' AND db."isOfflineStale" = TRUE`;
  }

  return '';
}

function buildMeshDeviceBaseSql() {
  return `
    WITH device_base AS (
      SELECT
        sd.id AS "deviceId",
        sd.node_id AS "nodeId",
        sd.node_name AS "nodeName",
        sd.status AS "deviceStatus",
        sd.allowed_ip AS "allowedIp",
        sd.last_seen_at AS "deviceLastSeenAt",
        sd.last_sync_at AS "lastSyncAt",
        sd.created_at AS "createdAt",
        sd.updated_at AS "updatedAt",
        mn.status AS "nodeStatus",
        mn.last_seen_at AS "nodeLastSeenAt",
        mn.users_connected AS "usersConnected",
        lh.battery_voltage AS "batteryVoltage",
        lh.signal_strength AS "signalStrength",
        lh.gps_status AS "gpsStatus",
        lh.cpu_temp AS "cpuTemp",
        lh.storage_remaining AS "storageRemaining",
        lh.ram_usage AS "ramUsage",
        lh.recorded_at AS "latestHealthRecordedAt",
        COALESCE(hr."healthLogRangeCount", 0)::int AS "healthLogRangeCount",
        COALESCE(cq."pendingCommandCount", 0)::int AS "pendingCommandCount",
        COALESCE(cq."processedCommandCount", 0)::int AS "processedCommandCount",
        COALESCE(cq."cancelledCommandCount", 0)::int AS "cancelledCommandCount",
        COALESCE(cq."commandRangeCount", 0)::int AS "commandRangeCount",
        COALESCE(cq."stalePendingCommandCount", 0)::int AS "stalePendingCommandCount",
        cq."oldestPendingAt",
        cq."latestCommandActivityAt",
        activity."latestObservedAt",
        COALESCE(activity."latestObservedAt", sd.created_at) AS "latestActivityAt",
        (activity."latestObservedAt" IS NOT NULL AND activity."latestObservedAt" >= NOW() - INTERVAL '1 day') AS "isOnlineRecent",
        (sd.status = 'active' AND (activity."latestObservedAt" IS NULL OR activity."latestObservedAt" < NOW() - INTERVAL '1 day')) AS "isOfflineStale",
        (sd.status = 'active' AND (sd.last_sync_at IS NULL OR sd.last_sync_at < NOW() - INTERVAL '1 day')) AS "isSyncStale",
        (sd.status = 'active' AND (COALESCE(sd.last_seen_at, mn.last_seen_at) IS NULL OR COALESCE(sd.last_seen_at, mn.last_seen_at) < NOW() - INTERVAL '1 day')) AS "isHeartbeatMissing",
        (sd.status = 'active' AND (lh.recorded_at IS NULL OR lh.recorded_at < NOW() - INTERVAL '1 day')) AS "isHealthMissing"
      FROM sync_devices sd
      LEFT JOIN mesh_nodes mn ON mn.node_id = sd.node_id
      LEFT JOIN LATERAL (
        SELECT
          h.battery_voltage,
          h.signal_strength,
          h.gps_status,
          h.cpu_temp,
          h.storage_remaining,
          h.ram_usage,
          h.recorded_at
        FROM mesh_node_health_logs h
        WHERE h.node_id = sd.node_id
        ORDER BY h.recorded_at DESC, h.id DESC
        LIMIT 1
      ) lh ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE h.recorded_at >= ? AND h.recorded_at < ?) AS "healthLogRangeCount"
        FROM mesh_node_health_logs h
        WHERE h.node_id = sd.node_id
      ) hr ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE mc.status = 'pending') AS "pendingCommandCount",
          COUNT(*) FILTER (WHERE mc.status = 'processed') AS "processedCommandCount",
          COUNT(*) FILTER (WHERE mc.status = 'cancelled') AS "cancelledCommandCount",
          COUNT(*) FILTER (WHERE mc.created_at >= ? AND mc.created_at < ?) AS "commandRangeCount",
          COUNT(*) FILTER (WHERE mc.status = 'pending' AND mc.created_at < NOW() - INTERVAL '30 minutes') AS "stalePendingCommandCount",
          MIN(mc.created_at) FILTER (WHERE mc.status = 'pending') AS "oldestPendingAt",
          MAX(COALESCE(mc.processed_at, mc.updated_at, mc.created_at)) AS "latestCommandActivityAt"
        FROM mesh_commands mc
        WHERE mc.target_node_id = sd.node_id
      ) cq ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          MAX(ts) AS "latestObservedAt"
        FROM (
          VALUES
            (sd.last_sync_at),
            (sd.last_seen_at),
            (mn.last_seen_at),
            (lh.recorded_at)
        ) observed(ts)
      ) activity ON TRUE
    )
  `;
}

async function listMeshDeviceSyncHealthRows({ nodeScope, rangeStartIso, rangeEndIso }) {
  const scopeSql = meshDeviceScopeWhereClause(nodeScope);
  return all(`
    ${buildMeshDeviceBaseSql()}
    SELECT *
    FROM device_base db
    ${scopeSql}
    ORDER BY db."latestActivityAt" DESC, db."deviceId" DESC
  `, [
    rangeStartIso,
    rangeEndIso,
    rangeStartIso,
    rangeEndIso
  ]);
}

async function listMeshCommandTypeRows({ nodeScope, rangeStartIso, rangeEndIso }) {
  const scopeSql = meshDeviceScopeWhereClause(nodeScope);
  return all(`
    ${buildMeshDeviceBaseSql()},
    filtered_devices AS (
      SELECT db."nodeId"
      FROM device_base db
      ${scopeSql}
    )
    SELECT
      COALESCE(NULLIF(mc.command_type, ''), 'unknown') AS "commandType",
      COUNT(*)::int AS "totalCount",
      COUNT(*) FILTER (WHERE mc.status = 'pending')::int AS "pendingCount",
      COUNT(*) FILTER (WHERE mc.status = 'processed')::int AS "processedCount",
      COUNT(*) FILTER (WHERE mc.status = 'cancelled')::int AS "cancelledCount"
    FROM mesh_commands mc
    INNER JOIN filtered_devices fd ON fd."nodeId" = mc.target_node_id
    WHERE mc.created_at >= ?
      AND mc.created_at < ?
    GROUP BY COALESCE(NULLIF(mc.command_type, ''), 'unknown')
    ORDER BY "totalCount" DESC, "commandType" ASC
  `, [
    rangeStartIso,
    rangeEndIso,
    rangeStartIso,
    rangeEndIso,
    rangeStartIso,
    rangeEndIso
  ]);
}

async function listOnlineDepartmentActivityRows({ rangeStartIso, rangeEndIso }) {
  return all(`
    WITH message_totals AS (
      SELECT
        m.department_id AS "departmentId",
        COUNT(*)::int AS "messageCount",
        COUNT(*) FILTER (WHERE m.sender_type = 'civilian')::int AS "civilianMessageCount",
        COUNT(*) FILTER (WHERE m.sender_type = 'admin')::int AS "adminMessageCount",
        COUNT(*) FILTER (WHERE m.sender_type = 'rescuer')::int AS "rescuerMessageCount",
        MAX(m.created_at) AS "latestMessageAt",
        COUNT(DISTINCT m.conversation_id)::int AS "activeConversationCount"
      FROM online_chat_messages m
      WHERE m.deleted = 0
        AND m.created_at >= ?
        AND m.created_at < ?
      GROUP BY m.department_id
    ),
    conversation_totals AS (
      SELECT
        c.department_id AS "departmentId",
        COUNT(*) FILTER (WHERE c.status = 'open')::int AS "openConversationCount"
      FROM online_chat_conversations c
      GROUP BY c.department_id
    )
    SELECT
      d.id AS "departmentId",
      d.slug,
      d.name,
      d.subtitle,
      d.status,
      d.read_only AS "readOnly",
      COALESCE(ct."openConversationCount", 0)::int AS "openConversationCount",
      COALESCE(mt."activeConversationCount", 0)::int AS "activeConversationCount",
      COALESCE(mt."messageCount", 0)::int AS "messageCount",
      COALESCE(mt."civilianMessageCount", 0)::int AS "civilianMessageCount",
      COALESCE(mt."adminMessageCount", 0)::int AS "adminMessageCount",
      COALESCE(mt."rescuerMessageCount", 0)::int AS "rescuerMessageCount",
      mt."latestMessageAt"
    FROM online_chat_departments d
    LEFT JOIN conversation_totals ct ON ct."departmentId" = d.id
    LEFT JOIN message_totals mt ON mt."departmentId" = d.id
    WHERE d.slug <> 'global-announcements'
      AND (
        d.status = 'active'
        OR COALESCE(mt."messageCount", 0) > 0
      )
    ORDER BY COALESCE(mt."messageCount", 0) DESC, d.sort_order ASC, d.name ASC
  `, [rangeStartIso, rangeEndIso]);
}

async function getOnlineGlobalAnnouncementSummary({ rangeStartIso, rangeEndIso }) {
  return get(`
    WITH global_department AS (
      SELECT id
      FROM online_chat_departments
      WHERE slug = 'global-announcements'
      ORDER BY id ASC
      LIMIT 1
    )
    SELECT
      COALESCE(COUNT(gm.*), 0)::int AS "messageCount",
      COALESCE(COUNT(*) FILTER (WHERE gm.sender_type = 'admin'), 0)::int AS "adminMessageCount",
      COALESCE(COUNT(*) FILTER (WHERE gm.sender_type = 'system'), 0)::int AS "systemMessageCount",
      MAX(gm.created_at) AS "latestMessageAt",
      (
        SELECT COUNT(DISTINCT grs.reader_id)::int
        FROM online_chat_global_read_states grs
        INNER JOIN global_department gd ON gd.id = grs.department_id
        WHERE grs.reader_type = 'civilian'
      ) AS "civilianReaderCount",
      (
        SELECT COUNT(DISTINCT grs.reader_id)::int
        FROM online_chat_global_read_states grs
        INNER JOIN global_department gd ON gd.id = grs.department_id
        WHERE grs.reader_type = 'rescuer'
      ) AS "rescuerReaderCount",
      (
        SELECT COUNT(DISTINCT grs.reader_id)::int
        FROM online_chat_global_read_states grs
        INNER JOIN global_department gd ON gd.id = grs.department_id
        WHERE grs.reader_type = 'admin'
      ) AS "adminReaderCount"
    FROM online_chat_global_messages gm
    INNER JOIN global_department gd ON gd.id = gm.department_id
    WHERE gm.deleted = 0
      AND gm.created_at >= ?
      AND gm.created_at < ?
  `, [rangeStartIso, rangeEndIso]);
}

async function getOnlineConversationLoadSummary({ chatScope, rangeStartIso, rangeEndIso }) {
  const includeDepartments = chatScope === 'all' || chatScope === 'department';
  const includeGlobal = chatScope === 'all' || chatScope === 'global';

  const openConversationCountRow = includeDepartments
    ? await get(`
        SELECT COUNT(*)::int AS count
        FROM online_chat_conversations c
        INNER JOIN online_chat_departments d ON d.id = c.department_id
        WHERE c.status = 'open'
          AND d.slug <> 'global-announcements'
      `)
    : { count: 0 };

  const activeConversationCountRow = includeDepartments
    ? await get(`
        SELECT COUNT(DISTINCT m.conversation_id)::int AS count
        FROM online_chat_messages m
        INNER JOIN online_chat_departments d ON d.id = m.department_id
        WHERE m.deleted = 0
          AND d.slug <> 'global-announcements'
          AND m.created_at >= ?
          AND m.created_at < ?
      `, [rangeStartIso, rangeEndIso])
    : { count: 0 };

  const departmentUnreadRows = includeDepartments
    ? await all(`
        SELECT
          rs.reader_type AS "readerType",
          COUNT(unread.id)::int AS count
        FROM online_chat_read_states rs
        INNER JOIN online_chat_conversations c ON c.id = rs.conversation_id
        INNER JOIN online_chat_departments d ON d.id = c.department_id
        LEFT JOIN online_chat_messages unread
          ON unread.conversation_id = c.id
         AND unread.deleted = 0
         AND unread.id > COALESCE(rs.last_read_message_id, 0)
        WHERE d.slug <> 'global-announcements'
          AND c.status = 'open'
        GROUP BY rs.reader_type
      `)
    : [];

  const globalUnreadRows = includeGlobal
    ? await all(`
        WITH global_department AS (
          SELECT id
          FROM online_chat_departments
          WHERE slug = 'global-announcements'
          ORDER BY id ASC
          LIMIT 1
        )
        SELECT
          rs.reader_type AS "readerType",
          COUNT(unread.id)::int AS count
        FROM online_chat_global_read_states rs
        INNER JOIN global_department gd ON gd.id = rs.department_id
        LEFT JOIN online_chat_global_messages unread
          ON unread.department_id = gd.id
         AND unread.deleted = 0
         AND unread.id > COALESCE(rs.last_read_message_id, 0)
        GROUP BY rs.reader_type
      `)
    : [];

  return {
    openConversationCount: Number(openConversationCountRow?.count || 0),
    activeConversationCount: Number(activeConversationCountRow?.count || 0),
    departmentUnreadRows,
    globalUnreadRows
  };
}

async function getOnlineSenderActivitySummary({ chatScope, rangeStartIso, rangeEndIso }) {
  const includeDepartments = chatScope === 'all' || chatScope === 'department';
  const includeGlobal = chatScope === 'all' || chatScope === 'global';

  const departmentSenderRows = includeDepartments
    ? await all(`
        SELECT
          m.sender_type AS "senderType",
          COUNT(*)::int AS count
        FROM online_chat_messages m
        INNER JOIN online_chat_departments d ON d.id = m.department_id
        WHERE m.deleted = 0
          AND d.slug <> 'global-announcements'
          AND m.created_at >= ?
          AND m.created_at < ?
        GROUP BY m.sender_type
      `, [rangeStartIso, rangeEndIso])
    : [];

  const globalSenderRows = includeGlobal
    ? await all(`
        SELECT
          gm.sender_type AS "senderType",
          COUNT(*)::int AS count
        FROM online_chat_global_messages gm
        INNER JOIN online_chat_departments d ON d.id = gm.department_id
        WHERE gm.deleted = 0
          AND d.slug = 'global-announcements'
          AND gm.created_at >= ?
          AND gm.created_at < ?
        GROUP BY gm.sender_type
      `, [rangeStartIso, rangeEndIso])
    : [];

  const topDepartmentRows = includeDepartments
    ? await all(`
        SELECT
          d.id AS "departmentId",
          d.name,
          COUNT(m.id)::int AS "messageCount"
        FROM online_chat_departments d
        INNER JOIN online_chat_messages m ON m.department_id = d.id
        WHERE m.deleted = 0
          AND d.slug <> 'global-announcements'
          AND m.created_at >= ?
          AND m.created_at < ?
        GROUP BY d.id, d.name, d.sort_order
        ORDER BY "messageCount" DESC, d.sort_order ASC, d.name ASC
        LIMIT 5
      `, [rangeStartIso, rangeEndIso])
    : [];

  const topConversationRows = includeDepartments
    ? await all(`
        SELECT
          c.id AS "conversationId",
          d.name AS "departmentName",
          u.user_code AS "civilianCode",
          u.first_name_enc AS "civilianFirstNameEnc",
          u.middle_name_enc AS "civilianMiddleNameEnc",
          u.last_name_enc AS "civilianLastNameEnc",
          COUNT(m.id)::int AS "messageCount",
          MAX(m.created_at) AS "latestMessageAt"
        FROM online_chat_conversations c
        INNER JOIN online_chat_departments d ON d.id = c.department_id
        INNER JOIN users u ON u.id = c.civilian_user_id
        INNER JOIN online_chat_messages m ON m.conversation_id = c.id
        WHERE m.deleted = 0
          AND d.slug <> 'global-announcements'
          AND m.created_at >= ?
          AND m.created_at < ?
        GROUP BY c.id, d.name, u.user_code, u.first_name_enc, u.middle_name_enc, u.last_name_enc
        ORDER BY "messageCount" DESC, "latestMessageAt" DESC, c.id DESC
        LIMIT 8
      `, [rangeStartIso, rangeEndIso])
    : [];

  return {
    departmentSenderRows,
    globalSenderRows,
    topDepartmentRows,
    topConversationRows
  };
}

async function getOnlineModerationSummary({ rangeStartIso, rangeEndIso }) {
  const [eventRows, civilianTimeoutRow, rescuerTimeoutRow] = await Promise.all([
    all(`
      SELECT
        event_type AS "eventType",
        reason,
        COUNT(*)::int AS "totalCount",
        COUNT(*) FILTER (WHERE civilian_user_id IS NOT NULL)::int AS "civilianCount",
        COUNT(*) FILTER (WHERE rescuer_id IS NOT NULL)::int AS "rescuerCount",
        MAX(created_at) AS "latestEventAt"
      FROM online_chat_moderation_events
      WHERE created_at >= ?
        AND created_at < ?
      GROUP BY event_type, reason
      ORDER BY "totalCount" DESC, event_type ASC, reason ASC
    `, [rangeStartIso, rangeEndIso]),
    get(`
      SELECT COUNT(*)::int AS count
      FROM online_chat_sender_guards
      WHERE timeout_until IS NOT NULL
        AND timeout_until > NOW()
    `),
    get(`
      SELECT COUNT(*)::int AS count
      FROM online_chat_rescuer_sender_guards
      WHERE timeout_until IS NOT NULL
        AND timeout_until > NOW()
    `)
  ]);

  return {
    eventRows,
    activeCivilianTimeoutCount: Number(civilianTimeoutRow?.count || 0),
    activeRescuerTimeoutCount: Number(rescuerTimeoutRow?.count || 0)
  };
}

async function listRecentOnlineCommunicationEventRows({ chatScope, rangeStartIso, rangeEndIso, limit = 40 }) {
  const includeDepartments = chatScope === 'all' || chatScope === 'department';
  const includeGlobal = chatScope === 'all' || chatScope === 'global';
  const parts = [];
  const params = [];

  if (includeDepartments) {
    parts.push(`
      SELECT
        'department-message' AS "eventKind",
        m.created_at AS "eventAt",
        d.name AS "roomName",
        m.sender_type AS "senderType",
        m.body AS preview,
        NULL::text AS reason,
        u.user_code AS "civilianCode",
        u.first_name_enc AS "civilianFirstNameEnc",
        u.middle_name_enc AS "civilianMiddleNameEnc",
        u.last_name_enc AS "civilianLastNameEnc",
        au.user_code AS "adminCode",
        au.first_name_enc AS "adminFirstNameEnc",
        au.middle_name_enc AS "adminMiddleNameEnc",
        au.last_name_enc AS "adminLastNameEnc",
        r.rescuer_code AS "rescuerCode",
        r.first_name_enc AS "rescuerFirstNameEnc",
        r.middle_name_enc AS "rescuerMiddleNameEnc",
        r.last_name_enc AS "rescuerLastNameEnc"
      FROM online_chat_messages m
      INNER JOIN online_chat_departments d ON d.id = m.department_id
      INNER JOIN users u ON u.id = m.civilian_user_id
      LEFT JOIN users au ON au.id = m.sender_id AND m.sender_type = 'admin'
      LEFT JOIN rescuers r ON r.id = m.sender_id AND m.sender_type = 'rescuer'
      WHERE m.deleted = 0
        AND d.slug <> 'global-announcements'
        AND m.created_at >= ?
        AND m.created_at < ?
    `);
    params.push(rangeStartIso, rangeEndIso);
  }

  if (includeGlobal) {
    parts.push(`
      SELECT
        'global-message' AS "eventKind",
        gm.created_at AS "eventAt",
        d.name AS "roomName",
        gm.sender_type AS "senderType",
        gm.body AS preview,
        NULL::text AS reason,
        NULL::text AS "civilianCode",
        NULL::text AS "civilianFirstNameEnc",
        NULL::text AS "civilianMiddleNameEnc",
        NULL::text AS "civilianLastNameEnc",
        au.user_code AS "adminCode",
        au.first_name_enc AS "adminFirstNameEnc",
        au.middle_name_enc AS "adminMiddleNameEnc",
        au.last_name_enc AS "adminLastNameEnc",
        NULL::text AS "rescuerCode",
        NULL::text AS "rescuerFirstNameEnc",
        NULL::text AS "rescuerMiddleNameEnc",
        NULL::text AS "rescuerLastNameEnc"
      FROM online_chat_global_messages gm
      INNER JOIN online_chat_departments d ON d.id = gm.department_id
      LEFT JOIN users au ON au.id = gm.sender_id AND gm.sender_type = 'admin'
      WHERE gm.deleted = 0
        AND d.slug = 'global-announcements'
        AND gm.created_at >= ?
        AND gm.created_at < ?
    `);
    params.push(rangeStartIso, rangeEndIso);
  }

  if (includeDepartments) {
    parts.push(`
      SELECT
        'moderation' AS "eventKind",
        me.created_at AS "eventAt",
        COALESCE(d.name, 'Department chat') AS "roomName",
        CASE
          WHEN me.rescuer_id IS NOT NULL THEN 'rescuer'
          ELSE 'civilian'
        END AS "senderType",
        COALESCE(me.body_preview, me.reason) AS preview,
        me.reason,
        u.user_code AS "civilianCode",
        u.first_name_enc AS "civilianFirstNameEnc",
        u.middle_name_enc AS "civilianMiddleNameEnc",
        u.last_name_enc AS "civilianLastNameEnc",
        NULL::text AS "adminCode",
        NULL::text AS "adminFirstNameEnc",
        NULL::text AS "adminMiddleNameEnc",
        NULL::text AS "adminLastNameEnc",
        r.rescuer_code AS "rescuerCode",
        r.first_name_enc AS "rescuerFirstNameEnc",
        r.middle_name_enc AS "rescuerMiddleNameEnc",
        r.last_name_enc AS "rescuerLastNameEnc"
      FROM online_chat_moderation_events me
      LEFT JOIN online_chat_departments d ON d.id = me.department_id
      LEFT JOIN users u ON u.id = me.civilian_user_id
      LEFT JOIN rescuers r ON r.id = me.rescuer_id
      WHERE me.created_at >= ?
        AND me.created_at < ?
    `);
    params.push(rangeStartIso, rangeEndIso);
  }

  return all(`
    SELECT *
    FROM (
      ${parts.join('\nUNION ALL\n')}
    ) events
    ORDER BY "eventAt" DESC, "eventKind" ASC
    LIMIT ?
  `, [...params, limit]);
}

async function createReportExport(entry) {
  return run(`
    INSERT INTO report_exports (
      report_type,
      source_scope,
      date_range_kind,
      range_start_at,
      range_end_at,
      output_mode,
      selected_section_ids_json,
      generated_by_admin_user_id,
      status,
      filename,
      byte_size,
      summary_metadata_json,
      error_message
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING id
  `, [
    entry.reportType,
    entry.sourceScope,
    entry.dateRangeKind,
    entry.rangeStartAt,
    entry.rangeEndAt,
    entry.outputMode,
    entry.selectedSectionIdsJson,
    entry.generatedByAdminUserId,
    entry.status,
    entry.filename,
    entry.byteSize,
    entry.summaryMetadataJson,
    entry.errorMessage
  ]);
}

async function updateReportExportStatus(id, entry) {
  return run(`
    UPDATE report_exports
    SET
      status = ?,
      filename = ?,
      byte_size = ?,
      summary_metadata_json = ?,
      error_message = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [
    entry.status,
    entry.filename,
    entry.byteSize,
    entry.summaryMetadataJson,
    entry.errorMessage,
    id
  ]);
}

async function listRecentReportExports(limit = 5) {
  return all(`
    SELECT
      re.id,
      re.report_type AS "reportType",
      re.source_scope AS "sourceScope",
      re.date_range_kind AS "dateRangeKind",
      re.range_start_at AS "rangeStartAt",
      re.range_end_at AS "rangeEndAt",
      re.output_mode AS "outputMode",
      re.selected_section_ids_json AS "selectedSectionIdsJson",
      re.generated_by_admin_user_id AS "generatedByAdminUserId",
      re.status,
      re.filename,
      re.byte_size AS "byteSize",
      re.summary_metadata_json AS "summaryMetadataJson",
      re.error_message AS "errorMessage",
      re.created_at AS "createdAt",
      re.updated_at AS "updatedAt",
      u.user_code AS "adminUserCode"
    FROM report_exports re
    LEFT JOIN users u ON u.id = re.generated_by_admin_user_id
    ORDER BY re.created_at DESC, re.id DESC
    LIMIT ?
  `, [limit]);
}

async function getAdminExportCount() {
  return get(`
    SELECT COUNT(*)::int AS count
    FROM report_exports
  `);
}

module.exports = {
  listIncidentSummaryRows,
  listRescueTeamActivityRows,
  listRescueTeamRosterRows,
  listMeshDeviceSyncHealthRows,
  listMeshCommandTypeRows,
  listOnlineDepartmentActivityRows,
  getOnlineGlobalAnnouncementSummary,
  getOnlineConversationLoadSummary,
  getOnlineSenderActivitySummary,
  getOnlineModerationSummary,
  listRecentOnlineCommunicationEventRows,
  createReportExport,
  updateReportExportStatus,
  listRecentReportExports,
  getAdminExportCount
};
