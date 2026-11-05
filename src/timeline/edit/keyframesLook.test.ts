import { describe, expect, it } from "vitest";
import { makeMedia, makeProject, makeSolidClip, makeTextClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import { reverseSectionKeys, sampleValue, sectionFrames } from "../../core/document/keyframes.js";
import { clipLookAt, readProp } from "../../core/document/keyProps.js";
import type { Clip, Keyframes, Project, SolidClip, TextClip } from "../../core/document/types.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createSessionStore } from "../../core/store/sessionStore.js";
import { copyKeys, keyable, pasteKeys, reverseKeys, setKeysEase, setStopwatch, stopwatchOn, toggleKeyAt } from "./keyframes.js";
import { setFrameStyle } from "./frameStyle.js";
import { setSolids } from "./solid.js";

const CORAL = { r: 1, g: 0.4, b: 0.3, a: 1 };
const INK = { r: 0.05, g: 0.05, b: 0.1, a: 1 };

function project(clips: Clip[]): Project {
  const p = makeProject();
  p.media.m = { ...makeMedia("m", "video"), width: 1920, height: 1080 };
  p.tracks.push(makeTrack("v1"), makeTrack("v2"));
  return withClips(p, clips);
}
const solid = (id: string, fields: Partial<SolidClip> = {}): SolidClip => ({ ...makeSolidClip({ id, trackId: "v1", start: 100, duration: 60 }), fill: CORAL, ...fields });

function setup(clips: Clip[]) {
  const session = createSessionStore();
  const store = new DocumentStore(project(clips), { session, validate: true });
  const at = (frame: number) => session.state.set((state) => ({ ...state, playhead: frame }));
  return { store, at };
}
const get = <C extends Clip>(store: DocumentStore, id: string) => store.getState().clips[id] as C;
const edit = (store: DocumentStore, fields: Record<string, unknown>) => store.dispatch(setSolids(store.getState(), new Map([["s", fields as never]]), { label: "Edit" })!);

describe("look sections", () => {
  it("key a section on the clips that have its fields", () => {
    const text = makeTextClip({ id: "t", trackId: "v1", start: 0, duration: 10 });
    expect(keyable(solid("s"), "fill")).toBe(true);
    expect(keyable(solid("s", { fill: { angle: 0, stops: [] } as never }), "fill")).toBe(false);
    expect(keyable(solid("s"), "stroke")).toBe(false);
    expect(keyable(solid("s", { stroke: { width: 4, color: INK, align: "center" } }), "stroke")).toBe(true);
    expect(keyable(text, "text") && !keyable(text, "size")).toBe(true);
    expect(keyable(text, "anchor")).toBe(true);
  });

  it("Fill stopwatch on a solid, then a color change at another frame makes color keys", () => {
    const { store, at } = setup([solid("s")]);
    store.dispatch(setStopwatch(store.getState(), ["s"], "fill", true, 100)!);
    expect(get<SolidClip>(store, "s").keyframes?.fill).toEqual([{ frame: 0, value: [1, 0.4, 0.3, 1], ease: "linear" }]);
    expect(stopwatchOn(get(store, "s"), "fill")).toBe(true);
    // A field edit of the fill at the playhead (frame 30 of the clip) becomes a key; the base fill stays.
    at(130);
    edit(store, { fill: INK });
    const keyed = get<SolidClip>(store, "s");
    expect(keyed.fill).toEqual(CORAL);
    expect(keyed.keyframes?.fill?.map((key) => key.frame)).toEqual([0, 30]);
    expect(keyed.keyframes?.fill?.[1]?.value).toEqual([0.05, 0.05, 0.1, 1]);
    // Switching it off bakes the value shown at the playhead.
    store.dispatch(setStopwatch(store.getState(), ["s"], "fill", false, 130)!);
    const off = get<SolidClip>(store, "s");
    expect(off.keyframes).toBeUndefined();
    expect(off.fill).toEqual(INK);
  });

  it("an edit of an unkeyed property of a keyed clip stays a plain edit", () => {
    const { store } = setup([solid("s", { keyframes: { fill: [{ frame: 0, value: [1, 0, 0, 1], ease: "hold" }] } })]);
    edit(store, { cornerRadius: 12 });
    expect(get<SolidClip>(store, "s").cornerRadius).toBe(12);
    expect(get<SolidClip>(store, "s").keyframes?.cornerRadius).toBeUndefined();
  });

  it("readProp and clipLookAt show the keyed values and leave unkeyed clips as they are", () => {
    const plain = solid("s");
    expect(clipLookAt(plain, 5)).toBe(plain);
    const keyed = solid("k", { keyframes: { "size.w": [{ frame: 0, value: 100, ease: "linear" }, { frame: 10, value: 200, ease: "linear" }] } });
    expect(clipLookAt(keyed, 5).size.w).toBe(150);
    expect(readProp(keyed, "fill")).toEqual([1, 0.4, 0.3, 1]);
    expect(readProp(keyed, "stroke.width")).toBeUndefined();
  });

  it("toggles a look key at the playhead and removes it again", () => {
    const { store } = setup([solid("s", { keyframes: { cornerRadius: [{ frame: 0, value: 0, ease: "linear" }] } })]);
    store.dispatch(toggleKeyAt(store.getState(), ["s"], "corners", 120)!);
    expect(sectionFrames(get<SolidClip>(store, "s").keyframes, "corners")).toEqual([0, 20]);
    store.dispatch(toggleKeyAt(store.getState(), ["s"], "corners", 120)!);
    expect(sectionFrames(get<SolidClip>(store, "s").keyframes, "corners")).toEqual([0]);
  });
});

describe("edits at the playhead of a keyed look", () => {
  const atEdit = (store: DocumentStore, frame: number, fields: Record<string, unknown>) => {
    const command = setSolids(store.getState(), new Map([["s", fields as never]]), { label: "Edit", at: frame });
    if (command) store.dispatch(command);
  };

  it("an edit back to the base value at a frame whose key differs updates that key", () => {
    const { store, at } = setup([solid("s")]);
    store.dispatch(setStopwatch(store.getState(), ["s"], "fill", true, 100)!);
    at(130);
    atEdit(store, 130, { fill: INK });
    atEdit(store, 130, { fill: CORAL });
    const keys = get<SolidClip>(store, "s").keyframes?.fill;
    expect(keys?.map((key) => key.frame)).toEqual([0, 30]);
    expect(keys?.[1]?.value).toEqual([1, 0.4, 0.3, 1]);
    expect(get<SolidClip>(store, "s").fill).toEqual(CORAL);
  });

  it("a number typed as the base value at a key frame that differs keys it", () => {
    const { store, at } = setup([solid("s", { size: { w: 100, h: 100 } })]);
    store.dispatch(setStopwatch(store.getState(), ["s"], "size", true, 100)!);
    at(130);
    atEdit(store, 130, { size: { w: 200, h: 100 } });
    atEdit(store, 130, { size: { w: 100, h: 100 } });
    const keys = get<SolidClip>(store, "s").keyframes?.["size.w"];
    expect(keys?.map((key) => key.value)).toEqual([100, 100]);
    expect(get<SolidClip>(store, "s").size.w).toBe(100);
  });

  it("an edit of another property adds no key to a keyed one whose value differs from the base", () => {
    const { store, at } = setup([solid("s")]);
    store.dispatch(setStopwatch(store.getState(), ["s"], "fill", true, 100)!);
    at(130);
    atEdit(store, 130, { fill: INK });
    atEdit(store, 145, { cornerRadius: 12 });
    const next = get<SolidClip>(store, "s");
    expect(next.cornerRadius).toBe(12);
    expect(next.keyframes?.fill?.map((key) => key.frame)).toEqual([0, 30]);
  });
});

describe("Frame section edits of keyed look", () => {
  it("a shadow blur step starts from the keyed value at the playhead and keys it", () => {
    const shadow = { x: 0, y: 0, blur: 0, spread: 0, color: INK };
    const { store, at } = setup([solid("s", { shadow })]);
    store.dispatch(setStopwatch(store.getState(), ["s"], "shadow", true, 100)!);
    at(130);
    const blur = (value: number) => store.dispatch(setFrameStyle(store.getState(), ["s"], (clip) => ({ shadow: { ...clip.shadow!, blur: value } }), { label: "Blur", at: 130 })!);
    blur(40);
    const shown = clipLookAt(get<SolidClip>(store, "s"), 30);
    expect(shown.shadow?.blur).toBe(40);
    const step = setFrameStyle(store.getState(), ["s"], (clip) => ({ shadow: { ...clip.shadow!, blur: clip.shadow!.blur + 1 } }), { label: "Blur", at: 130 })!;
    store.dispatch(step);
    expect(clipLookAt(get<SolidClip>(store, "s"), 30).shadow?.blur).toBe(41);
    expect(get<SolidClip>(store, "s").shadow?.blur).toBe(0);
    expect(get<SolidClip>(store, "s").keyframes?.["shadow.color"]?.map((key) => key.frame)).toEqual([0]);
  });
});

describe("Reverse keys and Set ease for selected", () => {
  const keys = (): Keyframes => ({
    opacity: [
      { frame: 0, value: 0, ease: "quadIn" },
      { frame: 10, value: 0.5, ease: "bezier", bezier: [0.1, 0.2, 0.3, 0.9] },
      { frame: 30, value: 1, ease: "linear" },
    ],
  });

  it("mirrors the frames and the segment curves, keeping values", () => {
    const reversed = reverseSectionKeys(keys(), "opacity", new Set([0, 10, 30]))!.opacity!;
    expect(reversed.map((key) => [key.frame, key.value])).toEqual([[0, 1], [20, 0.5], [30, 0]]);
    const b = reverseSectionKeys({ opacity: [{ frame: 0, value: 0, ease: "bezier", bezier: [0.1, 0.2, 0.3, 0.9] }, { frame: 10, value: 1, ease: "linear" }] }, "opacity", new Set([0, 10]))!.opacity!;
    expect(b[0]?.value).toBe(1);
    expect(b[0]?.ease).toBe("bezier");
    expect(b[0]?.bezier?.map((n) => Math.round(n * 100) / 100)).toEqual([0.7, 0.1, 0.9, 0.8]);
  });

  it("reverses twice to the original timing", () => {
    const twice = reverseSectionKeys(reverseSectionKeys(keys(), "opacity", new Set([0, 10, 30])), "opacity", new Set([0, 20, 30]))!.opacity!;
    expect(twice.map((key) => [key.frame, key.value])).toEqual([[0, 0], [10, 0.5], [30, 1]]);
  });

  it("is one undo step and needs two keys", () => {
    const { store } = setup([solid("s", { keyframes: keys() })]);
    expect(reverseKeys(store.getState(), "s", "opacity", [10])).toBeNull();
    store.dispatch(reverseKeys(store.getState(), "s", "opacity", [0, 10, 30])!);
    expect(sampleValue(get<SolidClip>(store, "s").keyframes!.opacity!, 0)).toBe(1);
    store.undo();
    expect(sampleValue(get<SolidClip>(store, "s").keyframes!.opacity!, 0)).toBe(0);
  });

  it("sets an ease with bezier or spring parameters on the selected keys in one step", () => {
    const { store } = setup([solid("s", { keyframes: keys() })]);
    const frames = new Map([["s", [0, 10]]]);
    store.dispatch(setKeysEase(store.getState(), frames, "opacity", "bezier", { bezier: [0.68, -0.55, 0.27, 1.55] })!);
    const after = get<SolidClip>(store, "s").keyframes!.opacity!;
    expect(after[0]).toMatchObject({ ease: "bezier", bezier: [0.68, -0.55, 0.27, 1.55] });
    expect(after[1]).toMatchObject({ ease: "bezier", bezier: [0.68, -0.55, 0.27, 1.55] });
    expect(after[2]?.ease).toBe("linear");
    store.dispatch(setKeysEase(store.getState(), frames, "opacity", "spring", { spring: { damping: 0.5, frequency: 6 } })!);
    expect(get<SolidClip>(store, "s").keyframes!.opacity![0]).toEqual({ frame: 0, value: 0, ease: "spring", spring: { damping: 0.5, frequency: 6 } });
    expect(setKeysEase(store.getState(), frames, "opacity", "spring", { spring: { damping: 0.5, frequency: 6 } })).toBeNull();
    store.undo();
    // Both edits share a coalesce key (a drag in the curve editor is one undo step), so one undo reverts both.
    expect(get<SolidClip>(store, "s").keyframes!.opacity![0]).toMatchObject({ ease: "quadIn" });
  });

  it("copies three look keys on one clip and pastes them with their spacing on another", () => {
    const from = solid("a", { keyframes: { fill: [0, 5, 20].map((frame, i) => ({ frame, value: [i / 2, 0, 0, 1], ease: "hold" as const })) } });
    const { store } = setup([from, solid("b", { start: 300 })]);
    const clip = copyKeys(from, "fill", [0, 5, 20])!;
    store.dispatch(pasteKeys(store.getState(), ["b"], clip, 310)!);
    expect((store.getState().clips.b as SolidClip).keyframes?.fill?.map((key) => key.frame)).toEqual([10, 15, 30]);
    expect((store.getState().clips.b as SolidClip).keyframes?.fill?.[2]?.value).toEqual([1, 0, 0, 1]);
  });

  it("the text stopwatch keys font size, letter spacing and fill together", () => {
    const text: TextClip = makeTextClip({ id: "t", trackId: "v1", start: 0, duration: 30 });
    const { store } = setup([text]);
    store.dispatch(setStopwatch(store.getState(), ["t"], "text", true, 0)!);
    expect(Object.keys(get<TextClip>(store, "t").keyframes ?? {}).sort()).toEqual(["style.fill", "style.fontSize", "style.letterSpacing"]);
  });
});
