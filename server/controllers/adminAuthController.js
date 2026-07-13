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

function invalidCredentials(res) {
  return res.status(401).json({
    success: false,
    message: 'Invalid admin credentials.'
  });
}

exports.login = async (req, res) => {
  try {
    const username = req.body && req.body.username ? String(req.body.username).trim() : '';
    const password = req.body && req.body.password ? String(req.body.password) : '';

    if (!username || !password) {
      return invalidCredentials(res);
    }

    const admin = await authenticateAdmin(username, password);

    if (!admin) {
      return invalidCredentials(res);
    }

    const adminSession = await createAdminWebSession(admin, req);
    res.setHeader('Set-Cookie', buildSessionCookie(adminSession.sessionToken, req));

    return res.json({
      success: true,
      redirectTo: '/resqmeshadmin/overview',
      data: toAdminSessionPayload(admin)
    });
  } catch (error) {
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
