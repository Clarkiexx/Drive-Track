const jwt = require('jsonwebtoken');

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32 || secret === 'replace_with_a_long_random_string') {
    throw new Error(
      'JWT_SECRET is missing or too weak. Set a random string of at least 32 characters in backend/.env (see .env.example).'
    );
  }
  return secret;
}

/**
 * Signs a JWT for an authenticated user.
 * @param {{ id: number, role: 'driver'|'enforcer'|'admin', mustChangePassword?: boolean }} payload
 */
function signToken(payload) {
  return jwt.sign(payload, getSecret(), {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });
}

function verifyToken(token) {
  return jwt.verify(token, getSecret());
}

module.exports = { signToken, verifyToken };
