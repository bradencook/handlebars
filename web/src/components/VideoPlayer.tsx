import { useEffect, useRef, useState } from "react";
import { readVideoStartEpoch } from "../lib/videoMeta";

interface Props {
  /** Notified on every playback time change (seconds into the clip). */
  onTime: (currentTime: number) => void;
  /** Receives the <video> element so parent can seek it (reverse sync). */
  onReady: (el: HTMLVideoElement) => void;
  /** Embedded recording-start epoch (UTC seconds), or null if unreadable. */
  onMeta: (startEpoch: number | null) => void;
}

export function VideoPlayer({ onTime, onReady, onMeta }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");

  // Revoke object URLs to avoid leaks when swapping files.
  useEffect(() => () => { if (src) URL.revokeObjectURL(src); }, [src]);

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (src) URL.revokeObjectURL(src);
    setSrc(URL.createObjectURL(file)); // stays local — never uploaded
    setFileName(file.name);
    readVideoStartEpoch(file).then(onMeta);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <label className="btn">
          Load video…
          <input
            type="file"
            accept="video/*"
            onChange={pickFile}
            style={{ display: "none" }}
          />
        </label>
        <span style={{ color: "#aaa", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis" }}>
          {fileName || "no file loaded"}
        </span>
      </div>

      {src ? (
        <video
          ref={videoRef}
          src={src}
          controls
          onLoadedMetadata={(e) => onReady(e.currentTarget)}
          onTimeUpdate={(e) => onTime(e.currentTarget.currentTime)}
          onSeeked={(e) => onTime(e.currentTarget.currentTime)}
          style={{ width: "100%", flex: 1, minHeight: 0, background: "#000", borderRadius: 8 }}
        />
      ) : (
        <div className="placeholder" style={{ flex: 1 }}>
          Load a video file of your ride to sync it with the map.
        </div>
      )}
    </div>
  );
}
