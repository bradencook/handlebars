// Read a video's embedded recording start time (UTC epoch seconds) from the
// QuickTime/MP4 `moov → mvhd` atom — no dependency, works in the browser.
//
// Only small header ranges are read via File.slice, so this stays cheap even
// for multi-GB GoPro files (where `moov` may sit at the very end).

const EPOCH_1904 = 2082844800; // seconds between 1904-01-01 and 1970-01-01 (UTC)

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
