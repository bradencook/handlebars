// Read a video's embedded recording start time (UTC epoch seconds) from the
// QuickTime/MP4 `moov → mvhd` atom — no dependency, works in the browser.
//
// Only small header ranges are read via File.slice, so this stays cheap even
// for multi-GB GoPro files (where `moov` may sit at the very end).

import type { FileHandleLike } from "./db";

const EPOCH_1904 = 2082844800; // seconds between 1904-01-01 and 1970-01-01 (UTC)

export interface PickedVideo {
  file: File;
  /** Present on desktop Chrome/Edge — lets a saved clip auto-reopen later. */
  handle: FileHandleLike | null;
}

/** True when the browser can persist a re-openable handle to a chosen file. */
export function canUseFileHandles(): boolean {
  return typeof (window as any).showOpenFilePicker === "function";
}

/**
 * Pick a video via the File System Access API (so we get a persistable handle).
 * Returns null if the API is unavailable (caller should fall back to <input>)
 * or the user cancels.
 */
export async function pickVideoFile(): Promise<PickedVideo | null> {
  const picker = (window as any).showOpenFilePicker;
  if (typeof picker !== "function") return null;
  try {
    const [handle] = await picker.call(window, {
      multiple: false,
      types: [{ description: "Video", accept: { "video/*": [".mp4", ".mov", ".m4v", ".webm"] } }],
    });
    const file = await handle.getFile();
    return { file, handle };
  } catch {
    return null; // user cancelled
  }
}

/** Read a video's duration (seconds) without playing it. */
export function readDuration(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => resolve(Number.isFinite(v.duration) ? v.duration : null);
    v.onerror = () => resolve(null);
    v.src = url;
  });
}

function atomType(dv: DataView, off: number): string {
  return String.fromCharCode(
    dv.getUint8(off),
    dv.getUint8(off + 1),
    dv.getUint8(off + 2),
    dv.getUint8(off + 3)
  );
}

/** Returns recording start as UTC epoch seconds, or null if not found. */
export async function readVideoStartEpoch(file: File): Promise<number | null> {
  try {
    const size = file.size;
    let off = 0;
    while (off + 8 <= size) {
      const head = new DataView(await file.slice(off, off + 16).arrayBuffer());
      let atomSize = head.getUint32(0);
      const type = atomType(head, 4);
      let header = 8;
      if (atomSize === 1) {
        atomSize = Number(head.getBigUint64(8));
        header = 16;
      } else if (atomSize === 0) {
        atomSize = size - off;
      }
      if (type === "moov") {
        const moov = new DataView(await file.slice(off + header, off + atomSize).arrayBuffer());
        const creation = findMvhdCreation(moov);
        if (creation == null) return null;
        const epoch = creation - EPOCH_1904;
        // Sanity: reject obviously bogus (pre-2000) values.
        return epoch > 946684800 ? epoch : null;
      }
      if (atomSize <= 0) break;
      off += atomSize;
    }
    return null;
  } catch {
    return null;
  }
}

function findMvhdCreation(dv: DataView): number | null {
  let off = 0;
  while (off + 8 <= dv.byteLength) {
    let atomSize = dv.getUint32(off);
    const type = atomType(dv, off + 4);
    let header = 8;
    if (atomSize === 1) {
      atomSize = Number(dv.getBigUint64(off + 8));
      header = 16;
    } else if (atomSize === 0) {
      atomSize = dv.byteLength - off;
    }
    if (type === "mvhd") {
      const p = off + header;
      const version = dv.getUint8(p);
      return version === 1 ? Number(dv.getBigUint64(p + 4)) : dv.getUint32(p + 4);
    }
    if (atomSize <= 0) break;
    off += atomSize;
  }
  return null;
}
