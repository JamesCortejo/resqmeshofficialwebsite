const {
  getRescuerAssignments,
  getRescuerLiveRoute,
  getCivilianLiveRoute,
  getVisibleLiveRoutes,
  resolveRescuerAssignment,
  updateRescuerLocation,
  getVisibleMapSnapshot,
  getVisibleNodeDistress,
  getRescuerLocationSharingStatus,
  setRescuerLocationSharing,
  getSharedRescuerRouteForCivilian
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

function disableSensitiveCaching(res) {
  res.set('Cache-Control', 'private, no-store, max-age=0');
  res.set('Pragma', 'no-cache');
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
    disableSensitiveCaching(res);
    const route = await getRescuerLiveRoute(req.rescuer);
    return res.json(route);
  } catch (error) {
    return errorResponse(res, error, 'Unable to load live route.');
  }
};

exports.getCivilianLiveRoute = async (req, res) => {
  try {
    disableSensitiveCaching(res);
    const route = await getCivilianLiveRoute(req.civilian);
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
    disableSensitiveCaching(res);
    const snapshot = await getVisibleMapSnapshot(req.mobilePrincipal, req.mobileRole);
    return res.json(snapshot.nodes);
  } catch (error) {
    return errorResponse(res, error, 'Unable to load nodes.');
  }
};

exports.getMapSnapshot = async (req, res) => {
  try {
    disableSensitiveCaching(res);
    return res.json(await getVisibleMapSnapshot(req.mobilePrincipal, req.mobileRole));
  } catch (error) {
    return errorResponse(res, error, 'Unable to load map snapshot.');
  }
};

exports.getNodeDistress = async (req, res) => {
  try {
    disableSensitiveCaching(res);
    const distress = await getVisibleNodeDistress(
      req.params.nodeId,
      req.mobilePrincipal,
      req.mobileRole
    );
    return res.json(distress);
  } catch (error) {
    return errorResponse(res, error, 'Unable to load node distress.');
  }
};

exports.getPublicLiveRoute = async (req, res) => {
  try {
    disableSensitiveCaching(res);
    const principal = req.mobilePrincipal || req.civilian || req.rescuer;
    const role = req.mobileRole || (req.rescuer ? 'rescuer' : 'civilian');
    const routes = await getVisibleLiveRoutes(principal, role);
    return res.json(routes[0]);
  } catch (error) {
    return errorResponse(res, error, 'Unable to load public live route.');
  }
};

exports.getPublicLiveRoutes = async (req, res) => {
  try {
    disableSensitiveCaching(res);
    const principal = req.mobilePrincipal || req.civilian || req.rescuer;
    const role = req.mobileRole || (req.rescuer ? 'rescuer' : 'civilian');
    const routes = await getVisibleLiveRoutes(principal, role);
    return res.json(routes);
  } catch (error) {
    return errorResponse(res, error, 'Unable to load public live routes.');
  }
};

exports.getNodeDistressEta = async (req, res) => {
  try {
    disableSensitiveCaching(res);
    const distress = await getVisibleNodeDistress(req.params.nodeId, req.mobilePrincipal, req.mobileRole);
    if (!distress || distress.visibility === 'assigned_other') {
      const error = new Error('Active distress signal not found.');
      error.statusCode = 404;
      throw error;
    }
    const routes = await getVisibleLiveRoutes(req.mobilePrincipal, req.mobileRole);
    const route = routes.find((item) => Number(item?.assignment?.distress_id) === Number(distress.id));
    if (!route) {
      const error = new Error('No active assignment found.');
      error.statusCode = 404;
      throw error;
    }
    const etaMinutes = route.route?.eta_minutes ?? null;
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

    disableSensitiveCaching(res);
    const routes = await getVisibleLiveRoutes(req.mobilePrincipal, req.mobileRole);
    const route = routes.find((item) => Number(item?.distress?.id) === distressId
      || Number(item?.assignment?.distress_id) === distressId
      || Number(item?.assignment?.online_distress_id) === distressId);
    if (!route) {
      const error = new Error('Active distress signal not found.');
      error.statusCode = 404;
      throw error;
    }
    const etaMinutes = route.route?.eta_minutes ?? null;
    return res.json({ eta_minutes: etaMinutes });
  } catch (error) {
    return errorResponse(res, error, 'Unable to load distress ETA.');
  }
};

exports.getSharedRescuerRouteForCivilian = async (req, res) => {
  try {
    const data = await getSharedRescuerRouteForCivilian(req.civilian, req.body || {});
    return res.json({
      success: true,
      data
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to load directions to rescuer.');
  }
};

exports.getRescuerLocationSharingStatus = async (req, res) => {
  try {
    const data = await getRescuerLocationSharingStatus(req.rescuer);
    return res.json({
      success: true,
      data
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to load rescuer sharing status.');
  }
};

exports.updateRescuerLocationSharing = async (req, res) => {
  try {
    const enabled = Boolean(req.body?.enabled);
    const data = await setRescuerLocationSharing(req.rescuer, enabled);
    return res.json({
      success: true,
      message: enabled
        ? 'Live location sharing enabled.'
        : 'Live location sharing disabled.',
      data
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to update rescuer sharing status.');
  }
};
