const express = require('express');
const adminAuthController = require('../controllers/adminAuthController');
const adminAccountsController = require('../controllers/adminAccountsController');

const router = express.Router();

router.post('/login', adminAuthController.login);
router.get('/accounts/pending', adminAccountsController.listPending);
router.get('/accounts/:id', adminAccountsController.getDetails);
router.get('/accounts/:id/id/:side', adminAccountsController.getIdImage);
router.patch('/accounts/:id/status', adminAccountsController.updateStatus);

module.exports = router;
