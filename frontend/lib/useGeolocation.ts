"use client";

import { useCallback, useRef, useState } from "react";

/** What `navigator.geolocation` reports back, reduced to what a citation needs. */
export type GeoLocation = {
  latitude: number;
  longitude: number;
};

type UseGeolocation = {
  /** The last successful fix, or null while there is none. */
  location: GeoLocation | null;
  /** A sentence an officer can act on, or null. */
  error: string | null;
  /** True while the browser is working on a fix. */
  isLocating: boolean;
  /** Requests a fresh fix. Safe to call again after a failure — this is the retry. */
  capture: () => void;
};

/**
 * WHY this exists: a citation carries the coordinates the officer stood at, and
 * the backend rejects the record without them (citationRoutes.js validates
 * `latitude`/`longitude` as floats). So "no fix" is a blocked submission, not a
 * degraded one, and the failure has to explain itself.
 *
 * WHY not a map library: the citation needs a coordinate pair, not a picture of
 * a street. `navigator.geolocation` is the whole API — no dependency, no
 * network round-trip for tiles an officer would never look at on this screen.
 */

/**
 * WHY each case gets its own sentence. The RN wizard distinguished permission
 * from a dead GPS; a single "location failed" leaves an officer guessing
 * whether to fix the site or the browser, and those lead to different places.
 */
const ERROR_MESSAGES: Record<number, string> = {
  // PERMISSION_DENIED — same wording as IssueCitationScreen's screen.
  1: "Location permission denied. GPS coordinates are required for citation records.",
  // POSITION_UNAVAILABLE — the radio is on but no fix (indoors, no satellites).
  2: "Unable to get current location. Make sure GPS is enabled.",
  // TIMEOUT — RN had no explicit message for this; the fix is the officer moving
  // to open sky, so that is what this asks for.
  3: "Timed out waiting for a GPS fix. Move to an open area and tap Retry.",
};

/**
 * WHY a separate message: `navigator.geolocation` is a secure-context-only API.
 * Over plain HTTP on a LAN address the browser does not merely refuse — the
 * property can be missing entirely, so the failure reads like an unsupported
 * device. Naming the actual cause (HTTPS) is the difference between an officer
 * filing a ticket and fixing it in ten seconds.
 */
const INSECURE_CONTEXT_MESSAGE =
  "GPS needs a secure (HTTPS) connection. Run next dev --experimental-https, or use localhost.";

/** WHY unsupported is not the same as denied: the phone will never grant it. */
const UNSUPPORTED_MESSAGE =
  "This browser cannot provide GPS coordinates. Open DriveTrack on a phone, or use a browser that supports geolocation.";

export default function useGeolocation(): UseGeolocation {
  const [location, setLocation] = useState<GeoLocation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  /**
   * WHY a request id: tapping Retry while the first attempt is still pending
   * starts a second `getCurrentPosition`. Whichever resolves last would
   * otherwise win, so a late failure could overwrite a fresh fix with an error.
   */
  const requestIdRef = useRef(0);

  const capture = useCallback(() => {
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;

    // A retry is a new attempt, not a re-read of the last failure.
    setError(null);
    setIsLocating(true);

    // Guard order matters. isSecureContext is checked FIRST because on plain
    // HTTP `navigator.geolocation` can be absent, and reporting that as "this
    // browser cannot provide GPS" would send the officer down the wrong path
    // when the real problem is the dev server's certificate.
    if (typeof window === "undefined" || !window.isSecureContext) {
      setIsLocating(false);
      setError(INSECURE_CONTEXT_MESSAGE);
      return;
    }

    if (!("geolocation" in navigator)) {
      setIsLocating(false);
      setError(UNSUPPORTED_MESSAGE);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (requestId !== requestIdRef.current) return;

        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setError(null);
        setIsLocating(false);
      },
      (geoError) => {
        if (requestId !== requestIdRef.current) return;

        setLocation(null);
        setError(
          ERROR_MESSAGES[geoError.code] ??
            "Unable to get current location. Tap Retry, or move to an open area."
        );
        setIsLocating(false);
      },
      {
        // WHY high accuracy: RN used the platform default, which indoors can be
        // hundreds of metres out. These coordinates are a legal record.
        enableHighAccuracy: true,
        // WHY 15s: long enough for a cold fix under trees or in a tunnel,
        // short enough that an officer does not think the app has hung.
        timeout: 15000,
        // WHY zero: the citation records where the officer is standing NOW. A
        // cached fix from a previous screen would be a different place.
        maximumAge: 0,
      }
    );
  }, []);

  return { location, error, isLocating, capture };
}