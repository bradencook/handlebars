import { useState } from "react";
import { parseGpx, GpxError, type ParsedRide } from "../lib/gpx";
import type { RideSummary } from "../lib/db";

interface Props {
  rideName: string;
  onNameChange: (name: string) => void;
  hasTrack: boolean;
  onLoadGpx: (ride: ParsedRide) => void;
  onSave: () => void;
  saving: boolean;
  dirty: boolean;
  savedRides: RideSummary[];
  currentId: string;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}

export function RideBar({
  rideName,
  onNameChange,
  hasTrack,
  onLoadGpx,
  onSave,
  saving,
  dirty,
  savedRides,
  currentId,
  onOpen,
  onDelete,
}: Props) {
  const [error, setError] = useState<string | null>(null);

  async function pickGpx(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      onLoadGpx(parseGpx(await file.text(), file.name));
    } catch (err) {
      setError(err instanceof GpxError ? err.message : `Couldn't read that file (${String(err)}).`);
    }
    e.target.value = ""; // allow re-picking the same file
  }

  return (
    <div className="panel ridebar">
      <label className="btn primary">
        Load ride (.gpx)
        <input type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml" onChange={pickGpx} style={{ display: "none" }} />
      </label>

      {hasTrack && (
        <>
          <input
            type="text"
            value={rideName}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Ride name"
            style={{ padding: "6px 8px", minWidth: 180 }}
          />
          <button className="btn" onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : dirty ? "Save ride •" : "Saved ✓"}
          </button>
        </>
      )}

      <span style={{ flex: 1 }} />

      {savedRides.length > 0 && (
        <select
          value={savedRides.some((r) => r.id === currentId) ? currentId : ""}
          onChange={(e) => e.target.value && onOpen(e.target.value)}
          style={{ padding: "6px 8px" }}
        >
          <option value="">Open saved ride…</option>
          {savedRides.map((r) => (
            <option key={r.id} value={r.id}>
              {new Date(r.startEpoch * 1000).toLocaleDateString()} — {r.name} ({r.clipCount} clip
              {r.clipCount === 1 ? "" : "s"})
            </option>
          ))}
        </select>
      )}
      {savedRides.some((r) => r.id === currentId) && (
        <button className="btn" title="Delete this saved ride" onClick={() => onDelete(currentId)}>
          🗑
        </button>
      )}

      {error && <span style={{ color: "#f66", fontSize: 12 }}>{error}</span>}
    </div>
  );
}
