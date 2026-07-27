const multer = require('multer');
const { verifyRecaptcha } = require('../services/recaptchaService');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: (req, file, callback) => {
    if (!file.mimetype || !file.mimetype.startsWith('image/')) {
      callback(new Error('Only image files are allowed.'));
      return;
    }

    callback(null, true);
  }
});

const registrationUploadEngine = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: (req, file, callback) => {
    const finish = (error) => {
      if (error) {
        callback(error);
        return;
      }

      if (!file.mimetype || !file.mimetype.startsWith('image/')) {
        callback(new Error('Only image files are allowed.'));
        return;
      }

      callback(null, true);
    };

    if (req.recaptchaVerified) {
      finish();
      return;
    }

    Promise.resolve()
      .then(async () => {
        await verifyRecaptcha(req.body?.recaptchaToken, 'register', {
          remoteIp: req.ip,
          hostname: req.hostname
        });
        req.recaptchaVerified = true;
      })
      .then(() => finish())
      .catch((error) => finish(error));
  }
});

const registrationUpload = registrationUploadEngine.fields([
  { name: 'frontIdImageFile', maxCount: 1 },
  { name: 'backIdImageFile', maxCount: 1 }
]);

const departmentChatIconUpload = upload.single('icon');

function handleUploadErrors(error, req, res, next) {
  if (!error) {
    next();
    return;
  }

  const message = error.code === 'LIMIT_FILE_SIZE'
    ? 'ID images must be 5MB or smaller.'
    : error.message;

  res.status(400).json({
    success: false,
    message
  });
}

module.exports = {
  departmentChatIconUpload,
  registrationUpload,
  handleUploadErrors
};
