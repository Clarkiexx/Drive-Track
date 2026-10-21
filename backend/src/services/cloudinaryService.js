/**
 * Cloudinary storage helpers.
 *
 * Two very different assets live here:
 *   - License photos are verification documents. They are uploaded as
 *     `type: 'authenticated'` so they can never be fetched from a plain
 *     public URL. Neon stores Cloudinary's `secure_url` in
 *     `license_photo_path`; API clients only ever receive the admin-only
 *     proxy path (see toProtectedLicensePath / buildLicensePhotoPath), and the
 *     proxy signs a Cloudinary URL server-side when an admin opens the image.
 *   - Profile avatars are display images. They are public uploads and the
 *     database stores Cloudinary's `secure_url` directly.
 *
 * All credentials stay server-side via CLOUDINARY_* environment variables.
 */

const { v2: cloudinary } = require('cloudinary');

const LICENSE_FOLDER = 'drivetrack/licenses';
const AVATAR_FOLDER = 'drivetrack/avatars';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

function isConfigured() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
}

/** Thrown when storage is unavailable; errorHandler turns this into a clear 502. */
function storageError(message) {
  const err = new Error(message);
  err.statusCode = 502;
  err.publicMessage = message;
  return err;
}

function assertConfigured() {
  if (!isConfigured()) {
    throw storageError('Image storage is not configured. Please contact the administrator.');
  }
}

/** Promisified `upload_stream` — uploads an in-memory multer buffer. */
function uploadBuffer(buffer, options) {
  assertConfigured();
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) return reject(storageError('Image upload failed. Please try again.'));
      return resolve(result);
    });
    stream.end(buffer);
  });
}

/** Uploads a license photo as a private, authenticated image. */
function uploadLicenseImage(buffer) {
  return uploadBuffer(buffer, {
    folder: LICENSE_FOLDER,
    type: 'authenticated',
    resource_type: 'image',
  });
}

/** Uploads a profile avatar as a public image. */
function uploadAvatarImage(buffer) {
  return uploadBuffer(buffer, {
    folder: AVATAR_FOLDER,
    type: 'upload',
    resource_type: 'image',
  });
}

/** The admin-only API path returned to clients for a license photo. */
function buildLicensePhotoPath(publicId) {
  return `/api/v1/media/license-photo?publicId=${encodeURIComponent(publicId)}`;
}

function isLicensePublicId(publicId) {
  return (
    typeof publicId === 'string' &&
    publicId.startsWith(`${LICENSE_FOLDER}/`) &&
    !publicId.includes('..') &&
    !publicId.includes('\\') &&
    !publicId.includes('?') &&
    !publicId.includes('#')
  );
}

/**
 * Maps a stored license_photo_path value to the admin-only proxy path.
 * New rows store the Cloudinary `secure_url`, which must never reach a client;
 * legacy local and already-proxied values pass through unchanged. Absolute
 * URLs that cannot be safely converted fall back to null rather than leaking.
 */
function toProtectedLicensePath(stored) {
  if (stored === null || stored === undefined || stored === '') return stored;
  if (typeof stored !== 'string') return null;
  if (stored.startsWith('/uploads/licenses/')) return stored;
  if (stored.startsWith('/api/v1/media/license-photo?')) return stored;
  if (/^(?:https?:)?\/\//i.test(stored)) {
    let host;
    try {
      host = new URL(stored).hostname.toLowerCase();
    } catch {
      return null;
    }
    if (host !== 'res.cloudinary.com' && !host.endsWith('.cloudinary.com')) return null;
    const publicId = publicIdFromUrl(stored);
    return isLicensePublicId(publicId) ? buildLicensePhotoPath(publicId) : null;
  }
  return stored;
}

/** Signed URL for an authenticated Cloudinary asset. */
function signedLicenseUrl(publicId) {
  assertConfigured();
  return cloudinary.url(publicId, {
    type: 'authenticated',
    sign_url: true,
    secure: true,
    resource_type: 'image',
  });
}

/**
 * Fetches an asset server-side (used by the admin license-photo proxy, so the
 * browser never receives a redirect or a usable Cloudinary URL).
 * Returns { buffer, contentType }.
 */
async function fetchAsset(url) {
  let response;
  try {
    response = await fetch(url);
  } catch {
    throw storageError('Image storage is temporarily unavailable. Please try again.');
  }
  if (!response.ok) {
    throw storageError('Image could not be retrieved from storage. Please try again.');
  }
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get('content-type') || 'image/jpeg',
  };
}

/** Derives the Cloudinary public id from a stored secure_url. */
function publicIdFromUrl(url) {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return null;
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    const marker = parts.findIndex((part) => part === 'upload' || part === 'authenticated');
    if (marker === -1) return null;
    let rest = parts.slice(marker + 1);
    // Authenticated URLs embed a signature segment (s--xxxx--) and a version
    // (v123); public uploads normally have only the version. Neither belongs
    // to the public id.
    rest = rest.filter((part) => !/^s--.+--$/.test(part));
    if (rest[0] && /^v\d+$/.test(rest[0])) rest = rest.slice(1);
    if (!rest.length) return null;
    // Cloudinary appends the format as a file extension; destroy() wants it
    // as a separate `format` argument, so strip it from the public id.
    rest[rest.length - 1] = rest[rest.length - 1].replace(/\.[^.]+$/, '');
    return rest.join('/');
  } catch {
    return null;
  }
}

/**
 * Best-effort delete of an uploaded asset. Never throws: cleanup must not turn
 * a successful request (or an already-failing one) into a different error.
 */
async function deleteAsset(publicId, { type = 'upload', resourceType = 'image' } = {}) {
  if (!publicId || !isConfigured()) return false;
  try {
    await cloudinary.uploader.destroy(publicId, { type, resource_type: resourceType, invalidate: true });
    return true;
  } catch (err) {
    console.error('Cloudinary delete failed:', err.message);
    return false;
  }
}

/** Best-effort delete of a previously stored avatar secure_url. */
async function deleteAvatarByUrl(url) {
  return deleteAsset(publicIdFromUrl(url), { type: 'upload' });
}

module.exports = {
  LICENSE_FOLDER,
  AVATAR_FOLDER,
  uploadLicenseImage,
  uploadAvatarImage,
  buildLicensePhotoPath,
  toProtectedLicensePath,
  isLicensePublicId,
  signedLicenseUrl,
  fetchAsset,
  publicIdFromUrl,
  deleteAsset,
  deleteAvatarByUrl,
};
