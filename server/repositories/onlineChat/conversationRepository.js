const { get, all, transaction } = require('../../database/postgres');

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
      d.rescuer_agency AS departmentRescuerAgency,
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
      u.email_enc AS emailEnc,
      u.occupation_enc AS occupationEnc,
      u.blood_type_enc AS bloodTypeEnc,
      u.medical_complications_enc AS medicalComplicationsEnc,
      u.allergies_enc AS allergiesEnc
    FROM online_chat_conversations c
    JOIN online_chat_departments d ON d.id = c.department_id
    JOIN users u ON u.id = c.civilian_user_id
      AND u.status = 'approved'
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
      ods.id AS activeOnlineDistressId,
      ods.distress_code AS distressCode,
      ods.reason AS distressReason,
      ods.recorded_at AS distressRecordedAt,
      CASE WHEN ods.id IS NULL THEN 0 ELSE 1 END AS hasActiveOnlineDistress,
      (
        SELECT COUNT(*)
        FROM online_chat_messages unread
        LEFT JOIN online_chat_read_states rs
          ON rs.conversation_id = c.id
          AND rs.reader_type = 'admin'
          AND rs.reader_id = ?
        WHERE unread.conversation_id = c.id
          AND unread.deleted = 0
          AND unread.sender_type IN ('civilian', 'rescuer')
          AND unread.id > COALESCE(rs.last_read_message_id, 0)
      ) AS unreadCount
    FROM online_chat_conversations c
    JOIN users u ON u.id = c.civilian_user_id
    LEFT JOIN online_chat_messages m ON m.id = c.last_message_id
    LEFT JOIN online_distress_signals ods
      ON ods.user_id = c.civilian_user_id
      AND ods.status = 'active'
      AND ods.deleted = 0
    WHERE c.department_id = ? AND c.status = 'open'
      AND EXISTS (
        SELECT 1
        FROM online_chat_messages seeded
        WHERE seeded.conversation_id = c.id
          AND seeded.deleted = 0
          AND seeded.sender_type = 'civilian'
      )
    ${searchClause}
    ORDER BY
      CASE WHEN ods.id IS NULL THEN 1 ELSE 0 END ASC,
      c.last_message_at DESC NULLS LAST,
      c.updated_at DESC,
      c.id DESC
  `, params);
}

function listRescuerConversations(
  departmentId,
  rescuerId,
  { search = '', beforeId = null, limit = 20 } = {}
) {
  const query = String(search || '').trim().toLowerCase();
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 50));
  const params = [rescuerId, departmentId];
  let searchClause = '';
  let cursorClause = '';

  if (query) {
    searchClause = `
      AND (
        LOWER(u.user_code) LIKE ?
        OR LOWER(COALESCE(m.body, '')) LIKE ?
      )
    `;
    params.push(`%${query}%`, `%${query}%`);
  }

  if (beforeId) {
    cursorClause = 'AND c.id < ?';
    params.push(beforeId);
  }

  params.push(safeLimit + 1);

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
      u.email_enc AS emailEnc,
      u.occupation_enc AS occupationEnc,
      u.blood_type_enc AS bloodTypeEnc,
      u.medical_complications_enc AS medicalComplicationsEnc,
      u.allergies_enc AS allergiesEnc,
      m.body AS lastMessageBody,
      m.sender_type AS lastMessageSenderType,
      ods.id AS activeOnlineDistressId,
      ods.distress_code AS distressCode,
      ods.reason AS distressReason,
      ods.recorded_at AS distressRecordedAt,
      CASE WHEN ods.id IS NULL THEN 0 ELSE 1 END AS hasActiveOnlineDistress,
      (
        SELECT COUNT(*)
        FROM online_chat_messages unread
        LEFT JOIN online_chat_read_states rs
          ON rs.conversation_id = c.id
          AND rs.reader_type = 'rescuer'
          AND rs.reader_id = ?
        WHERE unread.conversation_id = c.id
          AND unread.deleted = 0
          AND unread.sender_type IN ('civilian', 'admin', 'system')
          AND unread.id > COALESCE(rs.last_read_message_id, 0)
      ) AS unreadCount
    FROM online_chat_conversations c
    JOIN users u ON u.id = c.civilian_user_id
    LEFT JOIN online_chat_messages m ON m.id = c.last_message_id
    LEFT JOIN online_distress_signals ods
      ON ods.user_id = c.civilian_user_id
      AND ods.status = 'active'
      AND ods.deleted = 0
    WHERE c.department_id = ? AND c.status = 'open'
      AND EXISTS (
        SELECT 1
        FROM online_chat_messages seeded
        WHERE seeded.conversation_id = c.id
          AND seeded.deleted = 0
          AND seeded.sender_type = 'civilian'
      )
    ${searchClause}
    ${cursorClause}
    ORDER BY
      CASE WHEN ods.id IS NULL THEN 1 ELSE 0 END ASC,
      c.last_message_at DESC NULLS LAST,
      c.updated_at DESC,
      c.id DESC
    LIMIT ?
  `, params);
}

module.exports = {
  findConversation,
  getConversationById,
  getOrCreateConversation,
  listAdminConversations,
  listRescuerConversations
};
