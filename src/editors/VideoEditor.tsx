import { useEffect } from "react";
import "@/editors/video/video.css";
import { useVideoStore, type ProxyStatus } from "@/editors/video/useVideoStore";
import { VideoPreview } from "@/editors/video/VideoPreview";
import { Timeline } from "@/editors/video/Timeline";
import { playbackEngine } from "@/editors/video/engine/playback";
import { startAutosave, loadAutosave } from "@/editors/video/videoPersistence";
import { dispatch } from "@/commands/history";

function isTypingTarget(el: EventTarget | null): boolean {
  return (
    el instanceof HTMLElement &&
    (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)
  );
}

function proxyChipLabel(statuses: ProxyStatus[]): string | null {
  const generating = statuses.find((s) => s.state === "generating");
  if (generating) return `Proxy · 720p · ${Math.round((generating.progress ?? 0) * 100)}%`;
  if (statuses.some((s) => s.state === "failed")) return "Proxy · 720p · failed";
  if (statuses.some((s) => s.state === "ready")) return "Proxy · 720p · ready";
  return null;
}

function ProxyChip(): JSX.Element | null {
  const project = useVideoStore((s) => s.project);
  const proxyStatus = useVideoStore((s) => s.proxyStatus);
  if (!project) return null;
  const label = proxyChipLabel(
    project.sources.map((s) => proxyStatus[s.id]).filter((s): s is ProxyStatus => Boolean(s)),
  );
  return label ? <span className="vid-chip">{label}</span> : null;
}

function SelectedClipActions(): JSX.Element | null {
  const project = useVideoStore((s) => s.project);
  const selectedClipId = useVideoStore((s) => s.selectedClipId);
  if (!project || !selectedClipId) return null;
  const clip = project.clips.find((c) => c.id === selectedClipId);
  if (!clip) return null;
  const source = project.sources.find((s) => s.id === clip.sourceId);
  const track = project.tracks.find((t) => t.id === clip.trackId);
  const canDetach = track?.kind !== "audio" && source?.kind === "video" && clip.volume > 0;
  return (
    <>
      <button className="btn btn-quiet" onClick={() => void dispatch("video.splitAtPlayhead", {})}>
        Split (S)
      </button>
      <button className="btn btn-quiet" onClick={() => void dispatch("video.rippleDelete", {})}>
        Ripple delete
      </button>
      {canDetach && (
        <button className="btn btn-quiet" onClick={() => void dispatch("video.detachAudio", {})}>
          Detach audio
        </button>
      )}
    </>
  );
}

export function VideoEditor(): JSX.Element {
  const project = useVideoStore((s) => s.project);

  useEffect(() => {
    startAutosave();
    if (!useVideoStore.getState().project) {
      void loadAutosave().then((restored) => {
        if (restored && !useVideoStore.getState().project) {
          useVideoStore.getState().setProject(restored.project);
          void playbackEngine.renderStill();
        }
      });
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey) return;
      const s = useVideoStore.getState();
      if (e.code === "Space") {
        e.preventDefault();
        playbackEngine.togglePlay();
      } else if (e.key === "m" && s.project) {
        void dispatch("video.addMarker", {});
      } else if (e.key === "s" && s.project) {
        void dispatch("video.splitAtPlayhead", {});
      } else if ((e.key === "Delete" || e.key === "Backspace") && s.selectedClipId) {
        void dispatch(e.shiftKey ? "video.rippleDelete" : "video.deleteClip", {});
      } else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && s.project) {
        e.preventDefault();
        const step = e.shiftKey ? 1 : 1 / s.project.fps;
        playbackEngine.seek(s.playhead + (e.key === "ArrowLeft" ? -step : step));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="editor-fill">
      <div className="vid-toolbar">
        <button className="btn btn-quiet" onClick={() => void dispatch("video.newProject", {})}>
          New project
        </button>
        <button className="btn btn-quiet" onClick={() => void dispatch("video.importMedia", {})}>
          Import media
        </button>
        <SelectedClipActions />
        <ProxyChip />
        {project && (
          <span className="vid-project-meta">
            {project.width}×{project.height} · {project.fps} fps
          </span>
        )}
      </div>
      {project ? (
        <>
          <VideoPreview />
          <Timeline />
        </>
      ) : (
        <div className="vid-empty">
          <div className="placeholder">
            <span className="kicker">Video editor</span>
            <span className="headline">Import a video, audio file, or image to begin</span>
            <button className="btn btn-primary" onClick={() => void dispatch("video.importMedia", {})}>
              Import media
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
