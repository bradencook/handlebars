import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RideBar } from "./components/RideBar";
import { MapView } from "./components/MapView";
import { VideoPlayer } from "./components/VideoPlayer";
import { SyncControls } from "./components/SyncControls";
import { ClipStrip } from "./components/ClipStrip";
import type { ParsedRide } from "./lib/gpx";
import { interpolateLatLng, interpolateSpeed, type LatLng, type Track } from "./lib/sync";
import { canUseFileHandles, pickVideoFile, readDuration, readVideoStartEpoch } from "./lib/videoMeta";
import { persistClip, reopenClip, type ClipEntry } from "./lib/clips";
import {
  deleteRide,
  getRide,
  listRides,
  saveRide,
  type FileHandleLike,
  type RideRecord,
  type RideSummary,
} from "./lib/db";

type Chosen = { file: File; handle: FileHandleLike | null };

export default function App() {
  const [rideId, setRideId] = useState<string>(() => crypto.randomUUID());
  const [rideName, setRideName] = useState("");
  const [track, setTrack] = useState<Track | null>(null);
  const [distanceM, setDistanceM] = useState(0);
  const [clips, setClips] = useState<ClipEntry[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [videoTime, setVideoTime] = useState(0);
  const [alignMode, setAlignMode] = useState(false);
  const [follow, setFollow] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedRides, setSavedRides] = useState<RideSummary[]>([]);

  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const fallbackInputRef = useRef<HTMLInputElement | null>(null);
  const fallbackResolver = useRef<((v: Chosen | null) => void) | null>(null);

  useEffect(() => {
    listRides().then(setSavedRides).catch(() => {});
  }, []);

  const active = clips.find((c) => c.id === activeId) ?? null;
  const offset = active?.offsetSeconds ?? 0;
  const duration = track ? track.time[track.time.length - 1] : 0;
  const elapsed = track && active ? offset + videoTime : null;
  const position: LatLng | null =
    track && elapsed != null ? interpolateLatLng(track, elapsed) : null;
  const speed = useMemo(
    () => (track && elapsed != null ? interpolateSpeed(track, elapsed) : null),
    [track, elapsed]
  );
  const autoOffset =
    track && active?.videoStartEpoch != null ? active.videoStartEpoch - track.startEpoch : null;

  const revokeAll = (list: ClipEntry[]) =>
    list.forEach((c) => c.url && URL.revokeObjectURL(c.url));

  // --- file picking (FSA handle when available, hidden <input> fallback) ---
  const choose = useCallback(async (): Promise<Chosen | null> => {
    if (canUseFileHandles()) {
      const p = await pickVideoFile();
      return p ? { file: p.file, handle: p.handle } : null;
    }
    return new Promise<Chosen | null>((resolve) => {
      fallbackResolver.current = resolve;
      fallbackInputRef.current?.click();
    });
  }, []);

  function onFallbackInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    fallbackResolver.current?.(file ? { file, handle: null } : null);
    fallbackResolver.current = null;
    e.target.value = "";
  }

  // --- ride lifecycle ---
  function loadGpx(parsed: ParsedRide) {
    if (dirty && clips.length && !confirm("Discard unsaved changes to the current ride?")) return;
    revokeAll(clips);
    setRideId(crypto.randomUUID());
    setTrack(parsed.track);
    setRideName(parsed.name);
    setDistanceM(parsed.distanceM);
    setClips([]);
    setActiveId(null);
    setVideoTime(0);
    setDirty(true);
  }

  async function openRide(id: string) {
    if (dirty && clips.length && !confirm("Discard unsaved changes to the current ride?")) return;
    const rec = await getRide(id);
    if (!rec) return;
    revokeAll(clips);
    setRideId(rec.id);
    setRideName(rec.name);
    setTrack({ startEpoch: rec.startEpoch, time: rec.track.time, latlng: rec.track.latlng, velocity: rec.track.velocity });
    setDistanceM(rec.distanceM);
    const entries = await Promise.all(rec.clips.map(reopenClip)); // FSA permission prompt(s)
    setClips(entries);
    setActiveId(entries[0]?.id ?? null);
    setVideoTime(0);
    setDirty(false);
  }

  async function save() {
    if (!track) return;
    setSaving(true);
    const record: RideRecord = {
      id: rideId,
      name: rideName.trim() || "Untitled ride",
      startEpoch: track.startEpoch,
      distanceM,
      track: { time: track.time, latlng: track.latlng, velocity: track.velocity },
      clips: clips.map(persistClip),
      updatedAt: Date.now(),
    };
    await saveRide(record);
    setSavedRides(await listRides());
    setDirty(false);
    setSaving(false);
  }

  async function removeCurrentSaved(id: string) {
    if (!confirm("Delete this saved ride? (your video files are untouched)")) return;
    await deleteRide(id);
    setSavedRides(await listRides());
    setDirty(true); // current ride is no longer persisted
  }

  // --- clips ---
  async function addClip() {
    const c = await choose();
    if (!c) return;
    const url = URL.createObjectURL(c.file);
    const [epoch, dur] = await Promise.all([readVideoStartEpoch(c.file), readDuration(url)]);
    const clip: ClipEntry = {
      id: crypto.randomUUID(),
      label: c.file.name,
      fileName: c.file.name,
      fileSize: c.file.size,
      durationS: dur,
      videoStartEpoch: epoch,
      offsetSeconds: track && epoch != null ? epoch - track.startEpoch : 0,
      handle: c.handle,
      url,
      needsReattach: false,
    };
    setClips((cs) => [...cs, clip]);
    setActiveId(clip.id);
    setVideoTime(0);
    setDirty(true);
  }

  async function reattachClip(id: string) {
    const c = await choose();
    if (!c) return;
    const url = URL.createObjectURL(c.file);
    const dur = await readDuration(url);
    setClips((cs) =>
      cs.map((x) =>
        x.id === id
          ? { ...x, url, handle: c.handle, needsReattach: false, durationS: x.durationS ?? dur }
          : x
      )
    );
    setDirty(true);
  }

  function removeClip(id: string) {
    setClips((cs) => {
      const gone = cs.find((c) => c.id === id);
      if (gone?.url) URL.revokeObjectURL(gone.url);
      return cs.filter((c) => c.id !== id);
    });
    if (activeId === id) {
      setActiveId(null);
      setVideoTime(0);
    }
    setDirty(true);
  }

  function selectClip(id: string) {
    setActiveId(id);
    setVideoTime(0);
  }

  function setActiveOffset(v: number) {
    if (!activeId) return;
    setClips((cs) => cs.map((c) => (c.id === activeId ? { ...c, offsetSeconds: v } : c)));
    setDirty(true);
  }

  function handleReady(el: HTMLVideoElement) {
    videoElRef.current = el;
    if (active && active.durationS == null && Number.isFinite(el.duration)) {
      setClips((cs) => cs.map((c) => (c.id === active.id ? { ...c, durationS: el.duration } : c)));
    }
  }

  // Map click: align the active clip, or seek the video to that ride moment.
  const onMapPointElapsed = useCallback(
    (clickedElapsed: number) => {
      if (!active) return;
      if (alignMode) {
        setActiveOffset(clickedElapsed - videoTime);
        setAlignMode(false);
        return;
      }
      const vt = Math.max(0, clickedElapsed - active.offsetSeconds);
      if (videoElRef.current) videoElRef.current.currentTime = vt;
      setVideoTime(vt);
    },
    [active, alignMode, videoTime]
  );

  return (
    <div className="app">
      <header>
        <h1>Handlebars</h1>
        <span className="tagline">Sync your ride data with your footage.</span>
      </header>

      <RideBar
        rideName={rideName}
        onNameChange={(n) => {
          setRideName(n);
          setDirty(true);
        }}
        hasTrack={!!track}
        onLoadGpx={loadGpx}
        onSave={save}
        saving={saving}
        dirty={dirty}
        savedRides={savedRides}
        currentId={rideId}
        onOpen={openRide}
        onDelete={removeCurrentSaved}
      />

      <div className="stage">
        <section className="pane">
          <VideoPlayer
            src={active?.url ?? null}
            needsReattach={!!active?.needsReattach}
            onTime={setVideoTime}
            onReady={handleReady}
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

      <ClipStrip
        clips={clips}
        activeId={activeId}
        duration={duration}
        elapsed={elapsed}
        onAdd={addClip}
        onSelect={selectClip}
        onRemove={removeClip}
        onReattach={reattachClip}
        disabled={!track}
      />

      <SyncControls
        offset={offset}
        onOffsetChange={setActiveOffset}
        duration={duration}
        elapsed={elapsed}
        position={position}
        speed={speed}
        alignMode={alignMode}
        onToggleAlign={() => setAlignMode((v) => !v)}
        follow={follow}
        onToggleFollow={() => setFollow((v) => !v)}
        autoOffset={autoOffset}
        onUseAuto={() => autoOffset != null && setActiveOffset(autoOffset)}
        disabled={!active}
      />

      <input
        ref={fallbackInputRef}
        type="file"
        accept="video/*"
        style={{ display: "none" }}
        onChange={onFallbackInput}
      />
    </div>
  );
}
