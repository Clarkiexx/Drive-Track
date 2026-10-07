"use client";

import { LoaderCircle, LocateFixed, RefreshCw } from "lucide-react";

type GpsBoxProps = {
  location: { latitude: number; longitude: number } | null;
  error?: string | null;
  onRetry: () => void;
  /** True while the browser is asking for a fix. */
  isLocating?: boolean;
};

type State = "captured" | "error" | "locating";

/**
 * The pale-green GPS panel from IssueCitationScreen's documentation step. A
 * citation cannot be filed without coordinates, so the error and retry live
 * inside the panel rather than in the footer's error slot.
 */
export default function GpsBox({
  location,
  error,
  onRetry,
  isLocating = false,
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
          <p className="tabular font-display text-[16px] font-bold text-ink">
            {location!.latitude.toFixed(4)}° N, {location!.longitude.toFixed(4)}° E
          </p>
          <p className="mt-0.5 text-[12px] text-muted">Auto-captured location</p>
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