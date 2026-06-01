import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { LatLng, Track } from "../lib/sync";
import { nearestElapsed } from "../lib/sync";

interface Props {
  track: Track | null;
  /** Current synced position (the video-driven pin). */
  position: LatLng | null;
  /** Keep the pin centered as the video plays. */
  follow: boolean;
  /** When true, the next map click sets the sync offset instead of seeking. */
  alignMode: boolean;
  /** Called with the `elapsed` seconds of the nearest track point on map click. */
  onMapPointElapsed: (elapsed: number) => void;
}

// Esri World Imagery — free satellite tiles, no API key.
const ESRI_IMAGERY =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ESRI_ATTR =
  "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community";

export function MapView({ track, position, follow, alignMode, onMapPointElapsed }: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const lineRef = useRef<L.Polyline | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  // Latest click callback, read inside a once-bound handler to avoid rebinding.
  const clickCb = useRef(onMapPointElapsed);
  clickCb.current = onMapPointElapsed;

  // Init map once.
  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const map = L.map(elRef.current, { zoomControl: true }).setView([39.5, -111.5], 13);
    L.tileLayer(ESRI_IMAGERY, { attribution: ESRI_ATTR, maxZoom: 19 }).addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Draw the track + (re)bind the map click handler when the track changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    lineRef.current?.remove();
    lineRef.current = null;
    map.off("click");

    if (!track || !track.latlng.length) return;
    const line = L.polyline(track.latlng, { color: "#fc4c02", weight: 4, opacity: 0.9 }).addTo(map);
    map.fitBounds(line.getBounds(), { padding: [30, 30] });
    lineRef.current = line;

    map.on("click", (e: L.LeafletMouseEvent) => {
      clickCb.current(nearestElapsed(track, [e.latlng.lat, e.latlng.lng]));
    });
  }, [track]);

  // Move the synced pin (and follow it if enabled).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!position) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    if (!markerRef.current) {
      markerRef.current = L.marker(position, { icon: pinIcon() }).addTo(map);
    } else {
      markerRef.current.setLatLng(position);
    }
    if (follow) {
      const z = map.getZoom();
      if (z < 16) map.setView(position, 16, { animate: true });
      else map.panTo(position, { animate: false });
    }
  }, [position, follow]);

  // Crosshair cursor while arming an alignment click.
  useEffect(() => {
    const c = mapRef.current?.getContainer();
    if (c) c.style.cursor = alignMode ? "crosshair" : "";
  }, [alignMode]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={elRef} style={{ width: "100%", height: "100%", borderRadius: 8 }} />
      {alignMode && (
        <div className="align-banner">
          Click your current spot on the trail to lock the sync to this video frame
        </div>
      )}
    </div>
  );
}

// A simple high-contrast dot pin (no external image asset needed).
function pinIcon() {
  return L.divIcon({
    className: "",
    html: `<div style="width:18px;height:18px;border-radius:50%;background:#fff;border:4px solid #fc4c02;box-shadow:0 0 0 2px rgba(0,0,0,0.4)"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}
