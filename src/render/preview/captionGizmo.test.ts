// A cue's caption on the canvas (spec §20.3), with the approximate measurer: 55 px per character at
// 100 px, lines 120 px tall (line height 1.2).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addCaptionTrack, makeCaptionClip, makeProject, makeSolidClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { CaptionClip, CaptionStyle, Project } from "../../core/document/types.js";
import { defaultCaptionStyle } from "../../text/captions.js";
import { DEFAULT_TEXT_STYLE } from "../../text/style.js";
import { approximateMeasurer, setTextMeasurer } from "../text/layoutCache.js";
import { canvasLayersAt, layersUnder, pictureLayersAt } from "./canvasLayers.js";
import { captionMiddle, captionSizeGesture, captionTransform } from "./captionGizmo.js";

beforeAll(() => setTextMeasurer(approximateMeasurer));
afterAll(() => setTextMeasurer(null));

function style(patch: Partial<CaptionStyle> = {}): CaptionStyle {
  return { ...defaultCaptionStyle({ width: 1080, height: 1920 }), text: { ...structuredClone(DEFAULT_TEXT_STYLE), fontSize: 100, lineHeight: 1.2 }, maxWidth: 900, maxLines: 2, ...patch };
}

/** V1 with a full-frame solid, the caption track with cue q "ab" at 0..30. */
function project(captionStyle = style()): Project {
  const p = makeProject();
  p.tracks = [makeTrack("v1"), makeTrack("a1", "audio")];
  const withTrack = addCaptionTrack(p);
  withTrack.captionTracks.cc = { style: captionStyle };
  return withClips(withTrack, [makeSolidClip({ id: "s", trackId: "v1", start: 0, duration: 100 }), makeCaptionClip({ id: "q", trackId: "cc", start: 0, duration: 30, text: "ab" })]);
}

describe("the cue's caption as a canvas layer (spec §20.3)", () => {
  it("is the top layer, its box where the compositor draws it, hit on its glyphs", () => {
    const layers = canvasLayersAt(project(), 5);
    expect(layers.map((layer) => [layer.clipId, layer.cue ?? false])).toEqual([
      ["s", false],
      ["q", true],
    ]);
    const cue = layers[1]!;
    // 110 x 120, centered, its bottom edge at 78% of 1920.
    expect(cue.quad[0].x).toBeCloseTo(485);
    expect(cue.quad[2].y).toBeCloseTo(1920 * 0.78);
    expect(layersUnder(layers, 540, 1920 * 0.78 - 60)[0]?.clipId).toBe("q");
    expect(canvasLayersAt(project(), 40).map((layer) => layer.clipId)).toEqual(["s"]);
  });

  it("follows a cue's own style and a drag's position; hidden tracks have none, locked ones are in the picture only", () => {
    const p = project();
    p.clips.q = { ...(p.clips.q as CaptionClip), styleOverride: { position: "custom", x: 100, y: -500 } };
    const own = canvasLayersAt(p, 5)[1]!;
    expect(captionMiddle(own.transform, own.box)).toEqual({ x: 100, y: -500 });
    const moved = canvasLayersAt(p, 5, new Map([["q", { ...own.transform, y: -600 }]]))[1]!;
    expect(captionMiddle(moved.transform, moved.box)).toEqual({ x: 100, y: -600 });
    const hidden = project();
    hidden.tracks.find((track) => track.id === "cc")!.hidden = true;
    expect(canvasLayersAt(hidden, 5).some((layer) => layer.cue)).toBe(false);
    expect(pictureLayersAt(hidden, 5).some((layer) => layer.cue)).toBe(false);
    const locked = project();
    locked.tracks.find((track) => track.id === "cc")!.locked = true;
    expect(canvasLayersAt(locked, 5).some((layer) => layer.cue)).toBe(false);
    expect(pictureLayersAt(locked, 5).some((layer) => layer.cue)).toBe(true);
  });

  it("takes the live caption values: the cue list's text, a cue's live style", () => {
    const live = { texts: new Map([["q", "abcd"]]), styles: null, cueStyles: new Map([["q", style({ text: { ...style().text, fontSize: 200 } })]]) };
    const cue = canvasLayersAt(project(), 5, null, null, null, null, live)[1]!;
    expect(cue.box.width).toBeCloseTo(440);
    expect(cue.box.height).toBeCloseTo(240);
  });
});

describe("caption gestures (spec §20.3)", () => {
  it("places presets at their edge and Custom at its middle; a move ends as the box's middle", () => {
    expect(captionTransform(style(), 1920)).toMatchObject({ x: 0, anchor: { x: 0.5, y: 1 } });
    expect(captionTransform(style({ position: "custom", x: 20, y: -100 }), 1920)).toMatchObject({ x: 20, y: -100, anchor: { y: 0.5 } });
    const bottom = captionTransform(style(), 1920);
    expect(captionMiddle({ ...bottom, y: 400 }, { width: 110, height: 120 })).toEqual({ x: 0, y: 340 });
  });

  it("sizes the font by the pointer's travel along the corner's direction, keeping the anchor", () => {
    const transform = captionTransform(style(), 1920);
    const box = { width: 110, height: 120, left: 0, top: 0, right: 110, bottom: 120 };
    const start = { clipId: "q", text: "ab", style: style(), transform, box, frame: { width: 1080, height: 1920 } };
    // The anchor (bottom middle) at (540, 1497.6); the top-right handle 55 right and 120 up of it.
    const anchor = { x: 540, y: 1920 * 0.78 };
    const twice = captionSizeGesture(start, "ne", { x: anchor.x + 110, y: anchor.y - 240 });
    expect(twice.fontSize).toBe(200);
    expect(twice.style.text.fontSize).toBe(200);
    expect(twice.readout).toBe("200 px");
    // The bottom stays: the box grows up.
    expect(twice.box[2].y).toBeCloseTo(anchor.y);
    expect(twice.box[0].y).toBeCloseTo(anchor.y - 240);
    expect(captionSizeGesture(start, "sw", { x: anchor.x - 27.5, y: anchor.y }).fontSize).toBe(50);
    // Clamped to the text limits.
    expect(captionSizeGesture(start, "ne", { x: anchor.x - 500, y: anchor.y + 500 }).fontSize).toBeGreaterThan(0);
  });
});
