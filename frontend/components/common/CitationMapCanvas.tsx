"use client";

import "leaflet/dist/leaflet.css";

import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";

/**
 * The actual Leaflet canvas. Loaded only in the browser through
 * CitationMap.tsx (`next/dynamic` + `ssr: false`) — Leaflet touches `window`
 * at import time and its CSS assumes a real DOM (no 480px prerender).
 *
 * Deliberately attribute-free: this component is never imported statically.
 */

export type CitationMapCanvasProps = {
  latitude: number;
  longitude: number;
  /** Human-readable place shown in the marker popup. */
  place?: string | null;
  /** Explicit pixel height — Leaflet needs one, borders give it zero. */
  height: number;
  className?: string;
};

export default function CitationMapCanvas({
  latitude,
  longitude,
  place,
  height,
  className,
}: CitationMapCanvasProps) {
  const popupLabel = place?.trim() || "Citation location";

  return (
    <div
      className={className}
      style={{ height }}
      // A named region so screen-reader users know what the pane is before
      // Leaflet's own (mouse-oriented) controls take over.
      role="region"
      aria-label={`Map showing ${popupLabel}`}
    >
      <MapContainer
        // Remount when the coordinates change: MapContainer only reads
        // center/zoom on mount, so a new fix would otherwise leave the marker
        // and viewport behind.
        key={`${latitude}:${longitude}`}
        center={[latitude, longitude]}
        zoom={16}
        scrollWheelZoom={false}
        // relative + z-0 keeps Leaflet's panes (z-index 400–700) inside their
        // own stacking context, below sticky app bars and admin dialog chrome.
        className="relative z-0 h-full w-full"
        style={{ height, width: "100%" }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        {/* CircleMarker rather than Marker: no default icon image to break
            under the bundler, and it needs no assets from leaflet/dist/images. */}
        <CircleMarker
          center={[latitude, longitude]}
          radius={9}
          pathOptions={{
            color: "#1b5e20",
            weight: 3,
            fillColor: "#2e7d32",
            fillOpacity: 0.9,
          }}
        >
          <Popup>{popupLabel}</Popup>
        </CircleMarker>
      </MapContainer>
    </div>
  );
}
