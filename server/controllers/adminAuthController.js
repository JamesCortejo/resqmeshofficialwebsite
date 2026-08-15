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

    const adminSession = await createAdminWebSession(admin, req);
    res.setHeader('Set-Cookie', buildSessionCookie(adminSession.sessionToken, req));

    await audit({
      username,
      result: 'success',
      reason: 'session_created'
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

    console.error('Admin login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Unable to process admin login.'
    });
  }
};

exports.logout = async (req, res) => {
  try {
    await revokeAuthenticatedSession(req.adminSession?.session?.id);
    res.setHeader('Set-Cookie', buildClearedSessionCookie(req));

    return res.json({
      success: true,
      message: 'Admin session ended.'
    });
  } catch (error) {
    console.error('Admin logout error:', error);
    return res.status(500).json({
      success: false,
      message: 'Unable to end admin session.'
    });
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
