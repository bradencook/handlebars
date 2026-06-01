import type { ClipEntry } from "../lib/clips";

interface Props {
  clips: ClipEntry[];
  activeId: string | null;
  /** Ride duration (s) — the timeline scale. */
  duration: number;
  /** Current ride elapsed (s) for the playhead, or null. */
  elapsed: number | null;
  onAdd: () => void;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onReattach: (id: string) => void;
  disabled: boolean;
}

export function ClipStrip({
  clips,
  activeId,
  duration,
  elapsed,
  onAdd,
  onSelect,
  onRemove,
  onReattach,
  disabled,
}: Props) {
  const pct = (s: number) => `${Math.max(0, Math.min(1, s / duration)) * 100}%`;

  return (
    <div className="panel clipstrip">
      <div className="clipstrip-head">
        <strong style={{ fontSize: 13 }}>Clips</strong>
        <button className="btn primary" onClick={onAdd} disabled={disabled}>
          ＋ Add clip
        </button>
        {disabled && <span style={{ fontSize: 12, color: "#888" }}>load a ride first</span>}
      </div>

      {duration > 0 && clips.length > 0 && (
        <div className="timeline" title="Where each clip sits along the ride">
          {clips.map((c) => {
            const start = c.offsetSeconds;
            const end = c.offsetSeconds + (c.durationS ?? 0);
            return (
              <div
                key={c.id}
                className={`tl-seg ${c.id === activeId ? "active" : ""}`}
                style={{ left: pct(start), width: `max(3px, ${pct(end - start)})` }}
                onClick={() => onSelect(c.id)}
                title={c.label}
              />
            );
          })}
          {elapsed != null && <div className="tl-playhead" style={{ left: pct(elapsed) }} />}
        </div>
      )}

      <div className="clip-chips">
        {clips.length === 0 && (
          <span style={{ fontSize: 12, color: "#888" }}>
            No clips yet. Each clip auto-positions on the ride by its recording time.
          </span>
        )}
        {clips.map((c) => {
          const start = c.offsetSeconds;
          const end = c.offsetSeconds + (c.durationS ?? 0);
          return (
            <div
              key={c.id}
              className={`chip ${c.id === activeId ? "active" : ""} ${c.needsReattach ? "warn" : ""}`}
              onClick={() => onSelect(c.id)}
            >
              <span className="chip-label">{c.label}</span>
              <span className="chip-range">
                {fmtClock(start)}–{fmtClock(end)}
              </span>
              {c.needsReattach && (
                <button
                  className="chip-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onReattach(c.id);
                  }}
                >
                  re-attach
                </button>
              )}
              <button
                className="chip-btn"
                title="Remove clip"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(c.id);
                }}
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function fmtClock(s: number): string {
  const sign = s < 0 ? "-" : "";
  const a = Math.abs(Math.round(s));
  const h = Math.floor(a / 3600);
  const m = Math.floor((a % 3600) / 60);
  const sec = a % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${sign}${h > 0 ? h + ":" : ""}${mm}:${String(sec).padStart(2, "0")}`;
}
