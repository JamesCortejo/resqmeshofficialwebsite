const {
  archiveDepartmentChat,
  createDepartmentChat,
  getAdminConversations,
  getAdminDepartments,
  getConversationMessages,
  getGlobalMessages,
  markRead,
  markGlobalAnnouncementsRead,
  sendAdminMessage,
  sendGlobalAnnouncement,
  updateDepartmentChat
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
    const departments = await getAdminDepartments(req.adminUser.id, {
      includeSystem: req.query.includeSystem === '1'
    });

    return res.json({
      success: true,
      count: departments.length,
      data: departments
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to load department chats.');
  }
};

exports.createDepartment = async (req, res) => {
  try {
    const department = await createDepartmentChat(req.body || {}, req.file || null);

    return res.status(201).json({
      success: true,
      message: 'Department chat created successfully.',
      data: department
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to create department chat.');
  }
};

exports.updateDepartment = async (req, res) => {
  try {
    const id = parseId(req.params.id);

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Invalid department chat id.'
      });
    }

    const department = await updateDepartmentChat(id, req.body || {}, req.file || null);

    return res.json({
      success: true,
      message: 'Department chat updated successfully.',
      data: department
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to update department chat.');
  }
};

exports.archiveDepartment = async (req, res) => {
  try {
    const id = parseId(req.params.id);

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Invalid department chat id.'
      });
    }

    const department = await archiveDepartmentChat(id);

    return res.json({
      success: true,
      message: 'Department chat archived successfully.',
      data: department
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to archive department chat.');
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

    const result = await getAdminConversations(departmentId, req.adminUser.id, {
      search: req.query.search
    });

    return res.json({
      success: true,
      count: result.conversations.length,
      data: result
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to load conversations.');
  }
};

exports.listGlobalMessages = async (req, res) => {
  try {
    const result = await getGlobalMessages({
      type: 'admin',
      id: req.adminUser.id
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
      type: 'admin',
      id: req.adminUser.id
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

    const message = await sendAdminMessage(conversationId, req.adminUser.id, req.body?.body);

    return res.status(201).json({
      success: true,
      message: 'Message sent.',
      data: message
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to send message.');
  }
};

exports.sendGlobalMessage = async (req, res) => {
  try {
    const message = await sendGlobalAnnouncement(req.adminUser.id, req.body?.body);

    return res.status(201).json({
      success: true,
      message: 'Announcement sent.',
      data: message
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to send announcement.');
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
      type: 'admin',
      id: req.adminUser.id
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
      type: 'admin',
      id: req.adminUser.id
    });

    return res.json({
      success: true,
      message: 'Global announcements marked as read.'
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to mark global announcements read.');
  }
};
