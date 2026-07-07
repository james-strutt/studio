import { useEffect } from "react";
import "@/editors/video/video.css";
import { useVideoStore } from "@/editors/video/useVideoStore";
import { VideoPreview } from "@/editors/video/VideoPreview";
import { playbackEngine } from "@/editors/video/engine/playback";
import { startAutosave, loadAutosave } from "@/editors/video/videoPersistence";
import { dispatch } from "@/commands/history";

function isTypingTarget(el: EventTarget | null): boolean {
  return (
    el instanceof HTMLElement &&
    (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)
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
      if (e.code !== "Space" || isTypingTarget(e.target)) return;
      e.preventDefault();
      playbackEngine.togglePlay();
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
        {project && (
          <span className="vid-project-meta">
            {project.width}×{project.height} · {project.fps} fps
          </span>
        )}
      </div>
      {project ? (
        <VideoPreview />
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
