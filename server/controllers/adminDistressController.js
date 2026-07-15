const {
  getDistressSignalSummaries,
  getDistressSignalDetails,
  deployDistressSignal,
  cancelDeployment,
  accomplishDeployment
} = require('../services/distressDeploymentService');

function parseId(value) {
  const id = Number.parseInt(String(value || ''), 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function errorResponse(res, error, fallbackMessage) {
  const statusCode = error.statusCode || 500;

  if (statusCode === 500) {
    console.error(fallbackMessage, error);
  }

  return res.status(statusCode).json({
    success: false,
    message: statusCode === 500 ? fallbackMessage : error.message
  });
}

exports.listDistressSignals = async (req, res) => {
  try {
    const signals = await getDistressSignalSummaries();

    return res.json({
      success: true,
      count: signals.length,
      data: signals
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to load distress signals.');
  }
};

exports.getDistressSignalDetails = async (req, res) => {
  try {
    const id = parseId(req.params.id);

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Invalid distress signal id.'
      });
    }

    const signal = await getDistressSignalDetails(id);

    if (!signal) {
      return res.status(404).json({
        success: false,
        message: 'Distress signal not found.'
      });
    }

    return res.json({
      success: true,
      data: signal
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to load distress signal details.');
  }
};

exports.deployDistressSignal = async (req, res) => {
  try {
    const id = parseId(req.params.id);

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Invalid distress signal id.'
      });
    }

    const signal = await deployDistressSignal(id, req.body || {}, req.adminUser);

    return res.status(201).json({
      success: true,
      message: `Deployment prepared for ${signal.distressCode}.`,
      data: signal
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to deploy rescue team.');
  }
};

exports.cancelDeployment = async (req, res) => {
  try {
    const id = parseId(req.params.id);

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Invalid deployment id.'
      });
    }

    const deployment = await cancelDeployment(id);

    return res.json({
      success: true,
      message: `Deployment ${deployment.deploymentCode} canceled.`,
      data: deployment
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to cancel deployment.');
  }
};

exports.accomplishDeployment = async (req, res) => {
  try {
    const id = parseId(req.params.id);

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Invalid deployment id.'
      });
    }

    const deployment = await accomplishDeployment(id);

    return res.json({
      success: true,
      message: `Deployment ${deployment.deploymentCode} marked as accomplished.`,
      data: deployment
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to complete deployment.');
  }
};
