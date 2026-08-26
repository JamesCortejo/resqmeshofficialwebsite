const express = require('express');
const civilianMobileAuthController = require('../controllers/civilianMobileAuthController');
const civilianDistressController = require('../controllers/civilianDistressController');
const onlineChatCivilianController = require('../controllers/onlineChatCivilianController');
const onlineChatRescuerController = require('../controllers/onlineChatRescuerController');
const mobilePushController = require('../controllers/mobilePushController');
const rescuerMobileAuthController = require('../controllers/rescuerMobileAuthController');
const mobileOperationsController = require('../controllers/mobileOperationsController');
const { rateLimiters } = require('../middleware/rateLimitMiddleware');
const { requireCivilianSession, requireMobileSession, requireRescuerSession } = require('../middleware/rescuerSessionMiddleware');

const router = express.Router();

router.post('/auth/rescuer/login', rateLimiters.mobileLogin, rescuerMobileAuthController.login);
router.post('/auth/civilian/login', rateLimiters.mobileLogin, civilianMobileAuthController.login);
router.post('/auth/logout', requireMobileSession, rescuerMobileAuthController.logout);
router.post('/api/mobile/push/register', requireMobileSession, mobilePushController.register);
router.post('/api/mobile/push/unregister', requireMobileSession, mobilePushController.unregister);

router.get('/api/nodes', rateLimiters.publicMap, mobileOperationsController.listNodes);
router.get('/api/map/snapshot', rateLimiters.publicMap, mobileOperationsController.getMapSnapshot);
router.get('/api/node/:nodeId/distress', rateLimiters.publicMap, mobileOperationsController.getNodeDistress);
router.get('/api/node/:nodeId/distress/eta', rateLimiters.publicEta, mobileOperationsController.getNodeDistressEta);
router.get('/api/distress/:id/eta', rateLimiters.publicEta, mobileOperationsController.getDistressEta);
router.get('/api/public/distress/:id/eta', rateLimiters.publicEta, mobileOperationsController.getDistressEta);
router.get('/api/route/live/public', rateLimiters.publicMap, mobileOperationsController.getPublicLiveRoute);
router.get('/api/public/route/live', rateLimiters.publicMap, mobileOperationsController.getPublicLiveRoute);
router.get('/api/routes/live/public', rateLimiters.publicMap, mobileOperationsController.getPublicLiveRoutes);
router.get('/api/public/routes/live', rateLimiters.publicMap, mobileOperationsController.getPublicLiveRoutes);
router.get('/api/node/:nodeId/route/live', rateLimiters.publicMap, mobileOperationsController.getPublicLiveRoute);

router.post('/api/civilian/distress-signals', requireCivilianSession, rateLimiters.authenticatedMobileWrite, civilianDistressController.create);
router.get('/api/civilian/distress-signals/active', requireCivilianSession, civilianDistressController.getActive);
router.post('/api/civilian/distress-signals/:id/cancel', requireCivilianSession, rateLimiters.authenticatedMobileWrite, civilianDistressController.cancel);
router.post('/api/civilian/navigation/shared-rescuer-route', requireCivilianSession, rateLimiters.authenticatedMobileWrite, mobileOperationsController.getSharedRescuerRouteForCivilian);
router.get('/api/civilian/online-chat/departments', requireCivilianSession, onlineChatCivilianController.listDepartments);
router.post('/api/civilian/online-chat/departments/:departmentId/conversation', requireCivilianSession, onlineChatCivilianController.openConversation);
router.get('/api/civilian/online-chat/global/messages', requireCivilianSession, onlineChatCivilianController.listGlobalMessages);
router.get('/api/civilian/online-chat/messages/:id/voice', requireCivilianSession, onlineChatCivilianController.getVoiceClip);
router.get('/api/civilian/online-chat/conversations/:id/messages', requireCivilianSession, onlineChatCivilianController.listMessages);
router.post('/api/civilian/online-chat/conversations/:id/messages', requireCivilianSession, rateLimiters.onlineChatSend, onlineChatCivilianController.sendMessage);
router.post('/api/civilian/online-chat/conversations/:id/voice', requireCivilianSession, rateLimiters.onlineChatSend, onlineChatCivilianController.sendVoiceMessage);
router.post('/api/civilian/online-chat/global/read', requireCivilianSession, onlineChatCivilianController.markGlobalRead);
router.post('/api/civilian/online-chat/conversations/:id/read', requireCivilianSession, onlineChatCivilianController.markRead);
router.get('/api/rescuer/online-chat/departments', requireRescuerSession, onlineChatRescuerController.listDepartments);
router.get('/api/rescuer/online-chat/conversations', requireRescuerSession, onlineChatRescuerController.listConversations);
router.get('/api/rescuer/online-chat/global/messages', requireRescuerSession, onlineChatRescuerController.listGlobalMessages);
router.get('/api/rescuer/online-chat/messages/:id/voice', requireRescuerSession, onlineChatRescuerController.getVoiceClip);
router.get('/api/rescuer/online-chat/conversations/:id/messages', requireRescuerSession, onlineChatRescuerController.listMessages);
router.post('/api/rescuer/online-chat/conversations/:id/messages', requireRescuerSession, rateLimiters.onlineChatSend, onlineChatRescuerController.sendMessage);
router.post('/api/rescuer/online-chat/conversations/:id/voice', requireRescuerSession, rateLimiters.onlineChatSend, onlineChatRescuerController.sendVoiceMessage);
router.post('/api/rescuer/online-chat/global/read', requireRescuerSession, onlineChatRescuerController.markGlobalRead);
router.post('/api/rescuer/online-chat/conversations/:id/read', requireRescuerSession, onlineChatRescuerController.markRead);

router.get('/api/rescuer/assignments', requireRescuerSession, mobileOperationsController.listRescuerAssignments);
router.get('/api/rescuer/route/live', requireRescuerSession, mobileOperationsController.getRescuerLiveRoute);
router.get('/api/rescuer/location-sharing', requireRescuerSession, mobileOperationsController.getRescuerLocationSharingStatus);
router.post('/api/rescuer/location-sharing', requireRescuerSession, rateLimiters.authenticatedMobileWrite, mobileOperationsController.updateRescuerLocationSharing);
router.post('/api/assignment/:id/resolve', requireRescuerSession, rateLimiters.authenticatedMobileWrite, mobileOperationsController.resolveAssignment);
router.post('/api/location/update', requireRescuerSession, rateLimiters.locationUpdate, mobileOperationsController.updateLocation);

module.exports = router;
