const express = require('express');
const deviceAuthController = require('../controllers/deviceAuthController');
const deviceSyncController = require('../controllers/deviceSyncController');
const { requireDeviceSyncSession } = require('../middleware/deviceSyncMiddleware');
const { rateLimiters } = require('../middleware/rateLimitMiddleware');

const router = express.Router();

router.post('/device-auth/token', rateLimiters.deviceAuth, deviceAuthController.issueToken);

router.use('/device-sync', rateLimiters.deviceSync, requireDeviceSyncSession, rateLimiters.deviceSyncAuthenticated);
router.get('/device-sync/users', deviceSyncController.listUsers);
router.get('/device-sync/rescuers', deviceSyncController.listRescuers);
router.get('/device-sync/rescue-teams', deviceSyncController.listRescueTeams);
router.get('/device-sync/deployments', deviceSyncController.listDeployments);
router.get('/device-sync/deployment-routes', deviceSyncController.listDeploymentRoutes);
router.get('/device-sync/mesh-commands', deviceSyncController.listMeshCommands);
router.post('/device-sync/nodes/batch', deviceSyncController.syncNodesBatch);
router.post('/device-sync/node-health/batch', deviceSyncController.syncNodeHealthBatch);
router.post('/device-sync/node-neighbors/batch', deviceSyncController.syncNodeNeighborsBatch);
router.post('/device-sync/distress-signals/batch', deviceSyncController.syncDistressSignalsBatch);
router.post('/device-sync/messages/batch', deviceSyncController.syncMessagesBatch);
router.post('/device-sync/audit-logs/batch', deviceSyncController.syncAuditLogsBatch);
router.post('/device-sync/mesh-commands/:id/ack', deviceSyncController.acknowledgeMeshCommand);

module.exports = router;