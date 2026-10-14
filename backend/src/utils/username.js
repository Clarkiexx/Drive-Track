// Driver "username" normalization, moved verbatim out of src/models/Driver.js
// (the Sequelize `beforeValidate` hook and `Driver.normalizeUsername`) so the
// algorithm stays identical to what the MySQL data was written with — if this
// ever drifts, an existing driver could register successfully but never log in.

/**
 * Normalizes any user-typed full name the same way, for login comparison.
 * e.g. "Dela  Cruz, Juan." -> "dela cruz juan"
 */
function normalizeUsername(rawFullName) {
  return String(rawFullName || '')
    .replace(/[.,]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * Builds the stored username from the name columns — must match
 * normalizeUsername() exactly (same punctuation strip, whitespace collapse,
 * lowercase) or registration and login disagree.
 */
function buildUsername(firstName, middleInitial, lastName) {
  const parts = [firstName, middleInitial, lastName]
    .filter(Boolean)
    .map((p) => String(p).replace(/[.,]/g, '').trim())
    .filter(Boolean);
  return parts.join(' ').replace(/\s+/g, ' ').toLowerCase();
}

module.exports = { normalizeUsername, buildUsername };
