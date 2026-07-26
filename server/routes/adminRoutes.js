const express = require('express');
const adminAuthController = require('../controllers/adminAuthController');
const adminAccountsController = require('../controllers/adminAccountsController');
const adminNotificationsController = require('../controllers/adminNotificationsController');
const adminDistressController = require('../controllers/adminDistressController');
const onlineChatAdminController = require('../controllers/onlineChatAdminController');
const overviewController = require('../controllers/overviewController');
const deviceManagerController = require('../controllers/deviceManagerController');
const rescuerController = require('../controllers/rescuerController');
const rescueTeamController = require('../controllers/rescueTeamController');
const {
  requireAdminCsrf,
  requireAdminSession
} = require('../middleware/adminSessionMiddleware');
const {
  departmentChatIconUpload,
  handleUploadErrors
} = require('../middleware/uploadMiddleware');

const router = express.Router();

router.post('/login', adminAuthController.login);
router.use(requireAdminSession);
router.get('/session', adminAuthController.getSession);
router.use(requireAdminCsrf);
router.post('/logout', adminAuthController.logout);
router.get('/notifications', adminNotificationsController.list);
router.get('/notifications/unread-count', adminNotificationsController.unreadCount);
router.patch('/notifications/read-all', adminNotificationsController.markAllRead);
router.patch('/notifications/:id/read', adminNotificationsController.markRead);
router.delete('/notifications/:id', adminNotificationsController.deleteOne);
router.delete('/notifications', adminNotificationsController.clearAll);
router.get('/overview', overviewController.getOverview);
router.get('/accounts/pending', adminAccountsController.listPending);
router.get('/accounts/active', adminAccountsController.listActive);
router.get('/accounts/:id', adminAccountsController.getDetails);
router.get('/accounts/:id/id/:side', adminAccountsController.getIdImage);
router.patch('/accounts/:id/access-status', adminAccountsController.updateAccessStatus);
router.patch('/accounts/:id/status', adminAccountsController.updateStatus);
router.get('/devices', deviceManagerController.listDevices);
router.get('/devices/map', deviceManagerController.listDevicesForMap);
router.get('/devices/messages', deviceManagerController.listMeshMessages);
router.get('/device-map/routes', deviceManagerController.listDeviceMapRoutes);
router.get('/devices/:id/messages', deviceManagerController.getDeviceMessages);
router.get('/devices/:id', deviceManagerController.getDeviceDetails);
router.get('/distress-signals', adminDistressController.listDistressSignals);
router.get('/distress-signals/:id', adminDistressController.getDistressSignalDetails);
router.post('/distress-signals/:id/deploy', adminDistressController.deployDistressSignal);
router.post('/deployments/:id/cancel', adminDistressController.cancelDeployment);
router.post('/deployments/:id/accomplish', adminDistressController.accomplishDeployment);
router.get('/online-chat/departments', onlineChatAdminController.listDepartments);
router.post('/online-chat/departments', departmentChatIconUpload, handleUploadErrors, onlineChatAdminController.createDepartment);
router.patch('/online-chat/departments/:id', departmentChatIconUpload, handleUploadErrors, onlineChatAdminController.updateDepartment);
router.post('/online-chat/departments/:id/archive', onlineChatAdminController.archiveDepartment);
router.get('/online-chat/conversations', onlineChatAdminController.listConversations);
router.get('/online-chat/global/messages', onlineChatAdminController.listGlobalMessages);
router.get('/online-chat/conversations/:id/messages', onlineChatAdminController.listMessages);
router.post('/online-chat/global/messages', onlineChatAdminController.sendGlobalMessage);
router.post('/online-chat/conversations/:id/messages', onlineChatAdminController.sendMessage);
router.post('/online-chat/global/read', onlineChatAdminController.markGlobalRead);
router.post('/online-chat/conversations/:id/read', onlineChatAdminController.markRead);
router.post('/rescuers', rescuerController.createRescuer);
router.get('/rescuers', rescuerController.listRescuers);
router.get('/rescuers/assignable', rescueTeamController.listAssignableRescuers);
router.get('/rescuers/:id', rescuerController.getRescuerDetails);
router.patch('/rescuers/:id/access-status', rescuerController.updateAccessStatus);
router.patch('/rescuers/:id/status', rescuerController.updateStatus);
router.patch('/rescuers/:id/password', rescuerController.updatePassword);
router.get('/rescue-teams', rescueTeamController.listRescueTeams);
router.post('/rescue-teams', rescueTeamController.createRescueTeam);
router.get('/rescue-teams/:id', rescueTeamController.getRescueTeamDetails);
router.patch('/rescue-teams/:id', rescueTeamController.updateRescueTeam);

module.exports = router;
