// Pure sync + interpolation helpers. No React — easy to reason about and test.

export type LatLng = [number, number]; // [lat, lng]

export interface Track {
  /** Absolute UTC epoch (seconds) the ride started (first GPS point). */
  startEpoch: number;
  /** Seconds-from-start for each GPS sample. */
  time: number[];
  /** [lat, lng] for each sample. */
  latlng: LatLng[];
  /** Optional per-sample speed in m/s. */
  velocity?: number[];
}

/** Find the index i such that time[i] <= t < time[i+1] (binary search). */
function bracket(time: number[], t: number): number {
  let lo = 0;
  let hi = time.length - 1;
  if (t <= time[0]) return 0;
  if (t >= time[hi]) return hi;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (time[mid] <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * Interpolate a position along the track at `elapsed` seconds-from-start.
 * `elapsed` = offsetSeconds + video.currentTime.
 */
export function interpolateLatLng(track: Track, elapsed: number): LatLng | null {
  const { time, latlng } = track;
  if (!time.length) return null;
  const t = clamp(elapsed, time[0], time[time.length - 1]);
  const i = bracket(time, t);
  if (i >= time.length - 1) return latlng[latlng.length - 1];
  const t0 = time[i];
  const t1 = time[i + 1];
  const f = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
  const [la0, lo0] = latlng[i];
  const [la1, lo1] = latlng[i + 1];
  return [la0 + (la1 - la0) * f, lo0 + (lo1 - lo0) * f];
}

/** Interpolated speed (m/s) at `elapsed`, or null if no velocity stream. */
export function interpolateSpeed(track: Track, elapsed: number): number | null {
  const { time, velocity } = track;
  if (!velocity?.length) return null;
  const t = clamp(elapsed, time[0], time[time.length - 1]);
  const i = bracket(time, t);
  if (i >= velocity.length - 1) return velocity[velocity.length - 1];
  const f = time[i + 1] === time[i] ? 0 : (t - time[i]) / (time[i + 1] - time[i]);
  return velocity[i] + (velocity[i + 1] - velocity[i]) * f;
}

/**
 * Reverse sync: given a clicked position, find the nearest track sample and
 * return its `elapsed` (seconds-from-start). Caller maps to video time via
 * `videoTime = elapsed - offset`.
 */
export function nearestElapsed(track: Track, pos: LatLng): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < track.latlng.length; i++) {
    const d = haversineSq(track.latlng[i], pos);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return track.time[best];
}

// Cheap squared-distance proxy (good enough for nearest-point on a small area).
function haversineSq(a: LatLng, b: LatLng): number {
  const dLat = a[0] - b[0];
  const dLng = (a[1] - b[1]) * Math.cos((a[0] * Math.PI) / 180);
  return dLat * dLat + dLng * dLng;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function fmtMps(mps: number): string {
  return `${(mps * 3.6).toFixed(1)} km/h · ${(mps * 2.23694).toFixed(1)} mph`;
}
