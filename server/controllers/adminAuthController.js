const { authenticateAdmin } = require('../services/adminAuthService');

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

    return res.json({
      success: true,
      redirectTo: '/resqmeshadmin/overview',
      data: admin
    });
  } catch (error) {
    console.error('Admin login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Unable to process admin login.'
    });
  }
};
