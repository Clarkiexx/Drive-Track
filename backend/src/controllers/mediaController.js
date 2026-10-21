const { fail } = require('../utils/response');
const {
  isLicensePublicId,
  signedLicenseUrl,
  fetchAsset,
} = require('../services/cloudinaryService');

/**
 * GET /media/license-photo?publicId=<cloudinary public id>
 *
 * License photos are stored as Cloudinary `authenticated` assets, so there is
 * no public URL to hand out. This proxy requires an authenticated admin,
 * validates that the requested id belongs to the licenses folder, signs a
 * Cloudinary URL server-side, fetches it, and streams the bytes back. No
 * redirect — the browser never sees a usable Cloudinary URL.
 */
async function getLicensePhoto(req, res, next) {
  try {
    const publicId = typeof req.query.publicId === 'string' ? req.query.publicId.trim() : '';
    if (!publicId) {
      return fail(res, 'publicId query parameter is required', 400);
    }
    if (!isLicensePublicId(publicId)) {
      return fail(res, 'Invalid license photo reference', 422);
    }

    const { buffer, contentType } = await fetchAsset(signedLicenseUrl(publicId));
    res.set('Content-Type', contentType);
    // Sensitive admin-only document: never leave a copy in the browser cache
    // after logout.
    res.set('Cache-Control', 'no-store');
    return res.send(buffer);
  } catch (err) {
    return next(err);
  }
}

module.exports = { getLicensePhoto };
