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
  sourceTimeAt,
  trackEnd,
  formatTimecode,
  trimClipLeft,
  trimClipRight,
  rippleDelete,
  rollEdit,
  slipClip,
  detachAudio,
  clipEnd,
  reorderTrack,
  packTrack,
  setClipText,
  makeClipText,
  setClipFade,
  setTrackSolo,
  setTrackMuted,
  trackAudible,
  addTrack,
  type VideoProject,
} from "@/editors/video/videoModel";
import { containRect } from "@/editors/video/engine/renderMath";

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

  it("maps timeline time to source time", () => {
    const { project } = projectWithClip();
    const clip = project.clips[0]; // start 2, inPoint 0
    expect(sourceTimeAt(clip, 2)).toBe(0);
    expect(sourceTimeAt(clip, 5)).toBe(3);
    expect(sourceTimeAt({ ...clip, inPoint: 1.5 }, 5)).toBe(4.5);
  });

  it("finds the end of a track for appending", () => {
    const { project } = projectWithClip(); // clip on v1 ends at 8
    expect(trackEnd(project, "v1")).toBe(8);
    expect(trackEnd(project, "a1")).toBe(0);
  });
});

describe("clip edit operations", () => {
  it("trims the left edge keeping media in place, clamped to source start", () => {
    const { project, clipId } = projectWithClip(); // start 2, in 0, out 6
    const t = trimClipLeft(project, clipId, 4).clips[0];
    expect(t).toMatchObject({ start: 4, inPoint: 2, outPoint: 6 });
    // can't reveal media before source 0: start floor is 2 (start - inPoint)
    expect(trimClipLeft(project, clipId, 0).clips[0].start).toBe(2);
  });

  it("trims the right edge clamped to source duration", () => {
    const { project, clipId } = projectWithClip(); // source dur 10
    expect(trimClipRight(project, clipId, 7).clips[0].outPoint).toBe(5); // in 0 + (7-2)
    expect(trimClipRight(project, clipId, 100).clips[0].outPoint).toBe(10);
  });

  it("ripple-deletes: later clips on the same track close the gap", () => {
    let { project } = projectWithClip(); // clip A: 2..8 on v1
    const b = makeClip("v1", "s1", 8, 0, 4); // B: 8..12
    const other = makeClip("a1", "s1", 8, 0, 4); // audio track untouched
    project = addClip(addClip(project, b), other);
    const out = rippleDelete(project, project.clips[0].id);
    expect(out.clips.find((c) => c.id === b.id)?.start).toBe(2);
    expect(out.clips.find((c) => c.id === other.id)?.start).toBe(8);
  });

  it("rolls the boundary between abutting clips", () => {
    let { project } = projectWithClip(); // A: 2..8 (in 0 out 6)
    const b = makeClip("v1", "s1", 8, 2, 6); // B: 8..12 (in 2)
    project = addClip(project, b);
    const a = project.clips[0];
    const out = rollEdit(project, a.id, b.id, 7); // pull boundary 1s left
    expect(out.clips[0].outPoint).toBe(5);
    expect(out.clips[1]).toMatchObject({ start: 7, inPoint: 1 });
    // clamp: right clip can't reveal media before its source 0 (in 2 → floor 6)
    const clamped = rollEdit(project, a.id, b.id, 0).clips[1];
    expect(clamped.start).toBe(6);
  });

  it("slips the source window without moving the clip", () => {
    const { project, clipId } = projectWithClip(); // in 0 out 6, src 10
    const s = slipClip(project, clipId, 2).clips[0];
    expect(s).toMatchObject({ start: 2, inPoint: 2, outPoint: 8 });
    // clamped at the source end: max slip is 10-6 = 4
    expect(slipClip(project, clipId, 99).clips[0].outPoint).toBe(10);
    expect(slipClip(project, clipId, -1).clips[0].inPoint).toBe(0);
  });

  it("detaches audio: silences the video clip and mirrors it on the audio track", () => {
    const { project, clipId } = projectWithClip();
    const out = detachAudio(project, clipId);
    expect(out.clips).toHaveLength(2);
    const video = out.clips.find((c) => c.id === clipId);
    const audio = out.clips.find((c) => c.id !== clipId);
    expect(video?.volume).toBe(0);
    expect(audio).toMatchObject({ trackId: "a1", start: 2, inPoint: 0, outPoint: 6, volume: 1 });
    expect(clipEnd(audio as never)).toBe(8);
  });
});

describe("storyboard sequencing", () => {
  function sequence(): VideoProject {
    let { project } = projectWithClip(); // A: 2..8 (dur 6)
    project = addClip(project, makeClip("v1", "s1", 8, 0, 3)); // B: dur 3
    project = addClip(project, makeClip("v1", "s1", 11, 0, 2)); // C: dur 2
    return project;
  }

  it("reorders and repacks back-to-back from 0", () => {
    const out = reorderTrack(sequence(), "v1", 2, 0); // C to front
    const packed = out.clips.map((c) => ({ start: c.start, dur: c.outPoint - c.inPoint }));
    expect(packed.find((p) => p.dur === 2)?.start).toBe(0); // C first
    expect(packed.find((p) => p.dur === 6)?.start).toBe(2); // A second
    expect(packed.find((p) => p.dur === 3)?.start).toBe(8); // B last
  });

  it("packTrack closes gaps without changing order", () => {
    const out = packTrack(sequence(), "v1");
    expect(out.clips.map((c) => c.start)).toEqual([0, 6, 9]);
  });

  it("sets and clears clip title text", () => {
    const { project, clipId } = projectWithClip();
    const withText = setClipText(project, clipId, makeClipText("Hello"));
    expect(withText.clips[0].text?.content).toBe("Hello");
    expect(setClipText(withText, clipId, null).clips[0].text).toBeUndefined();
  });
});

describe("audio basics", () => {
  it("clamps fades to the clip duration and clears zero fades", () => {
    const { project, clipId } = projectWithClip(); // duration 6
    const faded = setClipFade(project, clipId, "in", 99).clips[0];
    expect(faded.fadeIn).toBe(6);
    expect(setClipFade(faded ? { ...project, clips: [faded] } : project, clipId, "in", 0).clips[0].fadeIn).toBeUndefined();
    expect(setClipFade(project, clipId, "out", 1.5).clips[0].fadeOut).toBe(1.5);
  });

  it("solo makes only soloed tracks audible; mute always wins", () => {
    let { project } = projectWithClip();
    const [v1, a1] = project.tracks;
    expect(trackAudible(project, v1)).toBe(true);
    project = setTrackSolo(project, "a1", true);
    expect(trackAudible(project, project.tracks[0])).toBe(false); // v1 silenced by a1 solo
    expect(trackAudible(project, project.tracks[1])).toBe(true);
    project = setTrackMuted(project, "a1", true);
    expect(trackAudible(project, project.tracks[1])).toBe(false); // muted even while soloed
    expect(a1.kind).toBe("audio");
  });

  it("adds numbered tracks of a kind", () => {
    const { project } = projectWithClip();
    const out = addTrack(addTrack(project, "audio"), "video");
    expect(out.tracks.map((t) => t.name)).toEqual(["Video 1", "Audio 1", "Audio 2", "Video 2"]);
  });
});

describe("timecode", () => {
  it("formats frames and rolls over to hours", () => {
    expect(formatTimecode(0, 30)).toBe("00:00:00");
    expect(formatTimecode(1.5, 30)).toBe("00:01:15");
    expect(formatTimecode(61, 30)).toBe("01:01:00");
    expect(formatTimecode(3661, 30)).toBe("01:01:01:00");
  });
});

describe("containRect", () => {
  it("letterboxes wide-into-tall and pads tall-into-wide", () => {
    expect(containRect(3840, 2160, 1920, 1080)).toEqual({ x: 0, y: 0, w: 1920, h: 1080 });
    expect(containRect(1080, 1920, 1920, 1080)).toEqual({ x: (1920 - 607.5) / 2, y: 0, w: 607.5, h: 1080 });
    expect(containRect(0, 0, 1920, 1080)).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });
});
