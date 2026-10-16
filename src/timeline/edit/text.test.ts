import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeProject, makeSolidClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { Project, TextClip, TextStyle, Transform } from "../../core/document/types.js";
import { validateProject } from "../../core/document/validate.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createSessionStore } from "../../core/store/sessionStore.js";
import { approximateMeasurer, setTextMeasurer } from "../../render/text/layoutCache.js";
import { DEFAULT_TEXT_STYLE, textContent } from "../../text/style.js";
import { addTextClip, keepAnchored, newTextClip, setTexts, textClipName } from "./text.js";
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
