import { create } from "zustand";
import { emptyProject, type VideoProject } from "@/editors/video/videoModel";

export interface ProxyStatus {
  state: "none" | "generating" | "ready" | "failed";
  progress?: number; // 0..1 while generating
}

export type VideoMode = "storyboard" | "timeline";

export interface RecordingState {
  kind: "screen" | "camera" | "mic";
  stop: () => void;
}

export interface ExportStatus {
  progress: number; // 0..1
  cancel: () => void;
}

interface VideoStore {
  project: VideoProject | null;
  playhead: number; // seconds
  playing: boolean;
  selectedClipId: string | null;
  proxyStatus: Record<string, ProxyStatus>;
  pxPerSecond: number;
  mode: VideoMode;
  showSafeAreas: boolean;
  recording: RecordingState | null;
  exportStatus: ExportStatus | null;
  createProject: () => void;
  setProject: (p: VideoProject) => void;
  setPlayhead: (t: number) => void;
  setPlaying: (b: boolean) => void;
  selectClip: (id: string | null) => void;
  setProxyStatus: (sourceId: string, status: ProxyStatus) => void;
  setZoom: (pxPerSecond: number) => void;
  setMode: (mode: VideoMode) => void;
  setShowSafeAreas: (b: boolean) => void;
  setRecording: (r: RecordingState | null) => void;
  setExportStatus: (s: ExportStatus | null) => void;
  getProject: () => VideoProject | null;
}

export const useVideoStore = create<VideoStore>((set, get) => ({
  project: null,
  playhead: 0,
  playing: false,
  selectedClipId: null,
  proxyStatus: {},
  pxPerSecond: 50,
  mode: "storyboard",
  showSafeAreas: false,
  recording: null,
  exportStatus: null,
  createProject: () => set({ project: emptyProject(), playhead: 0, selectedClipId: null }),
  setProject: (project) => set({ project }),
  setPlayhead: (playhead) => set({ playhead: Math.max(0, playhead) }),
  setPlaying: (playing) => set({ playing }),
  selectClip: (selectedClipId) => set({ selectedClipId }),
  setProxyStatus: (sourceId, status) =>
    set((s) => ({ proxyStatus: { ...s.proxyStatus, [sourceId]: status } })),
  setZoom: (pxPerSecond) => set({ pxPerSecond }),
  setMode: (mode) => set({ mode }),
  setShowSafeAreas: (showSafeAreas) => set({ showSafeAreas }),
  setRecording: (recording) => set({ recording }),
  setExportStatus: (exportStatus) => set({ exportStatus }),
  getProject: () => get().project,
}));
