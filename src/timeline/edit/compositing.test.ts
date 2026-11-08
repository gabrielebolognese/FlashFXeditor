import { describe, expect, it } from "vitest";
import type { Command } from "../../core/commands/command.js";
import { makeCompoundClip, makeMedia, makeMediaClip, makeProject, makeSolidClip, makeTextClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { Clip, Project } from "../../core/document/types.js";
import { validateProject } from "../../core/document/validate.js";
import { blendOf, matteCandidates, matteClipOf, matteModeOf, matteOnlyOf, setBlend, setMatte, setMatteMode, setMatteOnly } from "./compositing.js";

function doc(): Project {
  const p = makeProject();
  p.media.m1 = makeMedia("m1", "video");
  p.tracks = [makeTrack("v1"), makeTrack("v2"), makeTrack("v3"), makeTrack("a1", "audio")];
  const inner = makeTrack("in-1");
  p.sequences.seq = { id: "seq", name: "seq", size: { w: 1080, h: 1920 }, duration: 60, background: null, tracks: [inner] };
  const withRoot = withClips(p, [
    makeMediaClip(p, { id: "v", trackId: "v1", start: 0, duration: 30, mediaId: "m1" }),
    makeTextClip({ id: "t", trackId: "v2", start: 0, duration: 30, value: "Matte" }),
    makeSolidClip({ id: "s", trackId: "v3", start: 0, duration: 30 }),
    makeCompoundClip({ id: "c", trackId: "v3", start: 30, duration: 30, sequenceId: "seq" }),
    makeMediaClip(p, { id: "a", trackId: "a1", start: 0, duration: 30, mediaId: "m1", kind: "audio" }),
  ]);
  const innerClip = makeSolidClip({ id: "inner", trackId: "in-1", start: 0, duration: 30 }) as Clip;
  withRoot.clips.inner = innerClip;
  (withRoot.sequences.seq as { tracks: { clipIds: string[] }[] }).tracks[0]?.clipIds.push("inner");
  expect(validateProject(withRoot)).toEqual([]);
  return withRoot;
}

const run = (p: Project, command: Command | null): Project => {
  expect(command).not.toBeNull();
  const next = structuredClone(p);
  command?.run(next as never, { playhead: 0 } as never);
  expect(validateProject(next)).toEqual([]);
  return next;
};

describe("Compositing edits (spec §21.17, Batch 72)", () => {
  it("sets the blend mode of every selected visual clip in one step; normal removes the field", () => {
    const p = doc();
    const command = setBlend(p, ["v", "t", "a"], "screen");
    expect(command?.id).toBe("clip.blend");
    expect(command?.label).toBe("Blend: Screen");
    const screened = run(p, command);
    expect(screened.clips.v?.blend).toBe("screen");
    expect(screened.clips.t?.blend).toBe("screen");
    expect(screened.clips.a?.blend).toBeUndefined();
    expect(blendOf(screened, ["v", "t"])).toBe("screen");
    expect(blendOf(screened, ["v", "s"])).toBe("mixed");
    expect(setBlend(screened, ["v", "t"], "screen")).toBeNull();
    const back = run(screened, setBlend(screened, ["v"], "normal"));
    expect("blend" in (back.clips.v as object)).toBe(false);
  });

  it("lists matte candidates of the clip's own sequence: visual clips, not itself", () => {
    const p = doc();
    expect(matteCandidates(p, "v").map((c) => c.id)).toEqual(["t", "s", "c"]);
    expect(matteCandidates(p, "inner").map((c) => c.id)).toEqual([]);
  });

  it("sets a matte and hides the matte clip in the same step; clears it again", () => {
    const p = doc();
    const command = setMatte(p, ["v"], { clipId: "t", mode: "alpha" });
    expect(command?.id).toBe("clip.matte");
    const matted = run(p, command);
    expect(matted.clips.v?.matte).toEqual({ clipId: "t", mode: "alpha" });
    expect(matted.clips.t?.matteOnly).toBe(true);
    expect(matteClipOf(matted, ["v"])).toBe("t");
    expect(matteModeOf(matted, ["v"])).toBe("alpha");
    expect(matteOnlyOf(matted, ["t"])).toBe(true);
    const inverted = run(matted, setMatteMode(matted, ["v", "s"], "lumaInverted"));
    expect(inverted.clips.v?.matte?.mode).toBe("lumaInverted");
    expect(inverted.clips.s?.matte).toBeUndefined();
    const cleared = run(inverted, setMatte(inverted, ["v"], null));
    expect(cleared.clips.v?.matte).toBeUndefined();
    // The matte clip stays hidden until shown on purpose.
    expect(cleared.clips.t?.matteOnly).toBe(true);
    const shown = run(cleared, setMatteOnly(cleared, ["t"], false));
    expect("matteOnly" in (shown.clips.t as object)).toBe(false);
  });

  it("refuses a clip as its own matte, a matte in another sequence and a clip that draws nothing", () => {
    const p = doc();
    expect(setMatte(p, ["t"], { clipId: "t", mode: "alpha" })).toBeNull();
    expect(setMatte(p, ["v"], { clipId: "inner", mode: "alpha" })).toBeNull();
    expect(setMatte(p, ["v"], { clipId: "a", mode: "alpha" })).toBeNull();
    expect(setMatte(p, ["a"], { clipId: "t", mode: "alpha" })).toBeNull();
    expect(setMatte(p, ["v"], null)).toBeNull();
  });

  it("leaves locked clips alone", () => {
    const p = doc();
    p.tracks[0] = { ...(p.tracks[0] as Project["tracks"][number]), locked: true };
    expect(setBlend(p, ["v"], "multiply")).toBeNull();
    expect(setMatteOnly(p, ["v"], true)).toBeNull();
  });
});
