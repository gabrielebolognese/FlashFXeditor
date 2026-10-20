// The overlay's drag drawing cost (spec §6.17): overwrite hatching is drawn only where it is visible.
// jsdom has no canvas, so a recording stand-in for the 2D context counts the hatch lines.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeTrack } from "../../core/document/fixtures.js";
import type { Frame } from "../../core/document/types.js";
import { drawOverlay } from "./drawOverlay.js";
import { METRICS, testTheme } from "./fixtures.js";
import { TimelineGeometry } from "./geometry.js";
import type { MoveProposal } from "./gestures/moveClips.js";
import { TextCache } from "./textCache.js";

/** The x of every `moveTo` (one per hatch line). */
const moves: number[] = [];

/** A 2D context that accepts every call; text is 6 px per character. */
function fakeContext(): CanvasRenderingContext2D {
  const state: Record<string | symbol, unknown> = {
    canvas: { width: 1000, height: 428 },
    font: "",
    measureText: (text: string) => ({ width: text.length * 6 }),
    moveTo: (x: number) => void moves.push(x),
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
function drawDrag(hatch: [Frame, Frame], pxPerFrame: number, scrollFrame: number): void {
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
    tooltip: null,
    text: new TextCache(),
  });
}

describe("drawOverlay: overwrite hatching", () => {
  beforeEach(() => {
    moves.length = 0;
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
