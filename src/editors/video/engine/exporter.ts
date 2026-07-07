import {
  AudioBufferSource,
  BufferTarget,
  CanvasSink,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  canEncodeVideo,
  type VideoCodec,
  type WrappedCanvas,
} from "mediabunny";
import {
  clipEnd,
  clipSpeed,
  projectDuration,
  sourceTimeAt,
  trackAudible,
  transitionTail,
  type Clip,
  type VideoProject,
} from "@/editors/video/videoModel";
import { getMedia } from "@/editors/video/engine/mediaCache";
import {
  paintProjectFrame,
  visualClipsAt,
  type FrameSource,
} from "@/editors/video/engine/compositor";

export interface ExportOptions {
  width: number;
  height: number;
  codec: VideoCodec;
  videoBitrate: number; // bits per second
  audioBitrate: number;
}

export interface ExportProgress {
  progress: number; // 0..1
  cancelled: boolean;
}

/** Estimated output size in bytes for the dialog. */
export function estimateSize(project: VideoProject, opts: ExportOptions): number {
  return ((opts.videoBitrate + opts.audioBitrate) * projectDuration(project)) / 8;
}

export async function pickCodec(width: number, height: number): Promise<VideoCodec[]> {
  const usable: VideoCodec[] = [];
  for (const codec of ["avc", "vp9", "av1"] as VideoCodec[]) {
    if (await canEncodeVideo(codec, { width, height })) usable.push(codec);
  }
  return usable;
}

/**
 * Sequential frame reader over a clip's ORIGINAL (non-proxy) video: pulls
 * decoded frames forward as the export playhead advances.
 */
class ExportClipReader {
  private iter: AsyncGenerator<WrappedCanvas, void, unknown> | null = null;
  private current: WrappedCanvas | null = null;
  private next: WrappedCanvas | null = null;
  private sink: CanvasSink;

  constructor(
    videoTrack: ConstructorParameters<typeof CanvasSink>[0],
    private from: number,
    private to: number,
  ) {
    this.sink = new CanvasSink(videoTrack, { poolSize: 2 });
  }

  async frameAt(sourceTime: number): Promise<FrameSource | null> {
    if (!this.iter) {
      this.iter = this.sink.canvases(this.from, this.to);
      this.next = (await this.iter.next()).value ?? null;
    }
    while (this.next && this.next.timestamp <= sourceTime) {
      this.current = this.next;
      this.next = (await this.iter.next()).value ?? null;
    }
    return this.current?.canvas ?? null;
  }

  async dispose(): Promise<void> {
    await this.iter?.return();
  }
}

/** Decode a clip's audio window into one AudioBuffer for offline mixing. */
async function clipAudioBuffer(clip: Clip): Promise<AudioBuffer | null> {
  const handle = getMedia(clip.sourceId);
  if (!handle?.audio) return null;
  const chunks: { buffer: AudioBuffer; timestamp: number }[] = [];
  for await (const wb of handle.audio.buffers(clip.inPoint, clip.outPoint)) {
    chunks.push({ buffer: wb.buffer, timestamp: wb.timestamp });
  }
  if (chunks.length === 0) return null;
  const sampleRate = chunks[0].buffer.sampleRate;
  const channels = Math.max(...chunks.map((c) => c.buffer.numberOfChannels));
  const length = Math.max(1, Math.ceil((clip.outPoint - clip.inPoint) * sampleRate));
  const out = new AudioBuffer({ length, numberOfChannels: channels, sampleRate });
  for (const { buffer, timestamp } of chunks) {
    const offset = Math.max(0, Math.round((timestamp - clip.inPoint) * sampleRate));
    for (let ch = 0; ch < channels; ch += 1) {
      const src = buffer.getChannelData(Math.min(ch, buffer.numberOfChannels - 1));
      out.copyToChannel(src.subarray(0, Math.max(0, length - offset)), ch, offset);
    }
  }
  return out;
}

/** Mix every audible clip into one AudioBuffer with fades/volume/speed applied. */
async function renderAudio(project: VideoProject, duration: number): Promise<AudioBuffer | null> {
  const sampleRate = 48000;
  const clips = project.clips.filter((c) => {
    const track = project.tracks.find((t) => t.id === c.trackId);
    const handle = getMedia(c.sourceId);
    return track && trackAudible(project, track) && c.volume > 0 && handle?.audio;
  });
  if (clips.length === 0) return null;
  const octx = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate);
  for (const clip of clips) {
    const buffer = await clipAudioBuffer(clip);
    if (!buffer) continue;
    const node = octx.createBufferSource();
    node.buffer = buffer;
    node.playbackRate.value = clipSpeed(clip);
    const gain = octx.createGain();
    node.connect(gain);
    gain.connect(octx.destination);
    const g = gain.gain;
    const start = clip.start;
    const end = clipEnd(clip);
    g.setValueAtTime(clip.fadeIn ? 0 : clip.volume, Math.max(0, start));
    if (clip.fadeIn) g.linearRampToValueAtTime(clip.volume, start + clip.fadeIn);
    if (clip.fadeOut) {
      g.setValueAtTime(clip.volume, Math.max(0, end - clip.fadeOut));
      g.linearRampToValueAtTime(0, end);
    }
    node.start(Math.max(0, start));
    node.stop(Math.min(duration, end));
  }
  return octx.startRendering();
}

/**
 * Render the project to an MP4 via hardware WebCodecs encode. Renders at the
 * export resolution with the same compositor as the preview, but always from
 * ORIGINAL media (never proxies).
 */
export async function exportProject(
  project: VideoProject,
  opts: ExportOptions,
  onProgress: (p: number) => void,
  state: ExportProgress,
): Promise<Uint8Array | null> {
  const duration = projectDuration(project);
  if (duration <= 0) return null;
  const fps = project.fps;
  const frameCount = Math.ceil(duration * fps);

  const canvas = document.createElement("canvas");
  canvas.width = opts.width;
  canvas.height = opts.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
  const videoSource = new CanvasSource(canvas, { codec: opts.codec, bitrate: opts.videoBitrate });
  output.addVideoTrack(videoSource);

  const mixed = await renderAudio(project, duration);
  const audioSource = mixed ? new AudioBufferSource({ codec: "aac", bitrate: opts.audioBitrate }) : null;
  if (audioSource) output.addAudioTrack(audioSource);

  await output.start();

  const readers = new Map<string, ExportClipReader>();
  const readerFor = (clip: Clip): ExportClipReader | null => {
    const existing = readers.get(clip.id);
    if (existing) return existing;
    const handle = getMedia(clip.sourceId);
    if (!handle?.videoTrack) return null;
    const reader = new ExportClipReader(
      handle.videoTrack,
      clip.inPoint,
      clip.outPoint + transitionTail(project, clip),
    );
    readers.set(clip.id, reader);
    return reader;
  };

  try {
    // Scale project space onto the export canvas (letterbox on aspect mismatch).
    const scale = Math.min(opts.width / project.width, opts.height / project.height);
    const tx = (opts.width - project.width * scale) / 2;
    const ty = (opts.height - project.height * scale) / 2;

    for (let f = 0; f < frameCount; f += 1) {
      if (state.cancelled) {
        await output.cancel();
        return null;
      }
      const t = f / fps;
      const frames = new Map<string, FrameSource>();
      for (const clip of visualClipsAt(project, t)) {
        const handle = getMedia(clip.sourceId);
        if (handle?.bitmap) {
          frames.set(clip.id, handle.bitmap);
        } else {
          const frame = await readerFor(clip)?.frameAt(sourceTimeAt(clip, t));
          if (frame) frames.set(clip.id, frame);
        }
      }
      // Readers for clips that ended stay cached; their decoders idle harmlessly.
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, opts.width, opts.height);
      ctx.setTransform(scale, 0, 0, scale, tx, ty);
      paintProjectFrame(ctx, project, t, (clip) => frames.get(clip.id) ?? null);
      await videoSource.add(t, 1 / fps);
      onProgress((f / frameCount) * (mixed ? 0.92 : 1));
    }

    if (audioSource && mixed) {
      await audioSource.add(mixed);
      onProgress(0.97);
    }
    await output.finalize();
    onProgress(1);
    const buffer = output.target.buffer;
    return buffer ? new Uint8Array(buffer) : null;
  } catch (err) {
    if (output.state === "started") await output.cancel();
    throw err;
  } finally {
    for (const reader of readers.values()) void reader.dispose();
  }
}
