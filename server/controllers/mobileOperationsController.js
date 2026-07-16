const {
  getRescuerAssignments,
  getRescuerLiveRoute,
  resolveRescuerAssignment,
  updateRescuerLocation,
  getPublicLiveRoute,
  getPublicLiveRoutes,
  getEtaByNodeId,
  getEtaByDistressId,
  getPublicNodes,
  getNodeDistress
} = require('../services/mobileOperationsService');

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

exports.listRescuerAssignments = async (req, res) => {
  try {
    const assignments = await getRescuerAssignments(req.rescuer);
    return res.json(assignments);
  } catch (error) {
    return errorResponse(res, error, 'Unable to load rescuer assignments.');
  }
};

exports.getRescuerLiveRoute = async (req, res) => {
  try {
    const route = await getRescuerLiveRoute(req.rescuer);
    return res.json(route);
  } catch (error) {
    return errorResponse(res, error, 'Unable to load live route.');
  }
};

exports.resolveAssignment = async (req, res) => {
  try {
    const assignmentId = parseId(req.params.id);

    if (!assignmentId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid assignment id.'
      });
    }

    const deployment = await resolveRescuerAssignment(assignmentId, req.rescuer);
    return res.json({
      success: true,
      message: `Deployment ${deployment.deploymentCode} marked as accomplished.`,
      data: deployment
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to resolve assignment.');
  }
};

exports.updateLocation = async (req, res) => {
  try {
    const result = await updateRescuerLocation(req.rescuer, req.body || {});
    return res.json({
      success: true,
      data: result
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to update rescuer location.');
  }
};

exports.listNodes = async (req, res) => {
  try {
    const nodes = await getPublicNodes();
    return res.json(nodes);
  } catch (error) {
    return errorResponse(res, error, 'Unable to load nodes.');
  }
};

exports.getNodeDistress = async (req, res) => {
  try {
    const distress = await getNodeDistress(req.params.nodeId);
    return res.json(distress);
  } catch (error) {
    return errorResponse(res, error, 'Unable to load node distress.');
  }
};

exports.getPublicLiveRoute = async (req, res) => {
  try {
    const distressId = parseId(req.query?.distressId);
    const route = await getPublicLiveRoute({
      nodeId: req.params.nodeId || null,
      distressId
    });

    return res.json(route);
  } catch (error) {
    return errorResponse(res, error, 'Unable to load public live route.');
  }
};

exports.getPublicLiveRoutes = async (_req, res) => {
  try {
    const routes = await getPublicLiveRoutes();
    return res.json(routes);
  } catch (error) {
    return errorResponse(res, error, 'Unable to load public live routes.');
  }
};

exports.getNodeDistressEta = async (req, res) => {
  try {
    const etaMinutes = await getEtaByNodeId(req.params.nodeId);
    return res.json({ eta_minutes: etaMinutes });
  } catch (error) {
    return errorResponse(res, error, 'Unable to load distress ETA.');
  }
};

exports.getDistressEta = async (req, res) => {
  try {
    const distressId = parseId(req.params.id);

    if (!distressId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid distress id.'
      });
    }

    const etaMinutes = await getEtaByDistressId(distressId);
    return res.json({ eta_minutes: etaMinutes });
  } catch (error) {
    return errorResponse(res, error, 'Unable to load distress ETA.');
  }
};
