import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  CanvasSink,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
  QUALITY_MEDIUM,
} from "mediabunny";
import { get, set } from "idb-keyval";
import { getMedia, type MediaHandle } from "@/editors/video/engine/mediaCache";
import { useVideoStore } from "@/editors/video/useVideoStore";

export const PROXY_HEIGHT = 720;
const PROXY_PREFIX = "video.proxy.";

async function attachProxy(handle: MediaHandle, blob: Blob): Promise<void> {
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error("Proxy file has no video track");
  handle.proxy = new CanvasSink(track, { poolSize: 2 });
}

/** True when this source plays through a proxy rather than the original. */
export function needsProxy(handle: MediaHandle): boolean {
  return Boolean(handle.video && handle.info.height > PROXY_HEIGHT);
}

/**
 * Ensure a 720p playback proxy for one source: reattach a stored proxy from
 * IndexedDB, else background-generate one via WebCodecs. Safe to call again.
 */
export async function ensureProxy(sourceId: string): Promise<void> {
  const handle = getMedia(sourceId);
  const setStatus = useVideoStore.getState().setProxyStatus;
  if (!handle || !needsProxy(handle) || !handle.input) {
    setStatus(sourceId, { state: "none" });
    return;
  }
  if (handle.proxy) {
    setStatus(sourceId, { state: "ready" });
    return;
  }

  const stored = await get<Blob>(PROXY_PREFIX + sourceId);
  if (stored) {
    try {
      await attachProxy(handle, stored);
      setStatus(sourceId, { state: "ready" });
      return;
    } catch {
      // stored proxy unreadable — regenerate below
    }
  }

  setStatus(sourceId, { state: "generating", progress: 0 });
  try {
    const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
    const conversion = await Conversion.init({
      input: handle.input,
      output,
      video: { height: PROXY_HEIGHT, bitrate: QUALITY_MEDIUM },
      audio: { discard: true },
    });
    conversion.onProgress = (progress): void => {
      setStatus(sourceId, { state: "generating", progress });
    };
    await conversion.execute();
    const buffer = output.target.buffer;
    if (!buffer) throw new Error("Proxy conversion produced no output");
    const blob = new Blob([buffer], { type: "video/mp4" });
    await set(PROXY_PREFIX + sourceId, blob);
    await attachProxy(handle, blob);
    setStatus(sourceId, { state: "ready" });
  } catch {
    setStatus(sourceId, { state: "failed" }); // playback falls back to the original
  }
}
