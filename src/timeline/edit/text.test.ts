import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeSolidClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { Project, TextClip, TextPreset, TextStyle, Transform } from "../../core/document/types.js";
import { validateProject } from "../../core/document/validate.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createSessionStore } from "../../core/store/sessionStore.js";
import { approximateMeasurer, setTextMeasurer } from "../../render/text/layoutCache.js";
import { presetLook } from "../../text/presets.js";
import { starterPresets } from "../../text/starterPresets.js";
import { DEFAULT_TEXT_STYLE, DEFAULT_TITLE_STYLE, textContent, titleDefaults } from "../../text/style.js";
import { addTextClip, addTitle, applyPreset, keepAnchored, linkPreset, newTextClip, setTexts, SUBTITLE_BOTTOM, textClipName, titleDuration } from "./text.js";
import { IDENTITY_TRANSFORM, layerContent, layerPoint } from "./transform.js";

// The approximate measurer: 55 px per character at 100 px, lines 120 px tall at line height 1.2.
beforeAll(() => setTextMeasurer(approximateMeasurer));
afterAll(() => setTextMeasurer(null));

const style = (patch: Partial<TextStyle> = {}): TextStyle => ({ ...structuredClone(DEFAULT_TEXT_STYLE), fontSize: 100, lineHeight: 1.2, ...patch });

function project(clip: Partial<TextClip> = {}): Project {
  const p = makeProject();
  p.tracks = [makeTrack("v1"), makeTrack("v2"), makeTrack("a1", "audio")];
  return withClips(p, [{ ...newTextClip({ id: "t", trackId: "v1", start: 0, duration: 90, value: "ab", style: style() }), ...clip }]);
}

const frame = { width: 1080, height: 1920 };

describe("keepAnchored", () => {
  it("leaves a centered, middle-anchored text growing evenly", () => {
    const t: Transform = { ...IDENTITY_TRANSFORM, x: 10, y: 20 };
    expect(keepAnchored(t, { width: 100, height: 50 }, { width: 200, height: 150 }, { align: "center", verticalAnchor: "middle" }, frame)).toEqual(t);
  });

  it("keeps the left edge of a left-aligned text and the bottom of a bottom-anchored one", () => {
    const t: Transform = { ...IDENTITY_TRANSFORM, x: 10, y: 20 };
    const next = keepAnchored(t, { width: 100, height: 50 }, { width: 200, height: 150 }, { align: "left", verticalAnchor: "bottom" }, frame);
    expect(next.x).toBe(60);
    expect(next.y).toBe(-30);
  });

  it("keeps the anchored point on the frame for a turned, scaled layer", () => {
    const t: Transform = { ...IDENTITY_TRANSFORM, x: 5, y: -7, rotation: 30, scale: 2, anchor: { x: 0.2, y: 0.7 } };
    const before = { width: 100, height: 50 };
    const after = { width: 160, height: 90 };
    const next = keepAnchored(t, before, after, { align: "right", verticalAnchor: "top" }, frame);
    const a = layerPoint(t, before, frame, 100, 0);
    const b = layerPoint(next, after, frame, 160, 0);
    expect(b.x).toBeCloseTo(a.x);
    expect(b.y).toBeCloseTo(a.y);
  });
});

describe("setTexts", () => {
  it("writes content and style as one undo step and moves the box by its anchor", () => {
    const p = project({ style: style({ align: "left", verticalAnchor: "top" }) });
    const store = new DocumentStore(p, { session: createSessionStore(), validate: true });
    const command = setTexts(p, new Map([["t", { text: textContent("ab\nabcd") }]]), { label: "Edit text" });
    expect(command?.affects).toContain("clips");
    store.dispatch(command as NonNullable<typeof command>);
    const clip = store.getState().clips.t as TextClip;
    expect(clip.text.value).toBe("ab\nabcd");
    // The box went from 110 x 120 to 220 x 240: its top-left stays put.
    expect(clip.transform.x).toBe(55);
    expect(clip.transform.y).toBe(60);
    expect(validateProject(store.getState())).toEqual([]);
    store.undo();
    expect((store.getState().clips.t as TextClip).text.value).toBe("ab");
  });

  it("changes only the composite for a style that the timeline does not show", () => {
    const p = project();
    const command = setTexts(p, new Map([["t", { style: style({ fontSize: 120 }) }]]), { label: "Change font size", coalesceKey: "properties.text.fontSize" });
    expect(command?.affects).toEqual(["composite", "text"]);
    expect(command?.coalesceKey).toBe("properties.text.fontSize");
  });

  it("skips unchanged, locked and non-text clips", () => {
    const p = withClips(project(), [makeSolidClip({ id: "s", trackId: "v2", start: 0, duration: 30 })]);
    expect(setTexts(p, new Map([["t", { style: style() }]]), { label: "x" })).toBeNull();
    expect(setTexts(p, new Map([["s", { style: style({ fontSize: 50 }) }]]), { label: "x" })).toBeNull();
    const locked = structuredClone(p);
    (locked.tracks[0] as { locked: boolean }).locked = true;
    expect(setTexts(locked, new Map([["t", { style: style({ fontSize: 50 }) }]]), { label: "x" })).toBeNull();
  });
});

describe("text clips", () => {
  it("names a clip by its first line", () => {
    expect(textClipName(textContent("Hello\nworld"), { textCase: "upper" })).toBe("HELLO");
    expect(textClipName(textContent("   "), { textCase: "none" })).toBe("Text");
    expect(textClipName(textContent("x".repeat(50)), { textCase: "none" })).toHaveLength(40);
  });

  it("has its layout box as content box", () => {
    const p = project();
    expect(layerContent(p, p.clips.t as TextClip)).toEqual({ width: 110, height: 120, left: 0, top: 0, right: 110, bottom: 120 });
  });

  it("goes on the topmost free video track, or on a new one above", () => {
    let n = 0;
    const newId = () => `id${++n}`;
    const p = project();
    const store = new DocumentStore(p, { session: createSessionStore(), validate: true });
    const first = addTextClip(p, 30, 90, newId, { value: "One" });
    store.dispatch(first.command);
    expect(store.getState().clips[first.clipId]?.trackId).toBe("v2");
    const second = addTextClip(store.getState(), 60, 90, newId, { value: "Two" });
    store.dispatch(second.command);
    const state = store.getState();
    const track = state.tracks.find((t) => t.clipIds.includes(second.clipId));
    expect(track?.name).toBe("V3");
    expect(state.tracks.map((t) => t.kind)).toEqual(["video", "video", "video", "audio"]);
    expect(validateProject(state)).toEqual([]);
    expect((state.clips[second.clipId] as TextClip).name).toBe("Two");
    store.undo();
    expect(store.getState().tracks).toHaveLength(3);
  });
});

describe("addTitle", () => {
  let n = 0;
  const newId = () => `n${++n}`;
  /** Tracks v1 (bottom), v2 (top), a1; the text clip "t" on v1 at 0..90 (110 x 120 px box, centered). */
  const base = () => project();

  it("puts a 3 s Title centered at the playhead on the topmost video track, content selected for typing", () => {
    const p = base();
    const store = new DocumentStore(p, { session: createSessionStore(), validate: true });
    const result = addTitle(p, { kind: "title", playhead: 45, matchClip: true }, newId);
    expect(result.command.label).toBe("Add title");
    store.dispatch(result.command);
    const clip = store.getState().clips[result.clipId] as TextClip;
    expect(clip).toMatchObject({ kind: "text", trackId: "v2", start: 45, duration: 90, name: "Title" });
    expect(clip.text.value).toBe("Title");
    expect(clip.style).toEqual(DEFAULT_TITLE_STYLE);
    expect(clip.transform).toEqual(IDENTITY_TRANSFORM);
    expect(validateProject(store.getState())).toEqual([]);
  });

  it("takes a new track above when the topmost one is taken there, locked or hidden, even with a lower one free", () => {
    const taken = withClips(base(), [makeSolidClip({ id: "s", trackId: "v2", start: 0, duration: 100 })]);
    const store = new DocumentStore(taken, { session: createSessionStore(), validate: true });
    const result = addTitle(taken, { kind: "title", playhead: 50, matchClip: false }, newId);
    store.dispatch(result.command);
    const state = store.getState();
    expect(state.tracks.map((t) => t.kind)).toEqual(["video", "video", "video", "audio"]);
    expect(state.tracks[2]?.clipIds).toEqual([result.clipId]);
    for (const flag of ["locked", "hidden"] as const) {
      const p = structuredClone(base());
      (p.tracks[1] as { locked: boolean; hidden: boolean })[flag] = true;
      const added = addTitle(p, { kind: "title", playhead: 300, matchClip: false }, newId);
      const s = new DocumentStore(p, { session: createSessionStore(), validate: true });
      s.dispatch(added.command);
      expect(s.getState().tracks).toHaveLength(4);
    }
  });

  it("matches the rest of the video clip under the playhead when asked", () => {
    const p = structuredClone(base());
    p.media.m = makeMedia("m");
    const withVideo = withClips(p, [makeMediaClip(p, { id: "v", trackId: "v2", start: 100, duration: 300, mediaId: "m" })]);
    expect(titleDuration(withVideo, 160, true)).toBe(240);
    expect(titleDuration(withVideo, 160, false)).toBe(90);
    expect(titleDuration(withVideo, 400, true)).toBe(90);
    // Matching: the title spans to the clip's end, on a new track (the video holds the top one).
    const result = addTitle(withVideo, { kind: "title", playhead: 160, matchClip: true }, newId);
    const store = new DocumentStore(withVideo, { session: createSessionStore(), validate: true });
    store.dispatch(result.command);
    expect(store.getState().clips[result.clipId]).toMatchObject({ start: 160, duration: 240 });
  });

  it("puts a Subtitle with a background box in the lower third, growing upwards", () => {
    const p = base();
    const result = addTitle(p, { kind: "subtitle", playhead: 0, matchClip: true }, newId);
    expect(result.command.label).toBe("Add subtitle");
    const store = new DocumentStore(p, { session: createSessionStore(), validate: true });
    store.dispatch(result.command);
    const clip = store.getState().clips[result.clipId] as TextClip;
    expect(clip.text.value).toBe("Subtitle");
    expect(clip.style.background).toMatchObject({ enabled: true, mode: "line" });
    expect(clip.style.verticalAnchor).toBe("bottom");
    const box = layerContent(store.getState(), clip) as NonNullable<ReturnType<typeof layerContent>>;
    const bottom = layerPoint(clip.transform, box, frame, 0, box.height).y;
    expect(bottom).toBeCloseTo(SUBTITLE_BOTTOM * frame.height, 0);
    expect(layerPoint(clip.transform, box, frame, 0, 0).y).toBeGreaterThan((frame.height * 2) / 3);
  });

  it("stacks a new title 40 px under the selected text clip", () => {
    const p = base();
    const result = addTitle(p, { kind: "title", playhead: 0, matchClip: true, below: "t" }, newId);
    const store = new DocumentStore(p, { session: createSessionStore(), validate: true });
    store.dispatch(result.command);
    const clip = store.getState().clips[result.clipId] as TextClip;
    const box = layerContent(store.getState(), clip) as NonNullable<ReturnType<typeof layerContent>>;
    // "t" ends at 960 + 60 = 1020; the new box starts 40 px lower.
    expect(layerPoint(clip.transform, box, frame, 0, 0).y).toBeCloseTo(1060, 0);
    expect(clip.transform.x).toBe(0);
  });

  it("never places a title at -0 (Batch 47 fuzz: JSON writes it as 0)", () => {
    // The selected text sits 0.2 px left of the center: the new title's x rounds to 0, not -0.
    const p = project({ transform: { ...IDENTITY_TRANSFORM, x: -0.2 } });
    const result = addTitle(p, { kind: "title", playhead: 0, matchClip: true, below: "t" }, newId);
    const store = new DocumentStore(p, { session: createSessionStore(), validate: true });
    store.dispatch(result.command);
    expect(Object.is((store.getState().clips[result.clipId] as TextClip).transform.x, 0)).toBe(true);
  });

  it("scales the defaults to the project frame", () => {
    const small = titleDefaults("title", { width: 720, height: 1280 });
    expect(small.style.fontSize).toBe(80);
    expect(titleDefaults("subtitle", { width: 720, height: 1280 }).box).toEqual({ mode: "fixed", width: 600 });
    expect(titleDefaults("title", frame).style).toEqual(DEFAULT_TITLE_STYLE);
  });
});

describe("setTexts with a transform", () => {
  it("takes the edit's transform instead of the anchored one", () => {
    const p = project();
    const transform: Transform = { ...IDENTITY_TRANSFORM, x: 33, y: -4 };
    const command = setTexts(p, new Map([["t", { style: style({ fontSize: 150 }), transform }]]), { label: "Resize text" });
    const store = new DocumentStore(p, { session: createSessionStore(), validate: true });
    store.dispatch(command as NonNullable<typeof command>);
    expect((store.getState().clips.t as TextClip).transform).toEqual(transform);
  });
});

describe("text clip names", () => {
  it("follow the text while the clip is named after it, and stay once the user named it", () => {
    const p = project();
    expect(p.clips.t?.name).toBe("ab");
    const store = new DocumentStore(p, { session: createSessionStore(), validate: true });
    store.dispatch(setTexts(p, new Map([["t", { text: textContent("hello\nworld") }]]), { label: "Edit text" }) as NonNullable<ReturnType<typeof setTexts>>);
    expect(store.getState().clips.t?.name).toBe("hello");
    const named = project({ name: "Intro" });
    const next = new DocumentStore(named, { session: createSessionStore(), validate: true });
    next.dispatch(setTexts(named, new Map([["t", { text: textContent("bye") }]]), { label: "Edit text" }) as NonNullable<ReturnType<typeof setTexts>>);
    expect(next.getState().clips.t?.name).toBe("Intro");
  });
});

describe("addTitle stacking", () => {
  it("keeps a Subtitle in the lower third with a text clip selected", () => {
    const p = project();
    const result = addTitle(p, { kind: "subtitle", playhead: 0, matchClip: true, below: "t" }, () => crypto.randomUUID());
    const store = new DocumentStore(p, { session: createSessionStore(), validate: true });
    store.dispatch(result.command);
    const clip = store.getState().clips[result.clipId] as TextClip;
    const box = layerContent(store.getState(), clip) as NonNullable<ReturnType<typeof layerContent>>;
    expect(layerPoint(clip.transform, box, frame, 0, box.height).y).toBeCloseTo(SUBTITLE_BOTTOM * frame.height, 0);
  });
});

describe("text presets on clips", () => {
  const look = { presetId: "p1", style: style({ fontFamily: "Oswald", fontSize: 80, textCase: "upper" as const }), box: { mode: "fixed" as const, width: 600 }, position: null };

  it("adds a title with a preset's look, preset id, label and length", () => {
    const p = project();
    const result = addTitle(p, { kind: "title", playhead: 10, matchClip: true, look: { ...look, duration: 45 }, label: 'Add "Bold"' }, () => crypto.randomUUID());
    expect(result.command.label).toBe('Add "Bold"');
    const store = new DocumentStore(p, { session: createSessionStore(), validate: true });
    store.dispatch(result.command);
    const clip = store.getState().clips[result.clipId] as TextClip;
    expect(clip).toMatchObject({ start: 10, duration: 45, presetId: "p1", text: { value: "Title", box: { mode: "fixed", width: 600 } }, transform: IDENTITY_TRANSFORM });
    expect(clip.style).toEqual(look.style);
    // A preset that applies its position puts the clip there.
    const placed = addTitle(store.getState(), { kind: "subtitle", playhead: 10, matchClip: true, look: { ...look, position: { x: -100, y: 400 } } }, () => crypto.randomUUID());
    store.dispatch(placed.command);
    expect((store.getState().clips[placed.clipId] as TextClip).transform).toMatchObject({ x: -100, y: 400 });
    expect(validateProject(store.getState())).toEqual([]);
  });

  it("brings a preset's animations to a selected clip and to new clips, in the project's frames (Batch 31)", () => {
    const preset = starterPresets().find((p) => p.id === "starter-lower-third") as TextPreset;
    const p = { ...project(), settings: { ...project().settings, fps: { num: 60, den: 1 } } };
    const presetFrames = presetLook(preset, p.settings);
    expect(presetFrames.animIn).toEqual({ id: "slideRight", duration: 30 });
    const apply = { presetId: preset.id, style: presetFrames.style, box: presetFrames.box, position: null, ...(presetFrames.animIn && { animIn: presetFrames.animIn }), ...(presetFrames.animOut && { animOut: presetFrames.animOut }) };
    const store = new DocumentStore(p, { session: createSessionStore(), validate: true });
    store.dispatch(applyPreset(p, ["t"], apply, "Apply") as NonNullable<ReturnType<typeof applyPreset>>);
    expect(store.getState().clips.t).toMatchObject({ animIn: { id: "slideRight", duration: 30 }, animOut: { id: "fade", duration: 24 } });
    const added = addTitle(store.getState(), { kind: "title", playhead: 100, matchClip: false, look: { ...presetFrames, presetId: preset.id } }, () => crypto.randomUUID());
    store.dispatch(added.command);
    expect(store.getState().clips[added.clipId]).toMatchObject({ presetId: preset.id, animIn: { id: "slideRight", duration: 30 }, animOut: { id: "fade", duration: 24 } });
  });

  it("applies a preset's style and box to the selected text clips, keeping content, timing and position", () => {
    const p = withClips(project({ name: "ab", transform: { ...IDENTITY_TRANSFORM, x: 30, y: 40 } }), [newTextClip({ id: "u", trackId: "v2", start: 0, duration: 30, value: "cd" }), makeSolidClip({ id: "s", trackId: "v2", start: 40, duration: 10 })]);
    const command = applyPreset(p, ["t", "u", "s", "gone"], look, 'Apply "Bold"');
    expect(command).toMatchObject({ id: "clip.applyPreset", label: 'Apply "Bold"' });
    const store = new DocumentStore(p, { session: createSessionStore(), validate: true });
    store.dispatch(command as NonNullable<typeof command>);
    const t = store.getState().clips.t as TextClip;
    expect(t).toMatchObject({ start: 0, duration: 90, presetId: "p1", text: { value: "ab", box: { mode: "fixed", width: 600 } }, transform: { x: 30, y: 40 } });
    expect(t.style).toEqual(look.style);
    // A clip still named after its text follows its new case.
    expect(t.name).toBe("AB");
    expect((store.getState().clips.u as TextClip).presetId).toBe("p1");
    // Nothing left to change: no command.
    expect(applyPreset(store.getState(), ["t", "u"], look, "Apply")).toBeNull();
    // With the position: moved there; one undo step takes it all back.
    store.dispatch(applyPreset(store.getState(), ["t"], { ...look, position: { x: 0, y: 500 } }, "Apply") as NonNullable<ReturnType<typeof applyPreset>>);
    expect((store.getState().clips.t as TextClip).transform).toMatchObject({ x: 0, y: 500 });
    store.undo();
    store.undo();
    expect(store.getState()).toEqual(p);
  });

  it("skips locked clips and replaces the animations", () => {
    const p = project({ animIn: { id: "fade", duration: 10 } });
    p.tracks[0]!.locked = true;
    expect(applyPreset(p, ["t"], look, "Apply")).toBeNull();
    p.tracks[0]!.locked = false;
    const store = new DocumentStore(p, { session: createSessionStore(), validate: true });
    store.dispatch(applyPreset(p, ["t"], { ...look, animOut: { id: "pop", duration: 8 } }, "Apply") as NonNullable<ReturnType<typeof applyPreset>>);
    expect(store.getState().clips.t).toMatchObject({ animOut: { id: "pop" } });
    expect((store.getState().clips.t as TextClip).animIn).toBeUndefined();
  });

  it("links a clip to the preset it was saved as", () => {
    const p = project();
    const command = linkPreset(p, "t", "p1", 'Save preset "Bold"');
    expect(command).toMatchObject({ id: "clip.linkPreset", label: 'Save preset "Bold"' });
    const store = new DocumentStore(p, { session: createSessionStore(), validate: true });
    store.dispatch(command as NonNullable<typeof command>);
    expect((store.getState().clips.t as TextClip).presetId).toBe("p1");
    expect(linkPreset(store.getState(), "t", "p1", "x")).toBeNull();
    expect(linkPreset(store.getState(), "gone", "p1", "x")).toBeNull();
  });
});
