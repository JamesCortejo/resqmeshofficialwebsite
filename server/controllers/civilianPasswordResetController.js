const {
  requestCivilianPasswordReset,
  verifyCivilianPasswordResetCode,
  completeCivilianPasswordReset
} = require('../services/civilianPasswordResetService');

function sendError(res, error, fallbackMessage) {
  if (error.statusCode && error.statusCode < 500) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message
    });
  }

  console.error(fallbackMessage, error);
  return res.status(500).json({
    success: false,
    message: 'Unable to complete password reset right now. Please try again later.'
  });
}

exports.requestReset = async (req, res) => {
  try {
    const result = await requestCivilianPasswordReset(req.body || {}, req);
    return res.json(result);
  } catch (error) {
    return sendError(res, error, 'Password reset request failed:');
  }
};

exports.verifyCode = async (req, res) => {
  try {
    const result = await verifyCivilianPasswordResetCode(req.body || {});
    return res.json(result);
  } catch (error) {
    return sendError(res, error, 'Password reset code verification failed:');
  }
};

exports.completeReset = async (req, res) => {
  try {
    const result = await completeCivilianPasswordReset(req.body || {});
    return res.json(result);
  } catch (error) {
    return sendError(res, error, 'Password reset completion failed:');
  }
};
