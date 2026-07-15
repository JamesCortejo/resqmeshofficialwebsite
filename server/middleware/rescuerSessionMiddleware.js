const { validateMobileAppSession } = require('../services/authSessionService');

async function requireRescuerSession(req, res, next) {
  try {
    const authenticatedSession = await validateMobileAppSession(req);

    if (!authenticatedSession) {
      return res.status(401).json({
        success: false,
        message: 'Valid rescuer authentication is required.'
      });
    }

    req.rescuerSession = authenticatedSession.session;
    req.rescuer = authenticatedSession.principal;
    return next();
  } catch (error) {
    console.error('Rescuer session validation error:', error);
    return res.status(500).json({
      success: false,
      message: 'Unable to validate rescuer session.'
    });
  }
}

module.exports = {
  requireRescuerSession
};
