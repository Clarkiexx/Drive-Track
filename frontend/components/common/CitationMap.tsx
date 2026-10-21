"use client";

import dynamic from "next/dynamic";
import { MapPin } from "lucide-react";

/**
 * Citation location map.
 *
 * Leaflet reads `window` while its module initialises, so the real canvas is
 * pulled in with `next/dynamic` + `ssr: false` from this client wrapper. The
 * wrapper itself may still be rendered on the server: it validates the
 * coordinates first and only mounts the dynamic canvas when they are usable,
 * which keeps the fallback in the prerendered HTML and avoids a blank flash.
 */

const CitationMapCanvas = dynamic(() => import("./CitationMapCanvas"), {
  ssr: false,
  // The wrapper below owns the height, so the placeholder can fill it exactly
  // and nothing jumps when the tiles mount.
  loading: () => <div aria-hidden className="breathe h-full w-full bg-surface-sunken" />,
});

export type CitationMapProps = {
  /** Prisma Decimal columns arrive as strings; accept both. */
  latitude?: number | string | null;
  longitude?: number | string | null;
  /** Human-readable place shown in the marker popup. */
  place?: string | null;
  /** Pixel height of the map; defaults to 220. */
  height?: number;
  className?: string;
};

const DEFAULT_HEIGHT = 220;

/**
 * Parses one coordinate and checks its geographic range. Empty strings and
 * non-numeric junk (a Prisma Decimal that failed to serialise, a blank field)
 * all resolve to null rather than 0,0 in the Gulf of Guinea.
 */
function toCoordinate(
  value: number | string | null | undefined,
  min: number,
  max: number
): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;

  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

export default function CitationMap({
  latitude,
  longitude,
  place,
  height = DEFAULT_HEIGHT,
  className,
}: CitationMapProps) {
  const lat = toCoordinate(latitude, -90, 90);
  const lng = toCoordinate(longitude, -180, 180);

  // Compact fallback: a record without coordinates should not reserve a
  // 200px hole in the receipt. Callers pass their spacing via className.
  if (lat === null || lng === null) {
    return (
      <div
        className={`flex items-center gap-2.5 rounded-[10px] border border-hairline bg-surface-sunken px-3.5 py-3 ${className ?? ""}`}
        role="note"
      >
        <MapPin size={16} strokeWidth={2.2} aria-hidden className="shrink-0 text-muted" />
        <div className="min-w-0">
          <p className="text-[12.5px] font-semibold leading-snug text-ink">
            Location map unavailable
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-muted">
            No valid GPS coordinates were recorded for this citation.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`overflow-hidden rounded-[10px] border border-hairline bg-surface-sunken ${className ?? ""}`}
      style={{ height }}
    >
      <CitationMapCanvas
        latitude={lat}
        longitude={lng}
        place={place}
        height={height}
        className="h-full w-full"
      />
    </div>
  );
}
