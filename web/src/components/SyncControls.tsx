import type { LatLng } from "../lib/sync";
import { fmtMps } from "../lib/sync";

interface Props {
  offset: number;
  onOffsetChange: (offset: number) => void;
  /** Total ride duration (s) — bounds the offset range. */
  duration: number;
  elapsed: number | null;
  position: LatLng | null;
  speed: number | null;
  alignMode: boolean;
  onToggleAlign: () => void;
  follow: boolean;
  onToggleFollow: () => void;
  /** Offset implied by the video's embedded clock, or null if unreadable. */
  autoOffset: number | null;
  onUseAuto: () => void;
  disabled: boolean;
}

export function SyncControls({
  offset,
  onOffsetChange,
  duration,
  elapsed,
  position,
  speed,
  alignMode,
  onToggleAlign,
  follow,
  onToggleFollow,
  autoOffset,
  onUseAuto,
  disabled,
}: Props) {
  const max = Math.max(60, Math.ceil(duration));
  const autoApplied = autoOffset != null && Math.abs(autoOffset - offset) < 0.6;
  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button
          className={`btn ${alignMode ? "primary" : ""}`}
          onClick={onToggleAlign}
          disabled={disabled}
        >
          {alignMode ? "Click the map…" : "📍 Align to map"}
        </button>

        <label style={{ fontSize: 13, color: "#ccc", whiteSpace: "nowrap" }}>
          Offset
          <input
            type="number"
            step={0.1}
            value={Number.isFinite(offset) ? Number(offset.toFixed(1)) : 0}
            onChange={(e) => onOffsetChange(parseFloat(e.target.value) || 0)}
            disabled={disabled}
            style={{ width: 90, marginLeft: 6, padding: "4px 6px" }}
          />
          <span style={{ marginLeft: 4, color: "#888" }}>s</span>
        </label>

        <input
          type="range"
          min={-max}
          max={max}
          step={0.5}
          value={Math.max(-max, Math.min(max, offset))}
          onChange={(e) => onOffsetChange(parseFloat(e.target.value))}
          disabled={disabled}
          style={{ flex: 1, minWidth: 160 }}
        />
        <button className="btn" onClick={() => onOffsetChange(0)} disabled={disabled}>
          reset
        </button>

        <label style={{ fontSize: 13, color: "#ccc", display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={follow} onChange={onToggleFollow} />
          Follow pin
        </label>
      </div>

      {autoOffset != null && (
        <div style={{ fontSize: 12, color: autoApplied ? "#5ad17a" : "#ccc" }}>
          {autoApplied ? "✓ " : ""}Clock-synced from the video's timestamp ({autoOffset >= 0 ? "+" : ""}
          {fmtClock(autoOffset)}).
          {!autoApplied && (
            <button className="btn" style={{ marginLeft: 8, padding: "2px 8px" }} onClick={onUseAuto}>
              re-apply
            </button>
          )}
        </div>
      )}

      <div style={{ fontSize: 12, color: "#888" }}>
        {autoOffset == null && "No timestamp in this video — "}
        pause on a spot you recognize, hit <strong>Align to map</strong>, then click that
        spot on the trail. Fine-tune with the offset.
        <span style={{ marginLeft: 12 }}>
          {elapsed != null && <>ride&nbsp;time <strong>{fmtClock(elapsed)}</strong></>}
          {position && (
            <> · <strong>{position[0].toFixed(5)}, {position[1].toFixed(5)}</strong></>
          )}
          {speed != null && <> · {fmtMps(speed)}</>}
        </span>
      </div>
    </div>
  );
}

function fmtClock(s: number): string {
  const sign = s < 0 ? "-" : "";
  const a = Math.abs(Math.round(s));
  const m = Math.floor(a / 60);
  const sec = a % 60;
  return `${sign}${m}:${String(sec).padStart(2, "0")}`;
}
