import api, { type ApiEnvelope } from "@/lib/axios";

/**
 * Geocode service — thin wrapper over backend/src/routes/geocodeRoutes.js.
 *
 * GET /geocode/reverse resolves a coordinate pair to a human-readable place
 * name. Enforcer/admin only. Returns the unwrapped `data` of the backend
 * envelope; failures reject with an AxiosError (getApiErrorMessage() reads the
 * backend `message`). Geocoding is a convenience only — citation submission
 * must never depend on it.
 */

export interface ReverseGeocodeResult {
  /** Short label suitable for a form field, e.g. "Ortigas Center, Pasig". */
  placeName: string | null;
  /** Full provider display name, usually longer than placeName. */
  displayName: string | null;
  /** Upstream provider that answered, e.g. "nominatim". */
  source: string | null;
  /** True when the backend served this lookup from its cache. */
  cached: boolean;
}

export interface ReverseGeocodeOptions {
  /** Abort stale lookups when the location fix changes or the view unmounts. */
  signal?: AbortSignal;
}

export const geocodeService = {
  /**
   * GET /geocode/reverse?lat=…&lng=…
   *
   * The backend answers 422 for invalid coordinates and 502 when the upstream
   * provider fails; both reject here so callers can show a subtle fallback.
   */
  reverseGeocode: async (
    latitude: number | string,
    longitude: number | string,
    options: ReverseGeocodeOptions = {}
  ): Promise<ReverseGeocodeResult> => {
    const res = await api.get<ApiEnvelope<ReverseGeocodeResult>>("/geocode/reverse", {
      params: { lat: latitude, lng: longitude },
      signal: options.signal,
    });

    const data = res.data?.data;
    if (!data) throw new Error("Malformed geocode response");

    return {
      placeName: data.placeName ?? null,
      displayName: data.displayName ?? null,
      source: data.source ?? null,
      cached: Boolean(data.cached),
    };
  },
};
