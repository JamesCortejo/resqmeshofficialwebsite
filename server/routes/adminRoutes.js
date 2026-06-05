const express = require('express');
const adminAuthController = require('../controllers/adminAuthController');
const adminAccountsController = require('../controllers/adminAccountsController');
const adminNotificationsController = require('../controllers/adminNotificationsController');

const router = express.Router();

router.post('/login', adminAuthController.login);
router.get('/notifications', adminNotificationsController.list);
router.get('/notifications/unread-count', adminNotificationsController.unreadCount);
router.patch('/notifications/read-all', adminNotificationsController.markAllRead);
router.patch('/notifications/:id/read', adminNotificationsController.markRead);
router.delete('/notifications/:id', adminNotificationsController.deleteOne);
router.delete('/notifications', adminNotificationsController.clearAll);
router.get('/accounts/pending', adminAccountsController.listPending);
router.get('/accounts/active', adminAccountsController.listActive);
router.get('/accounts/:id', adminAccountsController.getDetails);
router.get('/accounts/:id/id/:side', adminAccountsController.getIdImage);
router.patch('/accounts/:id/access-status', adminAccountsController.updateAccessStatus);
router.patch('/accounts/:id/status', adminAccountsController.updateStatus);

module.exports = router;
