const express = require('express');
const contactController = require('../controllers/contactController');
const { rateLimiters } = require('../middleware/rateLimitMiddleware');

const router = express.Router();

router.post('/', rateLimiters.contact, contactController.submitContactMessage);

module.exports = router;