import { useEffect, useState } from "react";
import "@/editors/video/video.css";
import { useVideoStore, type ProxyStatus, type VideoMode } from "@/editors/video/useVideoStore";
import { VideoPreview } from "@/editors/video/VideoPreview";
import { Timeline } from "@/editors/video/Timeline";
import { Storyboard } from "@/editors/video/Storyboard";
import { playbackEngine } from "@/editors/video/engine/playback";
import { startAutosave, loadAutosave } from "@/editors/video/videoPersistence";
import { ClipTextDialog, ClipMotionDialog } from "@/editors/video/ClipDialogs";
import { previousAbutting } from "@/editors/video/videoModel";
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

const TRANSITION_TYPES = ["cut", "dissolve", "wipe", "slide"] as const;
const TRANSITION_DURATIONS = [0.25, 0.5, 1, 2];

function SelectedClipActions(): JSX.Element | null {
  const project = useVideoStore((s) => s.project);
  const selectedClipId = useVideoStore((s) => s.selectedClipId);
  const [dialog, setDialog] = useState<"text" | "motion" | null>(null);
  if (!project || !selectedClipId) return null;
  const clip = project.clips.find((c) => c.id === selectedClipId);
  if (!clip) return null;
  const source = project.sources.find((s) => s.id === clip.sourceId);
  const track = project.tracks.find((t) => t.id === clip.trackId);
  const visual = track?.kind !== "audio";
  const canDetach = visual && source?.kind === "video" && clip.volume > 0;
  const hasPrev = previousAbutting(project, clip) !== null;
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
      {(source?.kind === "video" || source?.kind === "audio") && (
        <label className="vid-volume" title={`Clip volume ${Math.round(clip.volume * 100)}%`}>
          Vol
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            key={`${clip.id}-${clip.volume}`}
            defaultValue={clip.volume}
            onPointerUp={(e) =>
              void dispatch("video.setClipVolume", {
                clipId: clip.id,
                volume: Number((e.target as HTMLInputElement).value),
              })
            }
          />
        </label>
      )}
      {visual && (
        <>
          <button className="btn btn-quiet" onClick={() => setDialog("text")}>
            Text…
          </button>
          <button className="btn btn-quiet" onClick={() => setDialog("motion")}>
            Motion…
          </button>
        </>
      )}
      {visual && hasPrev && (
        <>
          <select
            className="input vid-transition-select"
            aria-label="Transition into this clip"
            value={clip.transition?.type ?? "cut"}
            onChange={(e) =>
              void dispatch("video.setTransition", {
                clipId: clip.id,
                type: e.target.value,
                duration: clip.transition?.duration ?? 0.5,
              })
            }
          >
            {TRANSITION_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          {clip.transition && (
            <select
              className="input vid-transition-select"
              aria-label="Transition duration"
              value={clip.transition.duration}
              onChange={(e) =>
                void dispatch("video.setTransition", {
                  clipId: clip.id,
                  type: clip.transition?.type ?? "dissolve",
                  duration: Number(e.target.value),
                })
              }
            >
              {TRANSITION_DURATIONS.map((d) => (
                <option key={d} value={d}>
                  {d}s
                </option>
              ))}
            </select>
          )}
        </>
      )}
      {dialog === "text" && <ClipTextDialog clip={clip} onClose={() => setDialog(null)} />}
      {dialog === "motion" && <ClipMotionDialog clip={clip} onClose={() => setDialog(null)} />}
    </>
  );
}

const MODES: { id: VideoMode; label: string }[] = [
  { id: "storyboard", label: "Storyboard" },
  { id: "timeline", label: "Timeline" },
];

export function VideoEditor(): JSX.Element {
  const project = useVideoStore((s) => s.project);
  const mode = useVideoStore((s) => s.mode);
  const setMode = useVideoStore((s) => s.setMode);

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
        {project && (
          <button className="btn btn-quiet" onClick={() => void dispatch("video.addOverlay", {})}>
            Add overlay
          </button>
        )}
        {project && (
          <div className="seg" role="group" aria-label="Editing mode">
            {MODES.map((m) => (
              <button key={m.id} aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>
                {m.label}
              </button>
            ))}
          </div>
        )}
        {mode === "timeline" && <SelectedClipActions />}
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
          {mode === "timeline" ? <Timeline /> : <Storyboard />}
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
