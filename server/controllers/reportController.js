const {
  generateIncidentSummaryReport,
  generateRescueTeamActivityReport,
  getAdminReportCatalog,
  listAdminReportExports
} = require('../services/reportService');

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

exports.generateIncidentSummary = async (req, res) => {
  try {
    const result = await generateIncidentSummaryReport(req.adminUser.id, req.body || {});

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('Content-Length', result.buffer.length);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Report-Export-Id', String(result.exportId));

    return res.send(result.buffer);
  } catch (error) {
    return errorResponse(res, error, 'Unable to generate incident summary report.');
  }
};

exports.generateRescueTeamActivity = async (req, res) => {
  try {
    const result = await generateRescueTeamActivityReport(req.adminUser.id, req.body || {});

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('Content-Length', result.buffer.length);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Report-Export-Id', String(result.exportId));

    return res.send(result.buffer);
  } catch (error) {
    return errorResponse(res, error, 'Unable to generate rescue team activity report.');
  }
};
