const {
  createRescuerProfile,
  getRescuerSummaries,
  getRescuerDetails,
  setRescuerAccessStatus,
  updateRescuerOperationalStatus,
  resetRescuerPassword,
  getRescueTeamSummaries
} = require('../services/rescuerService');
const {
  ADMIN_ACTIONS,
  AUDIT_RESULTS,
  getErrorStatusCode,
  logAdminAction
} = require('../services/adminActionAuditService');

function parseId(value) {
  const id = Number.parseInt(value, 10);
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

function getRequestedRescuerAccessStatus(body) {
  return body && body.status ? String(body.status).trim().toLowerCase() : '';
}

function getRescuerAccessAuditAction(status) {
  const normalized = String(status || '').trim().toLowerCase();

  if (normalized === 'archived') {
    return ADMIN_ACTIONS.RESCUER_ARCHIVED;
  }

  if (normalized === 'active') {
    return ADMIN_ACTIONS.RESCUER_ACTIVATED;
  }

  return null;
}

async function auditRescuerAccessAttempt(req, details) {
  const action = getRescuerAccessAuditAction(details.status);

  if (!action) {
    return;
  }

  await logAdminAction(req, {
    action,
    targetType: 'rescuer',
    targetId: details.id,
    targetCode: details.targetCode,
    result: details.result,
    statusCode: details.statusCode,
    reason: details.reason,
    metadata: {
      requestedStatus: details.status || null,
      warning: details.warning || null
    }
  });
}

async function auditRescuerOperationalStatusAttempt(req, details) {
  await logAdminAction(req, {
    action: ADMIN_ACTIONS.RESCUER_OPERATIONAL_STATUS_CHANGED,
    targetType: 'rescuer',
    targetId: details.id,
    targetCode: details.targetCode,
    result: details.result,
    statusCode: details.statusCode,
    reason: details.reason,
    metadata: {
      requestedStatus: details.requestedStatus || null,
      currentStatus: details.currentStatus || null
    }
  });
}
async function auditRescuerPasswordAttempt(req, details) {
  await logAdminAction(req, {
    action: ADMIN_ACTIONS.RESCUER_PASSWORD_RESET,
    targetType: 'rescuer',
    targetId: details.id,
    targetCode: details.targetCode,
    result: details.result,
    statusCode: details.statusCode,
    reason: details.reason,
    metadata: {
      passwordProvided: Boolean(req.body?.password),
      confirmPasswordProvided: Boolean(req.body?.confirmPassword),
      adminPasswordProvided: Boolean(req.body?.adminPassword)
    }
  });
}

exports.createRescuer = async (req, res) => {
  try {
    const rescuer = await createRescuerProfile(req.body || {}, req.adminUser?.id || null);

    return res.status(201).json({
      success: true,
      message: `Rescuer ${rescuer.rescuerCode} created successfully.`,
      data: rescuer
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to create rescuer.');
  }
};

exports.listRescuers = async (req, res) => {
  try {
    const rescuers = await getRescuerSummaries();

    return res.json({
      success: true,
      count: rescuers.length,
      data: rescuers
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to load rescuers.');
  }
};

exports.getRescuerDetails = async (req, res) => {
  try {
    const id = parseId(req.params.id);

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Invalid rescuer id.'
      });
    }

    const rescuer = await getRescuerDetails(id);

    if (!rescuer) {
      return res.status(404).json({
        success: false,
        message: 'Rescuer not found.'
      });
    }

    return res.json({
      success: true,
      data: rescuer
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to load rescuer details.');
  }
};

exports.updateAccessStatus = async (req, res) => {
  let id = null;
  const status = getRequestedRescuerAccessStatus(req.body || {});

  try {
    id = parseId(req.params.id);

    if (!id) {
      await auditRescuerAccessAttempt(req, {
        id: req.params.id,
        status,
        result: AUDIT_RESULTS.FAILURE,
        statusCode: 400,
        reason: 'Invalid rescuer id.'
      });

      return res.status(400).json({
        success: false,
        message: 'Invalid rescuer id.'
      });
    }

    const result = await setRescuerAccessStatus(id, req.body || {}, req.adminUser?.id || null);

    await auditRescuerAccessAttempt(req, {
      id,
      status,
      targetCode: result.rescuer?.rescuerCode,
      result: AUDIT_RESULTS.SUCCESS,
      statusCode: 200,
      reason: null,
      warning: result.warning || null
    });

    return res.json({
      success: true,
      message: result.message,
      warning: result.warning || '',
      data: result.rescuer
    });
  } catch (error) {
    await auditRescuerAccessAttempt(req, {
      id: id || req.params.id,
      status,
      result: AUDIT_RESULTS.FAILURE,
      statusCode: getErrorStatusCode(error),
      reason: error.message
    });

    return errorResponse(res, error, 'Unable to update rescuer access status.');
  }
};

exports.updateStatus = async (req, res) => {
  let id = null;
  const status = req.body && req.body.status ? String(req.body.status).trim().toLowerCase() : '';

  try {
    id = parseId(req.params.id);

    if (!id) {
      await auditRescuerOperationalStatusAttempt(req, {
        id: req.params.id,
        requestedStatus: status,
        result: AUDIT_RESULTS.FAILURE,
        statusCode: 400,
        reason: 'Invalid rescuer id.'
      });

      return res.status(400).json({
        success: false,
        message: 'Invalid rescuer id.'
      });
    }

    const result = await updateRescuerOperationalStatus(id, status);

    await auditRescuerOperationalStatusAttempt(req, {
      id,
      targetCode: result.rescuer?.rescuerCode,
      requestedStatus: status,
      currentStatus: result.rescuer?.status,
      result: AUDIT_RESULTS.SUCCESS,
      statusCode: 200
    });

    return res.json({
      success: true,
      message: result.message,
      data: result.rescuer
    });
  } catch (error) {
    await auditRescuerOperationalStatusAttempt(req, {
      id: id || req.params.id,
      requestedStatus: status,
      result: AUDIT_RESULTS.FAILURE,
      statusCode: getErrorStatusCode(error),
      reason: error.message
    });

    return errorResponse(res, error, 'Unable to update rescuer status.');
  }
};

exports.updatePassword = async (req, res) => {
  let id = null;

  try {
    id = parseId(req.params.id);

    if (!id) {
      await auditRescuerPasswordAttempt(req, {
        id: req.params.id,
        result: AUDIT_RESULTS.FAILURE,
        statusCode: 400,
        reason: 'Invalid rescuer id.'
      });

      return res.status(400).json({
        success: false,
        message: 'Invalid rescuer id.'
      });
    }

    const result = await resetRescuerPassword(id, req.body || {}, req.adminUser?.id || null);

    await auditRescuerPasswordAttempt(req, {
      id,
      targetCode: result.rescuer?.rescuerCode,
      result: AUDIT_RESULTS.SUCCESS,
      statusCode: 200,
      reason: null
    });

    return res.json({
      success: true,
      message: result.message,
      data: result.rescuer
    });
  } catch (error) {
    await auditRescuerPasswordAttempt(req, {
      id: id || req.params.id,
      result: AUDIT_RESULTS.FAILURE,
      statusCode: getErrorStatusCode(error),
      reason: error.message
    });

    return errorResponse(res, error, 'Unable to reset rescuer password.');
  }
};

exports.listRescueTeams = async (req, res) => {
  try {
    const teams = await getRescueTeamSummaries();

    return res.json({
      success: true,
      count: teams.length,
      data: teams
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to load rescue teams.');
  }
};
