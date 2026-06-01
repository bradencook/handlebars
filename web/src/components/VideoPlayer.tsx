interface Props {
  /** Object URL of the active clip, or null when nothing is attached. */
  src: string | null;
  /** Whether the active clip exists but its file needs re-attaching. */
  needsReattach: boolean;
  /** Notified on every playback time change (seconds into the clip). */
  onTime: (currentTime: number) => void;
  /** Receives the <video> element (so parent can seek) + its duration. */
  onReady: (el: HTMLVideoElement) => void;
}

export function VideoPlayer({ src, needsReattach, onTime, onReady }: Props) {
  if (src) {
    return (
      <video
        // key forces a fresh element when switching clips, resetting playback.
        key={src}
        src={src}
        controls
        autoPlay={false}
        onLoadedMetadata={(e) => onReady(e.currentTarget)}
        onTimeUpdate={(e) => onTime(e.currentTarget.currentTime)}
        onSeeked={(e) => onTime(e.currentTarget.currentTime)}
        style={{ width: "100%", height: "100%", background: "#000", borderRadius: 8, objectFit: "contain" }}
      />
    );
  }
  return (
    <div className="placeholder" style={{ height: "100%" }}>
      {needsReattach
        ? "This clip's file isn't attached — re-attach it in the clip strip below."
        : "Add a clip (＋ in the strip below) to sync footage with the map."}
    </div>
  );
}
