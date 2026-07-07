import { describe, it, expect } from "vitest";
import { serialiseProject, deserialiseProject } from "@/editors/video/videoProject";
import { addClip, addSource, emptyProject, makeClip, newId } from "@/editors/video/videoModel";

function sampleProject(): ReturnType<typeof emptyProject> {
  let p = emptyProject("Round trip");
  p = addSource(p, {
    id: "src-90",
    name: "clip.mp4",
    url: "blob:session-scoped",
    kind: "video",
    duration: 12,
    width: 3840,
    height: 2160,
  });
  return addClip(p, makeClip("v1", "src-90", 0, 1, 8));
}

describe("project serialisation", () => {
  it("round-trips structure and strips session object URLs", () => {
    const original = sampleProject();
    const wire = serialiseProject(original);
    expect(JSON.stringify(wire)).not.toContain("blob:session-scoped");

    const restored = deserialiseProject(JSON.parse(JSON.stringify(wire)));
    expect(restored.sources[0]).toMatchObject({ id: "src-90", url: "", duration: 12 });
    expect(restored.clips).toEqual(original.clips);
    expect(restored.tracks).toEqual(original.tracks);
    expect(restored.fps).toBe(original.fps);
  });

  it("bumps the id counter past loaded ids so new ids cannot collide", () => {
    deserialiseProject(serialiseProject(sampleProject()));
    const fresh = newId("clip");
    expect(Number(/-(\d+)$/.exec(fresh)?.[1])).toBeGreaterThan(90);
  });

  it("rejects foreign and future files", () => {
    expect(() =>
      deserialiseProject({ version: 1, studio: "pdf" } as never),
    ).toThrow(/not a studio video project/i);
    const wire = serialiseProject(sampleProject());
    expect(() => deserialiseProject({ ...wire, version: 999 })).toThrow(/newer/i);
  });
});
