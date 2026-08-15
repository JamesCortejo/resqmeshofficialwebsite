function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    message: 'Resource not found.'
  });
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    next(error);
    return;
  }

  const statusCode = Number.isInteger(error?.statusCode) && error.statusCode >= 400 && error.statusCode < 500
    ? error.statusCode
    : 500;

  if (statusCode >= 500) {
    console.error('Unhandled request error:', error);
  }

  res.status(statusCode).json({
    success: false,
    message: statusCode >= 500 ? 'Unable to process request.' : error.message
  });
}

module.exports = {
  errorHandler,
  notFoundHandler
};
