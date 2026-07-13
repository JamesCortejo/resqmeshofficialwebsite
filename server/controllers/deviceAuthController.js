const { issueDeviceSyncToken } = require('../services/deviceAuthService');

exports.issueToken = async (req, res) => {
  try {
    const session = await issueDeviceSyncToken(req.body || {}, req);

    return res.json({
      success: true,
      message: 'Device sync token issued successfully.',
      data: session
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;

    if (statusCode === 500) {
      console.error('Device auth token error:', error);
    }

    return res.status(statusCode).json({
      success: false,
      message: statusCode === 500 ? 'Unable to issue device sync token.' : error.message
    });
  }
};
