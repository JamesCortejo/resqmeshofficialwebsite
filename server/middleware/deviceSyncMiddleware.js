const { validateDeviceSyncSession } = require('../services/authSessionService');

async function requireDeviceSyncSession(req, res, next) {
  try {
    const authenticatedSession = await validateDeviceSyncSession(req);

    if (!authenticatedSession) {
      return res.status(401).json({
        success: false,
        message: 'Valid device sync authentication is required.'
      });
    }

    req.syncSession = authenticatedSession.session;
    req.syncDevice = authenticatedSession.principal;
    return next();
  } catch (error) {
    console.error('Device sync session validation error:', error);
    return res.status(500).json({
      success: false,
      message: 'Unable to validate device sync session.'
    });
  }
}

module.exports = {
  requireDeviceSyncSession
};