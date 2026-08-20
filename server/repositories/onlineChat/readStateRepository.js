const { run, get, all } = require('../../database/postgres');

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

function getAdminDepartmentUnreadSummary(adminUserId) {
  return all(`
    SELECT
      d.id AS departmentId,
      COUNT(unread.id) AS unreadCount
    FROM online_chat_departments d
    LEFT JOIN online_chat_conversations c ON c.department_id = d.id AND c.status = 'open'
    LEFT JOIN users u
      ON u.id = c.civilian_user_id
      AND u.status = 'approved'
    LEFT JOIN online_chat_read_states rs
      ON rs.conversation_id = c.id
      AND rs.reader_type = 'admin'
      AND rs.reader_id = ?
    LEFT JOIN online_chat_messages unread
      ON unread.conversation_id = c.id
      AND u.id IS NOT NULL
      AND unread.deleted = 0
      AND unread.sender_type IN ('civilian', 'rescuer')
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
      AND unread.sender_type IN ('admin', 'rescuer', 'system')
      AND unread.id > COALESCE(rs.last_read_message_id, 0)
    WHERE d.status = 'active'
    GROUP BY d.id
  `, [civilianUserId, civilianUserId]);
}

function getRescuerDepartmentUnreadSummary(rescuerId) {
  return all(`
    SELECT
      d.id AS departmentId,
      COUNT(unread.id) AS unreadCount
    FROM online_chat_departments d
    LEFT JOIN online_chat_conversations c ON c.department_id = d.id AND c.status = 'open'
    LEFT JOIN online_chat_read_states rs
      ON rs.conversation_id = c.id
      AND rs.reader_type = 'rescuer'
      AND rs.reader_id = ?
    LEFT JOIN online_chat_messages unread
      ON unread.conversation_id = c.id
      AND unread.deleted = 0
      AND unread.sender_type IN ('civilian', 'admin', 'system')
      AND unread.id > COALESCE(rs.last_read_message_id, 0)
    GROUP BY d.id
  `, [rescuerId]);
}

function getRescuerGlobalUnreadSummary(rescuerId, departmentId) {
  return get(`
    SELECT COUNT(unread.id) AS unreadCount
    FROM online_chat_global_messages unread
    LEFT JOIN online_chat_global_read_states rs
      ON rs.department_id = unread.department_id
      AND rs.reader_type = 'rescuer'
      AND rs.reader_id = ?
    WHERE unread.department_id = ?
      AND unread.deleted = 0
      AND unread.id > COALESCE(rs.last_read_message_id, 0)
  `, [rescuerId, departmentId]);
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

module.exports = {
  getAdminDepartmentUnreadSummary,
  getCivilianDepartmentUnreadSummary,
  getCivilianGlobalUnreadSummary,
  getRescuerDepartmentUnreadSummary,
  getRescuerGlobalUnreadSummary,
  markConversationRead,
  markGlobalRead
};
