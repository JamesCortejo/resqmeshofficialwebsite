const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const civilianPasswordResetController = require('../controllers/civilianPasswordResetController');
const { registrationUpload, handleUploadErrors } = require('../middleware/uploadMiddleware');

router.post('/register', registrationUpload, handleUploadErrors, userController.registerUser);
router.post('/password-reset/request', civilianPasswordResetController.requestReset);
router.post('/password-reset/verify', civilianPasswordResetController.verifyCode);
router.post('/password-reset/complete', civilianPasswordResetController.completeReset);
router.get('/', userController.getRegistrants);

module.exports = router;
