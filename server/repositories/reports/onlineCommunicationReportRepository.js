const { all, get } = require('../../database/postgres');

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

module.exports = {
  listOnlineDepartmentActivityRows,
  getOnlineGlobalAnnouncementSummary,
  getOnlineConversationLoadSummary,
  getOnlineSenderActivitySummary,
  getOnlineModerationSummary,
  listRecentOnlineCommunicationEventRows
};
