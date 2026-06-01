// Local persistence for saved rides (IndexedDB). Stores the GPS track + clip
// metadata + per-clip sync. Video bytes are NOT stored — each clip keeps either
// a File System Access handle (desktop Chrome/Edge, auto-reopen) or just its
// identity so the file can be re-attached on other browsers.

import type { LatLng } from "./sync";

/** Minimal shape of a File System Access handle (types not in default lib.dom). */
export interface FileHandleLike {
  name: string;
  getFile(): Promise<File>;
  queryPermission?(desc: { mode: "read" | "readwrite" }): Promise<PermissionState>;
  requestPermission?(desc: { mode: "read" | "readwrite" }): Promise<PermissionState>;
}

export interface PersistedClip {
  id: string;
  label: string;
  fileName: string;
  fileSize: number;
  durationS: number | null;
  videoStartEpoch: number | null;
  offsetSeconds: number;
  handle: FileHandleLike | null;
}

export interface RideRecord {
  id: string;
  name: string;
  startEpoch: number;
  distanceM: number;
  track: { time: number[]; latlng: LatLng[]; velocity?: number[] };
  clips: PersistedClip[];
  updatedAt: number;
}

export interface RideSummary {
  id: string;
  name: string;
  startEpoch: number;
  distanceM: number;
  clipCount: number;
  updatedAt: number;
}

const DB_NAME = "handlebars";
const STORE = "rides";
const VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      })
  );
}

export function saveRide(record: RideRecord): Promise<IDBValidKey> {
  return tx("readwrite", (s) => s.put(record));
}

export function getRide(id: string): Promise<RideRecord | undefined> {
  return tx("readonly", (s) => s.get(id) as IDBRequest<RideRecord | undefined>);
}

export function deleteRide(id: string): Promise<undefined> {
  return tx("readwrite", (s) => s.delete(id) as IDBRequest<undefined>);
}

export async function listRides(): Promise<RideSummary[]> {
  const all = await tx("readonly", (s) => s.getAll() as IDBRequest<RideRecord[]>);
  return all
    .map((r) => ({
      id: r.id,
      name: r.name,
      startEpoch: r.startEpoch,
      distanceM: r.distanceM,
      clipCount: r.clips.length,
      updatedAt: r.updatedAt,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
