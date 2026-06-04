const multer = require('multer');

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

const registrationUpload = upload.fields([
  { name: 'frontIdImageFile', maxCount: 1 },
  { name: 'backIdImageFile', maxCount: 1 }
]);

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
  registrationUpload,
  handleUploadErrors
};
