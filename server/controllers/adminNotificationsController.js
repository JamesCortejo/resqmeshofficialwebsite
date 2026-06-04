const {
  getNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  clearNotifications
} = require('../services/notificationService');

function parseId(value) {
  const id = Number.parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function errorResponse(res, error, message) {
  console.error(message, error);
  return res.status(500).json({
    success: false,
    message
  });
}

exports.list = async (req, res) => {
  try {
    const notifications = await getNotifications();

    return res.json({
      success: true,
      count: notifications.length,
      data: notifications
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to load notifications.');
  }
};

exports.unreadCount = async (req, res) => {
  try {
    const count = await getUnreadNotificationCount();

    return res.json({
      success: true,
      count
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to load notification count.');
  }
};

exports.markRead = async (req, res) => {
  try {
    const id = parseId(req.params.id);

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Invalid notification id.'
      });
    }

    await markNotificationRead(id);
    return res.json({ success: true });
  } catch (error) {
    return errorResponse(res, error, 'Unable to mark notification as read.');
  }
};

exports.markAllRead = async (req, res) => {
  try {
    await markAllNotificationsRead();
    return res.json({ success: true });
  } catch (error) {
    return errorResponse(res, error, 'Unable to mark notifications as read.');
  }
};

exports.deleteOne = async (req, res) => {
  try {
    const id = parseId(req.params.id);

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Invalid notification id.'
      });
    }

    await deleteNotification(id);
    return res.json({ success: true });
  } catch (error) {
    return errorResponse(res, error, 'Unable to delete notification.');
  }
};

exports.clearAll = async (req, res) => {
  try {
    await clearNotifications();
    return res.json({ success: true });
  } catch (error) {
    return errorResponse(res, error, 'Unable to clear notifications.');
  }
};
