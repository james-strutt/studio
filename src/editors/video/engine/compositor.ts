import {
  clipAt,
  clipProgress,
  previousAbutting,
  tracksOfKind,
  transitionProgress,
  type Clip,
  type VideoProject,
} from "@/editors/video/videoModel";
import { drawClipText } from "@/editors/video/engine/renderMath";
import { computeDrawSpec, paintSpec } from "@/editors/video/engine/clipRender";

export type FrameSource = ImageBitmap | HTMLCanvasElement | OffscreenCanvas;

export type FrameLookup = (clip: Clip) => FrameSource | null;

/** Every clip a compositor needs a frame for at time t (incoming + transition tails). */
export function visualClipsAt(project: VideoProject, t: number): Clip[] {
  const clips: Clip[] = [];
  for (const track of tracksOfKind(project, "video", "overlay", "caption")) {
    const incoming = clipAt(project, track.id, t);
    if (!incoming) continue;
    clips.push(incoming);
    if (transitionProgress(incoming, t) !== null) {
      const prev = previousAbutting(project, incoming);
      if (prev) clips.push(prev);
    }
  }
  return clips;
}

/** Cover-scaled, blurred copy of the frame behind letterboxed base footage. */
function paintBlurFill(
  ctx: CanvasRenderingContext2D,
  project: VideoProject,
  frame: FrameSource,
): void {
  const scale = Math.max(project.width / frame.width, project.height / frame.height);
  const w = frame.width * scale;
  const h = frame.height * scale;
  ctx.save();
  ctx.filter = "blur(40px)";
  ctx.drawImage(frame, (project.width - w) / 2, (project.height - h) / 2, w, h);
  ctx.restore();
}

/** Draw one clip (media frame + title text) with a transition effect applied. */
function paintOne(
  ctx: CanvasRenderingContext2D,
  project: VideoProject,
  clip: Clip,
  t: number,
  frameFor: FrameLookup,
  alphaMult = 1,
  dxExtra = 0,
): void {
  const frame = frameFor(clip);
  if (frame) {
    const spec = computeDrawSpec(
      clip,
      frame.width,
      frame.height,
      project.width,
      project.height,
      clipProgress(clip, t),
    );
    paintSpec(ctx, frame, spec, alphaMult, dxExtra);
  }
  if (clip.text) {
    ctx.save();
    ctx.globalAlpha = alphaMult;
    ctx.translate(dxExtra, 0);
    drawClipText(ctx, clip.text, project.width, project.height);
    ctx.restore();
  }
}

/**
 * Composite every visual track at time t (bottom track first), honouring
 * transitions and the letterbox fill. Shared by preview, still, and export.
 */
export function paintProjectFrame(
  ctx: CanvasRenderingContext2D,
  project: VideoProject,
  t: number,
  frameFor: FrameLookup,
): void {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, project.width, project.height);
  const baseTrackId = tracksOfKind(project, "video")[0]?.id;
  for (const track of tracksOfKind(project, "video", "overlay", "caption")) {
    const incoming = clipAt(project, track.id, t);
    if (!incoming) continue;
    if (project.fill === "blur" && track.id === baseTrackId) {
      const frame = frameFor(incoming);
      if (frame) {
        const fits = Math.abs(frame.width / frame.height - project.width / project.height) < 0.01;
        if (!fits) paintBlurFill(ctx, project, frame);
      }
    }
    const p = transitionProgress(incoming, t);
    if (p === null) {
      paintOne(ctx, project, incoming, t, frameFor);
      continue;
    }
    const prev = previousAbutting(project, incoming);
    if (prev) paintOne(ctx, project, prev, t, frameFor);
    const type = incoming.transition?.type;
    if (type === "wipe") {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, project.width * p, project.height);
      ctx.clip();
      paintOne(ctx, project, incoming, t, frameFor);
      ctx.restore();
    } else if (type === "slide") {
      paintOne(ctx, project, incoming, t, frameFor, 1, (1 - p) * project.width);
    } else {
      paintOne(ctx, project, incoming, t, frameFor, p); // dissolve
    }
  }
}
