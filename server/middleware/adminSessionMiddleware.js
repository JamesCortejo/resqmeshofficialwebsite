const {
  hasValidCsrfToken,
  validateAdminWebSession
} = require('../services/authSessionService');
const {
  ADMIN_ACTIONS,
  AUDIT_RESULTS,
  logAdminAction
} = require('../services/adminActionAuditService');

async function auditAdminPermissionFailure(req, details) {
  await logAdminAction(req, {
    action: details.action,
    targetType: 'admin_permission',
    targetId: req.path || req.originalUrl || null,
    result: AUDIT_RESULTS.FAILURE,
    statusCode: details.statusCode,
    reason: details.reason,
    metadata: {
      method: req.method,
      path: req.originalUrl || req.path || null
    }
  });
}
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
      await auditAdminPermissionFailure(req, {
        action: ADMIN_ACTIONS.ADMIN_SESSION_REQUIRED_FAILED,
        statusCode: 401,
        reason: 'Admin authentication required.'
      });

      return res.status(401).json({
        success: false,
        message: 'Admin authentication required.'
      });
    }

    return next();
  } catch (error) {
    console.error('Admin session validation error:', error);
    await auditAdminPermissionFailure(req, {
      action: ADMIN_ACTIONS.ADMIN_SESSION_REQUIRED_FAILED,
      statusCode: 500,
      reason: 'Unable to validate admin session.'
    });

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

async function requireAdminCsrf(req, res, next) {
  if (hasValidCsrfToken(req)) {
    return next();
  }

  await auditAdminPermissionFailure(req, {
    action: ADMIN_ACTIONS.ADMIN_CSRF_FAILED,
    statusCode: 403,
    reason: 'Invalid or missing CSRF token.'
  });

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
