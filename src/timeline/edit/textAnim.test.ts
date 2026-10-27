import { describe, expect, it } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeTextClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { Project, TextClip } from "../../core/document/types.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createSessionStore } from "../../core/store/sessionStore.js";
import { animEdits, setTextAnims } from "./textAnim.js";

function project(): Project {
  const p = makeProject();
  p.tracks = [makeTrack("v1"), makeTrack("v2")];
  p.media.m = makeMedia("m");
  return withClips(p, [
    { ...makeTextClip({ id: "a", trackId: "v1", start: 0, duration: 90 }), animOut: { id: "fade", duration: 10 } },
    makeTextClip({ id: "b", trackId: "v2", start: 0, duration: 30 }),
    makeMediaClip(p, { id: "v", trackId: "v1", mediaId: "m", start: 100, duration: 30 }),
  ]);
}

describe("setTextAnims", () => {
  it("sets and removes animations on text clips as one undo step", () => {
    const p = project();
    const store = new DocumentStore(p, { session: createSessionStore(), validate: true });
    const command = setTextAnims(
      p,
      new Map([
        ["a", { animIn: { id: "wordPop", duration: 24 }, animOut: null }],
        ["b", { animIn: { id: "wordPop", duration: 24 } }],
        ["v", { animIn: { id: "fade", duration: 5 } }],
      ]),
      { label: "In animation: Word pop" },
    );
    expect(command?.id).toBe("clip.animation");
    expect(command?.affects).toContain("clips");
    store.dispatch(command as NonNullable<typeof command>);
    const a = store.getState().clips.a as TextClip;
    expect(a.animIn).toEqual({ id: "wordPop", duration: 24 });
    expect("animOut" in a).toBe(false);
    expect((store.getState().clips.b as TextClip).animIn).toEqual({ id: "wordPop", duration: 24 });
    expect("animIn" in (store.getState().clips.v as object)).toBe(false);
    store.undo();
    expect(store.getState()).toEqual(p);
  });

  it("skips locked clips and clips that would not change, and coalesces by key", () => {
    const p = project();
    expect(setTextAnims(p, new Map([["a", { animOut: { id: "fade", duration: 10 } }]]), { label: "x" })).toBeNull();
    expect(setTextAnims(p, new Map([["b", { animOut: null }]]), { label: "x" })).toBeNull();
    p.tracks[1]!.locked = true;
    expect(setTextAnims(p, new Map([["b", { animIn: { id: "fade", duration: 10 } }]]), { label: "x" })).toBeNull();
    p.tracks[1]!.locked = false;
    expect(setTextAnims(p, new Map([["b", { animIn: { id: "fade", duration: 10 } }]]), { label: "x", coalesceKey: "k" })?.coalesceKey).toBe("k");
  });

  it("builds per-clip edits from each clip's own animation", () => {
    const p = project();
    const edits = animEdits(p, ["a", "b", "v"], "animOut", (current) => (current ? { ...current, duration: current.duration + 5 } : undefined));
    expect([...edits]).toEqual([["a", { animOut: { id: "fade", duration: 15 } }]]);
  });
});
