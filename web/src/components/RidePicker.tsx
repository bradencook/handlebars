import { useState } from "react";
import { parseGpx, GpxError, type ParsedRide } from "../lib/gpx";

interface Props {
  ride: ParsedRide | null;
  onLoad: (ride: ParsedRide) => void;
}

export function RidePicker({ ride, onLoad }: Props) {
  const [error, setError] = useState<string | null>(null);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const text = await file.text();
      onLoad(parseGpx(text, file.name));
    } catch (err) {
      setError(err instanceof GpxError ? err.message : `Couldn't read that file (${String(err)}).`);
    }
  }

  return (
    <div className="panel" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <label className="btn primary">
        Load ride (.gpx)…
        <input type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml" onChange={pick} style={{ display: "none" }} />
      </label>
      {ride ? (
        <span style={{ fontSize: 13, color: "#ccc" }}>
          <strong>{ride.name}</strong> · {new Date(ride.startIso).toLocaleString()} ·{" "}
          {(ride.distanceM / 1000).toFixed(2)} km · {ride.track.latlng.length} points
        </span>
      ) : (
        <span style={{ fontSize: 13, color: "#888" }}>
          Export an activity from Strava (··· → Export GPX), Garmin, or Wahoo.
        </span>
      )}
      {error && <span style={{ color: "#f66", fontSize: 12 }}>{error}</span>}
    </div>
  );
}
