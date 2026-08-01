const express = require('express');
const downloadController = require('../controllers/downloadController');

const router = express.Router();

router.get('/app-info', downloadController.getAppInfo);
router.post('/request', downloadController.requestDownload);

module.exports = router;
