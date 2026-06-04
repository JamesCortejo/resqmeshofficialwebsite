const {
  getPendingAccountSummaries,
  getPendingAccountDetails,
  getPendingAccountIdImage,
  updateAccountReviewStatus
} = require('../services/adminAccountsService');

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

exports.getDetails = async (req, res) => {
  try {
    const id = parseId(req.params.id);

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Invalid account id.'
      });
    }

    const account = await getPendingAccountDetails(id);

    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Pending account not found.'
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

    const image = await getPendingAccountIdImage(id, req.params.side);

    if (!image) {
      return res.status(404).json({
        success: false,
        message: 'Pending account image not found.'
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
    const account = await updateAccountReviewStatus(id, status, reason);

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
