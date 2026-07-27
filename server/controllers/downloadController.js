const {
  APK_FILENAME,
  createProtectedDownload,
  resolveDownloadPath,
  verifyDownloadToken
} = require('../services/downloadSecurityService');

function errorResponse(res, error, fallbackMessage) {
  const statusCode = error && error.statusCode ? error.statusCode : 500;
  return res.status(statusCode).json({
    success: false,
    message: error && error.message ? error.message : fallbackMessage
  });
}

exports.requestDownload = async (req, res) => {
  try {
    const result = await createProtectedDownload(req.body || {}, {
      ipAddress: req.ip,
      hostname: req.hostname
    });

    return res.json({
      success: true,
      message: 'Download authorized.',
      data: result
    });
  } catch (error) {
    console.error('Download authorization error:', error);
    return errorResponse(res, error, 'Unable to authorize download right now.');
  }
};

exports.serveProtectedDownload = async (req, res) => {
  try {
    const filename = req.params.filename || APK_FILENAME;
    verifyDownloadToken(req.query.token, req.ip, filename);
    const filePath = resolveDownloadPath(filename);

    return res.download(filePath, filename);
  } catch (error) {
    if ((error && error.statusCode) === 404) {
      return res.status(404).send(error.message);
    }

    return res.status(403).send(error && error.message ? error.message : 'Download authorization failed.');
  }
};
