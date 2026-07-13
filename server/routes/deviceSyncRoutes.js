const express = require('express');
const deviceAuthController = require('../controllers/deviceAuthController');
const deviceSyncController = require('../controllers/deviceSyncController');
const {
  createRateLimiter,
  requireDeviceSyncSession
} = require('../middleware/deviceSyncMiddleware');

const router = express.Router();
const authRateLimit = createRateLimiter(20, 60 * 1000);
const syncRateLimit = createRateLimiter(180, 60 * 1000);

router.post('/device-auth/token', authRateLimit, deviceAuthController.issueToken);

router.use('/device-sync', syncRateLimit, requireDeviceSyncSession);
router.get('/device-sync/users', deviceSyncController.listUsers);
router.get('/device-sync/rescuers', deviceSyncController.listRescuers);
router.get('/device-sync/rescue-teams', deviceSyncController.listRescueTeams);
router.get('/device-sync/mesh-commands', deviceSyncController.listMeshCommands);
router.post('/device-sync/nodes/batch', deviceSyncController.syncNodesBatch);
router.post('/device-sync/node-health/batch', deviceSyncController.syncNodeHealthBatch);
router.post('/device-sync/distress-signals/batch', deviceSyncController.syncDistressSignalsBatch);
router.post('/device-sync/messages/batch', deviceSyncController.syncMessagesBatch);
router.post('/device-sync/audit-logs/batch', deviceSyncController.syncAuditLogsBatch);
router.post('/device-sync/mesh-commands/:id/ack', deviceSyncController.acknowledgeMeshCommand);

module.exports = router;
