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
    next();
  } catch (err) {
    return fail(res, 'Invalid or expired token', 401);
  }
}

module.exports = authenticate;
