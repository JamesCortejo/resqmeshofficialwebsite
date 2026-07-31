const {
  revokeAuthenticatedSession
} = require('../services/authSessionService');
const { loginRescuer } = require('../services/rescuerMobileAuthService');
const { disableActorMobilePushTokens } = require('../services/mobilePushService');
const { disableRescuerLocationSharing } = require('../services/mobileOperationsService');

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
    const code = String(req.body?.code || '').trim();
    const password = String(req.body?.password || '');

    if (!code || !password) {
      return res.status(400).json({
        success: false,
        message: 'Rescuer code and password are required.'
      });
    }

    const result = await loginRescuer(code, password, req);

    return res.json({
      success: true,
      access_token: result.accessToken,
      expires_at: result.expiresAt,
      user: result.user
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to process rescuer login.');
  }
};

exports.logout = async (req, res) => {
  try {
    if (req.mobilePrincipal?.id && req.mobilePrincipal?.rescuerCode) {
      await disableRescuerLocationSharing(req.mobilePrincipal.id);
    }

    if (req.mobilePrincipal?.id) {
      const role = req.mobilePrincipal?.rescuerCode ? 'rescuer' : 'civilian';
      await disableActorMobilePushTokens(req.mobilePrincipal, role);
    }

    await revokeAuthenticatedSession(req.mobileSession?.id || req.rescuerSession?.id);

    return res.json({
      success: true,
      message: 'Mobile session ended.'
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to log out rescuer.');
  }
};
