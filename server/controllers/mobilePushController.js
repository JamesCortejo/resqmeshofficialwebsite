const {
  registerMobilePushToken,
  unregisterMobilePushToken,
} = require('../services/mobilePushService');

function errorResponse(res, error, fallbackMessage) {
  const statusCode = error.statusCode || 500;

  if (statusCode === 500) {
    console.error(fallbackMessage, error);
  }

  return res.status(statusCode).json({
    success: false,
    message: statusCode === 500 ? fallbackMessage : error.message,
  });
}

exports.register = async (req, res) => {
  try {
    const principal = req.mobilePrincipal || req.rescuer || req.civilian;
    const role = principal?.rescuerCode ? 'rescuer' : 'civilian';
    const data = await registerMobilePushToken(principal, req.body || {}, role);

    return res.json({
      success: true,
      message: 'Push registration saved.',
      data,
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to register mobile push token.');
  }
};

exports.unregister = async (req, res) => {
  try {
    const principal = req.mobilePrincipal || req.rescuer || req.civilian;
    const role = principal?.rescuerCode ? 'rescuer' : 'civilian';
    const data = await unregisterMobilePushToken(principal, req.body || {}, role);

    return res.json({
      success: true,
      message: 'Push registration disabled.',
      data,
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to unregister mobile push token.');
  }
};
