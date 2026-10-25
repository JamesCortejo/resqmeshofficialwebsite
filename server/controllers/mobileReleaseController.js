const path = require('path');
const {
  APK_MIME_TYPE,
  getPublishedRelease,
  publicReleaseData
} = require('../services/mobileReleaseService');

exports.getLatest = (req, res) => {
  try {
    if (String(req.query.platform || 'android').toLowerCase() !== 'android') {
      return res.status(400).json({ success: false, message: 'Only Android releases are available.' });
    }
    const release = getPublishedRelease();
    return res.set('Cache-Control', 'no-store').json({
      success: true,
      data: publicReleaseData(release)
    });
  } catch (error) {
    console.error('Mobile release metadata error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode === 404 ? error.message : 'Unable to load the latest mobile release.'
    });
  }
};

exports.downloadLatest = (req, res) => {
  try {
    const release = getPublishedRelease({ required: true });
    const requestedReleaseId = String(req.query.releaseId || '').trim();
    if (!requestedReleaseId || requestedReleaseId !== release.releaseId) {
      return res.status(409).json({
        success: false,
        message: 'This release changed before the download started. Check for updates again.'
      });
    }
    res.set({
      'Content-Type': APK_MIME_TYPE,
      'Content-Disposition': `attachment; filename="${release.filename}"`,
      'Cache-Control': 'public, max-age=3600, immutable',
      ETag: `"${release.sha256}"`,
      'X-Content-Type-Options': 'nosniff'
    });
    return res.sendFile(path.resolve(release.filePath), {
      acceptRanges: true,
      lastModified: true
    });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: status === 404 ? error.message : 'Unable to download the latest mobile release.'
    });
  }
};
