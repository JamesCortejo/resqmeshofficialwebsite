const {
  generateIncidentSummaryReport,
  generateAccountsAccessAuditReport,
  generateRescueTeamActivityReport,
  generateMeshDeviceSyncHealthReport,
  generateOnlineCommunicationsModerationReport,
  getAdminReportCatalog,
  listAdminReportExports
} = require('../services/reportService');
const {
  ADMIN_ACTIONS,
  AUDIT_RESULTS,
  getErrorStatusCode,
  logAdminAction
} = require('../services/adminActionAuditService');

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

function sendReportResponse(res, result) {
  res.setHeader('Content-Type', result.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
  res.setHeader('Content-Length', result.buffer.length);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Report-Export-Id', String(result.exportId));

  return res.send(result.buffer);
}

async function auditReportExport(req, reportType, details) {
  await logAdminAction(req, {
    action: ADMIN_ACTIONS.REPORT_EXPORT_GENERATED,
    targetType: 'report_export',
    targetId: details.exportId || null,
    targetCode: details.filename || reportType,
    result: details.result,
    statusCode: details.statusCode,
    reason: details.reason,
    metadata: {
      reportType,
      exportId: details.exportId || null,
      filename: details.filename || null,
      options: req.body || {}
    }
  });
}

async function generateReport(req, res, reportType, generator, fallbackMessage) {
  try {
    const result = await generator(req.adminUser.id, req.body || {});

    await auditReportExport(req, reportType, {
      result: AUDIT_RESULTS.SUCCESS,
      statusCode: 200,
      exportId: result.exportId,
      filename: result.filename
    });

    return sendReportResponse(res, result);
  } catch (error) {
    await auditReportExport(req, reportType, {
      result: AUDIT_RESULTS.FAILURE,
      statusCode: getErrorStatusCode(error),
      reason: error.message
    });

    return errorResponse(res, error, fallbackMessage);
  }
}
exports.getCatalog = async (req, res) => {
  try {
    const catalog = await getAdminReportCatalog();
    return res.json({
      success: true,
      data: catalog
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to load report catalog.');
  }
};

exports.listExports = async (req, res) => {
  try {
    const exportsList = await listAdminReportExports();
    return res.json({
      success: true,
      count: exportsList.length,
      data: exportsList
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to load report exports.');
  }
};

exports.generateIncidentSummary = async (req, res) => generateReport(
  req,
  res,
  'incident_summary',
  generateIncidentSummaryReport,
  'Unable to generate incident summary report.'
);

exports.generateRescueTeamActivity = async (req, res) => generateReport(
  req,
  res,
  'rescue_team_activity',
  generateRescueTeamActivityReport,
  'Unable to generate rescue team activity report.'
);

exports.generateAccountsAccessAudit = async (req, res) => generateReport(
  req,
  res,
  'accounts_access_audit',
  generateAccountsAccessAuditReport,
  'Unable to generate accounts and access audit report.'
);

exports.generateMeshDeviceSyncHealth = async (req, res) => generateReport(
  req,
  res,
  'mesh_device_sync_health',
  generateMeshDeviceSyncHealthReport,
  'Unable to generate mesh device and sync health report.'
);

exports.generateOnlineCommunicationsModeration = async (req, res) => generateReport(
  req,
  res,
  'online_communications_moderation',
  generateOnlineCommunicationsModerationReport,
  'Unable to generate online communications and moderation report.'
);
