const { loginCivilian } = require('../services/civilianMobileAuthService');

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

exports.login = async (req, res) => {
  try {
    const phone = String(req.body?.phone || '').trim();
    const password = String(req.body?.password || '');

    if (!phone || !password) {
      return res.status(400).json({
        success: false,
        message: 'Phone and password are required.'
      });
    }

    const result = await loginCivilian(phone, password, req);

    return res.json({
      success: true,
      access_token: result.accessToken,
      expires_at: result.expiresAt,
      user: result.user
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to process civilian login.');
  }
};
