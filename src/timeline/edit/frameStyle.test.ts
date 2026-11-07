import { describe, expect, it } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeSolidClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import { validateStrict } from "../../core/document/strict.js";
import type { MediaClip, Project, SolidClip } from "../../core/document/types.js";
import { validateProject } from "../../core/document/validate.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createSessionStore } from "../../core/store/sessionStore.js";
import { parseProjectFile, serializeProject } from "../../project/projectFile.js";
import { DEFAULT_SHADOW, DEFAULT_STROKE, setFrameStyle, SOFT_SHADOW } from "./frameStyle.js";
import { random, randomProject } from "./fuzzKit.js";

function project(): Project {
  const p = makeProject();
  p.tracks = [makeTrack("v1"), makeTrack("v2"), makeTrack("a1", "audio")];
  p.media.m1 = makeMedia("m1", "video");
  return withClips(p, [makeSolidClip({ id: "s", trackId: "v1", start: 0, duration: 90 }), makeMediaClip(p, { id: "v", trackId: "v2", start: 0, duration: 90, mediaId: "m1" })]);
}

const store = (p: Project) => new DocumentStore(p, { session: createSessionStore(), validate: true });
const STAMP = { now: "2026-11-07T00:00:00.000Z", appVersion: "test" };

describe("setFrameStyle (Batch 58)", () => {
  it("adds a stroke and a shadow to a solid and a picture as one undo step, and removes them again", () => {
    const s = store(project());
    const command = setFrameStyle(s.getState(), ["s", "v"], () => ({ stroke: { ...DEFAULT_STROKE }, shadow: { ...DEFAULT_SHADOW } }), { label: "Frame" });
    expect(command?.id).toBe("clip.frameStyle");
    s.dispatch(command!);
    expect((s.getState().clips.s as SolidClip).stroke).toEqual(DEFAULT_STROKE);
    expect((s.getState().clips.v as MediaClip).shadow).toEqual(DEFAULT_SHADOW);
    expect(s.history.getState().undoLabel).toBe("Frame");
    s.dispatch(setFrameStyle(s.getState(), ["s", "v"], () => ({ stroke: null, shadow: null }), { label: "Clear" })!);
    expect(s.getState().clips.s).not.toHaveProperty("stroke");
    expect(s.getState().clips.v).not.toHaveProperty("shadow");
  });

  it("rounds a picture's corners and a solid's four corners; one radius drops the per-corner ones", () => {
    const s = store(project());
    s.dispatch(setFrameStyle(s.getState(), ["v"], () => ({ cornerRadius: 40.4 }), { label: "R" })!);
    expect((s.getState().clips.v as MediaClip).cornerRadius).toBe(40);
    s.dispatch(setFrameStyle(s.getState(), ["s"], () => ({ cornerRadii: [0, 10.6, 20, 30] }), { label: "R4" })!);
    expect((s.getState().clips.s as SolidClip).cornerRadii).toEqual([0, 11, 20, 30]);
    s.dispatch(setFrameStyle(s.getState(), ["s"], () => ({ cornerRadius: 12 }), { label: "R1" })!);
    expect(s.getState().clips.s).not.toHaveProperty("cornerRadii");
    // A picture ignores per-corner radii.
    expect(setFrameStyle(s.getState(), ["v"], () => ({ cornerRadii: [1, 2, 3, 4] }), { label: "x" })).toBeNull();
  });

  it("skips locked clips, other kinds and unchanged clips", () => {
    const p = project();
    p.tracks[0]!.locked = true;
    expect(setFrameStyle(p, ["s"], () => ({ stroke: { ...DEFAULT_STROKE } }), { label: "x" })).toBeNull();
    expect(setFrameStyle(p, ["missing"], () => ({ stroke: { ...DEFAULT_STROKE } }), { label: "x" })).toBeNull();
    const s = store(project());
    s.dispatch(setFrameStyle(s.getState(), ["v"], () => ({ shadow: { ...SOFT_SHADOW } }), { label: "x" })!);
    expect(setFrameStyle(s.getState(), ["v"], () => ({ shadow: { ...SOFT_SHADOW } }), { label: "x" })).toBeNull();
  });

  it("coalesces steps with the same key", () => {
    const s = store(project());
    s.dispatch(setFrameStyle(s.getState(), ["v"], () => ({ cornerRadius: 10 }), { label: "R", coalesceKey: "k" })!);
    s.dispatch(setFrameStyle(s.getState(), ["v"], () => ({ cornerRadius: 11 }), { label: "R", coalesceKey: "k" })!);
    s.undo();
    expect((s.getState().clips.v as MediaClip).cornerRadius).toBeUndefined();
  });
});

describe("frame styles on random projects", () => {
  for (const seed of [21, 22, 23, 24]) {
    it(`seed ${seed}: styled solids and pictures stay valid, strict and byte-stable through save and open`, () => {
      const rng = random(seed);
      const base = randomProject(random(seed), { id: `p${seed}`, idPrefix: `f${seed}_`, locks: "none", captions: false });
      const s = store(base);
      const ids = Object.keys(s.getState().clips);
      let changed = 0;
      for (const id of ids) {
        const command = setFrameStyle(
          s.getState(),
          [id],
          () => ({
            ...(rng.chance(0.5) && { cornerRadius: rng.int(0, 90) }),
            ...(rng.chance(0.6) && { stroke: { width: rng.int(0, 20), color: { r: rng.next(), g: 0.2, b: 0.4, a: 1 }, align: rng.pick(["inside", "center", "outside"] as const), ...(rng.chance(0.4) && { dash: [rng.int(1, 30), rng.int(1, 30)], dashOffset: rng.int(-50, 50) }) } }),
            ...(rng.chance(0.6) && { shadow: { x: rng.int(-30, 30), y: rng.int(-30, 30), blur: rng.int(0, 40), spread: rng.int(-5, 10), color: { r: 0, g: 0, b: 0, a: 0.5 } } }),
          }),
          { label: "fuzz" },
        );
        if (command) {
          s.dispatch(command);
          changed++;
        }
      }
      expect(changed).toBeGreaterThan(0);
      const after = s.getState();
      expect(validateProject(after)).toEqual(validateProject(base));
      const text = serializeProject(after, STAMP);
      expect(validateStrict(JSON.parse(text)).errors).toEqual([]);
      expect(parseProjectFile(text).clips).toEqual(after.clips);
      // Undoing everything restores the starting document.
      while (s.history.getState().canUndo) s.undo();
      expect(s.getState().clips).toEqual(base.clips);
    });
  }
});
