const {
  hasValidCsrfToken,
  validateAdminWebSession
} = require('../services/authSessionService');

async function loadAdminSession(req) {
  if (req.adminSession) {
    return req.adminSession;
  }

  const authenticatedSession = await validateAdminWebSession(req);

  if (authenticatedSession) {
    req.adminSession = authenticatedSession;
    req.adminUser = authenticatedSession.principal;
  }

  return authenticatedSession;
}

async function requireAdminSession(req, res, next) {
  try {
    const authenticatedSession = await loadAdminSession(req);

    if (!authenticatedSession) {
      return res.status(401).json({
        success: false,
        message: 'Admin authentication required.'
      });
    }

    return next();
  } catch (error) {
    console.error('Admin session validation error:', error);
    return res.status(500).json({
      success: false,
      message: 'Unable to validate admin session.'
    });
  }
}

async function requireAdminPageSession(req, res, next) {
  try {
    const authenticatedSession = await loadAdminSession(req);

    if (!authenticatedSession) {
      return res.redirect('/resqmeshadmin');
    }

    return next();
  } catch (error) {
    console.error('Admin page session validation error:', error);
    return res.redirect('/resqmeshadmin');
  }
}

async function redirectAuthenticatedAdmin(req, res, next) {
  try {
    const authenticatedSession = await loadAdminSession(req);

    if (authenticatedSession) {
      return res.redirect('/resqmeshadmin/overview');
    }

    return next();
  } catch (error) {
    return next();
  }
}

function requireAdminCsrf(req, res, next) {
  if (hasValidCsrfToken(req)) {
    return next();
  }

  return res.status(403).json({
    success: false,
    message: 'Invalid or missing CSRF token.'
  });
}

module.exports = {
  redirectAuthenticatedAdmin,
  requireAdminCsrf,
  requireAdminPageSession,
  requireAdminSession
};
