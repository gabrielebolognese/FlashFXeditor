import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TextStyle, Transform } from "../../core/document/types.js";
import { DEFAULT_TEXT_STYLE, textContent } from "../../text/style.js";
import { IDENTITY_TRANSFORM } from "../../timeline/edit/transform.js";
import { approximateMeasurer, setTextMeasurer } from "../text/layoutCache.js";
import { textSizeGesture, textWidthGesture, type TextGestureStart } from "./textGizmo.js";

// The approximate measurer: 55 px per character at 100 px, lines 120 px tall at line height 1.2.
beforeAll(() => setTextMeasurer(approximateMeasurer));
afterAll(() => setTextMeasurer(null));

const frame = { width: 1080, height: 1920 };
const style = (patch: Partial<TextStyle> = {}): TextStyle => ({ ...structuredClone(DEFAULT_TEXT_STYLE), fontSize: 100, lineHeight: 1.2, ...patch });
const start = (value: string, patch: Partial<TextStyle> = {}, transform: Transform = IDENTITY_TRANSFORM, box = textContent(value).box): TextGestureStart => ({
  clipId: "t",
  text: textContent(value, box),
  style: style(patch),
  transform,
  frame,
});

describe("textSizeGesture", () => {
  it("sizes the font from a corner, the opposite corner staying put", () => {
    // "ab": a 110 x 120 box centered on the frame, from (485, 900) to (595, 1020).
    const result = textSizeGesture(start("ab"), "se", { x: 650, y: 1080 }, { alt: false });
    expect(result.style.fontSize).toBe(150);
    expect(result.readout).toBe("150 px");
    expect(result.box[0].x).toBeCloseTo(485);
    expect(result.box[0].y).toBeCloseTo(900);
    expect(result.box[2].x).toBeCloseTo(650);
    expect(result.box[2].y).toBeCloseTo(1080);
    expect(result.transform.scale).toBe(1);
  });

  it("sizes around the center with Alt", () => {
    const result = textSizeGesture(start("ab"), "se", { x: 595 + 27.5, y: 1020 + 30 }, { alt: true });
    expect(result.style.fontSize).toBe(150);
    expect(result.transform.x).toBeCloseTo(0);
    expect(result.transform.y).toBeCloseTo(0);
  });

  it("scales a fixed box's width with the text, so the lines break the same", () => {
    const s = start("aa bb", { align: "left" }, IDENTITY_TRANSFORM, { mode: "fixed", width: 150 });
    // Two lines in a 150 x 240 box from (465, 840) to (615, 1080); twice as large from the se corner.
    const result = textSizeGesture(s, "nw", { x: 615 - 300, y: 1080 - 480 }, { alt: false });
    expect(result.style.fontSize).toBe(200);
    expect(result.text.box).toEqual({ mode: "fixed", width: 300 });
  });

  it("works in the layer's own axes when it is turned and scaled", () => {
    const turned: Transform = { ...IDENTITY_TRANSFORM, rotation: 90, scale: 2 };
    // Turned a quarter, the box's se corner is at the bottom-left on the frame.
    const s = start("ab", {}, turned);
    const before = textSizeGesture(s, "se", { x: 540 - 120, y: 960 + 110 }, { alt: false });
    expect(before.style.fontSize).toBeCloseTo(100);
    const bigger = textSizeGesture(s, "se", { x: 540 - 120 - 120, y: 960 + 110 + 110 }, { alt: false });
    expect(bigger.style.fontSize).toBeCloseTo(150);
    expect(bigger.transform.scale).toBe(2);
  });
});

describe("textWidthGesture", () => {
  it("turns an auto box fixed and reflows the text, the other side and the anchored height staying put", () => {
    // "aa bb": a 275 x 120 box from (402.5, 900) to (677.5, 1020).
    const s = start("aa bb", { verticalAnchor: "top" });
    const result = textWidthGesture(s, "e", { x: 402.5 + 150, y: 960 }, { alt: false });
    expect(result.text.box).toEqual({ mode: "fixed", width: 150 });
    expect(result.readout).toBe("W 150 px");
    // Two lines now, the box 150 x 240: its left side and its top stay.
    expect(result.box[0].x).toBeCloseTo(402.5);
    expect(result.box[0].y).toBeCloseTo(900);
    expect(result.box[2].y).toBeCloseTo(1140);
  });

  it("counts the background padding out of the width and keeps the minimum", () => {
    const s = start("aa bb", { background: { ...DEFAULT_TEXT_STYLE.background, enabled: true, paddingX: 20, paddingY: 0 } });
    // The box is 315 wide (275 + 2 x 20): from 382.5; the left handle dragged to 40 px short of the right side.
    const result = textWidthGesture(s, "w", { x: 697.5 - 240, y: 960 }, { alt: false });
    expect(result.text.box.width).toBe(200);
    expect(textWidthGesture(s, "w", { x: 697.5, y: 960 }, { alt: false }).text.box.width).toBe(10);
  });
});
