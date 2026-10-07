import { API_BASE_URL } from "@/lib/axios";

/**
 * Media URL helpers — client-side mirror of driver-app/src/config.js
 * (`getMediaBaseUrl` / `getMediaUrl`).
 *
 * The backend stores upload paths RELATIVE to its own origin
 * (`/uploads/evidence/<file>`, `/uploads/licenses/<file>`), while
 * NEXT_PUBLIC_API_URL points at `http://host:5000/api/v1`. Rendering those
 * paths straight into an <img src> would resolve against the Next.js origin
 * and 404, so the `/api/v1` suffix is stripped to recover the backend origin:
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
 *   backend/src/app.js mounts `/uploads/licenses` behind
 *   `authenticate` + `allowRoles('admin')`, so a license photo URL only loads
 *   with an admin JWT. Drivers/enforcers get 401 (and self-registered drivers
 *   cannot see their own photo). Evidence photos under `/uploads/evidence` are
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
