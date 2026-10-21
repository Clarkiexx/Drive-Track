import { API_BASE_URL } from "@/lib/axios";

/**
 * Media URL helpers — client-side mirror of driver-app/src/config.js
 * (`getMediaBaseUrl` / `getMediaUrl`).
 *
 * The backend stores legacy local media paths RELATIVE to its own origin
 * (`/uploads/evidence/<file>`, `/uploads/avatars/<file>`,
 * `/uploads/licenses/<file>`) and returns absolute Cloudinary URLs for new
 * avatar uploads, while NEXT_PUBLIC_API_URL points at
 * `http://host:5000/api/v1`. Rendering relative paths straight into an
 * <img src> would resolve against the Next.js origin and 404, so the `/api/v1`
 * suffix is stripped to recover the backend origin:
 *
 *   NEXT_PUBLIC_API_URL = http://192.168.1.19:5000/api/v1
 *   getMediaBaseUrl()    = http://192.168.1.19:5000
 *   getMediaUrl("/uploads/evidence/a.jpg")
 *                      = http://192.168.1.19:5000/uploads/evidence/a.jpg
 */

/** Backend origin (API base URL without the /api/vN suffix). */
export function getMediaBaseUrl(): string {
  return String(API_BASE_URL).replace(/\/api\/v\d+\/?$/i, "");
}

/**
 * Resolves a backend-relative media path to an absolute URL.
 * Absolute http(s) URLs and empty/null values pass through untouched.
 *
 * AUTH NOTE — license photos answer 401 for non-admin roles:
 *   legacy photos live under the backend's `/uploads/licenses` mount and new
 *   photos use the `/api/v1/media/license-photo` proxy; both sit behind
 *   `authenticate` + `allowRoles('admin')`, so a license photo URL only loads
 *   with an admin JWT. Drivers/enforcers get 401 (and self-registered drivers
 *   cannot see their own photo). Evidence photos under `/uploads/evidence` and
 *   avatars (Cloudinary secure_urls or legacy `/uploads/avatars` paths) are
 *   public. This is a plain <img src> fetch, NOT an axios call, so the
 *   lib/axios.ts 401 interceptor does not fire — handle the broken image in
 *   the component (placeholder) instead of expecting a redirect.
 */
export function getMediaUrl(imagePath?: string | null): string {
  if (!imagePath) return "";
  if (/^https?:\/\//i.test(imagePath)) return imagePath;
  const path = imagePath.startsWith("/") ? imagePath : `/${imagePath}`;
  return `${getMediaBaseUrl()}${path}`;
}

/**
 * Fetches a protected backend file (driver license photos are served only to
 * authenticated admins — legacy photos via the backend's `/uploads/licenses`
 * mount, new photos via the `/api/v1/media/license-photo` proxy, both behind
 * `authenticate` + `allowRoles('admin')`) and returns an object URL for use as
 * an <img> src. The JWT travels in the Authorization header, never in the URL.
 * Callers must revoke the URL (URL.revokeObjectURL) when done. Mirrors
 * admin-dashboard/src/api/media.js:fetchProtectedImageUrl.
 */
export async function fetchProtectedImageUrl(
  imagePath?: string | null,
  token?: string | null
): Promise<string> {
  if (!imagePath) return "";
  if (/^https?:\/\//i.test(imagePath)) return imagePath;
  const response = await fetch(getMediaUrl(imagePath), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    throw new Error(
      response.status === 401 || response.status === 403
        ? "You are not authorized to view this photo."
        : "Unable to load photo."
    );
  }
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}
