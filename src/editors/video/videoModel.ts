export type TrackKind = "video" | "audio" | "caption" | "overlay";
export type MediaKind = "video" | "audio" | "image";

export interface MediaSource {
  id: string;
  name: string;
  url: string; // object URL (session-scoped; blobs persisted separately)
  kind: MediaKind;
  duration: number; // seconds (0 for images)
  width: number;
  height: number;
}

export interface ClipTransform {
  x: number; // offset from centre, project px
  y: number;
  scale: number; // 1 = fitted
  rotation: number; // degrees
  opacity: number; // 0..1
}

export interface ClipText {
  content: string;
  size: number; // px at project resolution
  color: string;
  x: number; // 0..1 of project width (centre of text)
  y: number; // 0..1 of project height (baseline anchor)
  font?: string; // canvas font family
}

export interface ClipCrop {
  x: number; // fractions of the source frame
  y: number;
  w: number;
  h: number;
}

export interface PanZoom {
  fromScale: number;
  toScale: number;
  fromX: number; // offsets as fractions of project width/height
  fromY: number;
  toX: number;
  toY: number;
}

export type TransitionType = "dissolve" | "wipe" | "slide";

export interface Transition {
  type: TransitionType;
  duration: number; // seconds, measured into this clip
}

export interface Clip {
  id: string;
  trackId: string;
  sourceId: string;
  start: number; // timeline position, seconds
  inPoint: number; // source in, seconds
  outPoint: number; // source out, seconds
  volume: number; // 0..1
  fadeIn?: number; // audio fade seconds from clip start
  fadeOut?: number; // audio fade seconds before clip end
  transform?: ClipTransform;
  text?: ClipText;
  crop?: ClipCrop;
  panZoom?: PanZoom;
  transition?: Transition; // transition INTO this clip from the previous abutting clip
}

export function makeClipText(content: string): ClipText {
  return { content, size: 64, color: "#FFFFFF", x: 0.5, y: 0.82 };
}

export interface Track {
  id: string;
  kind: TrackKind;
  name: string;
  muted: boolean;
  solo?: boolean;
}

export interface Marker {
  id: string;
  time: number;
}

export interface VideoProject {
  id: string;
  name: string;
  width: number;
  height: number;
  fps: number;
  tracks: Track[];
  clips: Clip[];
  sources: MediaSource[];
  markers: Marker[];
}

export const clipDuration = (c: Clip): number => Math.max(0, c.outPoint - c.inPoint);
export const clipEnd = (c: Clip): number => c.start + clipDuration(c);

/** Total timeline length = the furthest clip end. */
export function projectDuration(project: VideoProject): number {
  return project.clips.reduce((max, c) => Math.max(max, clipEnd(c)), 0);
}

let counter = 0;
const id = (p: string): string => `${p}-${(counter += 1)}`;
export const newId = id;

/** After loading a saved project, move the id counter past every id in it. */
export function bumpIdCounterPast(project: VideoProject): void {
  const all = [
    project.id,
    ...project.tracks.map((t) => t.id),
    ...project.clips.map((c) => c.id),
    ...project.sources.map((s) => s.id),
  ];
  for (const value of all) {
    const n = Number(/-(\d+)$/.exec(value)?.[1]);
    if (Number.isFinite(n)) counter = Math.max(counter, n);
  }
}

/** Non-drop-frame timecode MM:SS:FF (HH: prepended past an hour). */
export function formatTimecode(t: number, fps: number): string {
  const fpsInt = Math.max(1, Math.round(fps));
  const totalFrames = Math.max(0, Math.round(t * fpsInt));
  const frames = totalFrames % fpsInt;
  const totalSeconds = Math.floor(totalFrames / fpsInt);
  const pad = (n: number): string => String(n).padStart(2, "0");
  const core = `${pad(Math.floor(totalSeconds / 60) % 60)}:${pad(totalSeconds % 60)}:${pad(frames)}`;
  const hours = Math.floor(totalSeconds / 3600);
  return hours > 0 ? `${pad(hours)}:${core}` : core;
}

export function emptyProject(name = "Untitled", width = 1920, height = 1080, fps = 30): VideoProject {
  return {
    id: id("proj"),
    name,
    width,
    height,
    fps,
    tracks: [
      { id: "v1", kind: "video", name: "Video 1", muted: false },
      { id: "a1", kind: "audio", name: "Audio 1", muted: false },
    ],
    clips: [],
    sources: [],
    markers: [],
  };
}

export function addMarker(project: VideoProject, time: number): VideoProject {
  return { ...project, markers: [...project.markers, { id: id("mark"), time }] };
}

export function removeMarker(project: VideoProject, markerId: string): VideoProject {
  return { ...project, markers: project.markers.filter((m) => m.id !== markerId) };
}

export function setTrackMuted(project: VideoProject, trackId: string, muted: boolean): VideoProject {
  return {
    ...project,
    tracks: project.tracks.map((t) => (t.id === trackId ? { ...t, muted } : t)),
  };
}

export function setTrackSolo(project: VideoProject, trackId: string, solo: boolean): VideoProject {
  return {
    ...project,
    tracks: project.tracks.map((t) => (t.id === trackId ? { ...t, solo } : t)),
  };
}

/** Audible = not muted, and when any track is soloed, only soloed tracks play. */
export function trackAudible(project: VideoProject, track: Track): boolean {
  if (track.muted) return false;
  const anySolo = project.tracks.some((t) => t.solo);
  return !anySolo || Boolean(track.solo);
}

export function addTrack(project: VideoProject, kind: TrackKind): VideoProject {
  const count = tracksOfKind(project, kind).length;
  const label = kind.charAt(0).toUpperCase() + kind.slice(1);
  const track: Track = { id: id(kind[0]), kind, name: `${label} ${count + 1}`, muted: false };
  return { ...project, tracks: [...project.tracks, track] };
}

/** Clamped audio fades; a fade of 0 clears the field. */
export function setClipFade(
  project: VideoProject,
  clipId: string,
  edge: "in" | "out",
  seconds: number,
): VideoProject {
  return {
    ...project,
    clips: project.clips.map((c) => {
      if (c.id !== clipId) return c;
      const s = Math.max(0, Math.min(seconds, clipDuration(c)));
      const next = { ...c };
      if (edge === "in") {
        if (s > 0) next.fadeIn = s;
        else delete next.fadeIn;
      } else if (s > 0) {
        next.fadeOut = s;
      } else {
        delete next.fadeOut;
      }
      return next;
    }),
  };
}

export function makeClip(trackId: string, sourceId: string, start: number, inPoint: number, outPoint: number): Clip {
  return { id: id("clip"), trackId, sourceId, start, inPoint, outPoint, volume: 1 };
}

/** Add a clip immutably. */
export function addClip(project: VideoProject, clip: Clip): VideoProject {
  return { ...project, clips: [...project.clips, clip] };
}

/** Move a clip to a new start time (clamped ≥ 0) and optionally another track. */
export function moveClip(project: VideoProject, clipId: string, start: number, trackId?: string): VideoProject {
  return {
    ...project,
    clips: project.clips.map((c) =>
      c.id === clipId ? { ...c, start: Math.max(0, start), trackId: trackId ?? c.trackId } : c,
    ),
  };
}

/** Trim a clip's in/out (source seconds), keeping in < out and within [0, duration]. */
export function trimClip(project: VideoProject, clipId: string, inPoint: number, outPoint: number): VideoProject {
  return {
    ...project,
    clips: project.clips.map((c) => {
      if (c.id !== clipId) return c;
      const src = project.sources.find((s) => s.id === c.sourceId);
      const max = src && src.duration > 0 ? src.duration : outPoint;
      const ni = Math.max(0, Math.min(inPoint, max - 0.01));
      const no = Math.max(ni + 0.01, Math.min(outPoint, max));
      return { ...c, inPoint: ni, outPoint: no };
    }),
  };
}

/**
 * Split a clip at an absolute timeline time. Returns the project with the clip
 * cut into two abutting clips (no-op if the time isn't strictly inside the clip).
 */
export function splitClip(project: VideoProject, clipId: string, atTime: number): VideoProject {
  const clip = project.clips.find((c) => c.id === clipId);
  if (!clip) return project;
  const offset = atTime - clip.start; // seconds into the clip
  if (offset <= 0 || offset >= clipDuration(clip)) return project;
  const cutSource = clip.inPoint + offset;
  const left: Clip = { ...clip, outPoint: cutSource };
  const right: Clip = { ...clip, id: id("clip"), start: atTime, inPoint: cutSource };
  return { ...project, clips: project.clips.flatMap((c) => (c.id === clipId ? [left, right] : [c])) };
}

export function removeClip(project: VideoProject, clipId: string): VideoProject {
  return { ...project, clips: project.clips.filter((c) => c.id !== clipId) };
}

const MIN_CLIP_SECONDS = 0.05;

/** Bounded source duration, or null for stills (images loop forever). */
function sourceDurationOf(project: VideoProject, clip: Clip): number | null {
  const src = project.sources.find((s) => s.id === clip.sourceId);
  return src && src.duration > 0 ? src.duration : null;
}

/** Drag the left edge: start and inPoint move together (media stays put on the timeline). */
export function trimClipLeft(project: VideoProject, clipId: string, newStart: number): VideoProject {
  return {
    ...project,
    clips: project.clips.map((c) => {
      if (c.id !== clipId) return c;
      const end = clipEnd(c);
      const minStart = Math.max(0, c.start - c.inPoint); // can't reveal media before source 0
      const ns = Math.min(Math.max(newStart, minStart), end - MIN_CLIP_SECONDS);
      return { ...c, start: ns, inPoint: c.inPoint + (ns - c.start) };
    }),
  };
}

/** Drag the right edge: outPoint follows, clamped to the source's end. */
export function trimClipRight(project: VideoProject, clipId: string, newEnd: number): VideoProject {
  return {
    ...project,
    clips: project.clips.map((c) => {
      if (c.id !== clipId) return c;
      const srcDur = sourceDurationOf(project, c);
      const maxOut = srcDur ?? Number.POSITIVE_INFINITY;
      const no = Math.min(Math.max(newEnd - c.start + c.inPoint, c.inPoint + MIN_CLIP_SECONDS), maxOut);
      return { ...c, outPoint: no };
    }),
  };
}

/** Delete a clip and close the gap on its own track (later clips shift left). */
export function rippleDelete(project: VideoProject, clipId: string): VideoProject {
  const clip = project.clips.find((c) => c.id === clipId);
  if (!clip) return project;
  const d = clipDuration(clip);
  const end = clipEnd(clip);
  return {
    ...project,
    clips: project.clips
      .filter((c) => c.id !== clipId)
      .map((c) =>
        c.trackId === clip.trackId && c.start >= end - 1e-9 ? { ...c, start: c.start - d } : c,
      ),
  };
}

/** Move the shared boundary of two abutting clips without moving anything else. */
export function rollEdit(
  project: VideoProject,
  leftId: string,
  rightId: string,
  time: number,
): VideoProject {
  const left = project.clips.find((c) => c.id === leftId);
  const right = project.clips.find((c) => c.id === rightId);
  if (!left || !right) return project;
  const leftSrc = sourceDurationOf(project, left);
  let t = Math.max(time, left.start + MIN_CLIP_SECONDS, right.start - right.inPoint);
  t = Math.min(t, clipEnd(right) - MIN_CLIP_SECONDS);
  if (leftSrc !== null) t = Math.min(t, left.start - left.inPoint + leftSrc);
  return {
    ...project,
    clips: project.clips.map((c) => {
      if (c.id === leftId) return { ...c, outPoint: c.inPoint + (t - c.start) };
      if (c.id === rightId) return { ...c, inPoint: c.inPoint + (t - c.start), start: t };
      return c;
    }),
  };
}

/** Slide the source window under a fixed timeline position (no-op for stills). */
export function slipClip(project: VideoProject, clipId: string, delta: number): VideoProject {
  return {
    ...project,
    clips: project.clips.map((c) => {
      if (c.id !== clipId) return c;
      const srcDur = sourceDurationOf(project, c);
      if (srcDur === null) return c;
      const d = Math.max(-c.inPoint, Math.min(delta, srcDur - c.outPoint));
      return { ...c, inPoint: c.inPoint + d, outPoint: c.outPoint + d };
    }),
  };
}

/**
 * Detach a video clip's audio onto the first audio track: the video clip is
 * silenced and a new audio clip with the same timing plays the sound.
 */
export function detachAudio(project: VideoProject, clipId: string): VideoProject {
  const clip = project.clips.find((c) => c.id === clipId);
  const audioTrack = tracksOfKind(project, "audio")[0];
  if (!clip || !audioTrack || clip.trackId === audioTrack.id) return project;
  const audioClip: Clip = {
    ...clip,
    id: id("clip"),
    trackId: audioTrack.id,
    transform: undefined,
  };
  return {
    ...project,
    clips: [...project.clips.map((c) => (c.id === clipId ? { ...c, volume: 0 } : c)), audioClip],
  };
}

/** Which clip on a track is under the playhead at `time` (last one wins on overlap). */
export function clipAt(project: VideoProject, trackId: string, time: number): Clip | null {
  let found: Clip | null = null;
  for (const c of project.clips) {
    if (c.trackId === trackId && time >= c.start && time < clipEnd(c)) found = c;
  }
  return found;
}

/** Map an absolute timeline time to a time within the clip's source media. */
export function sourceTimeAt(clip: Clip, time: number): number {
  return clip.inPoint + (time - clip.start);
}

/** End of the last clip on a track (0 for an empty track). */
export function trackEnd(project: VideoProject, trackId: string): number {
  return project.clips
    .filter((c) => c.trackId === trackId)
    .reduce((max, c) => Math.max(max, clipEnd(c)), 0);
}

export function addSource(project: VideoProject, source: MediaSource): VideoProject {
  return { ...project, sources: [...project.sources, source] };
}

/** Tracks of the given kinds in render order (array order = bottom first). */
export function tracksOfKind(project: VideoProject, ...kinds: TrackKind[]): Track[] {
  return project.tracks.filter((t) => kinds.includes(t.kind));
}

export function setClipText(project: VideoProject, clipId: string, text: ClipText | null): VideoProject {
  return {
    ...project,
    clips: project.clips.map((c) => (c.id === clipId ? { ...c, text: text ?? undefined } : c)),
  };
}

/** Patch presentation fields on one clip (undefined leaves a field alone, null clears it). */
export function patchClip(
  project: VideoProject,
  clipId: string,
  patch: {
    transform?: ClipTransform | null;
    crop?: ClipCrop | null;
    panZoom?: PanZoom | null;
    transition?: Transition | null;
    volume?: number;
  },
): VideoProject {
  return {
    ...project,
    clips: project.clips.map((c) => {
      if (c.id !== clipId) return c;
      const next = { ...c };
      for (const key of ["transform", "crop", "panZoom", "transition"] as const) {
        const value = patch[key];
        if (value === null) delete next[key];
        else if (value !== undefined) (next as Record<string, unknown>)[key] = value;
      }
      if (patch.volume !== undefined) next.volume = patch.volume;
      return next;
    }),
  };
}

const ABUT_EPSILON = 1e-6;

/** The clip on the same track that ends exactly where this clip starts. */
export function previousAbutting(project: VideoProject, clip: Clip): Clip | null {
  return (
    project.clips.find(
      (c) =>
        c.id !== clip.id &&
        c.trackId === clip.trackId &&
        Math.abs(clipEnd(c) - clip.start) < ABUT_EPSILON,
    ) ?? null
  );
}

/** 0..1 progress through the clip's incoming transition at time t, or null when outside it. */
export function transitionProgress(clip: Clip, t: number): number | null {
  if (!clip.transition || clip.transition.duration <= 0) return null;
  const p = (t - clip.start) / clip.transition.duration;
  return p >= 0 && p < 1 ? p : null;
}

/** 0..1 progress through the whole clip (for Ken Burns interpolation). */
export function clipProgress(clip: Clip, t: number): number {
  const d = clipDuration(clip);
  return d <= 0 ? 0 : Math.max(0, Math.min(1, (t - clip.start) / d));
}

/** How far past outPoint this clip's video must decode to feed the next clip's transition. */
export function transitionTail(project: VideoProject, clip: Clip): number {
  const next = project.clips.find(
    (c) =>
      c.id !== clip.id &&
      c.trackId === clip.trackId &&
      Math.abs(c.start - clipEnd(clip)) < ABUT_EPSILON &&
      c.transition,
  );
  return next?.transition?.duration ?? 0;
}

/** Get (or create) the first track of a kind. */
export function ensureTrack(
  project: VideoProject,
  kind: TrackKind,
  name: string,
): { project: VideoProject; trackId: string } {
  const existing = tracksOfKind(project, kind)[0];
  if (existing) return { project, trackId: existing.id };
  const track: Track = { id: id(kind), kind, name, muted: false };
  return { project: { ...project, tracks: [...project.tracks, track] }, trackId: track.id };
}

/** Clips of one track in start order. */
export function trackClips(project: VideoProject, trackId: string): Clip[] {
  return project.clips.filter((c) => c.trackId === trackId).sort((a, b) => a.start - b.start);
}

/** Repack a track's clips back-to-back from 0 (storyboard sequencing). */
export function packTrack(project: VideoProject, trackId: string): VideoProject {
  let cursor = 0;
  const packed = new Map<string, number>();
  for (const c of trackClips(project, trackId)) {
    packed.set(c.id, cursor);
    cursor += clipDuration(c);
  }
  return {
    ...project,
    clips: project.clips.map((c) => {
      const start = packed.get(c.id);
      return start === undefined ? c : { ...c, start };
    }),
  };
}

/** Move a clip within its track's sequence, then repack from 0. */
export function reorderTrack(
  project: VideoProject,
  trackId: string,
  fromIndex: number,
  toIndex: number,
): VideoProject {
  const clips = trackClips(project, trackId);
  if (fromIndex < 0 || fromIndex >= clips.length) return project;
  const order = [...clips];
  const [moved] = order.splice(fromIndex, 1);
  order.splice(Math.max(0, Math.min(toIndex, order.length)), 0, moved);
  let cursor = 0;
  const packed = new Map<string, number>();
  for (const c of order) {
    packed.set(c.id, cursor);
    cursor += clipDuration(c);
  }
  return {
    ...project,
    clips: project.clips.map((c) => {
      const start = packed.get(c.id);
      return start === undefined ? c : { ...c, start };
    }),
  };
}
