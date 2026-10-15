import { describe, expect, it, vi } from "vitest";
import { makeMedia, makeProject } from "../../core/document/fixtures.js";
import { formatTimecode } from "../../core/document/time.js";
import type { MediaItem } from "../../core/document/types.js";
import { createSessionStore, setSourceRange } from "../../core/store/sessionStore.js";
import { thumbLayout, type ThumbLevel } from "../../media/cache/thumbSheets.js";
import { hoverFrame, HoverScrub, markSource, rangeFractions, scrubCell, scrubFrames } from "./hoverScrub.js";

const FPS = { num: 30, den: 1 };
/** A 10 s 1080p30 video: 284 x 160 thumbnails, LOD0 every 2 s (1 sheet), LOD1 every 0.5 s (2 sheets). */
const video: MediaItem = { ...makeMedia("vid", "video", 10_000_000), width: 1920, height: 1080, fps: FPS };
const layout = thumbLayout(video)!;
const bitmapOf = (width: number, height: number) => ({ width, height }) as ImageBitmap;

describe("hover-scrub helpers", () => {
  it("maps the pointer across the thumbnail to 0..total frames", () => {
    expect(hoverFrame(0, 300)).toBe(0);
    expect(hoverFrame(0.2, 300)).toBe(60);
    expect(hoverFrame(1, 300)).toBe(300);
    expect(hoverFrame(-0.5, 300)).toBe(0);
    expect(hoverFrame(1.5, 300)).toBe(300);
    expect(scrubFrames(video, FPS)).toBe(300);
    expect(scrubFrames(makeMedia("s", "image", 0), FPS)).toBe(0);
  });

  it("marks in and out points: the out is the exclusive end, a point on the wrong side clears the other", () => {
    const frame = 33_333;
    const inAt2 = markSource(null, "in", 2_000_000, 10_000_000, frame);
    expect(inAt2).toEqual({ inUs: 2_000_000, outUs: null });
    const range = markSource(inAt2, "out", 5_000_000, 10_000_000, frame);
    expect(range).toEqual({ inUs: 2_000_000, outUs: 5_000_000 });
    expect(markSource(range, "in", 6_000_000, 10_000_000, frame)).toEqual({ inUs: 6_000_000, outUs: null });
    expect(markSource(range, "out", 1_000_000, 10_000_000, frame)).toEqual({ inUs: null, outUs: 1_000_000 });
    // Refused: an in point with less than a frame after it, an out point at the start.
    expect(markSource(range, "in", 9_990_000, 10_000_000, frame)).toBeNull();
    expect(markSource(range, "out", 0, 10_000_000, frame)).toBeNull();
  });

  it("gives the range bar's fractions", () => {
    expect(rangeFractions({ inUs: 2_000_000, outUs: 5_000_000 }, 10_000_000)).toEqual({ from: 0.2, to: 0.5 });
    expect(rangeFractions({ inUs: null, outUs: 5_000_000 }, 10_000_000)).toEqual({ from: 0, to: 0.5 });
    expect(rangeFractions({ inUs: 8_000_000, outUs: null }, 10_000_000)).toEqual({ from: 0.8, to: 1 });
  });

  it("picks the LOD1 cell when its sheet is in memory, else the nearest LOD0 one, and asks for the LOD1 sheet", () => {
    const sheets = new Map<string, ImageBitmap>();
    const sheetOf = (level: ThumbLevel, sheet: number) => sheets.get(`${level}/${sheet}`) ?? null;
    // 8.5 s: LOD1 thumbnail 17 (sheet 1, cell 1), LOD0 thumbnail 4 (8 s).
    expect(scrubCell(layout, 8_500_000, sheetOf)).toEqual({ image: null, key: "", want: 1 });
    const lod0 = bitmapOf(4 * 284, 2 * 160);
    sheets.set("0/0", lod0);
    expect(scrubCell(layout, 8_500_000, sheetOf)).toEqual({ image: { bitmap: lod0, sx: 0, sy: 160, sw: 284, sh: 160 }, key: "0/4", want: 1 });
    const lod1 = bitmapOf(4 * 284, 160);
    sheets.set("1/1", lod1);
    expect(scrubCell(layout, 8_500_000, sheetOf)).toEqual({ image: { bitmap: lod1, sx: 284, sy: 0, sw: 284, sh: 160 }, key: "1/17", want: 1 });
  });
});

function setup() {
  const project = makeProject();
  project.media.vid = video;
  project.media.still = makeMedia("still", "image", 0);
  const session = createSessionStore();
  const sheets = new Map<string, ImageBitmap>();
  let arrival: (() => void) | null = null;
  const deps = {
    sheets: {
      layout: (id: string) => (id === "vid" ? layout : null),
      sheet: (_id: string, level: ThumbLevel, sheet: number) => sheets.get(`${level}/${sheet}`) ?? null,
      hover: vi.fn(),
      subscribe: (listener: () => void) => {
        arrival = listener;
        return () => (arrival = null);
      },
    },
    painter: { scrub: vi.fn(), endScrub: vi.fn() },
    document: { getState: () => project },
    session: session.state,
    setRange: vi.fn((id: string, range: Parameters<typeof setSourceRange>[2]) => setSourceRange(session, id, range)),
    place: vi.fn(),
    dragging: () => false,
  };
  const scrub = new HoverScrub(deps);
  const card = (id: string) => {
    const element = document.createElement("div");
    element.dataset.mediaId = id;
    element.innerHTML = `<div data-thumb=""><canvas></canvas><span data-progress=""></span><span data-hover-time=""></span></div><span class="name">name</span>`;
    document.body.append(element);
    const thumb = element.querySelector<HTMLElement>("[data-thumb]")!;
    thumb.getBoundingClientRect = () => ({ left: 100, width: 200, top: 0, height: 112, right: 300, bottom: 112, x: 100, y: 0, toJSON: () => null });
    return { element, thumb, canvas: thumb.querySelector("canvas")!, progress: thumb.querySelector<HTMLElement>("[data-progress]")!, time: thumb.querySelector<HTMLElement>("[data-hover-time]")! };
  };
  const move = (target: Element, x: number) => scrub.move({ target, clientX: x, buttons: 0 });
  const key = (code: string, init: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent("keydown", { code, bubbles: true, cancelable: true, ...init });
    document.body.dispatchEvent(event);
    return event.defaultPrevented;
  };
  return { project, session, sheets, deps, scrub, card, move, key, arrive: () => arrival?.() };
}

describe("HoverScrub", () => {
  it("scrubs the hovered card: progress line, timecode, the picture from the sheets (no decoding)", () => {
    const t = setup();
    const c = t.card("vid");
    t.move(c.thumb, 140);
    expect(t.scrub.frame).toBe(60);
    expect(c.thumb.dataset.scrubbing).toBe("");
    expect(c.progress.style.left).toBe("calc(20% - 0.2 * var(--playhead-width))");
    expect(c.time.textContent).toBe(formatTimecode(60, FPS));
    // 2 s: LOD1 sheet 0 asked for; nothing in memory yet, so the poster stays.
    expect(t.deps.sheets.hover).toHaveBeenLastCalledWith({ mediaId: "vid", level: 1, sheet: 0 });
    expect(t.deps.painter.scrub).not.toHaveBeenCalled();
    // The sheet arrives: the cell of 2 s (LOD1 thumbnail 4: row 1, column 0) is drawn.
    const lod1 = bitmapOf(4 * 284, 4 * 160);
    t.sheets.set("1/0", lod1);
    t.arrive();
    expect(t.deps.painter.scrub).toHaveBeenLastCalledWith(c.canvas, { bitmap: lod1, sx: 0, sy: 160, sw: 284, sh: 160 });
    // Moving within the same frame changes nothing.
    t.move(c.canvas, 140.2);
    expect(t.deps.painter.scrub).toHaveBeenCalledTimes(1);

    t.scrub.leave();
    expect(t.deps.painter.endScrub).toHaveBeenCalledWith(c.canvas);
    expect(t.deps.sheets.hover).toHaveBeenLastCalledWith(null);
    expect(c.thumb.dataset.scrubbing).toBeUndefined();
    c.element.remove();
  });

  it("I and O set the hovered media's source range, Alt+X clears it, , and . place it (spec §12)", () => {
    const t = setup();
    const c = t.card("vid");
    t.move(c.thumb, 140);
    expect(t.key("KeyI", { key: "i" })).toBe(true);
    t.move(c.thumb, 200);
    expect(t.key("KeyO", { key: "o" })).toBe(true);
    expect(t.session.state.getState().sourceRanges.vid).toEqual({ inUs: 2_000_000, outUs: 5_000_000 });
    expect(t.key("Comma", { key: "," })).toBe(true);
    expect(t.deps.place).toHaveBeenCalledWith("vid", "insert");
    expect(t.key("Period", { key: "." })).toBe(true);
    expect(t.deps.place).toHaveBeenLastCalledWith("vid", "overwrite");
    // With Ctrl the key is a shortcut, not a mark.
    expect(t.key("KeyI", { key: "i", ctrlKey: true })).toBe(false);
    expect(t.key("KeyX", { key: "x", altKey: true })).toBe(true);
    expect(t.session.state.getState().sourceRanges).toEqual({});
    t.scrub.leave();
    // Not hovering: the keys go on to the shortcuts.
    expect(t.key("KeyI", { key: "i" })).toBe(false);
    c.element.remove();
  });

  it("does not scrub stills (I passes on) but places them; leaves when the pointer is off a thumbnail or pressed", () => {
    const t = setup();
    const still = t.card("still");
    t.move(still.thumb, 150);
    expect(still.thumb.dataset.scrubbing).toBeUndefined();
    expect(t.key("KeyI", { key: "i" })).toBe(false);
    expect(t.key("Comma", { key: "," })).toBe(true);
    expect(t.deps.place).toHaveBeenCalledWith("still", "insert");
    const name = still.element.querySelector(".name")!;
    t.move(name, 150);
    expect(t.scrub.mediaId).toBeNull();
    const c = t.card("vid");
    t.move(c.thumb, 150);
    expect(t.scrub.mediaId).toBe("vid");
    t.scrub.move({ target: c.thumb, clientX: 160, buttons: 1 });
    expect(t.scrub.mediaId).toBeNull();
    still.element.remove();
    c.element.remove();
  });
});
