import { describe, it, expect } from "vitest";
import {
  emptyProject,
  makeClip,
  addClip,
  moveClip,
  trimClip,
  splitClip,
  removeClip,
  projectDuration,
  clipAt,
  clipDuration,
  type VideoProject,
} from "@/editors/video/videoModel";

function projectWithClip(): { project: VideoProject; clipId: string } {
  let p = emptyProject();
  p = { ...p, sources: [{ id: "s1", name: "v.mp4", url: "blob:", kind: "video", duration: 10, width: 1920, height: 1080 }] };
  const clip = makeClip("v1", "s1", 2, 0, 6); // timeline 2..8, source 0..6
  return { project: addClip(p, clip), clipId: clip.id };
}

describe("video project model", () => {
  it("computes clip and project duration", () => {
    const { project } = projectWithClip();
    expect(clipDuration(project.clips[0])).toBe(6);
    expect(projectDuration(project)).toBe(8); // start 2 + duration 6
  });

  it("moves a clip and clamps start to ≥ 0", () => {
    const { project, clipId } = projectWithClip();
    expect(moveClip(project, clipId, -5).clips[0].start).toBe(0);
    expect(moveClip(project, clipId, 4, "a1").clips[0]).toMatchObject({ start: 4, trackId: "a1" });
  });

  it("trims within the source bounds", () => {
    const { project, clipId } = projectWithClip();
    const t = trimClip(project, clipId, -1, 20).clips[0];
    expect(t.inPoint).toBe(0);
    expect(t.outPoint).toBe(10); // clamped to source duration
  });

  it("splits a clip into two abutting clips", () => {
    const { project, clipId } = projectWithClip();
    const out = splitClip(project, clipId, 5); // 3s into the clip
    expect(out.clips).toHaveLength(2);
    const [a, b] = out.clips;
    expect(a.outPoint).toBe(3); // in 0 + 3
    expect(b.start).toBe(5);
    expect(b.inPoint).toBe(3);
  });

  it("does not split outside the clip", () => {
    const { project, clipId } = projectWithClip();
    expect(splitClip(project, clipId, 100).clips).toHaveLength(1);
  });

  it("finds the clip under the playhead", () => {
    const { project } = projectWithClip();
    expect(clipAt(project, "v1", 5)?.id).toBe(project.clips[0].id);
    expect(clipAt(project, "v1", 9)).toBeNull();
  });

  it("removes a clip", () => {
    const { project, clipId } = projectWithClip();
    expect(removeClip(project, clipId).clips).toHaveLength(0);
  });
});
