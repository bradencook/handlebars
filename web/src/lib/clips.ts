// Runtime clip model + conversion to/from the persisted form.

import type { PersistedClip } from "./db";

/** A clip as held in app state (adds a playable URL + attach status). */
export interface ClipEntry extends PersistedClip {
  /** Object URL for playback this session, or null if not attached yet. */
  url: string | null;
  /** True for a saved clip whose file isn't available yet (needs re-picking). */
  needsReattach: boolean;
}

/** Strip the runtime-only fields before saving. */
export function persistClip(c: ClipEntry): PersistedClip {
  const { url: _url, needsReattach: _needsReattach, ...rest } = c;
  return rest;
}

/**
 * Re-open a saved clip: if it has a File System Access handle, request read
 * permission and rebuild a playable URL. Must be called within a user gesture
 * (so the permission prompt is allowed).
 */
export async function reopenClip(p: PersistedClip): Promise<ClipEntry> {
  let url: string | null = null;
  let needsReattach = true;
  if (p.handle) {
    try {
      let perm = (await p.handle.queryPermission?.({ mode: "read" })) ?? "prompt";
      if (perm !== "granted") {
        perm = (await p.handle.requestPermission?.({ mode: "read" })) ?? "denied";
      }
      if (perm === "granted") {
        url = URL.createObjectURL(await p.handle.getFile());
        needsReattach = false;
      }
    } catch {
      /* fall through — user will re-attach manually */
    }
  }
  return { ...p, url, needsReattach };
}
