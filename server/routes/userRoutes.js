const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const civilianPasswordResetController = require('../controllers/civilianPasswordResetController');
const { rateLimiters } = require('../middleware/rateLimitMiddleware');
const { registrationUpload, handleUploadErrors } = require('../middleware/uploadMiddleware');

router.post('/register', rateLimiters.registration, registrationUpload, handleUploadErrors, userController.registerUser);
router.post('/password-reset/request', rateLimiters.passwordResetRequest, civilianPasswordResetController.requestReset);
router.post('/password-reset/verify', rateLimiters.passwordResetConfirm, civilianPasswordResetController.verifyCode);
router.post('/password-reset/complete', rateLimiters.passwordResetConfirm, civilianPasswordResetController.completeReset);

module.exports = router;