import { useEffect, useRef, useState } from "react";
import { dispatch } from "@/commands/history";
import { localPoint, localScale } from "@/lib/pointer";
import { useVideoStore } from "@/editors/video/useVideoStore";
import { playbackEngine } from "@/editors/video/engine/playback";
import {
  clipDuration,
  clipEnd,
  formatTimecode,
  moveClip,
  projectDuration,
  rollEdit,
  setClipFade,
  slipClip,
  trimClipLeft,
  trimClipRight,
  type Clip,
  type Track,
  type VideoProject,
} from "@/editors/video/videoModel";
import {
  clampZoom,
  pxToTime,
  snapMove,
  snapTime,
  tickStep,
  timeToPx,
} from "@/editors/video/timelineMath";

const TAIL_SECONDS = 10;
const RULER_HEIGHT = 26;
const LANE_HEIGHT = 48;
const ABUT_EPS = 1e-6;

type DragMode = "move" | "trim-left" | "trim-right" | "slip" | "roll" | "fade-in" | "fade-out";

interface DragState {
  mode: DragMode;
  clipId: string;
  neighbourId?: string; // roll partner
  downX: number;
  downY: number;
  orig: Clip;
  origTrackIndex: number;
  candidates: number[]; // snap targets
  moved: boolean;
}

function contentSeconds(project: VideoProject): number {
  return projectDuration(project) + TAIL_SECONDS;
}

/** Snap targets for a drag: every other clip edge, markers, playhead, zero. */
function snapCandidates(project: VideoProject, excludeClipId: string, playhead: number): number[] {
  const times = [0, playhead, ...project.markers.map((m) => m.time)];
  for (const c of project.clips) {
    if (c.id === excludeClipId) continue;
    times.push(c.start, clipEnd(c));
  }
  return times;
}

/** Apply a drag gesture to the project with the same pure ops the drop command uses. */
function previewDrag(
  project: VideoProject,
  drag: DragState,
  dt: number,
  laneIndex: number,
  pps: number,
): VideoProject {
  const { mode, clipId, orig } = drag;
  if (mode === "move") {
    const start = snapMove(
      Math.max(0, orig.start + dt),
      clipDuration(orig),
      drag.candidates,
      pps,
    );
    const target = project.tracks[laneIndex];
    const sameKind = target && target.kind === project.tracks[drag.origTrackIndex]?.kind;
    return moveClip(project, clipId, start, sameKind ? target.id : undefined);
  }
  if (mode === "trim-left") {
    return trimClipLeft(project, clipId, snapTime(orig.start + dt, drag.candidates, pps));
  }
  if (mode === "trim-right") {
    return trimClipRight(project, clipId, snapTime(clipEnd(orig) + dt, drag.candidates, pps));
  }
  if (mode === "slip") {
    return slipClip(project, clipId, -dt);
  }
  if (mode === "fade-in") {
    return setClipFade(project, clipId, "in", (orig.fadeIn ?? 0) + dt);
  }
  if (mode === "fade-out") {
    return setClipFade(project, clipId, "out", (orig.fadeOut ?? 0) - dt);
  }
  // roll: boundary follows the pointer from the original shared edge
  if (drag.neighbourId) {
    const boundary = snapTime(clipEnd(orig) + dt, drag.candidates, pps);
    return rollEdit(project, clipId, drag.neighbourId, boundary);
  }
  return project;
}

function dropCommand(drag: DragState, preview: VideoProject): void {
  const clip = preview.clips.find((c) => c.id === drag.clipId);
  if (!clip) return;
  if (drag.mode === "move") {
    void dispatch("video.moveClip", { clipId: clip.id, start: clip.start, trackId: clip.trackId });
  } else if (drag.mode === "trim-left") {
    void dispatch("video.trimClip", { clipId: clip.id, edge: "left", time: clip.start });
  } else if (drag.mode === "trim-right") {
    void dispatch("video.trimClip", { clipId: clip.id, edge: "right", time: clipEnd(clip) });
  } else if (drag.mode === "slip") {
    void dispatch("video.slipClip", { clipId: clip.id, delta: clip.inPoint - drag.orig.inPoint });
  } else if (drag.mode === "roll" && drag.neighbourId) {
    void dispatch("video.rollEdit", {
      leftClipId: clip.id,
      rightClipId: drag.neighbourId,
      time: clipEnd(clip),
    });
  } else if (drag.mode === "fade-in") {
    void dispatch("video.setClipFade", { clipId: clip.id, edge: "in", seconds: clip.fadeIn ?? 0 });
  } else if (drag.mode === "fade-out") {
    void dispatch("video.setClipFade", { clipId: clip.id, edge: "out", seconds: clip.fadeOut ?? 0 });
  }
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

interface LaneProps {
  project: VideoProject;
  track: Track;
  pps: number;
  onClipPointerDown: (e: React.PointerEvent, clip: Clip) => void;
}

function Lane({ project, track, pps, onClipPointerDown }: LaneProps): JSX.Element {
  const selectedClipId = useVideoStore((s) => s.selectedClipId);
  return (
    <div className={`tl-lane tl-lane-${track.kind}`}>
      {project.clips
        .filter((c) => c.trackId === track.id)
        .map((clip) => {
          const source = project.sources.find((s) => s.id === clip.sourceId);
          const selected = clip.id === selectedClipId;
          const hasAudio = source?.kind === "video" || source?.kind === "audio";
          return (
            <div
              key={clip.id}
              role="button"
              tabIndex={0}
              className={`tl-clip${selected ? " cropmark tl-clip-selected" : ""}`}
              style={{ left: timeToPx(clip.start, pps), width: timeToPx(clipDuration(clip), pps) }}
              onPointerDown={(e) => onClipPointerDown(e, clip)}
            >
              <span className="tl-clip-handle tl-clip-handle-l" />
              <span className="tl-clip-name">{source?.name ?? clip.sourceId}</span>
              <span className="tl-clip-handle tl-clip-handle-r" />
              {clip.fadeIn ? (
                <span className="tl-fade-ramp tl-fade-ramp-l" style={{ width: timeToPx(clip.fadeIn, pps) }} />
              ) : null}
              {clip.fadeOut ? (
                <span className="tl-fade-ramp tl-fade-ramp-r" style={{ width: timeToPx(clip.fadeOut, pps) }} />
              ) : null}
              {hasAudio && (
                <>
                  <span className="tl-fade tl-fade-l" title="Drag right to fade in" />
                  <span className="tl-fade tl-fade-r" title="Drag left to fade out" />
                </>
              )}
            </div>
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
  const dragRef = useRef<DragState | null>(null);
  const [preview, setPreview] = useState<VideoProject | null>(null);
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
      const cursor = localPoint(el, e.clientX, e.clientY);
      const anchorTime = pxToTime(cursor.x + el.scrollLeft, current);
      const next = clampZoom(current * (e.deltaY < 0 ? 1.2 : 1 / 1.2));
      useVideoStore.getState().setZoom(next);
      el.scrollLeft = timeToPx(anchorTime, next) - cursor.x;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [hasProject]);

  if (!project) return null;
  const shown = preview ?? project;
  const width = timeToPx(contentSeconds(shown), pps);

  const seekFromEvent = (e: React.PointerEvent): void => {
    const canvas = scrollRef.current?.querySelector<HTMLElement>(".tl-canvas");
    if (!canvas) return;
    playbackEngine.seek(pxToTime(localPoint(canvas, e.clientX, e.clientY).x, pps));
  };

  const onClipPointerDown = (e: React.PointerEvent, clip: Clip): void => {
    e.stopPropagation();
    selectClip(clip.id);
    const target = e.target as HTMLElement;
    const isLeft = target.classList.contains("tl-clip-handle-l");
    const isRight = target.classList.contains("tl-clip-handle-r");
    const trackIndex = project.tracks.findIndex((t) => t.id === clip.trackId);

    let mode: DragMode = "move";
    let neighbourId: string | undefined;
    if (target.classList.contains("tl-fade-l")) mode = "fade-in";
    else if (target.classList.contains("tl-fade-r")) mode = "fade-out";
    else if (isLeft || isRight) {
      mode = isLeft ? "trim-left" : "trim-right";
      if (e.altKey && isRight) {
        const next = project.clips.find(
          (c) =>
            c.id !== clip.id &&
            c.trackId === clip.trackId &&
            Math.abs(c.start - clipEnd(clip)) < ABUT_EPS,
        );
        if (next) {
          mode = "roll";
          neighbourId = next.id;
        }
      }
    } else if (e.altKey) {
      mode = "slip";
    }

    dragRef.current = {
      mode,
      clipId: clip.id,
      neighbourId,
      downX: e.clientX,
      downY: e.clientY,
      orig: clip,
      origTrackIndex: trackIndex,
      candidates: snapCandidates(project, clip.id, useVideoStore.getState().playhead),
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onClipPointerMove = (e: React.PointerEvent): void => {
    const drag = dragRef.current;
    if (!drag || e.buttons !== 1) return;
    const canvas = scrollRef.current?.querySelector<HTMLElement>(".tl-canvas");
    const s = canvas ? localScale(canvas) : { x: 1, y: 1 };
    const dt = pxToTime((e.clientX - drag.downX) * s.x, pps);
    if (!drag.moved && Math.abs(e.clientX - drag.downX) + Math.abs(e.clientY - drag.downY) < 3) return;
    drag.moved = true;
    const laneIndex = canvas
      ? Math.max(
          0,
          Math.min(
            project.tracks.length - 1,
            Math.floor((localPoint(canvas, e.clientX, e.clientY).y - RULER_HEIGHT) / LANE_HEIGHT),
          ),
        )
      : drag.origTrackIndex;
    setPreview(previewDrag(project, drag, dt, laneIndex, pps));
  };

  const onClipPointerUp = (): void => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag?.moved && preview) dropCommand(drag, preview);
    setPreview(null);
  };

  return (
    <div className="tl">
      <div className="tl-headers">
        <div className="tl-corner" />
        {shown.tracks.map((track) => (
          <div key={track.id} className="tl-head">
            <span className="tl-head-name">{track.name}</span>
            <button
              className={`tl-mute${track.solo ? " tl-mute-on" : ""}`}
              title={track.solo ? "Unsolo track" : "Solo track"}
              onClick={() => void dispatch("video.toggleTrackSolo", { trackId: track.id })}
            >
              S
            </button>
            <button
              className={`tl-mute${track.muted ? " tl-mute-on" : ""}`}
              title={track.muted ? "Unmute track" : "Mute track"}
              onClick={() => void dispatch("video.toggleTrackMute", { trackId: track.id })}
            >
              M
            </button>
          </div>
        ))}
        <div className="tl-add-tracks">
          <button
            className="btn btn-quiet"
            title="Add video track"
            onClick={() => void dispatch("video.addTrack", { kind: "video" })}
          >
            +V
          </button>
          <button
            className="btn btn-quiet"
            title="Add audio track"
            onClick={() => void dispatch("video.addTrack", { kind: "audio" })}
          >
            +A
          </button>
        </div>
      </div>
      <div className="tl-scroll" ref={scrollRef}>
        <div
          className="tl-canvas"
          style={{ width }}
          onPointerDown={(e) => {
            selectClip(null);
            seekFromEvent(e);
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (dragRef.current) onClipPointerMove(e);
            else if (e.buttons === 1) seekFromEvent(e);
          }}
          onPointerUp={onClipPointerUp}
        >
          <Ruler project={shown} pps={pps} />
          {shown.tracks.map((track) => (
            <Lane
              key={track.id}
              project={shown}
              track={track}
              pps={pps}
              onClipPointerDown={onClipPointerDown}
            />
          ))}
          <TimelinePlayhead pps={pps} />
        </div>
      </div>
    </div>
  );
}
