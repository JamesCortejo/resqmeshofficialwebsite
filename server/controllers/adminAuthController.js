const {
  buildClearedSessionCookie,
  buildSessionCookie,
  createAdminWebSession,
  revokeAuthenticatedSession
} = require('../services/authSessionService');
const {
  authenticateAdmin,
  toAdminSessionPayload
} = require('../services/adminAuthService');
const { logAdminLoginAttempt } = require('../services/adminLoginAuditService');
const {
  ADMIN_ACTIONS,
  AUDIT_RESULTS,
  executeAuditedAdminAction,
  logAdminAction
} = require('../services/adminActionAuditService');
const { verifyRecaptcha } = require('../services/recaptchaService');

function invalidCredentials(res) {
  return res.status(401).json({
    success: false,
    message: 'Invalid admin credentials.'
  });
}

exports.login = async (req, res) => {
  let auditLogged = false;
  const audit = async (details) => {
    auditLogged = true;
    await logAdminLoginAttempt(req, details);
    if (!details.databaseAudited) {
      await logAdminAction(req, {
      action: details.result === 'success' ? ADMIN_ACTIONS.ADMIN_LOGIN_SUCCEEDED : ADMIN_ACTIONS.ADMIN_LOGIN_FAILED,
      targetType: 'admin_session',
      targetCode: details.username || null,
      adminUserId: details.adminUserId || null,
      adminUserCode: details.adminUserCode || details.username || null,
      result: details.result === 'success' ? AUDIT_RESULTS.SUCCESS : AUDIT_RESULTS.FAILURE,
      statusCode: details.result === 'success' ? 200 : (details.result === 'server_error' ? 500 : 401),
      reason: details.reason || null,
      metadata: { loginResult: details.result || 'unknown' }
      });
    }
  };

  try {
    const username = req.body && req.body.username ? String(req.body.username).trim() : '';
    const password = req.body && req.body.password ? String(req.body.password) : '';
    const recaptchaToken = req.body && req.body.recaptchaToken ? String(req.body.recaptchaToken).trim() : '';

    if (!username || !password) {
      await audit({
        username,
        result: 'missing_credentials',
        reason: !username ? 'missing_username' : 'missing_password'
      });
      return invalidCredentials(res);
    }

    try {
      await verifyRecaptcha(recaptchaToken, 'admin_login', {
        hostname: req.hostname,
        remoteIp: req.ip
      });
    } catch (error) {
      await audit({
        username,
        result: 'recaptcha_failed',
        reason: error.statusCode ? 'verification_rejected' : 'verification_error'
      });
      throw error;
    }

    const admin = await authenticateAdmin(username, password);

    if (!admin) {
      await audit({
        username,
        result: 'invalid_credentials',
        reason: 'invalid_username_or_password'
      });
      return invalidCredentials(res);
    }

    const adminSession = await executeAuditedAdminAction(
      req,
      () => createAdminWebSession(admin, req),
      (session) => ({
        action: ADMIN_ACTIONS.ADMIN_LOGIN_SUCCEEDED,
        targetType: 'admin_session',
        targetId: session.sessionId,
        targetCode: admin.userCode || admin.user_code || username,
        adminUserId: admin.id,
        adminUserCode: admin.userCode || admin.user_code || username,
        statusCode: 200,
        metadata: { loginResult: 'success' }
      })
    );
    res.setHeader('Set-Cookie', buildSessionCookie(adminSession.sessionToken, req));

    await audit({
      username,
      result: 'success',
      reason: 'session_created',
      adminUserId: admin.id,
      adminUserCode: admin.userCode || admin.user_code || username,
      databaseAudited: true
    });

    return res.json({
      success: true,
      redirectTo: '/resqmeshadmin/overview',
      data: toAdminSessionPayload(admin)
    });
  } catch (error) {
    if (!auditLogged) {
      await audit({
        username: req.body && req.body.username ? String(req.body.username).trim() : '',
        result: 'server_error',
        reason: 'login_exception'
      });
    }

    if (error.statusCode && error.statusCode < 500) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    console.error('Admin login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Unable to process admin login.'
    });
  }
};

exports.logout = async (req, res) => {
  const sessionId = req.adminSession?.session?.id || null;
  try {
    await executeAuditedAdminAction(
      req,
      async () => {
        await revokeAuthenticatedSession(sessionId);
        return sessionId;
      },
      () => ({
        action: ADMIN_ACTIONS.ADMIN_LOGOUT,
        targetType: 'admin_session',
        targetId: sessionId,
        statusCode: 200
      })
    );
    res.setHeader('Set-Cookie', buildClearedSessionCookie(req));

    return res.json({ success: true, message: 'Admin session ended.' });
  } catch (error) {
    await logAdminAction(req, {
      action: ADMIN_ACTIONS.ADMIN_LOGOUT,
      targetType: 'admin_session',
      targetId: sessionId,
      result: AUDIT_RESULTS.FAILURE,
      statusCode: 500,
      reason: error.message
    });
    console.error('Admin logout error:', error);
    return res.status(500).json({ success: false, message: 'Unable to end admin session.' });
  }
};
exports.getSession = async (req, res) => {
  return res.json({
    success: true,
    data: {
      admin: toAdminSessionPayload(req.adminUser),
      csrfToken: req.adminSession?.csrfToken || '',
      expiresAt: req.adminSession?.session?.expiresAt || null
    }
  });
};
