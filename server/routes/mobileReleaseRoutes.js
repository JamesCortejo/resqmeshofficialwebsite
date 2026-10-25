const express = require('express');
const mobileReleaseController = require('../controllers/mobileReleaseController');
const { rateLimiters } = require('../middleware/rateLimitMiddleware');

const router = express.Router();

router.get('/latest', rateLimiters.mobileReleaseMetadata, mobileReleaseController.getLatest);
router.get('/latest/apk', rateLimiters.mobileReleaseDownload, mobileReleaseController.downloadLatest);
router.head('/latest/apk', rateLimiters.mobileReleaseDownload, mobileReleaseController.downloadLatest);

module.exports = router;
