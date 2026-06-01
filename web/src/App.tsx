import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RidePicker } from "./components/RidePicker";
import { MapView } from "./components/MapView";
import { VideoPlayer } from "./components/VideoPlayer";
import { SyncControls } from "./components/SyncControls";
import type { ParsedRide } from "./lib/gpx";
import { interpolateLatLng, interpolateSpeed, type LatLng } from "./lib/sync";

export default function App() {
  const [ride, setRide] = useState<ParsedRide | null>(null);
  const [offset, setOffset] = useState(0);
  const [videoTime, setVideoTime] = useState(0);
  const [alignMode, setAlignMode] = useState(false);
  const [follow, setFollow] = useState(true);
  const [videoEpoch, setVideoEpoch] = useState<number | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);

  const track = ride?.track ?? null;
  const duration = track ? track.time[track.time.length - 1] : 0;

  // Auto clock-sync: video's embedded start time vs the ride's first GPS point.
  const autoOffset =
    track && videoEpoch != null ? videoEpoch - track.startEpoch : null;
  // Apply it whenever a new ride or video makes a fresh auto-offset available.
  useEffect(() => {
    if (autoOffset != null) setOffset(autoOffset);
  }, [autoOffset]);
  const elapsed = track ? offset + videoTime : null;
  const position: LatLng | null =
    track && elapsed != null ? interpolateLatLng(track, elapsed) : null;
  const speed = useMemo(
    () => (track && elapsed != null ? interpolateSpeed(track, elapsed) : null),
    [track, elapsed]
  );

  // Clicking the map does one of two things:
  //  • align mode  → "the current video frame is HERE": offset = clicked - videoTime
  //  • normal mode → seek the video to the moment the rider was at that spot
  const onMapPointElapsed = useCallback(
    (clickedElapsed: number) => {
      if (alignMode) {
        setOffset(clickedElapsed - videoTime);
        setAlignMode(false);
        return;
      }
      const vt = Math.max(0, clickedElapsed - offset);
      if (videoElRef.current) videoElRef.current.currentTime = vt;
      setVideoTime(vt);
    },
    [alignMode, offset, videoTime]
  );

  return (
    <div className="app">
      <header>
        <h1>Handlebars</h1>
        <span className="tagline">Sync your ride data with your footage.</span>
      </header>

      <RidePicker ride={ride} onLoad={setRide} />

      <div className="stage">
        <section className="pane">
          <VideoPlayer
            onTime={setVideoTime}
            onReady={(el) => (videoElRef.current = el)}
            onMeta={setVideoEpoch}
          />
        </section>
        <section className="pane">
          <MapView
            track={track}
            position={position}
            follow={follow}
            alignMode={alignMode}
            onMapPointElapsed={onMapPointElapsed}
          />
        </section>
      </div>

      <SyncControls
        offset={offset}
        onOffsetChange={setOffset}
        duration={duration}
        elapsed={elapsed}
        position={position}
        speed={speed}
        alignMode={alignMode}
        onToggleAlign={() => setAlignMode((v) => !v)}
        follow={follow}
        onToggleFollow={() => setFollow((v) => !v)}
        autoOffset={autoOffset}
        onUseAuto={() => autoOffset != null && setOffset(autoOffset)}
        disabled={!track}
      />
    </div>
  );
}
