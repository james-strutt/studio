import type { AudioBufferSink, CanvasSink, WrappedCanvas } from "mediabunny";
import { useVideoStore } from "@/editors/video/useVideoStore";
import {
  clipAt,
  clipEnd,
  clipProgress,
  previousAbutting,
  projectDuration,
  sourceTimeAt,
  trackAudible,
  tracksOfKind,
  transitionProgress,
  transitionTail,
  type Clip,
  type VideoProject,
} from "@/editors/video/videoModel";
import { getMedia } from "@/editors/video/engine/mediaCache";
import { drawClipText } from "@/editors/video/engine/renderMath";
import { computeDrawSpec, paintSpec } from "@/editors/video/engine/clipRender";

type FrameSource = ImageBitmap | HTMLCanvasElement | OffscreenCanvas;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Pumps decoded frames for one playing clip. A `for await` over the sink's
 * sequential iterator sleeps until each frame is due, then publishes it as
 * `latest` for the composite loop to draw. When the iterator ends (clip out
 * point), `latest` keeps the last frame — a free freeze for transition tails.
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

interface ClipAudioTiming {
  volume: number;
  fadeIn: number;
  fadeOut: number;
  clipStartCtx: number; // AudioContext time when the clip starts on the timeline
  clipEndCtx: number;
}

/** Piecewise gain value for a fade envelope at one moment (for mid-clip starts). */
function envelopeValueAt(timing: ClipAudioTiming, ctxTime: number): number {
  const { volume, fadeIn, fadeOut, clipStartCtx, clipEndCtx } = timing;
  if (fadeIn > 0 && ctxTime < clipStartCtx + fadeIn) {
    return (Math.max(0, ctxTime - clipStartCtx) / fadeIn) * volume;
  }
  if (fadeOut > 0 && ctxTime > clipEndCtx - fadeOut) {
    return (Math.max(0, clipEndCtx - ctxTime) / fadeOut) * volume;
  }
  return volume;
}

/** Schedules one playing clip's audio onto the shared AudioContext clock. */
class ClipAudioPlayer {
  private stopped = false;
  private nodes: AudioBufferSourceNode[] = [];
  private gain: GainNode;

  constructor(
    sink: AudioBufferSink,
    private ctx: AudioContext,
    destination: AudioNode,
    anchor: { ctxTime: number; sourceTime: number },
    sourceEnd: number,
    timing: ClipAudioTiming,
    private sourceNow: () => number,
  ) {
    this.gain = ctx.createGain();
    this.gain.connect(destination);
    const now = ctx.currentTime;
    const g = this.gain.gain;
    g.setValueAtTime(envelopeValueAt(timing, now), now);
    if (timing.fadeIn > 0 && timing.clipStartCtx + timing.fadeIn > now) {
      g.linearRampToValueAtTime(timing.volume, timing.clipStartCtx + timing.fadeIn);
    }
    if (timing.fadeOut > 0) {
      const fadeStart = timing.clipEndCtx - timing.fadeOut;
      if (fadeStart > now) g.setValueAtTime(timing.volume, fadeStart);
      g.linearRampToValueAtTime(0, timing.clipEndCtx);
    }
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
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private meterBuffer: Uint8Array<ArrayBuffer> | null = null;
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
        this.masterGain = this.audioCtx.createGain();
        this.analyser = this.audioCtx.createAnalyser();
        this.analyser.fftSize = 1024;
        this.meterBuffer = new Uint8Array(this.analyser.fftSize);
        this.masterGain.connect(this.analyser);
        this.analyser.connect(this.audioCtx.destination);
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

  /** Master output RMS level 0..1 for the meter (0 when idle). */
  masterLevel(): number {
    if (!this.playing || !this.analyser || !this.meterBuffer) return 0;
    this.analyser.getByteTimeDomainData(this.meterBuffer);
    let sum = 0;
    for (const v of this.meterBuffer) {
      const x = (v - 128) / 128;
      sum += x * x;
    }
    return Math.min(1, Math.sqrt(sum / this.meterBuffer.length) * 2);
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

  /** Clips that must be live at time t: those under the playhead plus transition tails. */
  private wantedClips(
    project: VideoProject,
    t: number,
  ): Map<string, { clip: Clip; muted: boolean; visual: boolean }> {
    const wanted = new Map<string, { clip: Clip; muted: boolean; visual: boolean }>();
    for (const track of project.tracks) {
      const clip = clipAt(project, track.id, t);
      if (!clip) continue;
      const visual = track.kind !== "audio";
      const muted = !trackAudible(project, track);
      wanted.set(clip.id, { clip, muted, visual });
      if (visual && transitionProgress(clip, t) !== null) {
        const prev = previousAbutting(project, clip);
        if (prev) wanted.set(prev.id, { clip: prev, muted, visual });
      }
    }
    return wanted;
  }

  /** Start players for wanted clips, stop players for clips that left the playhead. */
  private reconcile(project: VideoProject, t: number): void {
    const wanted = this.wantedClips(project, t);
    for (const [id, p] of this.players) {
      if (!wanted.has(id)) {
        p.video?.stop();
        p.audio?.stop();
        this.players.delete(id);
      }
    }
    for (const [id, { clip, muted, visual }] of wanted) {
      if (!this.players.has(id)) this.startPlayer(project, clip, muted, visual, t);
    }
  }

  private startPlayer(
    project: VideoProject,
    clip: Clip,
    muted: boolean,
    visual: boolean,
    t: number,
  ): void {
    const handle = getMedia(clip.sourceId);
    if (!handle || handle.bitmap) {
      if (handle) this.players.set(clip.id, { video: null, audio: null });
      return; // images draw straight from the bitmap
    }
    const sourceStart = sourceTimeAt(clip, t);
    const sourceNow = (): number => sourceTimeAt(clip, this.playheadNow());
    const videoSink = visual ? (handle.proxy ?? handle.video) : null; // no video decode on audio lanes
    const videoEnd = clip.outPoint + transitionTail(project, clip);
    const video = videoSink
      ? new ClipVideoPlayer(videoSink, sourceStart, videoEnd, sourceNow)
      : null;
    const audio =
      handle.audio && !muted && clip.volume > 0 && this.audioCtx && this.masterGain
        ? new ClipAudioPlayer(
            handle.audio,
            this.audioCtx,
            this.masterGain,
            { ctxTime: this.audioCtx.currentTime, sourceTime: sourceStart },
            clip.outPoint,
            {
              volume: clip.volume,
              fadeIn: clip.fadeIn ?? 0,
              fadeOut: clip.fadeOut ?? 0,
              clipStartCtx: this.audioCtx.currentTime + (clip.start - t),
              clipEndCtx: this.audioCtx.currentTime + (clipEnd(clip) - t),
            },
            sourceNow,
          )
        : null;
    this.players.set(clip.id, { video, audio });
  }

  /** Draw one clip (media frame + title text) with a transition effect applied. */
  private paintOne(
    ctx: CanvasRenderingContext2D,
    project: VideoProject,
    clip: Clip,
    t: number,
    frameFor: (clip: Clip) => FrameSource | null,
    alphaMult = 1,
    dxExtra = 0,
  ): void {
    const frame = frameFor(clip);
    if (frame) {
      const spec = computeDrawSpec(
        clip,
        frame.width,
        frame.height,
        project.width,
        project.height,
        clipProgress(clip, t),
      );
      paintSpec(ctx, frame, spec, alphaMult, dxExtra);
    }
    if (clip.text) {
      ctx.save();
      ctx.globalAlpha = alphaMult;
      ctx.translate(dxExtra, 0);
      drawClipText(ctx, clip.text, project.width, project.height);
      ctx.restore();
    }
  }

  /** Composite all visual tracks at time t (bottom track first), honouring transitions. */
  private paintTracks(
    ctx: CanvasRenderingContext2D,
    project: VideoProject,
    t: number,
    frameFor: (clip: Clip) => FrameSource | null,
  ): void {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, project.width, project.height);
    for (const track of tracksOfKind(project, "video", "overlay", "caption")) {
      const incoming = clipAt(project, track.id, t);
      if (!incoming) continue;
      const p = transitionProgress(incoming, t);
      if (p === null) {
        this.paintOne(ctx, project, incoming, t, frameFor);
        continue;
      }
      const prev = previousAbutting(project, incoming);
      if (prev) this.paintOne(ctx, project, prev, t, frameFor);
      const type = incoming.transition?.type;
      if (type === "wipe") {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, project.width * p, project.height);
        ctx.clip();
        this.paintOne(ctx, project, incoming, t, frameFor);
        ctx.restore();
      } else if (type === "slide") {
        this.paintOne(ctx, project, incoming, t, frameFor, 1, (1 - p) * project.width);
      } else {
        this.paintOne(ctx, project, incoming, t, frameFor, p); // dissolve
      }
    }
  }

  private drawFrame(project: VideoProject, t: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.canvas) return;
    this.paintTracks(ctx, project, t, (clip) => {
      const handle = getMedia(clip.sourceId);
      if (!handle) return null;
      return handle.bitmap ?? this.players.get(clip.id)?.video?.latest?.canvas ?? null;
    });
  }

  /**
   * Paused-state render: decode the exact frame under the playhead for every
   * visible clip (frame-accurate seek), then composite atomically.
   */
  async renderStill(): Promise<void> {
    const token = ++this.stillToken;
    const project = useVideoStore.getState().project;
    const ctx = this.ctx;
    if (!project || !ctx || !this.canvas) return;
    this.canvas.width = project.width;
    this.canvas.height = project.height;
    const t = useVideoStore.getState().playhead;

    const frames = new Map<string, FrameSource>();
    for (const { clip, visual } of this.wantedClips(project, t).values()) {
      if (!visual) continue;
      const handle = getMedia(clip.sourceId);
      if (!handle) continue;
      if (handle.bitmap) {
        frames.set(clip.id, handle.bitmap);
        continue;
      }
      const sink = handle.proxy ?? handle.video;
      if (!sink) continue;
      const wrapped = await sink.getCanvas(sourceTimeAt(clip, t));
      if (token !== this.stillToken) return; // superseded by a newer seek
      if (wrapped) frames.set(clip.id, wrapped.canvas);
    }
    if (token !== this.stillToken) return;
    this.paintTracks(ctx, project, t, (clip) => frames.get(clip.id) ?? null);
  }
}

export const playbackEngine = new PlaybackEngine();
