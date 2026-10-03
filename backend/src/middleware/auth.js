const { verifyToken } = require('../utils/jwt');
const { fail } = require('../utils/response');

/**
 * Verifies the Authorization: Bearer <token> header and attaches
 * the decoded payload to req.user. Does not check role — see role.js.
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return fail(res, 'Authentication token missing', 401);
  }

  const token = authHeader.split(' ')[1];

  try {
    req.user = verifyToken(token); // { id, role, mustChangePassword? }
    // A driver flagged for password change may only call the change-password
    // endpoint — every other protected operation is rejected until the
    // password is actually changed (a fresh token is issued then).
    // allowRoles() still applies on top of this check.
    if (
      req.user.role === 'driver' &&
      req.user.mustChangePassword === true &&
      !(req.method === 'POST' && String(req.originalUrl || '').split('?')[0].endsWith('/auth/driver/change-password'))
    ) {
      return fail(res, 'Password change required before continuing', 403);
    }
    next();
  } catch (err) {
    return fail(res, 'Invalid or expired token', 401);
  }
}

module.exports = authenticate;
