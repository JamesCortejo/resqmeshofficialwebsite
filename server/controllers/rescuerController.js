const {
  createRescuerProfile,
  getRescuerSummaries,
  getRescuerDetails,
  setRescuerAccessStatus,
  updateRescuerOperationalStatus,
  resetRescuerPassword,
  getRescueTeamSummaries
} = require('../services/rescuerService');

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

exports.createRescuer = async (req, res) => {
  try {
    const rescuer = await createRescuerProfile(req.body || {});

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
  try {
    const id = parseId(req.params.id);

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Invalid rescuer id.'
      });
    }

    const status = req.body && req.body.status ? String(req.body.status).trim().toLowerCase() : '';
    const result = await setRescuerAccessStatus(id, status);

    return res.json({
      success: true,
      message: result.message,
      data: result.rescuer
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to update rescuer access status.');
  }
};

exports.updateStatus = async (req, res) => {
  try {
    const id = parseId(req.params.id);

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Invalid rescuer id.'
      });
    }

    const status = req.body && req.body.status ? String(req.body.status).trim().toLowerCase() : '';
    const result = await updateRescuerOperationalStatus(id, status);

    return res.json({
      success: true,
      message: result.message,
      data: result.rescuer
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to update rescuer status.');
  }
};

exports.updatePassword = async (req, res) => {
  try {
    const id = parseId(req.params.id);

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Invalid rescuer id.'
      });
    }

    const result = await resetRescuerPassword(id, req.body || {});

    return res.json({
      success: true,
      message: result.message,
      data: result.rescuer
    });
  } catch (error) {
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
