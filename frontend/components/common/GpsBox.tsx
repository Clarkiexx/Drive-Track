"use client";

import { Check, LoaderCircle, LocateFixed, RefreshCw } from "lucide-react";

import CitationMap from "@/components/common/CitationMap";

type GpsBoxProps = {
  location: { latitude: number; longitude: number } | null;
  error?: string | null;
  onRetry: () => void;
  /** True while the browser is asking for a fix. */
  isLocating?: boolean;
  /** Reverse-geocoded human-readable place for the captured fix. */
  placeName?: string | null;
  /** True while the reverse-geocode request is in flight. */
  isResolvingPlace?: boolean;
  /** Non-blocking message when reverse geocoding failed. */
  placeError?: string | null;
  /** Copies the detected place into the wizard's placeOfViolation field. */
  onUsePlace?: () => void;
  /** True when placeOfViolation already holds the detected place. */
  isPlaceApplied?: boolean;
};

type State = "captured" | "error" | "locating";

/**
 * The pale-green GPS panel from IssueCitationScreen's documentation step. A
 * citation cannot be filed without coordinates, so the error and retry live
 * inside the panel rather than in the footer's error slot.
 *
 * The detected place is the headline once reverse geocoding answers; the raw
 * coordinates stay underneath as a caption. Geocoding is never a gate — a
 * failed lookup still leaves the captured fix and the manual place field
 * usable.
 */
export default function GpsBox({
  location,
  error,
  onRetry,
  isLocating = false,
  placeName = null,
  isResolvingPlace = false,
  placeError = null,
  onUsePlace,
  isPlaceApplied = false,
}: GpsBoxProps) {
  const state: State = location ? "captured" : error ? "error" : "locating";

  return (
    <div className="mb-2 rounded-[10px] bg-brand-soft p-4">
      <p className="mb-1 flex items-center gap-1.5 text-[13px] text-muted">
        <LocateFixed size={14} strokeWidth={2.2} aria-hidden />
        GPS Coordinates <span className="text-signal-stop">*</span>
      </p>

      {state === "captured" ? (
        <>
          {isResolvingPlace ? (
            <p
              role="status"
              className="flex items-center gap-2 text-[14px] font-semibold text-muted"
            >
              <LoaderCircle
                size={15}
                strokeWidth={2.4}
                className="animate-spin text-brand-500"
                aria-hidden
              />
              Detecting place name…
            </p>
          ) : placeName ? (
            <p className="font-display text-[16px] font-bold leading-snug text-ink">
              {placeName}
            </p>
          ) : (
            <p className="text-[15px] font-semibold leading-snug text-ink">
              Location captured
            </p>
          )}

          {placeError && !isResolvingPlace ? (
            <p className="mt-0.5 text-[11.5px] leading-snug text-muted">
              Place name unavailable — you can type it manually.
            </p>
          ) : null}

          <p className="tabular mt-1 text-[11.5px] text-muted">
            {location!.latitude.toFixed(4)}° N, {location!.longitude.toFixed(4)}° E
            <span aria-hidden> • </span>
            Auto-captured location
          </p>

          {placeName && onUsePlace ? (
            <button
              type="button"
              onClick={onUsePlace}
              disabled={isPlaceApplied}
              className="mt-2 inline-flex items-center gap-1.5 rounded-[8px] border border-brand-200 bg-surface px-3 py-1.5 text-[12.5px] font-bold text-brand-700 transition-colors hover:bg-brand-50 disabled:cursor-default disabled:border-hairline disabled:text-muted disabled:hover:bg-surface"
            >
              <Check size={13} strokeWidth={2.6} aria-hidden />
              {isPlaceApplied ? "Added to Place of Violation" : "Use this place"}
            </button>
          ) : null}

          <CitationMap
            latitude={location!.latitude}
            longitude={location!.longitude}
            place={placeName}
            height={180}
            className="mt-3"
          />
        </>
      ) : null}

      {state === "error" ? (
        <>
          <p className="text-[13px] font-semibold leading-snug text-signal-stop">{error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-bold text-brand-500 underline-offset-2 hover:underline"
          >
            <RefreshCw size={14} strokeWidth={2.4} aria-hidden />
            Retry
          </button>
        </>
      ) : null}

      {state === "locating" ? (
        <div className="flex items-center gap-2 py-1">
          <LoaderCircle size={18} strokeWidth={2.4} className="animate-spin text-brand-500" aria-hidden />
          <p className="text-[12px] text-muted">
            {isLocating
              ? "Waiting for a location fix…"
              : "Capturing location… wait before submitting."}
          </p>
        </div>
      ) : null}
    </div>
  );
}
