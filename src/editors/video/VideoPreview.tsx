import { useEffect, useRef, useState } from "react";
import { useVideoStore } from "@/editors/video/useVideoStore";
import { playbackEngine } from "@/editors/video/engine/playback";
import { formatTimecode, projectDuration } from "@/editors/video/videoModel";

function MasterMeter(): JSX.Element {
  const playing = useVideoStore((s) => s.playing);
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!playing) {
      setLevel(0);
      return;
    }
    let raf = 0;
    const tick = (): void => {
      setLevel(playbackEngine.masterLevel());
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [playing]);
  return (
    <div className="vid-meter" title="Master level" aria-hidden="true">
      <div
        className={`vid-meter-fill${level > 0.85 ? " vid-meter-hot" : ""}`}
        style={{ width: `${Math.round(level * 100)}%` }}
      />
    </div>
  );
}

function SafeAreaGuides(): JSX.Element | null {
  const show = useVideoStore((s) => s.showSafeAreas);
  if (!show) return null;
  return (
    <>
      <div className="vid-safe vid-safe-action" />
      <div className="vid-safe vid-safe-title" />
    </>
  );
}

export function VideoPreview(): JSX.Element {
  const project = useVideoStore((s) => s.project);
  const playhead = useVideoStore((s) => s.playhead);
  const playing = useVideoStore((s) => s.playing);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    playbackEngine.attach(canvas);
    return () => playbackEngine.detach();
  }, []);

  // Re-render the still frame when the project changes while paused (edits, undo).
  useEffect(() => {
    if (!playing) void playbackEngine.renderStill();
  }, [project, playing]);

  if (!project) return <></>;
  const duration = projectDuration(project);
  const frame = 1 / project.fps;

  return (
    <div className="vid-preview">
      <div className="vid-stage">
        <div className="vid-canvas-wrap">
          <canvas
            ref={canvasRef}
            className="vid-canvas"
            width={project.width}
            height={project.height}
          />
          <SafeAreaGuides />
        </div>
      </div>
      <div className="vid-transport">
        <button
          className="btn btn-quiet"
          aria-label="Back one frame"
          title="Back one frame"
          onClick={() => playbackEngine.seek(playhead - frame)}
        >
          ⏮
        </button>
        <button
          className="btn btn-primary vid-play"
          aria-label={playing ? "Pause" : "Play"}
          title={playing ? "Pause (Space)" : "Play (Space)"}
          onClick={() => playbackEngine.togglePlay()}
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <button
          className="btn btn-quiet"
          aria-label="Forward one frame"
          title="Forward one frame"
          onClick={() => playbackEngine.seek(playhead + frame)}
        >
          ⏭
        </button>
        <span className="vid-timecode cropmark">{formatTimecode(playhead, project.fps)}</span>
        <input
          className="vid-scrub"
          type="range"
          min={0}
          max={Math.max(duration, 0.001)}
          step={frame}
          value={Math.min(playhead, duration)}
          aria-label="Seek"
          onChange={(e) => playbackEngine.seek(Number(e.target.value))}
        />
        <span className="vid-timecode vid-duration">{formatTimecode(duration, project.fps)}</span>
        <MasterMeter />
      </div>
    </div>
  );
}
