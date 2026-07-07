import { del, get, keys, set } from "idb-keyval";
import { useVideoStore } from "@/editors/video/useVideoStore";
import { registerMedia } from "@/editors/video/engine/mediaCache";
import {
  serialiseProject,
  deserialiseProject,
  type SerialisedProject,
} from "@/editors/video/videoProject";
import type { VideoProject } from "@/editors/video/videoModel";

const AUTOSAVE_KEY = "video.autosave";
const MEDIA_PREFIX = "video.media.";
const AUTOSAVE_DEBOUNCE_MS = 800;

export async function storeMediaBlob(sourceId: string, blob: Blob): Promise<void> {
  await set(MEDIA_PREFIX + sourceId, blob);
}

export async function loadMediaBlob(sourceId: string): Promise<Blob | null> {
  return (await get<Blob>(MEDIA_PREFIX + sourceId)) ?? null;
}

/** Drop stored blobs no live project references any more. */
async function pruneMediaBlobs(project: VideoProject | null): Promise<void> {
  const live = new Set(project?.sources.map((s) => MEDIA_PREFIX + s.id) ?? []);
  for (const key of await keys()) {
    if (typeof key === "string" && key.startsWith(MEDIA_PREFIX) && !live.has(key)) {
      await del(key);
    }
  }
}

/**
 * Re-link a deserialised project's media from IndexedDB into the media cache.
 * Sources whose blob is gone are returned in `missing` (their clips stay —
 * they render black until relinked).
 */
export async function relinkProjectMedia(project: VideoProject): Promise<{
  project: VideoProject;
  missing: string[];
}> {
  const missing: string[] = [];
  const sources = await Promise.all(
    project.sources.map(async (s) => {
      const blob = await loadMediaBlob(s.id);
      if (!blob) {
        missing.push(s.name);
        return s;
      }
      await registerMedia(s.id, blob);
      return { ...s, url: URL.createObjectURL(blob) };
    }),
  );
  return { project: { ...project, sources }, missing };
}

export async function loadAutosave(): Promise<{
  project: VideoProject;
  missing: string[];
} | null> {
  const data = await get<SerialisedProject>(AUTOSAVE_KEY);
  if (!data) return null;
  try {
    return await relinkProjectMedia(deserialiseProject(data));
  } catch {
    return null; // corrupt or incompatible autosave — start fresh
  }
}

let timer: ReturnType<typeof setTimeout> | null = null;
let started = false;

/** Debounced autosave of every project change. Idempotent; call once from the editor. */
export function startAutosave(): void {
  if (started) return;
  started = true;
  useVideoStore.subscribe((state, prev) => {
    if (state.project === prev.project) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const project = useVideoStore.getState().project;
      if (project) {
        void set(AUTOSAVE_KEY, serialiseProject(project)).then(() => pruneMediaBlobs(project));
      } else {
        void del(AUTOSAVE_KEY);
      }
    }, AUTOSAVE_DEBOUNCE_MS);
  });
}
