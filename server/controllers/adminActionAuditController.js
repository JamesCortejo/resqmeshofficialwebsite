const { getAdminActionAuditLogPage } = require('../services/adminActionAuditService');

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

exports.listAuditLogs = async (req, res) => {
  try {
    const result = await getAdminActionAuditLogPage(req.query || {});

    return res.json({
      success: true,
      ...result
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to load admin audit logs.');
  }
};