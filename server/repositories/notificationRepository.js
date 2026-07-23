const { all, get, run } = require('../database/postgres');

function createNotification(notification) {
  return run(`
    INSERT INTO notifications (
      type,
      title,
      message,
      related_entity_type,
      related_entity_id,
      related_entity_code,
      metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    notification.type,
    notification.title,
    notification.message,
    notification.relatedEntityType || null,
    notification.relatedEntityId || null,
    notification.relatedEntityCode || null,
    notification.metadata ? JSON.stringify(notification.metadata) : null
  ]);
}

function listNotifications(limit = 50) {
  return all(`
    SELECT
      id,
      type,
      title,
      message,
      related_entity_type AS relatedEntityType,
      related_entity_id AS relatedEntityId,
      related_entity_code AS relatedEntityCode,
      metadata_json AS metadataJson,
      read_at AS readAt,
      hidden_at AS hiddenAt,
      created_at AS createdAt
    FROM notifications
    WHERE hidden_at IS NULL
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `, [limit]);
}

function countUnreadNotifications() {
  return get(`
    SELECT COUNT(*) AS count
    FROM notifications
    WHERE hidden_at IS NULL AND read_at IS NULL
  `);
}

function markNotificationRead(id) {
  return run(`
    UPDATE notifications
    SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
    WHERE id = ? AND hidden_at IS NULL
  `, [id]);
}

function markAllNotificationsRead() {
  return run(`
    UPDATE notifications
    SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
    WHERE hidden_at IS NULL AND read_at IS NULL
  `);
}

function deleteNotification(id) {
  return run(`
    UPDATE notifications
    SET hidden_at = COALESCE(hidden_at, CURRENT_TIMESTAMP)
    WHERE id = ? AND hidden_at IS NULL
  `, [id]);
}

function clearNotifications() {
  return run(`
    UPDATE notifications
    SET hidden_at = COALESCE(hidden_at, CURRENT_TIMESTAMP)
    WHERE hidden_at IS NULL
  `);
}

module.exports = {
  createNotification,
  listNotifications,
  countUnreadNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  clearNotifications
};
