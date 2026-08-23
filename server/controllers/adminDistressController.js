const {
  getDistressSignalSummaries,
  getUnresolvedDistressSignalCount,
  getDistressSignalDetails,
  deployDistressSignal,
  cancelDeployment,
  accomplishDeployment
} = require('../services/distressDeploymentService');
const {
  ADMIN_ACTIONS,
  AUDIT_RESULTS,
  getErrorStatusCode,
  logAdminAction
} = require('../services/adminActionAuditService');

function parseId(value) {
  const id = Number.parseInt(String(value || ''), 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function isValidDistressKey(value) {
  return Boolean(parseId(value) || /^(mesh|online):\d+$/i.test(String(value || '').trim()));
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

async function auditDeploymentAction(req, details) {
  await logAdminAction(req, {
    action: details.action,
    targetType: 'deployment',
    targetId: details.id,
    targetCode: details.targetCode,
    result: details.result,
    statusCode: details.statusCode,
    reason: details.reason,
    metadata: {
      requestedDeploymentId: details.id || null,
      deploymentStatus: details.deploymentStatus || null,
      distressSource: details.distressSource || null,
      distressCode: details.distressCode || null
    }
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

exports.getActiveDistressSignalCount = async (req, res) => {
  try {
    const count = await getUnresolvedDistressSignalCount();

    return res.json({
      success: true,
      count
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to load active distress count.');
  }
};

exports.getDistressSignalDetails = async (req, res) => {
  try {
    if (!isValidDistressKey(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid distress signal id.'
      });
    }

    const signal = await getDistressSignalDetails(req.params.id);

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
    if (!isValidDistressKey(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid distress signal id.'
      });
    }

    const signal = await deployDistressSignal(req.params.id, req.body || {}, req.adminUser);

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
  let id = null;

  try {
    id = parseId(req.params.id);

    if (!id) {
      await auditDeploymentAction(req, {
        action: ADMIN_ACTIONS.DEPLOYMENT_CANCELED,
        id: req.params.id,
        result: AUDIT_RESULTS.FAILURE,
        statusCode: 400,
        reason: 'Invalid deployment id.'
      });

      return res.status(400).json({
        success: false,
        message: 'Invalid deployment id.'
      });
    }

    const deployment = await cancelDeployment(id);

    await auditDeploymentAction(req, {
      action: ADMIN_ACTIONS.DEPLOYMENT_CANCELED,
      id,
      targetCode: deployment.deploymentCode,
      result: AUDIT_RESULTS.SUCCESS,
      statusCode: 200,
      deploymentStatus: deployment.status,
      distressSource: deployment.distressSource,
      distressCode: deployment.distressCode
    });

    return res.json({
      success: true,
      message: `Deployment ${deployment.deploymentCode} canceled.`,
      data: deployment
    });
  } catch (error) {
    await auditDeploymentAction(req, {
      action: ADMIN_ACTIONS.DEPLOYMENT_CANCELED,
      id: id || req.params.id,
      result: AUDIT_RESULTS.FAILURE,
      statusCode: getErrorStatusCode(error),
      reason: error.message
    });

    return errorResponse(res, error, 'Unable to cancel deployment.');
  }
};

exports.accomplishDeployment = async (req, res) => {
  let id = null;

  try {
    id = parseId(req.params.id);

    if (!id) {
      await auditDeploymentAction(req, {
        action: ADMIN_ACTIONS.DEPLOYMENT_ACCOMPLISHED,
        id: req.params.id,
        result: AUDIT_RESULTS.FAILURE,
        statusCode: 400,
        reason: 'Invalid deployment id.'
      });

      return res.status(400).json({
        success: false,
        message: 'Invalid deployment id.'
      });
    }

    const deployment = await accomplishDeployment(id);

    await auditDeploymentAction(req, {
      action: ADMIN_ACTIONS.DEPLOYMENT_ACCOMPLISHED,
      id,
      targetCode: deployment.deploymentCode,
      result: AUDIT_RESULTS.SUCCESS,
      statusCode: 200,
      deploymentStatus: deployment.status,
      distressSource: deployment.distressSource,
      distressCode: deployment.distressCode
    });

    return res.json({
      success: true,
      message: `Deployment ${deployment.deploymentCode} marked as accomplished.`,
      data: deployment
    });
  } catch (error) {
    await auditDeploymentAction(req, {
      action: ADMIN_ACTIONS.DEPLOYMENT_ACCOMPLISHED,
      id: id || req.params.id,
      result: AUDIT_RESULTS.FAILURE,
      statusCode: getErrorStatusCode(error),
      reason: error.message
    });

    return errorResponse(res, error, 'Unable to complete deployment.');
  }
};
