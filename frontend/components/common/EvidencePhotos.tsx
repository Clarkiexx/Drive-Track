"use client";

import { Camera, Images, X } from "lucide-react";

export type EvidencePhoto = {
  /** Object URL or data URL for the preview. */
  url: string;
  /** Optional file name shown to officers with poor connectivity. */
  name?: string;
};

type EvidencePhotosProps = {
  photos: EvidencePhoto[];
  onRemove: (index: number) => void;
  onCapture: () => void;
  onPick: () => void;
  /** Mirrors the 5-photo cap in IssueCitationScreen. */
  max?: number;
  className?: string;
};

/**
 * Evidence thumbnail strip plus the capture controls, matching the wizard's
 * documentation step: 80px tiles with a red remove badge, and two bordered
 * buttons underneath.
 */
export default function EvidencePhotos({
  photos,
  onRemove,
  onCapture,
  onPick,
  max = 5,
  className = "",
}: EvidencePhotosProps) {
  const full = photos.length >= max;

  return (
    <div className={className}>
      {photos.length > 0 ? (
        <ul className="mt-1.5 flex flex-wrap gap-2.5">
          {photos.map((photo, index) => (
            <li key={`${photo.url}-${index}`} className="relative">
              {/* Blob and data URLs cannot go through the image optimiser. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt={photo.name ? `Evidence photo ${index + 1}: ${photo.name}` : `Evidence photo ${index + 1}`}
                className="size-20 rounded-lg border border-hairline object-cover"
              />
              <button
                type="button"
                onClick={() => onRemove(index)}
                aria-label={`Remove evidence photo ${index + 1}`}
                className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-signal-stop text-white ring-2 ring-canvas transition-transform active:scale-90"
              >
                <X size={12} strokeWidth={3} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3 flex gap-2.5">
        <button
          type="button"
          onClick={onCapture}
          disabled={full}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-hairline bg-surface py-3.5 text-[13px] font-semibold text-ink transition-colors duration-150 hover:bg-surface-sunken active:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Camera size={16} strokeWidth={2.2} aria-hidden />
          Take Photo
        </button>
        <button
          type="button"
          onClick={onPick}
          disabled={full}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-hairline bg-surface py-3.5 text-[13px] font-semibold text-ink transition-colors duration-150 hover:bg-surface-sunken active:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Images size={16} strokeWidth={2.2} aria-hidden />
          From Gallery
        </button>
      </div>

      {full ? (
        <p className="mt-2 text-[11px] text-muted">
          {max} photos attached — that is the limit for one citation.
        </p>
      ) : null}
    </div>
  );
}