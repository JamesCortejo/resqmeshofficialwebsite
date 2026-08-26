const express = require('express');
const downloadController = require('../controllers/downloadController');
const { rateLimiters } = require('../middleware/rateLimitMiddleware');

const router = express.Router();

router.get('/app-info', downloadController.getAppInfo);
router.post('/request', rateLimiters.downloadRequest, downloadController.requestDownload);

module.exports = router;