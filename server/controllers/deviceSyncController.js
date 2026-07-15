const {
  getUsersDelta,
  getRescuersDelta,
  getRescueTeamsDelta,
  getDeploymentsDelta,
  getDeploymentRouteSnapshotsDelta,
  syncNodesBatch,
  syncNodeHealthBatch,
  syncDistressSignalsBatch,
  syncMessagesBatch,
  syncAuditLogsBatch,
  getMeshCommands,
  acknowledgeMeshCommand
} = require('../services/deviceSyncService');

function requestIp(req) {
  const forwardedFor = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwardedFor || req.socket?.remoteAddress || '';
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

exports.listUsers = async (req, res) => {
  try {
    const result = await getUsersDelta(req.query || {});
    return res.json({
      success: true,
      serverTime: new Date().toISOString(),
      ...result
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to load synced users.');
  }
};

exports.listRescuers = async (req, res) => {
  try {
    const result = await getRescuersDelta(req.query || {});
    return res.json({
      success: true,
      serverTime: new Date().toISOString(),
      ...result
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to load synced rescuers.');
  }
};

exports.listRescueTeams = async (req, res) => {
  try {
    const result = await getRescueTeamsDelta(req.query || {});
    return res.json({
      success: true,
      serverTime: new Date().toISOString(),
      ...result
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to load synced rescue teams.');
  }
};

exports.listDeployments = async (req, res) => {
  try {
    const result = await getDeploymentsDelta(req.query || {});
    return res.json({
      success: true,
      serverTime: new Date().toISOString(),
      ...result
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to load synced deployments.');
  }
};

exports.listDeploymentRoutes = async (req, res) => {
  try {
    const result = await getDeploymentRouteSnapshotsDelta(req.query || {});
    return res.json({
      success: true,
      serverTime: new Date().toISOString(),
      ...result
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to load synced deployment routes.');
  }
};

exports.syncNodesBatch = async (req, res) => {
  try {
    const result = await syncNodesBatch(req.body || {}, req.syncDevice, requestIp(req));
    return res.json({ success: true, data: result });
  } catch (error) {
    return errorResponse(res, error, 'Unable to sync mesh nodes.');
  }
};

exports.syncNodeHealthBatch = async (req, res) => {
  try {
    const result = await syncNodeHealthBatch(req.body || {}, req.syncDevice, requestIp(req));
    return res.json({ success: true, data: result });
  } catch (error) {
    return errorResponse(res, error, 'Unable to sync node health logs.');
  }
};

exports.syncDistressSignalsBatch = async (req, res) => {
  try {
    const result = await syncDistressSignalsBatch(req.body || {}, req.syncDevice, requestIp(req));
    return res.json({ success: true, data: result });
  } catch (error) {
    return errorResponse(res, error, 'Unable to sync distress signals.');
  }
};

exports.syncMessagesBatch = async (req, res) => {
  try {
    const result = await syncMessagesBatch(req.body || {}, req.syncDevice, requestIp(req));
    return res.json({ success: true, data: result });
  } catch (error) {
    return errorResponse(res, error, 'Unable to sync mesh messages.');
  }
};

exports.syncAuditLogsBatch = async (req, res) => {
  try {
    const result = await syncAuditLogsBatch(req.body || {}, req.syncDevice, requestIp(req));
    return res.json({ success: true, data: result });
  } catch (error) {
    return errorResponse(res, error, 'Unable to sync audit logs.');
  }
};

exports.listMeshCommands = async (req, res) => {
  try {
    const commands = await getMeshCommands(req.syncDevice);
    return res.json({
      success: true,
      count: commands.length,
      data: commands
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to load mesh commands.');
  }
};

exports.acknowledgeMeshCommand = async (req, res) => {
  try {
    await acknowledgeMeshCommand(req.params.id, req.syncDevice, requestIp(req));
    return res.json({
      success: true,
      message: 'Mesh command acknowledged.'
    });
  } catch (error) {
    return errorResponse(res, error, 'Unable to acknowledge mesh command.');
  }
};
