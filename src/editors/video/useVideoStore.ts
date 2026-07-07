import { create } from "zustand";
import { emptyProject, type VideoProject } from "@/editors/video/videoModel";

interface VideoStore {
  project: VideoProject | null;
  playhead: number; // seconds
  playing: boolean;
  selectedClipId: string | null;
  createProject: () => void;
  setProject: (p: VideoProject) => void;
  setPlayhead: (t: number) => void;
  setPlaying: (b: boolean) => void;
  selectClip: (id: string | null) => void;
  getProject: () => VideoProject | null;
}

export const useVideoStore = create<VideoStore>((set, get) => ({
  project: null,
  playhead: 0,
  playing: false,
  selectedClipId: null,
  createProject: () => set({ project: emptyProject(), playhead: 0, selectedClipId: null }),
  setProject: (project) => set({ project }),
  setPlayhead: (playhead) => set({ playhead: Math.max(0, playhead) }),
  setPlaying: (playing) => set({ playing }),
  selectClip: (selectedClipId) => set({ selectedClipId }),
  getProject: () => get().project,
}));
