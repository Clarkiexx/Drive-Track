const { fail } = require('../utils/response');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error(err);

  if (err.name === 'SequelizeUniqueConstraintError') {
    return fail(res, 'A record with this value already exists', 409, err.errors?.map(e => e.message));
  }

  if (err.name === 'SequelizeValidationError') {
    return fail(res, 'Validation failed', 422, err.errors?.map(e => e.message));
  }

  // Multer upload failures (thrown before controllers run): surface them
  // with useful client-facing codes instead of a generic 500.
  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return fail(res, 'Uploaded file is too large. Maximum is 8MB per photo.', 413);
    }
    if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
      return fail(res, 'Too many files. Up to 5 evidence photos are allowed.', 422);
    }
    return fail(res, 'File upload failed', 422);
  }
  if (err.message === 'Only JPEG, PNG, or WEBP images are allowed') {
    return fail(res, err.message, 422);
  }

  // Never leak raw implementation details (SQL, stack traces, driver
  // messages) to API clients — log them server-side and return a generic
  // message instead. Known fail() responses already carry safe messages.
  const statusCode = err.statusCode || err.status || 500;
  if (statusCode >= 500) {
    return fail(res, 'Internal server error', 500);
  }
  return fail(res, 'Request failed', statusCode);
}

module.exports = errorHandler;
