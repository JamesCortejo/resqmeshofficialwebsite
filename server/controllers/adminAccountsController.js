const {
  getPendingAccountSummaries,
  getActiveAccountSummaries,
  getReviewableAccountDetails,
  getReviewableAccountIdImage,
  updateAccountReviewStatus,
  updateAccountAccessReviewStatus
} = require('../services/adminAccountsService');
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

function getAccountAccessAuditAction(status) {
  const normalized = String(status || '').trim().toLowerCase();

  if (normalized === 'suspended') {
    return ADMIN_ACTIONS.CIVILIAN_ACCOUNT_SUSPENDED;
  }

  if (normalized === 'approved') {
    return ADMIN_ACTIONS.CIVILIAN_ACCOUNT_ACTIVATED;
  }

  return null;
}

async function auditAccountAccessAttempt(req, details) {
  const action = getAccountAccessAuditAction(details.status);

  if (!action) {
    return;
  }

  await logAdminAction(req, {
    action,
    targetType: 'civilian_account',
    targetId: details.id,
    targetCode: details.targetCode,
    result: details.result,
    statusCode: details.statusCode,
    reason: details.reason,
    metadata: {
      requestedStatus: details.status || null,
      requestedReason: details.requestedReason || null
    }
  });
}
exports.listPending = async (req, res) => {
  try {
    const accounts = await getPendingAccountSummaries();

    return res.json({
      success: true,
      count: accounts.length,
      data: accounts
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to load pending accounts.');
  }
};

exports.listActive = async (req, res) => {
  try {
    const accounts = await getActiveAccountSummaries();

    return res.json({
      success: true,
      count: accounts.length,
      data: accounts
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to load active accounts.');
  }
};

exports.getDetails = async (req, res) => {
  try {
    const id = parseId(req.params.id);

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Invalid account id.'
      });
    }

    const account = await getReviewableAccountDetails(id);

    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Reviewable account not found.'
      });
    }

    return res.json({
      success: true,
      data: account
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to load account details.');
  }
};

exports.getIdImage = async (req, res) => {
  try {
    const id = parseId(req.params.id);

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Invalid account id.'
      });
    }

    const image = await getReviewableAccountIdImage(id, req.params.side);

    if (!image) {
      return res.status(404).json({
        success: false,
        message: 'Reviewable account image not found.'
      });
    }

    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'no-store');
    return res.send(image);
  } catch (error) {
    return errorResponse(res, error, 'Unable to load ID image.');
  }
};

exports.updateStatus = async (req, res) => {
  try {
    const id = parseId(req.params.id);

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Invalid account id.'
      });
    }

    const status = req.body && req.body.status ? String(req.body.status).trim().toLowerCase() : '';
    const reason = req.body && req.body.reason ? String(req.body.reason) : '';
    const account = await updateAccountReviewStatus(id, status, reason, req.adminUser?.id || null);

    return res.json({
      success: true,
      message: `Account ${account.userCode} has been ${account.status}.`,
      warning: account.emailWarning || '',
      data: account
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to update account status.');
  }
};

exports.updateAccessStatus = async (req, res) => {
  let id = null;
  let status = '';
  let reason = '';

  try {
    id = parseId(req.params.id);
    status = req.body && req.body.status ? String(req.body.status).trim().toLowerCase() : '';
    reason = req.body && req.body.reason ? String(req.body.reason) : '';

    if (!id) {
      await auditAccountAccessAttempt(req, {
        id: req.params.id,
        status,
        result: AUDIT_RESULTS.FAILURE,
        statusCode: 400,
        reason: 'Invalid account id.',
        requestedReason: reason
      });

      return res.status(400).json({
        success: false,
        message: 'Invalid account id.'
      });
    }

    const adminPassword = req.body && req.body.adminPassword ? String(req.body.adminPassword) : '';

    if (!req.adminUser?.id) {
      await auditAccountAccessAttempt(req, {
        id,
        status,
        result: AUDIT_RESULTS.FAILURE,
        statusCode: 401,
        reason: 'Admin authentication required.',
        requestedReason: reason
      });

      return res.status(401).json({
        success: false,
        message: 'Admin authentication required.'
      });
    }

    if (!adminPassword.trim()) {
      await auditAccountAccessAttempt(req, {
        id,
        status,
        result: AUDIT_RESULTS.FAILURE,
        statusCode: 400,
        reason: 'Confirm your admin password before changing account access.',
        requestedReason: reason
      });

      return res.status(400).json({
        success: false,
        message: 'Confirm your admin password before changing account access.'
      });
    }

    const account = await updateAccountAccessReviewStatus(id, status, reason, req.adminUser?.id || null, adminPassword);
    const action = account.status === 'suspended' ? 'suspended' : 'activated';

    await auditAccountAccessAttempt(req, {
      id,
      status,
      targetCode: account.userCode,
      result: AUDIT_RESULTS.SUCCESS,
      statusCode: 200,
      reason: reason || null,
      requestedReason: reason
    });

    return res.json({
      success: true,
      message: `Account ${account.userCode} has been ${action}.`,
      warning: account.emailWarning || '',
      data: account
    });
  } catch (error) {
    await auditAccountAccessAttempt(req, {
      id: id || req.params.id,
      status,
      result: AUDIT_RESULTS.FAILURE,
      statusCode: getErrorStatusCode(error),
      reason: error.message,
      requestedReason: reason
    });

    return errorResponse(res, error, 'Unable to update account access status.');
  }
};
