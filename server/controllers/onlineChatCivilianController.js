const {
  getCivilianDepartments,
  getConversationMessages,
  getGlobalMessages,
  markRead,
  markGlobalAnnouncementsRead,
  openCivilianConversation,
  sendCivilianMessage
} = require('../services/onlineChatService');

function parseId(value) {
  const id = Number.parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function errorResponse(res, error, fallbackMessage) {
  const statusCode = error.statusCode || 500;

  if (statusCode === 500) {
    console.error(fallbackMessage, error);
  }

  return res.status(statusCode).json({
    success: false,
    message: statusCode === 500 ? fallbackMessage : error.message
  });
}

exports.listDepartments = async (req, res) => {
  try {
    const departments = await getCivilianDepartments(req.civilian.id);

    return res.json({
      success: true,
      count: departments.length,
      data: departments
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to load department chats.');
  }
};

exports.openConversation = async (req, res) => {
  try {
    const departmentId = parseId(req.params.departmentId);

    if (!departmentId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid department chat id.'
      });
    }

    const result = await openCivilianConversation(departmentId, req.civilian.id);

    return res.json({
      success: true,
      data: result
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to open department chat.');
  }
};

exports.listGlobalMessages = async (req, res) => {
  try {
    const result = await getGlobalMessages({
      type: 'civilian',
      id: req.civilian.id
    }, {
      beforeId: parseId(req.query.before),
      limit: Math.min(parseId(req.query.limit) || 80, 100)
    });

    return res.json({
      success: true,
      count: result.messages.length,
      data: result
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to load global announcements.');
  }
};

exports.listMessages = async (req, res) => {
  try {
    const conversationId = parseId(req.params.id);

    if (!conversationId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid conversation id.'
      });
    }

    const result = await getConversationMessages(conversationId, {
      type: 'civilian',
      id: req.civilian.id
    }, {
      beforeId: parseId(req.query.before),
      limit: Math.min(parseId(req.query.limit) || 50, 100)
    });

    return res.json({
      success: true,
      count: result.messages.length,
      data: result
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to load messages.');
  }
};

exports.sendMessage = async (req, res) => {
  try {
    const conversationId = parseId(req.params.id);

    if (!conversationId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid conversation id.'
      });
    }

    const message = await sendCivilianMessage(conversationId, req.civilian.id, req.body?.body);

    return res.status(201).json({
      success: true,
      message: 'Message sent.',
      data: message
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to send message.');
  }
};

exports.markRead = async (req, res) => {
  try {
    const conversationId = parseId(req.params.id);

    if (!conversationId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid conversation id.'
      });
    }

    await markRead(conversationId, {
      type: 'civilian',
      id: req.civilian.id
    });

    return res.json({
      success: true,
      message: 'Conversation marked as read.'
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to mark conversation read.');
  }
};

exports.markGlobalRead = async (req, res) => {
  try {
    await markGlobalAnnouncementsRead({
      type: 'civilian',
      id: req.civilian.id
    });

    return res.json({
      success: true,
      message: 'Global announcements marked as read.'
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to mark global announcements read.');
  }
};
