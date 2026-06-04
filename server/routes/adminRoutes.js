const express = require('express');
const adminAuthController = require('../controllers/adminAuthController');

const router = express.Router();

router.post('/login', adminAuthController.login);

module.exports = router;
