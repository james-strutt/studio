import { useEffect, useRef, useState } from "react";
import { dispatch } from "@/commands/history";
import { getCommand } from "@/commands/registry";
import { useVideoStore } from "@/editors/video/useVideoStore";
import { playbackEngine } from "@/editors/video/engine/playback";
import { getMedia } from "@/editors/video/engine/mediaCache";
import { containRect } from "@/editors/video/engine/renderMath";
import {
  clipDuration,
  sourceTimeAt,
  trackClips,
  tracksOfKind,
  type Clip,
} from "@/editors/video/videoModel";

const THUMB_W = 168;
const THUMB_H = 94;

function ClipThumb({ clip }: { clip: Clip }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    const handle = getMedia(clip.sourceId);
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !handle) return;
    const draw = (frame: CanvasImageSource, w: number, h: number): void => {
      if (cancelled) return;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, THUMB_W, THUMB_H);
      const r = containRect(w, h, THUMB_W, THUMB_H);
      ctx.drawImage(frame, r.x, r.y, r.w, r.h);
    };
    if (handle.bitmap) {
      draw(handle.bitmap, handle.bitmap.width, handle.bitmap.height);
    } else {
      const sink = handle.proxy ?? handle.video;
      void sink?.getCanvas(sourceTimeAt(clip, clip.start)).then((wrapped) => {
        if (wrapped) draw(wrapped.canvas, wrapped.canvas.width, wrapped.canvas.height);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [clip.sourceId, clip.inPoint, clip.start, clip]);

  return <canvas ref={canvasRef} className="sb-thumb" width={THUMB_W} height={THUMB_H} />;
}

function DurationField({ clip }: { clip: Clip }): JSX.Element {
  const [value, setValue] = useState(clipDuration(clip).toFixed(1));
  useEffect(() => setValue(clipDuration(clip).toFixed(1)), [clip]);
  const commit = (): void => {
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds > 0 && seconds !== clipDuration(clip)) {
      void dispatch("video.setClipDuration", { clipId: clip.id, seconds });
    }
  };
  return (
    <label className="sb-duration">
      <input
        className="input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
      s
    </label>
  );
}

export function Storyboard(): JSX.Element | null {
  const project = useVideoStore((s) => s.project);
  if (!project) return null;

  const videoTrack = tracksOfKind(project, "video")[0];
  const clips = videoTrack ? trackClips(project, videoTrack.id) : [];
  const musicTrack = tracksOfKind(project, "audio")[0];
  const music = musicTrack ? trackClips(project, musicTrack.id) : [];
  const canExport = Boolean(getCommand("video.export"));

  return (
    <div className="sb">
      <div className="sb-strip">
        {clips.map((clip, i) => {
          const source = project.sources.find((s) => s.id === clip.sourceId);
          return (
            <div key={clip.id} className="sb-card">
              <button
                className="sb-thumb-btn"
                title="Play from here"
                onClick={() => playbackEngine.seek(clip.start)}
              >
                <ClipThumb clip={clip} />
              </button>
              <span className="sb-name">{source?.name ?? "Clip"}</span>
              <input
                className="input sb-text"
                placeholder="Title text…"
                defaultValue={clip.text?.content ?? ""}
                key={`${clip.id}-${clip.text?.content ?? ""}`}
                onBlur={(e) => {
                  if (e.target.value !== (clip.text?.content ?? "")) {
                    void dispatch("video.setClipText", { clipId: clip.id, content: e.target.value });
                  }
                }}
              />
              <div className="sb-card-row">
                <button
                  className="btn btn-quiet"
                  disabled={i === 0}
                  aria-label="Move earlier"
                  onClick={() =>
                    void dispatch("video.reorderClip", {
                      trackId: videoTrack.id,
                      fromIndex: i,
                      toIndex: i - 1,
                    })
                  }
                >
                  ◀
                </button>
                <DurationField clip={clip} />
                <button
                  className="btn btn-quiet"
                  disabled={i === clips.length - 1}
                  aria-label="Move later"
                  onClick={() =>
                    void dispatch("video.reorderClip", {
                      trackId: videoTrack.id,
                      fromIndex: i,
                      toIndex: i + 1,
                    })
                  }
                >
                  ▶
                </button>
                <button
                  className="btn btn-quiet sb-remove"
                  aria-label="Remove clip"
                  onClick={() => void dispatch("video.rippleDelete", { clipId: clip.id })}
                >
                  ✕
                </button>
              </div>
            </div>
          );
        })}
        <button className="sb-add" onClick={() => void dispatch("video.importMedia", {})}>
          + Add clip
        </button>
      </div>
      <div className="sb-footer">
        <button
          className="btn btn-quiet"
          onClick={() => void dispatch("video.importMedia", { kind: "audio" })}
        >
          {music.length ? `Music: ${music.length} track(s)` : "Add music"}
        </button>
        <button
          className="btn btn-primary"
          disabled={!canExport || clips.length === 0}
          title={canExport ? "Export video" : "Export arrives with the export task (P3.11)"}
          onClick={() => void dispatch("video.export", {})}
        >
          Export
        </button>
      </div>
    </div>
  );
}
