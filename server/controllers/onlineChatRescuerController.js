const {
  getConversationMessages,
  getGlobalMessages,
  getRescuerConversations,
  getRescuerDepartments,
  markRead,
  markGlobalAnnouncementsRead,
  sendRescuerMessage
} = require('../services/onlineChatService');

function parseId(value) {
  const id = Number.parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function parseCursor(query, primaryKey, fallbackKey = null) {
  return parseId(query?.[primaryKey] ?? (fallbackKey ? query?.[fallbackKey] : null));
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
    const departments = await getRescuerDepartments(req.rescuer);

    return res.json({
      success: true,
      count: departments.length,
      data: departments
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to load rescuer chat departments.');
  }
};

exports.listConversations = async (req, res) => {
  try {
    const departmentId = parseId(req.query.departmentId);

    if (!departmentId) {
      return res.status(400).json({
        success: false,
        message: 'Valid department id is required.'
      });
    }

    const result = await getRescuerConversations(departmentId, req.rescuer, {
      search: req.query.search
    });

    return res.json({
      success: true,
      count: result.conversations.length,
      data: result
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to load rescuer conversations.');
  }
};

exports.listGlobalMessages = async (req, res) => {
  try {
    const result = await getGlobalMessages({
      type: 'rescuer',
      id: req.rescuer.id
    }, {
      beforeId: parseCursor(req.query, 'before'),
      afterId: parseCursor(req.query, 'after', 'afterId'),
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
      type: 'rescuer',
      id: req.rescuer.id,
      agency: req.rescuer.agency
    }, {
      beforeId: parseCursor(req.query, 'before'),
      afterId: parseCursor(req.query, 'after', 'afterId'),
      limit: Math.min(parseId(req.query.limit) || 50, 100)
    });

    return res.json({
      success: true,
      count: result.messages.length,
      data: result
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to load rescuer messages.');
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

    const message = await sendRescuerMessage(conversationId, req.rescuer, req.body?.body);

    return res.status(201).json({
      success: true,
      message: 'Message sent.',
      data: message
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to send rescuer message.');
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
      type: 'rescuer',
      id: req.rescuer.id,
      agency: req.rescuer.agency
    });

    return res.json({
      success: true,
      message: 'Conversation marked as read.'
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to mark rescuer conversation read.');
  }
};

exports.markGlobalRead = async (req, res) => {
  try {
    await markGlobalAnnouncementsRead({
      type: 'rescuer',
      id: req.rescuer.id
    });

    return res.json({
      success: true,
      message: 'Global announcements marked as read.'
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to mark global announcements read.');
  }
};
