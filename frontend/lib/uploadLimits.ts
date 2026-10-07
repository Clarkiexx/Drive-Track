/**
 * Upload limits, mirrored from the backend's multer config.
 *
 * WHY these live here: the API rejects an unsupported type or an oversized file
 * at upload time with a 422/413, and because the citation and driver creates are
 * multipart, ONE bad file fails the ENTIRE request — an officer who attaches a
 * 12MB HEIC from an iPhone loses the whole citation, not just the photo. So the
 * browser has to refuse the same files the server would, with a message the
 * officer can act on, before the request is ever sent.
 *
 * Source of truth — backend/src/middleware/upload.js and uploadLicense.js:
 *   fileFilter → image/jpeg, image/png, image/webp
 *   limits.fileSize → 8MB per file
 *   upload.js limits.files → 5 (uploads/evidence only)
 * If those change, change them here too.
 */

/** `accept` attribute value: only the types multer's fileFilter allows. */
export const ACCEPTED_IMAGE_TYPES = "image/jpeg,image/png,image/webp";

/** The same list as a lookup, for validating a picked File's `.type`. */
export const ACCEPTED_IMAGE_MIME_TYPES: readonly string[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

/** multer's `fileSize` limit: 8MB. */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** multer's `files` limit on the evidence endpoint (uploads/evidence only). */
export const MAX_EVIDENCE_PHOTOS = 5;

export type ImageRejectionReason = "type" | "size";

/**
 * Checks a picked file against the server's rules.
 *
 * Returns the reason it would be rejected, or `null` when it is acceptable.
 * Deliberately returns only the FIRST problem: the officer fixes one thing at a
 * time, and a combined message reads as a wall of text.
 */
export function rejectImage(
  file: { type: string; size: number },
  maxBytes: number = MAX_IMAGE_BYTES
): ImageRejectionReason | null {
  if (!ACCEPTED_IMAGE_MIME_TYPES.includes(file.type)) return "type";
  if (file.size > maxBytes) return "size";
  return null;
}

/** Officer-facing wording for each rejection. */
export const IMAGE_REJECTION_MESSAGE: Record<ImageRejectionReason, string> = {
  type: "Only JPEG, PNG or WebP images are accepted.",
  size: "Each image must be 8 MB or smaller.",
};