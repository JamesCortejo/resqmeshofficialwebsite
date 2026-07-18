const express = require('express');
const rescuerMobileAuthController = require('../controllers/rescuerMobileAuthController');
const mobileOperationsController = require('../controllers/mobileOperationsController');
const { requireRescuerSession } = require('../middleware/rescuerSessionMiddleware');

const router = express.Router();

router.post('/auth/rescuer/login', rescuerMobileAuthController.login);
router.post('/auth/logout', requireRescuerSession, rescuerMobileAuthController.logout);

router.get('/api/nodes', mobileOperationsController.listNodes);
router.get('/api/map/snapshot', mobileOperationsController.getMapSnapshot);
router.get('/api/node/:nodeId/distress', mobileOperationsController.getNodeDistress);
router.get('/api/node/:nodeId/distress/eta', mobileOperationsController.getNodeDistressEta);
router.get('/api/distress/:id/eta', mobileOperationsController.getDistressEta);
router.get('/api/public/distress/:id/eta', mobileOperationsController.getDistressEta);
router.get('/api/route/live/public', mobileOperationsController.getPublicLiveRoute);
router.get('/api/public/route/live', mobileOperationsController.getPublicLiveRoute);
router.get('/api/routes/live/public', mobileOperationsController.getPublicLiveRoutes);
router.get('/api/public/routes/live', mobileOperationsController.getPublicLiveRoutes);
router.get('/api/node/:nodeId/route/live', mobileOperationsController.getPublicLiveRoute);

router.get('/api/rescuer/assignments', requireRescuerSession, mobileOperationsController.listRescuerAssignments);
router.get('/api/rescuer/route/live', requireRescuerSession, mobileOperationsController.getRescuerLiveRoute);
router.post('/api/assignment/:id/resolve', requireRescuerSession, mobileOperationsController.resolveAssignment);
router.post('/api/location/update', requireRescuerSession, mobileOperationsController.updateLocation);

module.exports = router;
