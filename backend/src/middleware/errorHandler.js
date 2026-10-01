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
