const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { registrationUpload, handleUploadErrors } = require('../middleware/uploadMiddleware');

router.post('/register', registrationUpload, handleUploadErrors, userController.registerUser);
router.get('/', userController.getRegistrants);

module.exports = router;
