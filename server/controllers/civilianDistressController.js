const {
  cancelCivilianDistress,
  cancelCivilianOnlineDistress,
  createCivilianOnlineDistress,
  getActiveCivilianOnlineDistress
} = require('../services/civilianDistressService');

function errorResponse(res, error, fallbackMessage) {
  const statusCode = error.statusCode || 500;

  if (statusCode === 500) {
    console.error(fallbackMessage, error);
  }

  return res.status(statusCode).json({
    success: false,
    message: statusCode === 500 ? fallbackMessage : error.message,
    ...(error.conflict ? { conflict: error.conflict } : {}),
    ...(error.activeSource ? { activeSource: error.activeSource } : {})
  });
}

exports.create = async (req, res) => {
  try {
    const distress = await createCivilianOnlineDistress(req.civilian, req.body || {});
    return res.status(201).json({
      success: true,
      message: 'Online distress signal activated.',
      distress,
      data: distress
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to activate online distress signal.');
  }
};

exports.cancelBySource = async (req, res) => {
  try {
    const result = await cancelCivilianDistress(req.civilian, req.params.source, req.params.id);
    return res.json({
      success: true,
      message: result?.message || 'Distress signal canceled.',
      data: result
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to cancel distress signal.');
  }
};

exports.getActive = async (req, res) => {
  try {
    const distress = await getActiveCivilianOnlineDistress(req.civilian);
    return res.json({
      success: true,
      distress,
      data: distress
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to load active online distress signal.');
  }
};

exports.cancel = async (req, res) => {
  try {
    const result = await cancelCivilianOnlineDistress(req.civilian, req.params.id);
    return res.json({
      success: true,
      message: result?.message || 'Online distress signal canceled.',
      data: result
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to cancel online distress signal.');
  }
};
