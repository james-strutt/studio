import type { AudioBufferSink, CanvasSink, WrappedCanvas } from "mediabunny";
import { useVideoStore } from "@/editors/video/useVideoStore";
import {
  clipAt,
  projectDuration,
  sourceTimeAt,
  tracksOfKind,
  type Clip,
  type VideoProject,
} from "@/editors/video/videoModel";
import { getMedia } from "@/editors/video/engine/mediaCache";
import { containRect, drawClipText } from "@/editors/video/engine/renderMath";

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Pumps decoded frames for one playing clip. A `for await` over the sink's
 * sequential iterator sleeps until each frame is due, then publishes it as
 * `latest` for the composite loop to draw.
 */
class ClipVideoPlayer {
  latest: WrappedCanvas | null = null;
  private stopped = false;

  constructor(
    sink: CanvasSink,
    sourceStart: number,
    sourceEnd: number,
    private sourceNow: () => number,
  ) {
    void this.run(sink, sourceStart, sourceEnd);
  }

  private async run(sink: CanvasSink, from: number, to: number): Promise<void> {
    try {
      for await (const frame of sink.canvases(from, to)) {
        if (this.stopped) return;
        while (!this.stopped && frame.timestamp > this.sourceNow() + 0.005) await sleep(8);
        if (this.stopped) return;
        this.latest = frame;
      }
    } catch {
      // input disposed mid-iteration — player is being torn down
    }
  }

  stop(): void {
    this.stopped = true;
  }
}

/** Schedules one playing clip's audio onto the shared AudioContext clock. */
class ClipAudioPlayer {
  private stopped = false;
  private nodes: AudioBufferSourceNode[] = [];
  private gain: GainNode;

  constructor(
    sink: AudioBufferSink,
    private ctx: AudioContext,
    anchor: { ctxTime: number; sourceTime: number },
    sourceEnd: number,
    volume: number,
    private sourceNow: () => number,
  ) {
    this.gain = ctx.createGain();
    this.gain.gain.value = volume;
    this.gain.connect(ctx.destination);
    void this.run(sink, anchor, sourceEnd);
  }

  private async run(
    sink: AudioBufferSink,
    anchor: { ctxTime: number; sourceTime: number },
    sourceEnd: number,
  ): Promise<void> {
    try {
      for await (const { buffer, timestamp } of sink.buffers(anchor.sourceTime, sourceEnd)) {
        if (this.stopped) return;
        const when = anchor.ctxTime + (timestamp - anchor.sourceTime);
        const node = this.ctx.createBufferSource();
        node.buffer = buffer;
        node.connect(this.gain);
        if (when >= this.ctx.currentTime) {
          node.start(when);
        } else if (when + buffer.duration > this.ctx.currentTime) {
          node.start(this.ctx.currentTime, this.ctx.currentTime - when);
        } else {
          continue; // buffer entirely in the past
        }
        this.nodes.push(node);
        while (!this.stopped && timestamp - this.sourceNow() > 1) await sleep(100);
      }
    } catch {
      // disposed mid-iteration
    }
  }

  stop(): void {
    this.stopped = true;
    for (const n of this.nodes) {
      try {
        n.stop();
      } catch {
        // already ended
      }
    }
    this.gain.disconnect();
  }
}

interface ActivePlayer {
  video: ClipVideoPlayer | null;
  audio: ClipAudioPlayer | null;
}

class PlaybackEngine {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private raf = 0;
  private playing = false;
  private anchor = { wall: 0, playhead: 0 };
  private players = new Map<string, ActivePlayer>();
  private audioCtx: AudioContext | null = null;
  private stillToken = 0;

  attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    void this.renderStill();
  }

  detach(): void {
    this.pause();
    this.canvas = null;
    this.ctx = null;
  }

  /** The live playhead — anchored to wall clock while playing, store value while paused. */
  playheadNow(): number {
    if (!this.playing) return useVideoStore.getState().playhead;
    return this.anchor.playhead + (performance.now() / 1000 - this.anchor.wall);
  }

  play(): void {
    if (this.playing) return;
    const project = useVideoStore.getState().project;
    if (!project || projectDuration(project) === 0) return;
    let t = useVideoStore.getState().playhead;
    if (t >= projectDuration(project) - 1e-3) t = 0;
    if (!this.audioCtx) {
      try {
        this.audioCtx = new AudioContext();
      } catch {
        this.audioCtx = null; // video-only playback still works
      }
    }
    void this.audioCtx?.resume();
    this.anchor = { wall: performance.now() / 1000, playhead: t };
    this.playing = true;
    useVideoStore.getState().setPlaying(true);
    this.loop();
  }

  pause(): void {
    if (!this.playing) return;
    const t = this.playheadNow();
    this.playing = false;
    cancelAnimationFrame(this.raf);
    this.stopAllPlayers();
    useVideoStore.getState().setPlaying(false);
    useVideoStore.getState().setPlayhead(t);
    void this.renderStill();
  }

  seek(t: number): void {
    const project = useVideoStore.getState().project;
    const clamped = Math.max(0, Math.min(t, project ? projectDuration(project) : 0));
    useVideoStore.getState().setPlayhead(clamped);
    if (this.playing) {
      this.stopAllPlayers();
      this.anchor = { wall: performance.now() / 1000, playhead: clamped };
    } else {
      void this.renderStill();
    }
  }

  togglePlay(): void {
    if (this.playing) this.pause();
    else this.play();
  }

  dispose(): void {
    this.pause();
    void this.audioCtx?.close();
    this.audioCtx = null;
  }

  private stopAllPlayers(): void {
    for (const p of this.players.values()) {
      p.video?.stop();
      p.audio?.stop();
    }
    this.players.clear();
  }

  private loop = (): void => {
    if (!this.playing) return;
    const project = useVideoStore.getState().project;
    if (!project || !this.ctx) {
      this.pause();
      return;
    }
    const t = this.playheadNow();
    const duration = projectDuration(project);
    if (t >= duration) {
      useVideoStore.getState().setPlayhead(duration);
      this.pause();
      return;
    }
    useVideoStore.getState().setPlayhead(t);
    this.reconcile(project, t);
    this.drawFrame(project, t);
    this.raf = requestAnimationFrame(this.loop);
  };

  /** Start players for clips under the playhead, stop players for clips that left it. */
  private reconcile(project: VideoProject, t: number): void {
    const wanted = new Map<string, { clip: Clip; muted: boolean; visual: boolean }>();
    for (const track of project.tracks) {
      const clip = clipAt(project, track.id, t);
      if (clip) {
        wanted.set(clip.id, {
          clip,
          muted: track.muted,
          visual: track.kind === "video" || track.kind === "overlay",
        });
      }
    }
    for (const [id, p] of this.players) {
      if (!wanted.has(id)) {
        p.video?.stop();
        p.audio?.stop();
        this.players.delete(id);
      }
    }
    for (const [id, { clip, muted, visual }] of wanted) {
      if (!this.players.has(id)) this.startPlayer(clip, muted, visual, t);
    }
  }

  private startPlayer(clip: Clip, muted: boolean, visual: boolean, t: number): void {
    const handle = getMedia(clip.sourceId);
    if (!handle || handle.bitmap) {
      if (handle) this.players.set(clip.id, { video: null, audio: null });
      return; // images draw straight from the bitmap
    }
    const sourceStart = sourceTimeAt(clip, t);
    const sourceNow = (): number => sourceTimeAt(clip, this.playheadNow());
    const videoSink = visual ? (handle.proxy ?? handle.video) : null; // no video decode on audio lanes
    const video = videoSink
      ? new ClipVideoPlayer(videoSink, sourceStart, clip.outPoint, sourceNow)
      : null;
    const audio =
      handle.audio && !muted && clip.volume > 0 && this.audioCtx
        ? new ClipAudioPlayer(
            handle.audio,
            this.audioCtx,
            { ctxTime: this.audioCtx.currentTime, sourceTime: sourceStart },
            clip.outPoint,
            clip.volume,
            sourceNow,
          )
        : null;
    this.players.set(clip.id, { video, audio });
  }

  /** Composite the latest frame of every visible track onto the canvas (bottom track first). */
  private drawFrame(project: VideoProject, t: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.canvas) return;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, project.width, project.height);
    for (const track of tracksOfKind(project, "video", "overlay", "caption")) {
      const clip = clipAt(project, track.id, t);
      if (!clip) continue;
      const handle = getMedia(clip.sourceId);
      const frame = handle
        ? (handle.bitmap ?? this.players.get(clip.id)?.video?.latest?.canvas ?? null)
        : null;
      if (frame) {
        const r = containRect(frame.width, frame.height, project.width, project.height);
        ctx.drawImage(frame, r.x, r.y, r.w, r.h);
      }
      if (clip.text) drawClipText(ctx, clip.text, project.width, project.height);
    }
  }

  /**
   * Paused-state render: decode the exact frame under the playhead for each
   * visible clip (frame-accurate seek), then draw all layers atomically.
   */
  async renderStill(): Promise<void> {
    const token = ++this.stillToken;
    const project = useVideoStore.getState().project;
    const ctx = this.ctx;
    if (!project || !ctx || !this.canvas) return;
    this.canvas.width = project.width;
    this.canvas.height = project.height;
    const t = useVideoStore.getState().playhead;

    const draws: { frame?: CanvasImageSource; w?: number; h?: number; clip: Clip }[] = [];
    for (const track of tracksOfKind(project, "video", "overlay", "caption")) {
      const clip = clipAt(project, track.id, t);
      if (!clip) continue;
      const handle = getMedia(clip.sourceId);
      const sink = handle ? (handle.proxy ?? handle.video) : null;
      if (handle?.bitmap) {
        draws.push({ frame: handle.bitmap, w: handle.bitmap.width, h: handle.bitmap.height, clip });
      } else if (sink) {
        const wrapped = await sink.getCanvas(sourceTimeAt(clip, t));
        if (token !== this.stillToken) return; // superseded by a newer seek
        if (wrapped) {
          draws.push({
            frame: wrapped.canvas,
            w: wrapped.canvas.width,
            h: wrapped.canvas.height,
            clip,
          });
        } else {
          draws.push({ clip });
        }
      } else if (clip.text) {
        draws.push({ clip });
      }
    }
    if (token !== this.stillToken) return;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, project.width, project.height);
    for (const d of draws) {
      if (d.frame && d.w && d.h) {
        const r = containRect(d.w, d.h, project.width, project.height);
        ctx.drawImage(d.frame, r.x, r.y, r.w, r.h);
      }
      if (d.clip.text) drawClipText(ctx, d.clip.text, project.width, project.height);
    }
  }
}

export const playbackEngine = new PlaybackEngine();
