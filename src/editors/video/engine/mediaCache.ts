import {
  ALL_FORMATS,
  AudioBufferSink,
  BlobSource,
  CanvasSink,
  Input,
} from "mediabunny";
import type { MediaKind } from "@/editors/video/videoModel";

export interface MediaInfo {
  kind: MediaKind;
  duration: number;
  width: number;
  height: number;
}

export interface MediaHandle {
  id: string;
  blob: Blob;
  info: MediaInfo;
  input: Input | null;
  video: CanvasSink | null;
  audio: AudioBufferSink | null;
  bitmap: ImageBitmap | null;
  /** 720p playback proxy (attached by engine/proxy.ts once generated). */
  proxy: CanvasSink | null;
}

const handles = new Map<string, MediaHandle>();

async function openMedia(id: string, blob: Blob): Promise<MediaHandle> {
  if (blob.type.startsWith("image/")) {
    const bitmap = await createImageBitmap(blob);
    return {
      id,
      blob,
      info: { kind: "image", duration: 0, width: bitmap.width, height: bitmap.height },
      input: null,
      video: null,
      audio: null,
      bitmap,
      proxy: null,
    };
  }

  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  const videoTrack = await input.getPrimaryVideoTrack();
  const audioTrack = await input.getPrimaryAudioTrack();
  if (!videoTrack && !audioTrack) throw new Error("No decodable video or audio track found");
  const duration = await input.computeDuration();
  return {
    id,
    blob,
    info: {
      kind: videoTrack ? "video" : "audio",
      duration,
      width: videoTrack?.displayWidth ?? 0,
      height: videoTrack?.displayHeight ?? 0,
    },
    input,
    video: videoTrack ? new CanvasSink(videoTrack, { poolSize: 2 }) : null,
    audio: audioTrack ? new AudioBufferSink(audioTrack) : null,
    bitmap: null,
    proxy: null,
  };
}

/** Register a media blob under a source id and probe it. Idempotent per id. */
export async function registerMedia(id: string, blob: Blob): Promise<MediaHandle> {
  const existing = handles.get(id);
  if (existing) return existing;
  const handle = await openMedia(id, blob);
  handles.set(id, handle);
  return handle;
}

export function getMedia(id: string): MediaHandle | null {
  return handles.get(id) ?? null;
}

export function releaseMedia(id: string): void {
  const h = handles.get(id);
  if (!h) return;
  h.input?.dispose();
  h.bitmap?.close();
  handles.delete(id);
}
