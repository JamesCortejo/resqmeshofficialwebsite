const {
  createRescueTeamProfile,
  getRescueTeamSummaries,
  getRescueTeamDetails,
  updateRescueTeamProfile,
  getAssignableRescuerSummaries
} = require('../services/rescueTeamService');

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

exports.createRescueTeam = async (req, res) => {
  try {
    const team = await createRescueTeamProfile(req.body || {});

    return res.status(201).json({
      success: true,
      message: `Rescue team ${team.teamCode} created successfully.`,
      data: team
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to create rescue team.');
  }
};

exports.getRescueTeamDetails = async (req, res) => {
  try {
    const id = parseId(req.params.id);

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Invalid rescue team id.'
      });
    }

    const team = await getRescueTeamDetails(id);

    if (!team) {
      return res.status(404).json({
        success: false,
        message: 'Rescue team not found.'
      });
    }

    return res.json({
      success: true,
      data: team
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to load rescue team details.');
  }
};

exports.updateRescueTeam = async (req, res) => {
  try {
    const id = parseId(req.params.id);

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Invalid rescue team id.'
      });
    }

    const result = await updateRescueTeamProfile(id, req.body || {});

    return res.json({
      success: true,
      message: result.message,
      data: result.team
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to update rescue team.');
  }
};

exports.listAssignableRescuers = async (req, res) => {
  try {
    const rescuers = await getAssignableRescuerSummaries();

    return res.json({
      success: true,
      count: rescuers.length,
      data: rescuers
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to load assignable rescuers.');
  }
};
