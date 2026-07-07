import { useEffect, useRef } from "react";
import { dispatch } from "@/commands/history";
import { useVideoStore } from "@/editors/video/useVideoStore";
import { playbackEngine } from "@/editors/video/engine/playback";
import {
  clipDuration,
  formatTimecode,
  projectDuration,
  type Track,
  type VideoProject,
} from "@/editors/video/videoModel";
import { clampZoom, pxToTime, tickStep, timeToPx } from "@/editors/video/timelineMath";

const TAIL_SECONDS = 10;

function contentSeconds(project: VideoProject): number {
  return projectDuration(project) + TAIL_SECONDS;
}

function TimelinePlayhead({ pps }: { pps: number }): JSX.Element {
  const playhead = useVideoStore((s) => s.playhead);
  const fps = useVideoStore((s) => s.project?.fps ?? 30);
  return (
    <div className="tl-playhead" style={{ left: timeToPx(playhead, pps) }}>
      <span className="tl-playhead-flag">{formatTimecode(playhead, fps)}</span>
    </div>
  );
}

function Ruler({ project, pps }: { project: VideoProject; pps: number }): JSX.Element {
  const step = tickStep(pps);
  const total = contentSeconds(project);
  const ticks: number[] = [];
  for (let t = 0; t <= total; t += step) ticks.push(t);
  return (
    <div className="tl-ruler">
      {ticks.map((t) => (
        <span key={t} className="tl-tick" style={{ left: timeToPx(t, pps) }}>
          {formatTimecode(t, project.fps)}
        </span>
      ))}
      {project.markers.map((m) => (
        <button
          key={m.id}
          className="tl-marker"
          style={{ left: timeToPx(m.time, pps) }}
          title="Jump to marker (Alt+click removes)"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            if (e.altKey) void dispatch("video.removeMarker", { markerId: m.id });
            else playbackEngine.seek(m.time);
          }}
        />
      ))}
    </div>
  );
}

function Lane({ project, track, pps }: { project: VideoProject; track: Track; pps: number }): JSX.Element {
  const selectedClipId = useVideoStore((s) => s.selectedClipId);
  const selectClip = useVideoStore((s) => s.selectClip);
  return (
    <div className={`tl-lane tl-lane-${track.kind}`}>
      {project.clips
        .filter((c) => c.trackId === track.id)
        .map((clip) => {
          const source = project.sources.find((s) => s.id === clip.sourceId);
          const selected = clip.id === selectedClipId;
          return (
            <button
              key={clip.id}
              className={`tl-clip${selected ? " cropmark tl-clip-selected" : ""}`}
              style={{ left: timeToPx(clip.start, pps), width: timeToPx(clipDuration(clip), pps) }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => selectClip(clip.id)}
            >
              <span className="tl-clip-name">{source?.name ?? clip.sourceId}</span>
            </button>
          );
        })}
    </div>
  );
}

export function Timeline(): JSX.Element | null {
  const project = useVideoStore((s) => s.project);
  const pps = useVideoStore((s) => s.pxPerSecond);
  const selectClip = useVideoStore((s) => s.selectClip);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasProject = project !== null;

  // Native non-passive wheel listener: React's synthetic onWheel is passive,
  // so preventDefault (needed to stop browser page-zoom on Ctrl+wheel) is ignored.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent): void => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const current = useVideoStore.getState().pxPerSecond;
      const rect = el.getBoundingClientRect();
      const cursorPx = e.clientX - rect.left + el.scrollLeft;
      const anchorTime = pxToTime(cursorPx, current);
      const next = clampZoom(current * (e.deltaY < 0 ? 1.2 : 1 / 1.2));
      useVideoStore.getState().setZoom(next);
      el.scrollLeft = timeToPx(anchorTime, next) - (e.clientX - rect.left);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [hasProject]);

  if (!project) return null;
  const width = timeToPx(contentSeconds(project), pps);

  const seekFromEvent = (e: React.PointerEvent): void => {
    const canvas = scrollRef.current?.querySelector(".tl-canvas");
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    playbackEngine.seek(pxToTime(e.clientX - rect.left, pps));
  };

  const onPointerDown = (e: React.PointerEvent): void => {
    selectClip(null);
    seekFromEvent(e);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  return (
    <div className="tl">
      <div className="tl-headers">
        <div className="tl-corner" />
        {project.tracks.map((track) => (
          <div key={track.id} className="tl-head">
            <span className="tl-head-name">{track.name}</span>
            <button
              className={`tl-mute${track.muted ? " tl-mute-on" : ""}`}
              title={track.muted ? "Unmute track" : "Mute track"}
              onClick={() => void dispatch("video.toggleTrackMute", { trackId: track.id })}
            >
              M
            </button>
          </div>
        ))}
      </div>
      <div className="tl-scroll" ref={scrollRef}>
        <div
          className="tl-canvas"
          style={{ width }}
          onPointerDown={onPointerDown}
          onPointerMove={(e) => {
            if (e.buttons === 1) seekFromEvent(e);
          }}
        >
          <Ruler project={project} pps={pps} />
          {project.tracks.map((track) => (
            <Lane key={track.id} project={project} track={track} pps={pps} />
          ))}
          <TimelinePlayhead pps={pps} />
        </div>
      </div>
    </div>
  );
}
