import { describe, expect, it } from "vitest";
import type { Command } from "../../core/commands/command.js";
import { setPerspective } from "../../core/commands/projectCommands.js";
import { makeCompoundClip, makeProject, makeSolidClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import { animatedTransform } from "../../core/document/keyframes.js";
import type { Clip, Project, Transform } from "../../core/document/types.js";
import { validateProject } from "../../core/document/validate.js";
import { runInScope } from "../../core/store/DocumentStore.js";
import { backfaceHiddenAll, depthSortOf, resetDepth, setBackfaceHidden, setDepthSort } from "./depth.js";
import { IDENTITY_TRANSFORM, setTransforms } from "./transform.js";

const t = (fields: Partial<Transform> = {}): Transform => ({ ...IDENTITY_TRANSFORM, ...fields });

function doc(): Project {
  const p = makeProject();
  p.tracks = [makeTrack("v1"), makeTrack("v2")];
  const inner = makeTrack("in-1");
  p.sequences.seq = { id: "seq", name: "seq", size: { w: 1080, h: 1920 }, duration: 60, background: null, tracks: [inner] };
  return withClips(p, [
    { ...makeSolidClip({ id: "a", trackId: "v1", start: 0, duration: 30 }), transform: t({ rotationY: 40, z: 100 }) } as Clip,
    makeCompoundClip({ id: "c", trackId: "v2", start: 0, duration: 30, sequenceId: "seq" }),
  ]);
}

const run = (p: Project, command: Command | null): Project => {
  if (!command) return p;
  const next = structuredClone(p);
  command.run(next as never, { playhead: 0 } as never);
  expect(validateProject(next)).toEqual([]);
  return next;
};

describe("2.5D edits (spec §21.15, Batch 70)", () => {
  it("hides and shows the back side of layers; a no-op is no command", () => {
    const p = doc();
    const hidden = run(p, setBackfaceHidden(p, ["a", "c"], true));
    expect(hidden.clips.a?.backfaceHidden).toBe(true);
    expect(backfaceHiddenAll(hidden, ["a", "c"])).toBe(true);
    expect(setBackfaceHidden(hidden, ["a", "c"], true)).toBeNull();
    const shown = run(hidden, setBackfaceHidden(hidden, ["a"], false));
    expect(shown.clips.a).not.toHaveProperty("backfaceHidden");
  });

  it("resets X / Y rotation and depth to 0, keying at the playhead when the transform is keyed", () => {
    const p = doc();
    const flat = run(p, resetDepth(p, ["a"], 0));
    expect(flat.clips.a).toMatchObject({ transform: { rotationX: 0, rotationY: 0, z: 0 } });
    expect(resetDepth(flat, ["a"], 0)).toBeNull();
    // Keyed: two rotationY keys, the reset writes 0 at frame 20 only.
    const keyed = run(p, setTransforms(p, new Map([["a", t({ rotationY: 40, z: 100 })]]), { label: "k", at: 0 }));
    const withKeys = structuredClone(keyed);
    (withKeys.clips.a as { keyframes: Record<string, unknown> }).keyframes = { "transform.rotationY": [{ frame: 0, value: 40, ease: "linear" }, { frame: 29, value: 80, ease: "linear" }] };
    const reset = run(withKeys, resetDepth(withKeys, ["a"], 20));
    expect(animatedTransform(reset.clips.a as never, 20).rotationY).toBe(0);
    expect(animatedTransform(reset.clips.a as never, 0).rotationY).toBe(40);
  });

  it("sorts a compound's inner layers by depth on and off", () => {
    const p = doc();
    expect(depthSortOf(p, ["a"])).toBeNull();
    expect(depthSortOf(p, ["c"])).toBe(false);
    const on = run(p, setDepthSort(p, ["a", "c"], true));
    expect(on.sequences.seq?.depthSort).toBe(true);
    expect(depthSortOf(on, ["c"])).toBe(true);
    expect(setDepthSort(on, ["c"], true)).toBeNull();
    expect(run(on, setDepthSort(on, ["c"], false)).sequences.seq).not.toHaveProperty("depthSort");
  });

  it("sets the perspective within limits, null for none; inside an open compound it is the sequence's", () => {
    const p = doc();
    expect(run(p, setPerspective(800)).settings.perspective).toBe(800);
    expect(run(p, setPerspective(null)).settings.perspective).toBeNull();
    expect(run(p, setPerspective(3)).settings.perspective).toBe(100);
    const scoped = structuredClone(p);
    runInScope(scoped as never, "seq", (draft) => setPerspective(500).run(draft as never, { playhead: 0 } as never));
    expect(scoped.sequences.seq?.perspective).toBe(500);
    expect(scoped.settings).not.toHaveProperty("perspective");
    expect(validateProject(scoped)).toEqual([]);
  });
});
