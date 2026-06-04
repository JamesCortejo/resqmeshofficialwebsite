const {
  createNotification,
  listNotifications,
  countUnreadNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  clearNotifications
} = require('../repositories/notificationRepository');

function normalizeNotification(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    relatedEntityType: row.relatedEntityType,
    relatedEntityId: row.relatedEntityId,
    relatedEntityCode: row.relatedEntityCode,
    metadata: row.metadataJson ? JSON.parse(row.metadataJson) : null,
    readAt: row.readAt,
    hiddenAt: row.hiddenAt,
    createdAt: row.createdAt,
    isRead: Boolean(row.readAt)
  };
}

async function safeCreateNotification(notification) {
  try {
    await createNotification(notification);
  } catch (error) {
    console.error('Notification creation failed:', error);
  }
}

function notifyPendingRegistrationCreated(user) {
  return safeCreateNotification({
    type: 'registration.pending',
    title: 'New pending registration',
    message: `Registration ${user.userCode} is waiting for admin review.`,
    relatedEntityType: 'user',
    relatedEntityId: user.id,
    relatedEntityCode: user.userCode,
    metadata: { status: user.status }
  });
}

function notifyRegistrationReviewed(user, status) {
  const approved = status === 'approved';

  return safeCreateNotification({
    type: approved ? 'registration.approved' : 'registration.declined',
    title: approved ? 'Registration approved' : 'Registration declined',
    message: `Registration ${user.userCode} was ${status}.`,
    relatedEntityType: 'user',
    relatedEntityId: user.id,
    relatedEntityCode: user.userCode,
    metadata: { status }
  });
}

async function getNotifications() {
  const notifications = await listNotifications();
  return notifications.map(normalizeNotification);
}

async function getUnreadNotificationCount() {
  const row = await countUnreadNotifications();
  return row ? row.count : 0;
}

module.exports = {
  notifyPendingRegistrationCreated,
  notifyRegistrationReviewed,
  getNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  clearNotifications
};
