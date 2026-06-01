// Parse a GPX file (Strava/Garmin/Wahoo export) into a Track for syncing.
// No dependency — GPX is XML, so the browser's DOMParser handles it.

import type { LatLng, Track } from "./sync";

export interface ParsedRide {
  track: Track;
  name: string;
  /** ISO start time of the ride. */
  startIso: string;
  /** Total distance in meters (derived from the points). */
  distanceM: number;
}

export class GpxError extends Error {}

export function parseGpx(xml: string, fallbackName = "ride.gpx"): ParsedRide {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) throw new GpxError("That doesn't look like valid GPX/XML.");

  const trkpts = Array.from(doc.getElementsByTagName("trkpt"));
  if (!trkpts.length) throw new GpxError("No track points found in this GPX file.");

  const latlng: LatLng[] = [];
  const epochs: number[] = []; // absolute seconds per point

  for (const pt of trkpts) {
    const lat = parseFloat(pt.getAttribute("lat") ?? "");
    const lon = parseFloat(pt.getAttribute("lon") ?? "");
    const timeText = pt.getElementsByTagName("time")[0]?.textContent;
    if (Number.isNaN(lat) || Number.isNaN(lon) || !timeText) continue;
    const ms = Date.parse(timeText);
    if (Number.isNaN(ms)) continue;
    latlng.push([lat, lon]);
    epochs.push(ms / 1000);
  }

  if (latlng.length < 2) {
    throw new GpxError(
      "This GPX has no per-point timestamps, so it can't be time-synced to video. " +
        "Export an *activity* (recorded ride), not a route."
    );
  }

  const startEpoch = epochs[0];
  const time = epochs.map((e) => e - startEpoch);

  // Derive speed (m/s) from consecutive points — GPX has no velocity stream.
  const velocity = new Array<number>(latlng.length);
  let distanceM = 0;
  velocity[0] = 0;
  for (let i = 1; i < latlng.length; i++) {
    const d = haversineM(latlng[i - 1], latlng[i]);
    distanceM += d;
    const dt = time[i] - time[i - 1];
    velocity[i] = dt > 0 ? d / dt : velocity[i - 1];
  }
  velocity[0] = velocity[1] ?? 0;

  const name =
    doc.getElementsByTagName("trk")[0]?.getElementsByTagName("name")[0]?.textContent ||
    doc.getElementsByTagName("name")[0]?.textContent ||
    fallbackName;

  return {
    track: { startEpoch, time, latlng, velocity },
    name,
    startIso: new Date(startEpoch * 1000).toISOString(),
    distanceM,
  };
}

function haversineM(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * toRad;
  const dLon = (b[1] - a[1]) * toRad;
  const la1 = a[0] * toRad;
  const la2 = b[0] * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
