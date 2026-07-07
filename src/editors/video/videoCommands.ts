import { z } from "zod";
import { registerCommand } from "@/commands/registry";
import { getFileService } from "@/files/fileService";
import { useVideoStore } from "@/editors/video/useVideoStore";
import { registerMedia } from "@/editors/video/engine/mediaCache";
import { playbackEngine } from "@/editors/video/engine/playback";
import { ensureProxy } from "@/editors/video/engine/proxy";
import { storeMediaBlob, relinkProjectMedia } from "@/editors/video/videoPersistence";
import { serialiseProject, deserialiseProject } from "@/editors/video/videoProject";
import {
  addClip,
  addMarker,
  addSource,
  clipEnd,
  detachAudio,
  makeClip,
  moveClip,
  newId,
  removeClip,
  removeMarker,
  rippleDelete,
  rollEdit,
  setTrackMuted,
  slipClip,
  splitClip,
  trackEnd,
  tracksOfKind,
  trimClipLeft,
  trimClipRight,
  type MediaSource,
  type VideoProject,
} from "@/editors/video/videoModel";

const IMAGE_CLIP_SECONDS = 5;

const MEDIA_ACCEPT = [
  ".mp4",
  ".webm",
  ".mov",
  ".mkv",
  ".m4v",
  ".mp3",
  ".wav",
  ".m4a",
  ".aac",
  ".ogg",
  ".flac",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
];

const MIME_BY_EXT: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  aac: "audio/aac",
  ogg: "audio/ogg",
  flac: "audio/flac",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

function mimeFor(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

interface ProjectSnapshot {
  prev: VideoProject;
}

function mutateProject(fn: (p: VideoProject) => VideoProject): ProjectSnapshot | null {
  const store = useVideoStore.getState();
  const project = store.getProject();
  if (!project) return null;
  store.setProject(fn(project));
  return { prev: project };
}

function undoProject(_args: unknown, snap: ProjectSnapshot | null): void {
  if (snap) {
    useVideoStore.getState().setProject(snap.prev);
    void playbackEngine.renderStill();
  }
}

registerCommand({
  id: "video.newProject",
  title: "New video project",
  editor: "video",
  schema: z.object({}),
  run: () => {
    playbackEngine.pause();
    useVideoStore.getState().createProject();
  },
});

registerCommand({
  id: "video.importMedia",
  title: "Import media (video, audio, image)",
  editor: "video",
  schema: z.object({}),
  run: async () => {
    const file = await getFileService().open({ accept: MEDIA_ACCEPT });
    if (!file) return null;
    const store = useVideoStore.getState();
    if (!store.getProject()) store.createProject();

    const sourceId = newId("src");
    const blob = new Blob([Uint8Array.from(file.data)], { type: mimeFor(file.name) });
    const handle = await registerMedia(sourceId, blob);
    void storeMediaBlob(sourceId, blob);
    void ensureProxy(sourceId);
    const source: MediaSource = {
      id: sourceId,
      name: file.name,
      url: URL.createObjectURL(blob),
      kind: handle.info.kind,
      duration: handle.info.duration,
      width: handle.info.width,
      height: handle.info.height,
    };

    const snap = mutateProject((p) => {
      const track = tracksOfKind(p, handle.info.kind === "audio" ? "audio" : "video")[0];
      if (!track) return p;
      const start = trackEnd(p, track.id);
      const duration = handle.info.kind === "image" ? IMAGE_CLIP_SECONDS : handle.info.duration;
      return addClip(addSource(p, source), makeClip(track.id, sourceId, start, 0, duration));
    });
    void playbackEngine.renderStill();
    return snap;
  },
  undo: undoProject,
});

registerCommand({
  id: "video.playPause",
  title: "Play / pause",
  editor: "video",
  shortcut: "Space",
  schema: z.object({}),
  run: () => playbackEngine.togglePlay(),
});

/** Resolve an optional clipId argument to the selected clip. */
function targetClip(clipId?: string): string | null {
  return clipId ?? useVideoStore.getState().selectedClipId;
}

registerCommand({
  id: "video.trimClip",
  title: "Trim clip edge",
  editor: "video",
  schema: z.object({ clipId: z.string(), edge: z.enum(["left", "right"]), time: z.number() }),
  run: ({ clipId, edge, time }) =>
    mutateProject((p) =>
      edge === "left" ? trimClipLeft(p, clipId, time) : trimClipRight(p, clipId, time),
    ),
  undo: undoProject,
});

registerCommand({
  id: "video.splitAtPlayhead",
  title: "Split at playhead",
  editor: "video",
  shortcut: "S",
  schema: z.object({}),
  run: () => {
    const s = useVideoStore.getState();
    const t = s.playhead;
    return mutateProject((p) => {
      const targets = s.selectedClipId
        ? p.clips.filter((c) => c.id === s.selectedClipId)
        : p.clips.filter((c) => t > c.start && t < clipEnd(c));
      return targets.reduce((acc, c) => splitClip(acc, c.id, t), p);
    });
  },
  undo: undoProject,
});

registerCommand({
  id: "video.deleteClip",
  title: "Delete clip",
  editor: "video",
  shortcut: "Del",
  schema: z.object({ clipId: z.string().optional() }),
  run: ({ clipId }) => {
    const id = targetClip(clipId);
    if (!id) return null;
    useVideoStore.getState().selectClip(null);
    return mutateProject((p) => removeClip(p, id));
  },
  undo: undoProject,
});

registerCommand({
  id: "video.rippleDelete",
  title: "Ripple delete clip (close the gap)",
  editor: "video",
  shortcut: "Shift+Del",
  schema: z.object({ clipId: z.string().optional() }),
  run: ({ clipId }) => {
    const id = targetClip(clipId);
    if (!id) return null;
    useVideoStore.getState().selectClip(null);
    return mutateProject((p) => rippleDelete(p, id));
  },
  undo: undoProject,
});

registerCommand({
  id: "video.rollEdit",
  title: "Roll edit (move shared boundary)",
  editor: "video",
  schema: z.object({ leftClipId: z.string(), rightClipId: z.string(), time: z.number() }),
  run: ({ leftClipId, rightClipId, time }) =>
    mutateProject((p) => rollEdit(p, leftClipId, rightClipId, time)),
  undo: undoProject,
});

registerCommand({
  id: "video.slipClip",
  title: "Slip clip (slide source window)",
  editor: "video",
  schema: z.object({ clipId: z.string(), delta: z.number() }),
  run: ({ clipId, delta }) => mutateProject((p) => slipClip(p, clipId, delta)),
  undo: undoProject,
});

registerCommand({
  id: "video.moveClip",
  title: "Move clip",
  editor: "video",
  schema: z.object({ clipId: z.string(), start: z.number(), trackId: z.string().optional() }),
  run: ({ clipId, start, trackId }) => mutateProject((p) => moveClip(p, clipId, start, trackId)),
  undo: undoProject,
});

registerCommand({
  id: "video.detachAudio",
  title: "Detach audio to audio track",
  editor: "video",
  schema: z.object({ clipId: z.string().optional() }),
  run: ({ clipId }) => {
    const id = targetClip(clipId);
    return id ? mutateProject((p) => detachAudio(p, id)) : null;
  },
  undo: undoProject,
});

registerCommand({
  id: "video.addMarker",
  title: "Add marker at playhead",
  editor: "video",
  shortcut: "M",
  schema: z.object({ time: z.number().optional() }),
  run: ({ time }) => mutateProject((p) => addMarker(p, time ?? useVideoStore.getState().playhead)),
  undo: undoProject,
});

registerCommand({
  id: "video.removeMarker",
  title: "Remove marker",
  editor: "video",
  schema: z.object({ markerId: z.string() }),
  run: ({ markerId }) => mutateProject((p) => removeMarker(p, markerId)),
  undo: undoProject,
});

registerCommand({
  id: "video.toggleTrackMute",
  title: "Mute / unmute track",
  editor: "video",
  schema: z.object({ trackId: z.string() }),
  run: ({ trackId }) =>
    mutateProject((p) => {
      const track = p.tracks.find((t) => t.id === trackId);
      return track ? setTrackMuted(p, trackId, !track.muted) : p;
    }),
  undo: undoProject,
});

registerCommand({
  id: "video.saveProject",
  title: "Save project (.studio)",
  editor: "video",
  schema: z.object({}),
  run: async () => {
    const project = useVideoStore.getState().getProject();
    if (!project) return;
    const json = JSON.stringify(serialiseProject(project), null, 2);
    await getFileService().save(`${project.name}.studio`, new TextEncoder().encode(json));
  },
});

registerCommand({
  id: "video.openProject",
  title: "Open project (.studio)",
  editor: "video",
  schema: z.object({}),
  run: async () => {
    const file = await getFileService().open({ accept: [".studio"] });
    if (!file) return;
    playbackEngine.pause();
    const data = JSON.parse(new TextDecoder().decode(file.data)) as Parameters<
      typeof deserialiseProject
    >[0];
    const { project, missing } = await relinkProjectMedia(deserialiseProject(data));
    useVideoStore.getState().setProject(project);
    useVideoStore.getState().setPlayhead(0);
    void playbackEngine.renderStill();
    if (missing.length) {
      // ponytail: native alert; swap for a themed relink dialog when relinking lands
      alert(`Missing media (clips render black until re-imported):\n${missing.join("\n")}`);
    }
  },
});
