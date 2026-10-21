const { success, fail } = require('../utils/response');
const { reverseGeocode } = require('../services/geocodingService');

const UPSTREAM_FAILURE_MESSAGE =
  'Location lookup is temporarily unavailable. Enter the place manually and try again later.';

/**
 * Parses a query-string coordinate. Returns null for anything that is not a
 * finite number inside [min, max] — including missing, empty, repeated, or
 * non-numeric values.
 */
function parseCoordinate(value, min, max) {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

/**
 * GET /geocode/reverse?lat=<number>&lng=<number>
 *
 * Enforcer/admin-only reverse geocoding for the citation form. Coordinates
 * are validated here rather than with express-validator so the 422 body has
 * one entry per bad coordinate and never echoes the raw input.
 */
async function reverse(req, res, next) {
  const lat = parseCoordinate(req.query.lat, -90, 90);
  const lng = parseCoordinate(req.query.lng, -180, 180);

  if (lat === null || lng === null) {
    const errors = [];
    if (lat === null) {
      errors.push({ field: 'lat', message: 'lat must be a number between -90 and 90' });
    }
    if (lng === null) {
      errors.push({ field: 'lng', message: 'lng must be a number between -180 and 180' });
    }
    return fail(res, 'Validation failed', 422, errors);
  }

  try {
    const result = await reverseGeocode(lat, lng);
    return success(res, result);
  } catch (err) {
    if (err && err.code === 'GEOCODING_UNAVAILABLE') {
      // Safe, provider-agnostic message: no upstream status code, body, or
      // location details are exposed to the client.
      return fail(res, UPSTREAM_FAILURE_MESSAGE, 502);
    }
    return next(err);
  }
}

module.exports = { reverse };
