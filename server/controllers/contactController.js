const { submitContactMessage } = require('../services/contactService');

exports.submitContactMessage = async (req, res) => {
  try {
    await submitContactMessage(req.body || {}, {
      ipAddress: req.ip,
      hostname: req.hostname
    });

    return res.json({
      success: true,
      message: 'Message sent successfully. The ResQMesh team will review your inquiry.'
    });
  } catch (error) {
    if (error.statusCode && error.statusCode < 500) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    console.error('Contact form email failed:', error);

    return res.status(500).json({
      success: false,
      message: 'Unable to send your message right now. Please try again later.'
    });
  }
};
