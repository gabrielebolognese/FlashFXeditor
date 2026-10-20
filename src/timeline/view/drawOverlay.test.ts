// The overlay's drag drawing (spec §6.17): overwrite hatching is drawn only where it is visible; the
// snap line and the snap target's name (spec §6.9). jsdom has no canvas, so a recording stand-in for
// the 2D context counts the hatch lines and keeps the filled rects and texts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeTrack } from "../../core/document/fixtures.js";
import type { Frame } from "../../core/document/types.js";
import { drawOverlay, type OverlayScene } from "./drawOverlay.js";
import { METRICS, testTheme } from "./fixtures.js";
import { TimelineGeometry } from "./geometry.js";
import type { MoveProposal } from "./gestures/moveClips.js";
import { TextCache } from "./textCache.js";

/** The x of every `moveTo` (one per hatch line). */
const moves: number[] = [];
const rects: { style: unknown; x: number; y: number; width: number; height: number }[] = [];
const texts: { style: unknown; font: unknown; text: string; x: number }[] = [];

/** A 2D context that accepts every call; text is 6 px per character. */
function fakeContext(): CanvasRenderingContext2D {
  const state: Record<string | symbol, unknown> = {
    canvas: { width: 1000, height: 428 },
    font: "",
    measureText: (text: string) => ({ width: text.length * 6 }),
    moveTo: (x: number) => void moves.push(x),
    fillRect: (x: number, y: number, width: number, height: number) => void rects.push({ style: state.fillStyle, x, y, width, height }),
    fillText: (text: string, x: number) => void texts.push({ style: state.fillStyle, font: state.font, text, x }),
  };
  return new Proxy(state, {
    get: (target, key) => (key in target ? target[key] : () => {}),
    set: (target, key, value) => {
      target[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

/** Draws a drag of one long clip on V1 whose overwritten part is `hatch`, at `pxPerFrame` from `scrollFrame`. */
function drawDrag(hatch: [Frame, Frame], pxPerFrame: number, scrollFrame: number, snap: Pick<OverlayScene, "snapFrame" | "tooltip"> = { snapFrame: null, tooltip: null }): void {
  const project = makeProject();
  project.media.m = makeMedia("m");
  const v1 = makeTrack("v1");
  const clip = makeMediaClip(project, { id: "long", trackId: "v1", start: 0, duration: 18_000, mediaId: "m" });
  const proposal: MoveProposal = {
    deltaFrames: 0,
    laneDelta: { video: 0, audio: 0 },
    mode: "overwrite",
    duplicate: false,
    ghosts: [{ clip, start: 0, target: { kind: "video", number: 0, track: v1 }, hatch: [hatch] }],
    newLanes: [],
    refused: null,
    insertFrame: null,
    end: clip.duration,
    snap: null,
  };
  const geometry = new TimelineGeometry({ width: 1000, height: 428, tracks: [v1, makeTrack("a1", "audio")], pxPerFrame, scrollFrame, scrollY: 0, metrics: METRICS });
  drawOverlay({
    ctx: fakeContext(),
    dpr: 1,
    geometry,
    theme: testTheme(),
    playhead: 0,
    scrubbing: false,
    hoverClip: null,
    hoverAddRow: null,
    hoverToggle: null,
    move: { proposal, newRowHeight: METRICS.trackHeight.M },
    marquee: null,
    text: new TextCache(),
    ...snap,
  });
}

describe("drawOverlay: overwrite hatching", () => {
  beforeEach(() => {
    moves.length = 0;
    rects.length = 0;
    texts.length = 0;
    vi.stubGlobal("Path2D", class {});
  });
  afterEach(() => vi.unstubAllGlobals());

  it("draws as many lines as fit the view, however long the span and deep the zoom", () => {
    // A 10 min overlap at 400 px/frame is 7.2 M px wide: unclamped, 1.2 M lines.
    drawDrag([0, 18_000], 400, 9_000);
    const area = { x: METRICS.headerWidth, width: 1000 - METRICS.headerWidth };
    const gap = testTheme().timeline.hatchGap;
    // Lines start up to one row height left of the area (they lean right), one per gap.
    expect(moves.length).toBeGreaterThan(area.width / gap);
    expect(moves.length).toBeLessThan((area.width + 2 * METRICS.trackHeight.M) / gap);
    // The grid stays anchored to x (no crawl while the ghost moves).
    expect(moves.every((x) => x % gap === 0)).toBe(true);
  });

  it("draws nothing for a span outside the view", () => {
    drawDrag([0, 1_000], 400, 9_000);
    expect(moves).toEqual([]);
  });
});

describe("drawOverlay: snapping", () => {
  const accent = testTheme().color.accent;
  beforeEach(() => {
    rects.length = 0;
    texts.length = 0;
    vi.stubGlobal("Path2D", class {});
  });
  afterEach(() => vi.unstubAllGlobals());

  it("draws the snap line in the accent color through the full height, before the ghosts", () => {
    // 4 px/frame from frame 0: frame 50 is at x = 176 + 200.
    drawDrag([0, 0], 4, 0, { snapFrame: 50, tooltip: null });
    const line = rects.find((rect) => rect.style === accent);
    expect(line).toEqual({ style: accent, x: 376, y: 0, width: 1, height: 428 });
    // The ghost body comes after the line (§6.17 order: snap lines, then ghosts).
    const ghostBody = rects.findIndex((rect) => rect.style === testTheme().timeline.clip.video.body);
    expect(ghostBody).toBeGreaterThan(rects.indexOf(line as (typeof rects)[number]));
  });

  it("draws no snap line off the track area or when nothing snapped", () => {
    drawDrag([0, 0], 4, 100, { snapFrame: 50, tooltip: null });
    expect(rects.filter((rect) => rect.style === accent)).toEqual([]);
    drawDrag([0, 0], 4, 0, { snapFrame: null, tooltip: null });
    expect(rects.filter((rect) => rect.style === accent)).toEqual([]);
  });

  it("writes the delta in mono and the snap target's name after it in the accent color", () => {
    drawDrag([0, 0], 4, 0, { snapFrame: 50, tooltip: { text: "Δ +00:00:10", target: "End of b", x: 300, y: 200 } });
    const [delta, target] = texts.slice(-2);
    expect(delta).toMatchObject({ text: "Δ +00:00:10", style: testTheme().color.textPrimary });
    expect(String(delta?.font)).toContain(testTheme().font.mono);
    expect(target).toMatchObject({ text: "End of b", style: accent });
    expect(String(target?.font)).not.toContain(testTheme().font.mono);
    expect(target?.x).toBeGreaterThan((delta?.x ?? 0) + "Δ +00:00:10".length * 6);
    // A scrub snap: the name alone.
    texts.length = 0;
    drawDrag([0, 0], 4, 0, { snapFrame: 50, tooltip: { text: null, target: "Playhead", x: 300, y: 10 } });
    expect(texts.at(-1)).toMatchObject({ text: "Playhead", style: accent });
  });
});
