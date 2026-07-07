import { z } from "zod";
import { registerCommand } from "@/commands/registry";
import { getFileService } from "@/files/fileService";
import { useVideoStore } from "@/editors/video/useVideoStore";
import { registerMedia } from "@/editors/video/engine/mediaCache";
import { playbackEngine } from "@/editors/video/engine/playback";
import { storeMediaBlob, relinkProjectMedia } from "@/editors/video/videoPersistence";
import { serialiseProject, deserialiseProject } from "@/editors/video/videoProject";
import {
  addClip,
  addSource,
  makeClip,
  newId,
  trackEnd,
  tracksOfKind,
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
