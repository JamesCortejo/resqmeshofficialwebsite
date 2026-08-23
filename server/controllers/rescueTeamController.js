const {
  createRescueTeamProfile,
  getRescueTeamSummaries,
  getRescueTeamDetails,
  updateRescueTeamProfile,
  getAssignableRescuerSummaries
} = require('../services/rescueTeamService');
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

function countRequestedRescuers(body) {
  if (Array.isArray(body?.rescuerIds)) {
    return body.rescuerIds.length;
  }

  if (Array.isArray(body?.rescuers)) {
    return body.rescuers.length;
  }

  return null;
}

async function auditRescueTeamAction(req, details) {
  await logAdminAction(req, {
    action: details.action,
    targetType: 'rescue_team',
    targetId: details.id,
    targetCode: details.targetCode,
    result: details.result,
    statusCode: details.statusCode,
    reason: details.reason,
    metadata: {
      name: details.team?.name || req.body?.name || null,
      requestedStatus: req.body?.status || null,
      currentStatus: details.team?.status || null,
      agency: details.team?.agency || req.body?.agency || null,
      rescuerCount: Array.isArray(details.team?.members) ? details.team.members.length : countRequestedRescuers(req.body || {}),
      rosterChanged: details.rosterChanged ?? null
    }
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

    await auditRescueTeamAction(req, {
      action: ADMIN_ACTIONS.RESCUE_TEAM_CREATED,
      id: team.id,
      targetCode: team.teamCode,
      team,
      result: AUDIT_RESULTS.SUCCESS,
      statusCode: 201,
      rosterChanged: Array.isArray(team.members) && team.members.length > 0
    });

    return res.status(201).json({
      success: true,
      message: `Rescue team ${team.teamCode} created successfully.`,
      data: team
    });
  } catch (error) {
    await auditRescueTeamAction(req, {
      action: ADMIN_ACTIONS.RESCUE_TEAM_CREATED,
      result: AUDIT_RESULTS.FAILURE,
      statusCode: getErrorStatusCode(error),
      reason: error.message
    });

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
  let id = null;

  try {
    id = parseId(req.params.id);

    if (!id) {
      await auditRescueTeamAction(req, {
        action: ADMIN_ACTIONS.RESCUE_TEAM_UPDATED,
        id: req.params.id,
        result: AUDIT_RESULTS.FAILURE,
        statusCode: 400,
        reason: 'Invalid rescue team id.'
      });

      return res.status(400).json({
        success: false,
        message: 'Invalid rescue team id.'
      });
    }

    const result = await updateRescueTeamProfile(id, req.body || {});

    await auditRescueTeamAction(req, {
      action: ADMIN_ACTIONS.RESCUE_TEAM_UPDATED,
      id,
      targetCode: result.team?.teamCode,
      team: result.team,
      result: AUDIT_RESULTS.SUCCESS,
      statusCode: 200,
      rosterChanged: result.rosterChanged
    });

    return res.json({
      success: true,
      message: result.message,
      data: result.team
    });
  } catch (error) {
    await auditRescueTeamAction(req, {
      action: ADMIN_ACTIONS.RESCUE_TEAM_UPDATED,
      id: id || req.params.id,
      result: AUDIT_RESULTS.FAILURE,
      statusCode: getErrorStatusCode(error),
      reason: error.message
    });

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
