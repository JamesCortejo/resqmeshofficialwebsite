const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

// Mock Multer upload structure placeholder (since ID upload files will need destination directory)
// router.post('/register', upload.fields([{ name: 'idImage', maxCount: 1 }, { name: 'selfieImage', maxCount: 1 }]), userController.registerUser);

// Static Endpoint
router.post('/register', userController.registerUser);
router.get('/', userController.getRegistrants);

module.exports = router;
