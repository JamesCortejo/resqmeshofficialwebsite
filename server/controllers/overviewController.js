const { getOverviewDashboard } = require('../services/overviewService');

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

exports.getOverview = async (req, res) => {
  try {
    const overview = await getOverviewDashboard();

    return res.json({
      success: true,
      data: overview
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to load overview dashboard.');
  }
};
