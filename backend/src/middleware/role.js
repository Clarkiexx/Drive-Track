const { fail } = require('../utils/response');

/**
 * Restricts a route to specific roles. Must run after authenticate().
 * Usage: router.post('/citations', authenticate, allowRoles('enforcer'), controller)
 */
function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return fail(res, 'You are not authorized to perform this action', 403);
    }
    next();
  };
}

module.exports = allowRoles;
