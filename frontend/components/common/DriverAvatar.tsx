"use client";

import { useState } from "react";

import { getMediaUrl } from "@/lib/media";

type DriverAvatarProps = {
  firstName?: string | null;
  lastName?: string | null;
  photoPath?: string | null;
  /** `sm` for the drivers table, `lg` for the detail drawer. */
  size?: "sm" | "lg";
  className?: string;
};

const SIZES = {
  sm: {
    shell: "size-9",
    initials: "text-[12px]",
  },
  lg: {
    shell: "size-24",
    initials: "text-[28px]",
  },
} as const;

/**
 * The driver's chosen avatar (My Profile → profile picture), with an initials
 * fallback. New uploads are public Cloudinary `secure_url`s (absolute, passed
 * through by getMediaUrl); legacy local `/uploads/avatars` paths are still
 * supported. Either way a plain <img src> works here — unlike the admin-only
 * license photo, which must be fetched with the admin JWT (lib/media
 * fetchProtectedImageUrl).
 */
export default function DriverAvatar({
  firstName,
  lastName,
  photoPath,
  size = "sm",
  className = "",
}: DriverAvatarProps) {
  const [failedPath, setFailedPath] = useState<string | null>(null);

  // Keep the previous failure only for the exact path that failed. A new
  // upload gets a new filename, so it retries automatically after a refresh.
  const photoUrl = photoPath && failedPath !== photoPath ? getMediaUrl(photoPath) : "";

  const fullName = `${firstName ?? ""} ${lastName ?? ""}`.trim();
  const initials =
    `${firstName?.charAt(0) ?? ""}${lastName?.charAt(0) ?? ""}`.toUpperCase() || "?";
  const { shell, initials: initialsText } = SIZES[size];

  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={fullName ? `${fullName} profile photo` : "Driver profile photo"}
        onError={() => setFailedPath(photoPath ?? null)}
        className={`${shell} shrink-0 rounded-full object-cover ring-2 ring-surface ${className}`}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={`grid ${shell} shrink-0 place-items-center rounded-full bg-brand-500 font-display font-bold text-white ring-2 ring-surface ${initialsText} ${className}`}
    >
      {initials}
    </span>
  );
}
