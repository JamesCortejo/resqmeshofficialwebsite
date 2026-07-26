const { run, get, all, transaction } = require('../database/postgres');

function selectDepartmentColumns(prefix = 'd') {
  return `
    ${prefix}.id,
    ${prefix}.slug,
    ${prefix}.name,
    ${prefix}.subtitle,
    ${prefix}.status,
    ${prefix}.color_tag AS colorTag,
    ${prefix}.icon_url AS iconUrl,
    ${prefix}.sort_order AS sortOrder,
    ${prefix}.read_only AS readOnly,
    ${prefix}.archived_at AS archivedAt,
    ${prefix}.created_at AS createdAt,
    ${prefix}.updated_at AS updatedAt
  `;
}

function listDepartments({ includeArchived = true } = {}) {
  const statusClause = includeArchived ? '' : "WHERE status = 'active'";

  return all(`
    SELECT ${selectDepartmentColumns('d')}
    FROM online_chat_departments d
    ${statusClause}
    ORDER BY d.sort_order ASC, d.created_at ASC, d.id ASC
  `);
}

function getDepartmentById(id) {
  return get(`
    SELECT ${selectDepartmentColumns('d')}
    FROM online_chat_departments d
    WHERE d.id = ?
    LIMIT 1
  `, [id]);
}

function getDepartmentBySlug(slug) {
  return get(`
    SELECT ${selectDepartmentColumns('d')}
    FROM online_chat_departments d
    WHERE d.slug = ?
    LIMIT 1
  `, [slug]);
}

function createDepartment(room) {
  return run(`
    INSERT INTO online_chat_departments (
      slug,
      name,
      subtitle,
      status,
      color_tag,
      icon_path,
      icon_url,
      sort_order,
      read_only,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    RETURNING id
  `, [
    room.slug,
    room.name,
    room.subtitle,
    room.status,
    room.colorTag,
    room.iconPath,
    room.iconUrl,
    room.sortOrder,
    room.readOnly
  ]);
}

function updateDepartment(id, room) {
  return run(`
    UPDATE online_chat_departments
    SET
      slug = ?,
      name = ?,
      subtitle = ?,
      status = ?,
      color_tag = ?,
      icon_path = COALESCE(?, icon_path),
      icon_url = COALESCE(?, icon_url),
      sort_order = ?,
      read_only = ?,
      archived_at = CASE WHEN ? = 'archived' AND archived_at IS NULL THEN CURRENT_TIMESTAMP ELSE archived_at END,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [
    room.slug,
    room.name,
    room.subtitle,
    room.status,
    room.colorTag,
    room.iconPath,
    room.iconUrl,
    room.sortOrder,
    room.readOnly,
    room.status,
    id
  ]);
}

function archiveDepartment(id) {
  return run(`
    UPDATE online_chat_departments
    SET
      status = 'archived',
      archived_at = COALESCE(archived_at, CURRENT_TIMESTAMP),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [id]);
}

function getCivilianById(id) {
  return get(`
    SELECT
      id,
      user_code AS userCode,
      first_name_enc AS firstNameEnc,
      middle_name_enc AS middleNameEnc,
      last_name_enc AS lastNameEnc,
      birth_date_enc AS birthDateEnc,
      phone_enc AS phoneEnc,
      occupation_enc AS occupationEnc,
      blood_type_enc AS bloodTypeEnc,
      status
    FROM users
    WHERE id = ?
    LIMIT 1
  `, [id]);
}

function findConversation(departmentId, civilianUserId) {
  return get(`
    SELECT
      c.id,
      c.department_id AS departmentId,
      c.civilian_user_id AS civilianUserId,
      c.status,
      c.last_message_id AS lastMessageId,
      c.last_message_at AS lastMessageAt,
      c.created_at AS createdAt,
      c.updated_at AS updatedAt
    FROM online_chat_conversations c
    WHERE c.department_id = ? AND c.civilian_user_id = ?
    LIMIT 1
  `, [departmentId, civilianUserId]);
}

function getConversationById(id) {
  return get(`
    SELECT
      c.id,
      c.department_id AS departmentId,
      c.civilian_user_id AS civilianUserId,
      c.status,
      c.last_message_id AS lastMessageId,
      c.last_message_at AS lastMessageAt,
      c.created_at AS createdAt,
      c.updated_at AS updatedAt,
      d.slug AS departmentSlug,
      d.name AS departmentName,
      d.subtitle AS departmentSubtitle,
      d.status AS departmentStatus,
      d.color_tag AS departmentColorTag,
      d.icon_url AS departmentIconUrl,
      d.sort_order AS departmentSortOrder,
      d.read_only AS departmentReadOnly,
      d.archived_at AS departmentArchivedAt,
      d.created_at AS departmentCreatedAt,
      d.updated_at AS departmentUpdatedAt,
      u.user_code AS userCode,
      u.first_name_enc AS firstNameEnc,
      u.middle_name_enc AS middleNameEnc,
      u.last_name_enc AS lastNameEnc,
      u.birth_date_enc AS birthDateEnc,
      u.phone_enc AS phoneEnc,
      u.occupation_enc AS occupationEnc,
      u.blood_type_enc AS bloodTypeEnc
    FROM online_chat_conversations c
    JOIN online_chat_departments d ON d.id = c.department_id
    JOIN users u ON u.id = c.civilian_user_id
    WHERE c.id = ?
    LIMIT 1
  `, [id]);
}

async function getOrCreateConversation(departmentId, civilianUserId) {
  return transaction(async (trx) => {
    const existing = await trx.get(`
      SELECT
        id,
        department_id AS departmentId,
        civilian_user_id AS civilianUserId,
        status,
        last_message_id AS lastMessageId,
        last_message_at AS lastMessageAt,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM online_chat_conversations
      WHERE department_id = ? AND civilian_user_id = ?
      LIMIT 1
    `, [departmentId, civilianUserId]);

    if (existing) {
      if (existing.status === 'archived') {
        await trx.run(`
          UPDATE online_chat_conversations
          SET status = 'open', updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [existing.id]);
        existing.status = 'open';
      }

      return existing;
    }

    const created = await trx.run(`
      INSERT INTO online_chat_conversations (
        department_id,
        civilian_user_id,
        status,
        created_at,
        updated_at
      ) VALUES (?, ?, 'open', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id
    `, [departmentId, civilianUserId]);

    return trx.get(`
      SELECT
        id,
        department_id AS departmentId,
        civilian_user_id AS civilianUserId,
        status,
        last_message_id AS lastMessageId,
        last_message_at AS lastMessageAt,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM online_chat_conversations
      WHERE id = ?
      LIMIT 1
    `, [created.lastID]);
  });
}

function insertMessage(message) {
  return transaction(async (trx) => {
    const inserted = await trx.run(`
      INSERT INTO online_chat_messages (
        conversation_id,
        department_id,
        civilian_user_id,
        sender_type,
        sender_id,
        body,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id
    `, [
      message.conversationId,
      message.departmentId,
      message.civilianUserId,
      message.senderType,
      message.senderId,
      message.body
    ]);

    await trx.run(`
      UPDATE online_chat_conversations
      SET
        last_message_id = ?,
        last_message_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [inserted.lastID, message.conversationId]);

    return trx.get(`
      SELECT
        id,
        conversation_id AS conversationId,
        department_id AS departmentId,
        civilian_user_id AS civilianUserId,
        sender_type AS senderType,
        sender_id AS senderId,
        body,
        deleted,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM online_chat_messages
      WHERE id = ?
      LIMIT 1
    `, [inserted.lastID]);
  });
}

function listMessages(conversationId, { beforeId = null, afterId = null, limit = 50 } = {}) {
  const params = [conversationId];
  let rangeClause = '';

  if (afterId) {
    rangeClause = 'AND id > ?';
    params.push(afterId);
  } else if (beforeId) {
    rangeClause = 'AND id < ?';
    params.push(beforeId);
  }

  params.push(limit);

  return all(`
    SELECT *
    FROM (
      SELECT
        id,
        conversation_id AS conversationId,
        department_id AS departmentId,
        civilian_user_id AS civilianUserId,
        sender_type AS senderType,
        sender_id AS senderId,
        body,
        deleted,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM online_chat_messages
      WHERE conversation_id = ? AND deleted = 0 ${rangeClause}
      ORDER BY id ${afterId ? 'ASC' : 'DESC'}
      LIMIT ?
    ) recent
    ORDER BY id ASC
  `, params);
}

function listGlobalMessages(departmentId, { beforeId = null, afterId = null, limit = 50 } = {}) {
  const params = [departmentId];
  let rangeClause = '';

  if (afterId) {
    rangeClause = 'AND id > ?';
    params.push(afterId);
  } else if (beforeId) {
    rangeClause = 'AND id < ?';
    params.push(beforeId);
  }

  params.push(limit);

  return all(`
    SELECT *
    FROM (
      SELECT
        id,
        department_id AS departmentId,
        sender_type AS senderType,
        sender_id AS senderId,
        body,
        deleted,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM online_chat_global_messages
      WHERE department_id = ? AND deleted = 0 ${rangeClause}
      ORDER BY id ${afterId ? 'ASC' : 'DESC'}
      LIMIT ?
    ) recent
    ORDER BY id ASC
  `, params);
}

function markConversationRead(conversationId, readerType, readerId) {
  return run(`
    INSERT INTO online_chat_read_states (
      conversation_id,
      reader_type,
      reader_id,
      last_read_message_id,
      last_read_at,
      created_at,
      updated_at
    )
    SELECT
      ?,
      ?,
      ?,
      MAX(id),
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    FROM online_chat_messages
    WHERE conversation_id = ? AND deleted = 0
    ON CONFLICT (conversation_id, reader_type, reader_id)
    DO UPDATE SET
      last_read_message_id = EXCLUDED.last_read_message_id,
      last_read_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
  `, [conversationId, readerType, readerId, conversationId]);
}

function markGlobalRead(departmentId, readerType, readerId) {
  return run(`
    INSERT INTO online_chat_global_read_states (
      department_id,
      reader_type,
      reader_id,
      last_read_message_id,
      last_read_at,
      created_at,
      updated_at
    )
    SELECT
      ?,
      ?,
      ?,
      MAX(id),
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    FROM online_chat_global_messages
    WHERE department_id = ? AND deleted = 0
    ON CONFLICT (department_id, reader_type, reader_id)
    DO UPDATE SET
      last_read_message_id = EXCLUDED.last_read_message_id,
      last_read_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
  `, [departmentId, readerType, readerId, departmentId]);
}

function listAdminConversations(departmentId, adminUserId, { search = '' } = {}) {
  const query = String(search || '').trim().toLowerCase();
  const params = [adminUserId, departmentId];
  let searchClause = '';

  if (query) {
    searchClause = `
      AND (
        LOWER(u.user_code) LIKE ?
        OR LOWER(COALESCE(m.body, '')) LIKE ?
      )
    `;
    params.push(`%${query}%`, `%${query}%`);
  }

  return all(`
    SELECT
      c.id,
      c.department_id AS departmentId,
      c.civilian_user_id AS civilianUserId,
      c.status,
      c.last_message_id AS lastMessageId,
      c.last_message_at AS lastMessageAt,
      c.created_at AS createdAt,
      c.updated_at AS updatedAt,
      u.user_code AS userCode,
      u.first_name_enc AS firstNameEnc,
      u.middle_name_enc AS middleNameEnc,
      u.last_name_enc AS lastNameEnc,
      u.birth_date_enc AS birthDateEnc,
      u.phone_enc AS phoneEnc,
      u.occupation_enc AS occupationEnc,
      u.blood_type_enc AS bloodTypeEnc,
      m.body AS lastMessageBody,
      m.sender_type AS lastMessageSenderType,
      (
        SELECT COUNT(*)
        FROM online_chat_messages unread
        LEFT JOIN online_chat_read_states rs
          ON rs.conversation_id = c.id
          AND rs.reader_type = 'admin'
          AND rs.reader_id = ?
        WHERE unread.conversation_id = c.id
          AND unread.deleted = 0
          AND unread.sender_type = 'civilian'
          AND unread.id > COALESCE(rs.last_read_message_id, 0)
      ) AS unreadCount
    FROM online_chat_conversations c
    JOIN users u ON u.id = c.civilian_user_id
    LEFT JOIN online_chat_messages m ON m.id = c.last_message_id
    WHERE c.department_id = ? AND c.status = 'open'
      AND EXISTS (
        SELECT 1
        FROM online_chat_messages seeded
        WHERE seeded.conversation_id = c.id
          AND seeded.deleted = 0
          AND seeded.sender_type = 'civilian'
      )
    ${searchClause}
    ORDER BY c.last_message_at DESC NULLS LAST, c.updated_at DESC, c.id DESC
  `, params);
}

function getAdminDepartmentUnreadSummary(adminUserId) {
  return all(`
    SELECT
      d.id AS departmentId,
      COUNT(unread.id) AS unreadCount
    FROM online_chat_departments d
    LEFT JOIN online_chat_conversations c ON c.department_id = d.id AND c.status = 'open'
    LEFT JOIN online_chat_read_states rs
      ON rs.conversation_id = c.id
      AND rs.reader_type = 'admin'
      AND rs.reader_id = ?
    LEFT JOIN online_chat_messages unread
      ON unread.conversation_id = c.id
      AND unread.deleted = 0
      AND unread.sender_type = 'civilian'
      AND unread.id > COALESCE(rs.last_read_message_id, 0)
    GROUP BY d.id
  `, [adminUserId]);
}

function getCivilianDepartmentUnreadSummary(civilianUserId) {
  return all(`
    SELECT
      d.id AS departmentId,
      COUNT(unread.id) AS unreadCount
    FROM online_chat_departments d
    LEFT JOIN online_chat_conversations c
      ON c.department_id = d.id
      AND c.civilian_user_id = ?
      AND c.status = 'open'
    LEFT JOIN online_chat_read_states rs
      ON rs.conversation_id = c.id
      AND rs.reader_type = 'civilian'
      AND rs.reader_id = ?
    LEFT JOIN online_chat_messages unread
      ON unread.conversation_id = c.id
      AND unread.deleted = 0
      AND unread.sender_type IN ('admin', 'system')
      AND unread.id > COALESCE(rs.last_read_message_id, 0)
    WHERE d.status = 'active'
    GROUP BY d.id
  `, [civilianUserId, civilianUserId]);
}

function getCivilianGlobalUnreadSummary(civilianUserId, departmentId) {
  return get(`
    SELECT COUNT(unread.id) AS unreadCount
    FROM online_chat_global_messages unread
    LEFT JOIN online_chat_global_read_states rs
      ON rs.department_id = unread.department_id
      AND rs.reader_type = 'civilian'
      AND rs.reader_id = ?
    WHERE unread.department_id = ?
      AND unread.deleted = 0
      AND unread.id > COALESCE(rs.last_read_message_id, 0)
  `, [civilianUserId, departmentId]);
}

function insertGlobalMessage(message) {
  return run(`
    INSERT INTO online_chat_global_messages (
      department_id,
      sender_type,
      sender_id,
      body,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    RETURNING id
  `, [
    message.departmentId,
    message.senderType,
    message.senderId,
    message.body
  ]);
}

function getGlobalMessageById(id) {
  return get(`
    SELECT
      id,
      department_id AS departmentId,
      sender_type AS senderType,
      sender_id AS senderId,
      body,
      deleted,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM online_chat_global_messages
    WHERE id = ?
    LIMIT 1
  `, [id]);
}

function getSenderGuard(civilianUserId) {
  return get(`
    SELECT
      civilian_user_id AS civilianUserId,
      window_started_at AS windowStartedAt,
      message_count AS messageCount,
      strike_count AS strikeCount,
      timeout_until AS timeoutUntil,
      last_message_at AS lastMessageAt,
      last_message_body_hash AS lastMessageBodyHash,
      last_violation_at AS lastViolationAt,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM online_chat_sender_guards
    WHERE civilian_user_id = ?
    LIMIT 1
  `, [civilianUserId]);
}

function upsertSenderGuard(guard) {
  return run(`
    INSERT INTO online_chat_sender_guards (
      civilian_user_id,
      window_started_at,
      message_count,
      strike_count,
      timeout_until,
      last_message_at,
      last_message_body_hash,
      last_violation_at,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(civilian_user_id) DO UPDATE SET
      window_started_at = excluded.window_started_at,
      message_count = excluded.message_count,
      strike_count = excluded.strike_count,
      timeout_until = excluded.timeout_until,
      last_message_at = excluded.last_message_at,
      last_message_body_hash = excluded.last_message_body_hash,
      last_violation_at = excluded.last_violation_at,
      updated_at = CURRENT_TIMESTAMP
  `, [
    guard.civilianUserId,
    guard.windowStartedAt || null,
    guard.messageCount || 0,
    guard.strikeCount || 0,
    guard.timeoutUntil || null,
    guard.lastMessageAt || null,
    guard.lastMessageBodyHash || null,
    guard.lastViolationAt || null,
  ]);
}

function insertModerationEvent(event) {
  return run(`
    INSERT INTO online_chat_moderation_events (
      civilian_user_id,
      department_id,
      conversation_id,
      event_type,
      reason,
      body_preview,
      metadata_json,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `, [
    event.civilianUserId,
    event.departmentId || null,
    event.conversationId || null,
    event.eventType,
    event.reason,
    event.bodyPreview || null,
    event.metadataJson || null,
  ]);
}

module.exports = {
  archiveDepartment,
  createDepartment,
  findConversation,
  getAdminDepartmentUnreadSummary,
  getCivilianById,
  getCivilianDepartmentUnreadSummary,
  getCivilianGlobalUnreadSummary,
  getConversationById,
  getDepartmentById,
  getDepartmentBySlug,
  getGlobalMessageById,
  getSenderGuard,
  getOrCreateConversation,
  insertGlobalMessage,
  insertMessage,
  insertModerationEvent,
  listAdminConversations,
  listDepartments,
  listGlobalMessages,
  listMessages,
  markGlobalRead,
  markConversationRead,
  upsertSenderGuard,
  updateDepartment
};
