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
