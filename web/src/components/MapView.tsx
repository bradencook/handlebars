import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { LatLng, Track } from "../lib/sync";
import { nearestElapsed } from "../lib/sync";
import { fetchTrails } from "../lib/overpass";

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

// Esri World Imagery — free satellite tiles, no API key. Native to z19; we let
// Leaflet upscale beyond that (maxZoom 22) so you can get in tight.
const ESRI_IMAGERY =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ESRI_ATTR =
  "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community";
const MAX_ZOOM = 22;
// Below this, the map covers too much ground for a sane Overpass query.
const MIN_TRAIL_ZOOM = 14;

export function MapView({ track, position, follow, alignMode, onMapPointElapsed }: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const lineRef = useRef<L.Polyline | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const trailsRef = useRef<L.LayerGroup | null>(null);
  const clickCb = useRef(onMapPointElapsed);
  clickCb.current = onMapPointElapsed;

  const [trails, setTrails] = useState<{ loading: boolean; count: number | null; error: string | null }>(
    { loading: false, count: null, error: null }
  );
  const [zoom, setZoom] = useState(13);

  // Init map + layers once.
  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const map = L.map(elRef.current, { zoomControl: true, maxZoom: MAX_ZOOM }).setView(
      [39.5, -111.5],
      13
    );

    const satellite = L.tileLayer(ESRI_IMAGERY, {
      attribution: ESRI_ATTR,
      maxNativeZoom: 19,
      maxZoom: MAX_ZOOM,
    }).addTo(map);

    const cyclosm = L.tileLayer(
      "https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png",
      {
        subdomains: "abc",
        attribution: "© CyclOSM, © OpenStreetMap contributors",
        maxNativeZoom: 20,
        maxZoom: MAX_ZOOM,
      }
    );

    const osm = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxNativeZoom: 19,
      maxZoom: MAX_ZOOM,
    });

    // Transparent overlay of signed MTB routes (OSM route relations).
    const mtbRoutes = L.tileLayer("https://tile.waymarkedtrails.org/mtb/{z}/{x}/{y}.png", {
      attribution: "MTB routes © waymarkedtrails.org",
      maxNativeZoom: 18,
      maxZoom: MAX_ZOOM,
      opacity: 0.9,
    });

    L.control
      .layers(
        { "Satellite (Esri)": satellite, "Trail map (CyclOSM)": cyclosm, OpenStreetMap: osm },
        { "MTB routes (Waymarked)": mtbRoutes },
        { collapsed: true }
      )
      .addTo(map);

    setZoom(map.getZoom());
    map.on("zoomend", () => setZoom(map.getZoom()));

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Draw the ride track + (re)bind the map click handler when the track changes.
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

  async function loadTrails() {
    const map = mapRef.current;
    if (!map) return;
    setTrails({ loading: true, count: null, error: null });
    try {
      const b = map.getBounds();
      const ways = await fetchTrails({
        south: b.getSouth(),
        west: b.getWest(),
        north: b.getNorth(),
        east: b.getEast(),
      });
      trailsRef.current?.remove();
      const group = L.layerGroup();
      for (const w of ways) {
        const label = [w.name ?? w.highway, w.mtbScale ? `mtb:${w.mtbScale}` : null]
          .filter(Boolean)
          .join(" · ");
        L.polyline(w.latlngs, { color: "#19e6ff", weight: 2, opacity: 0.85 })
          .bindTooltip(label, { sticky: true })
          .addTo(group);
      }
      group.addTo(map);
      trailsRef.current = group;
      lineRef.current?.bringToFront(); // keep the ride track on top
      setTrails({ loading: false, count: ways.length, error: null });
    } catch (e) {
      setTrails({ loading: false, count: null, error: String(e) });
    }
  }

  function clearTrails() {
    trailsRef.current?.remove();
    trailsRef.current = null;
    setTrails({ loading: false, count: null, error: null });
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={elRef} style={{ width: "100%", height: "100%", borderRadius: 8 }} />

      {(zoom >= MIN_TRAIL_ZOOM || trails.count != null) && (
        <div className="map-tools">
          {zoom >= MIN_TRAIL_ZOOM && (
            <button className="btn" onClick={loadTrails} disabled={trails.loading} title="Load OSM trails in view">
              {trails.loading ? "Loading trails…" : "⛰ Load trails here"}
            </button>
          )}
          {trails.count != null && (
            <span className="map-note">
              {trails.count} OSM trails
              <button className="map-note-x" onClick={clearTrails} title="Remove loaded OSM trails">
                ✕
              </button>
            </span>
          )}
          {trails.error && <span className="map-note err">trail load failed</span>}
        </div>
      )}

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
