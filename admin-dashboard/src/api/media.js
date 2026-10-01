import { getMediaBaseUrl } from './client';

/**
 * Resolves a backend-relative media path (e.g. `/uploads/evidence/x.jpg`)
 * to an absolute URL using the configured API host. Returns '' when the
 * path is missing so callers can render a placeholder instead.
 */
export function getMediaUrl(imagePath) {
  if (!imagePath) return '';
  if (/^https?:\/\//i.test(imagePath)) return imagePath;
  const path = imagePath.startsWith('/') ? imagePath : `/${imagePath}`;
  return `${getMediaBaseUrl()}${path}`;
}

/**
 * Fetches a protected backend file (e.g. a driver license photo, which is
 * served only to authenticated admins) and returns an object URL for use
 * as an <img> src. The JWT travels in the Authorization header — never in
 * the URL. Callers must revoke the URL (URL.revokeObjectURL) when done.
 */
export async function fetchProtectedImageUrl(imagePath, token) {
  if (!imagePath) return '';
  if (/^https?:\/\//i.test(imagePath)) return imagePath;
  const response = await fetch(getMediaUrl(imagePath), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    throw new Error(response.status === 401 || response.status === 403
      ? 'You are not authorized to view this photo.'
      : 'Unable to load photo.');
  }
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}
