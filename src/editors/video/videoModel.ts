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

export interface Clip {
  id: string;
  trackId: string;
  sourceId: string;
  start: number; // timeline position, seconds
  inPoint: number; // source in, seconds
  outPoint: number; // source out, seconds
  volume: number; // 0..1
}

export interface Track {
  id: string;
  kind: TrackKind;
  name: string;
  muted: boolean;
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
