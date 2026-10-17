// The overlay's drag drawing (spec §6.17): overwrite hatching is drawn only where it is visible; the
// snap line and the snap target's name (spec §6.9). jsdom has no canvas, so a recording stand-in for
// the 2D context counts the hatch lines and keeps the filled rects and texts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeTrack } from "../../core/document/fixtures.js";
import type { Frame, Project } from "../../core/document/types.js";
import { EMPTY_SELECTION } from "../../core/store/selection.js";
import { drawOverlay, type OverlayScene } from "./drawOverlay.js";
import { METRICS, testTheme } from "./fixtures.js";
import { TimelineGeometry } from "./geometry.js";
import { NO_MODIFIERS, type MoveProposal } from "./gestures/moveClips.js";
import { TrimGesture, type TrimProposal } from "./gestures/trimClip.js";
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
    trim: null,
    editPoints: [],
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

describe("drawOverlay: trims", () => {
  const theme = testTheme();
  beforeEach(() => {
    rects.length = 0;
    texts.length = 0;
    vi.stubGlobal("Path2D", class {});
  });
  afterEach(() => vi.unstubAllGlobals());

  /** V1: a [0, 50) at its media start, b [50, 80); the trim gesture moved a's in point by `delta`. */
  function drawTrim(delta: number, ripple = false) {
    const project = makeProject();
    project.media.m = makeMedia("m");
    const v1 = makeTrack("v1", "video", ["a", "b"]);
    project.tracks = [v1, makeTrack("a1", "audio")];
    project.clips.a = makeMediaClip(project, { id: "a", trackId: "v1", start: 0, duration: 50, mediaId: "m" });
    project.clips.b = makeMediaClip(project, { id: "b", trackId: "v1", start: 50, duration: 30, mediaId: "m" });
    const trim = new TrimGesture(project, { kind: "trim", clipId: "a", edge: "in" }, 0);
    const proposal = trim.update(delta, NO_MODIFIERS, { ripple, linkedSelection: true });
    drawScene(project, proposal, []);
    return proposal;
  }

  /** Draws the trim layer of `proposal` and the edit point brackets over V1 at 4 px/frame. */
  function drawScene(project: Project, proposal: TrimProposal | null, editPoints: OverlayScene["editPoints"]) {
    const geometry = new TimelineGeometry({ width: 1000, height: 428, tracks: project.tracks, pxPerFrame: 4, scrollFrame: 0, scrollY: 0, metrics: METRICS });
    drawOverlay({
      ctx: fakeContext(),
      dpr: 1,
      geometry,
      theme,
      playhead: 0,
      scrubbing: false,
      hoverClip: null,
      hoverAddRow: null,
      hoverToggle: null,
      snapFrame: null,
      move: null,
      trim: proposal ? { proposal, selection: EMPTY_SELECTION } : null,
      editPoints,
      marquee: null,
      tooltip: proposal ? { text: "Δ", target: null, alert: proposal.result.mediaBound ? "Media start" : null, x: 300, y: 200 } : null,
      text: new TextCache(),
    });
  }

  /** V1: a [0, 50) and b [50, 80), both at their media start. */
  function cutProject(): Project {
    const project = makeProject();
    project.media.m = makeMedia("m");
    project.tracks = [makeTrack("v1", "video", ["a", "b"]), makeTrack("a1", "audio")];
    project.clips.a = makeMediaClip(project, { id: "a", trackId: "v1", start: 0, duration: 50, mediaId: "m" });
    project.clips.b = makeMediaClip(project, { id: "b", trackId: "v1", start: 50, duration: 30, mediaId: "m" });
    return project;
  }

  it("redraws the trimmed row from the proposed document, then the ghost edge in the accent color", () => {
    drawTrim(10);
    // The V1 clip band (172 + 2 .. 228 - 2) is cleared over [0, 50): x 176..376.
    const clear = rects.find((rect) => rect.style === theme.color.bg);
    expect(clear).toMatchObject({ x: 176, y: 174, width: 200, height: 52 });
    // The trimmed clip drawn at its new place (frame 10: x 216), then the 2 px edge at its new in point.
    const body = rects.find((rect) => rect.style === theme.timeline.clip.video.body);
    expect(body?.x).toBe(216);
    const edge = rects.find((rect) => rect.style === theme.color.accent);
    expect(edge).toMatchObject({ x: 216, width: 2, height: 52 });
    expect(rects.indexOf(edge as (typeof rects)[number])).toBeGreaterThan(rects.indexOf(clear as (typeof rects)[number]));
  });

  it("draws the edge in the danger color at a media bound, with the alert last in the tooltip", () => {
    const proposal = drawTrim(-10);
    expect(proposal.result).toMatchObject({ delta: 0, mediaBound: "start" });
    expect(rects.some((rect) => rect.style === theme.color.danger)).toBe(true);
    expect(rects.some((rect) => rect.style === theme.color.accent)).toBe(false);
    expect(texts.at(-1)).toMatchObject({ text: "Media start", style: theme.color.danger });
  });

  it("draws both edges of a roll, red only on the side that sits on its media bound", () => {
    const project = cutProject();
    const roll = new TrimGesture(project, { kind: "roll", clipId: "a", edge: "out", rightId: "b" }, 50);
    // b has no frames before its in point: the cut cannot move left.
    const proposal = roll.update(40, NO_MODIFIERS, { ripple: false, linkedSelection: true });
    expect(proposal.result).toMatchObject({ delta: 0, mediaBound: "start" });
    expect(proposal.previewSplit).toEqual({ leftFrame: 49, rightFrame: 50 });
    drawScene(project, proposal, []);
    // The cut at x 376: a's out edge left of it in the accent color, b's in edge right of it in red.
    expect(rects).toContainEqual({ style: theme.color.accent, x: 374, y: 174, width: 2, height: 52 });
    expect(rects).toContainEqual({ style: theme.color.danger, x: 376, y: 174, width: 2, height: 52 });
    // Moving right is free: both edges in the accent color at the new cut.
    rects.length = 0;
    const right = roll.update(60, NO_MODIFIERS, { ripple: false, linkedSelection: true });
    expect(right.previewSplit).toEqual({ leftFrame: 59, rightFrame: 60 });
    drawScene(project, right, []);
    expect(rects.filter((rect) => rect.style === theme.color.danger)).toEqual([]);
    expect(rects.filter((rect) => rect.style === theme.color.accent && rect.width === 2).map((rect) => rect.x)).toEqual([414, 416]);
  });

  it("draws a selected edit point's brackets: both sides in red for a roll, one side in the accent color", () => {
    const project = cutProject();
    drawScene(project, null, [{ trackId: "v1", frame: 50, side: "both" }]);
    const red = rects.filter((rect) => rect.style === theme.color.danger);
    // `]` (spine left of the cut, serifs pointing left) and `[` (spine right of it, serifs pointing right).
    expect(red).toContainEqual({ style: theme.color.danger, x: 374, y: 174, width: 2, height: 52 });
    expect(red).toContainEqual({ style: theme.color.danger, x: 370, y: 174, width: 4, height: 2 });
    expect(red).toContainEqual({ style: theme.color.danger, x: 376, y: 174, width: 2, height: 52 });
    expect(red).toContainEqual({ style: theme.color.danger, x: 378, y: 224, width: 4, height: 2 });
    expect(red).toHaveLength(6);
    rects.length = 0;
    drawScene(project, null, [{ trackId: "v1", frame: 50, side: "right" }]);
    const gold = rects.filter((rect) => rect.style === theme.color.accent);
    expect(gold.map((rect) => rect.x)).toEqual([376, 378, 378]);
  });

  it("redraws the shifted clips of a ripple from where they start", () => {
    const proposal = drawTrim(10, true);
    expect(proposal.repaint.get("v1")).toEqual({ from: 0, to: Infinity });
    expect(proposal.project.clips.b?.start).toBe(40);
    // Cleared to the right end of the track area (and a frame past it, clipped).
    const clear = rects.find((rect) => rect.style === theme.color.bg);
    expect(clear?.x).toBe(176);
    expect((clear?.x ?? 0) + (clear?.width ?? 0)).toBeGreaterThanOrEqual(1000);
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

describe("drawOverlay: gaps and the Razor (Batch 15)", () => {
  const theme = testTheme();
  const strokes: { style: unknown; dash: unknown; x: number; width: number }[] = [];
  beforeEach(() => {
    rects.length = 0;
    strokes.length = 0;
    vi.stubGlobal("Path2D", class {});
  });
  afterEach(() => vi.unstubAllGlobals());

  /** Draws an idle overlay (4 px/frame from x = 176) with the gap and Razor fields given. */
  function draw(fields: Pick<OverlayScene, "hoverGap" | "gap" | "razor" | "silence">, scrollFrame = 0): TimelineGeometry {
    const ctx = fakeContext();
    let dash: number[] = [];
    Object.assign(ctx, {
      setLineDash: (value: number[]) => void (dash = value),
      strokeRect: (x: number, _y: number, width: number) => void strokes.push({ style: ctx.strokeStyle, dash, x, width }),
    });
    const geometry = new TimelineGeometry({ width: 1000, height: 428, tracks: [makeTrack("v1"), makeTrack("a1", "audio")], pxPerFrame: 4, scrollFrame, scrollY: 0, metrics: METRICS });
    drawOverlay({
      ctx,
      dpr: 1,
      geometry,
      theme,
      playhead: 0,
      scrubbing: false,
      hoverClip: null,
      hoverAddRow: null,
      hoverToggle: null,
      snapFrame: null,
      move: null,
      trim: null,
      editPoints: [],
      marquee: null,
      tooltip: null,
      text: new TextCache(),
      ...fields,
    });
    return geometry;
  }

  it("fills a hovered gap with the hover wash, a selected one with the accent wash and a dashed accent outline", () => {
    const geometry = draw({ hoverGap: { trackId: "v1", start: 10, end: 30 }, gap: { trackId: "a1", start: 0, end: 20 } });
    const v1 = geometry.rowOf("v1") as { y: number; height: number };
    const a1 = geometry.rowOf("a1") as { y: number; height: number };
    expect(rects).toContainEqual({ style: theme.color.hoverWash, x: 176 + 40, y: v1.y + 2, width: 80, height: v1.height - 4 });
    expect(rects).toContainEqual({ style: theme.color.accentWash, x: 176, y: a1.y + 2, width: 80, height: a1.height - 4 });
    const dash = theme.timeline.gapDash;
    expect(strokes).toEqual([{ style: theme.color.accent, dash: [dash, dash], x: 176 + 1, width: 78 }]);
  });

  it("hatches Remove silence's cuts in red over the clip band, a line at each end, visible parts only (Batch 38)", () => {
    const geometry = draw({
      silence: {
        segments: [
          { trackId: "a1", start: 10, end: 30 },
          { trackId: "v1", start: 500, end: 600 },
        ],
      },
    });
    const a1 = geometry.rowOf("a1") as { y: number; height: number };
    const fills = rects.filter((rect) => rect.style === theme.timeline.silenceFill);
    expect(fills).toEqual([{ style: theme.timeline.silenceFill, x: 176 + 40, y: a1.y + 2, width: 80, height: a1.height - 4 }]);
    const edges = rects.filter((rect) => rect.style === theme.timeline.silenceEdge);
    expect(edges.map((rect) => [rect.x, rect.width])).toEqual([
      [216, 1],
      [295, 1],
    ]);
  });

  it("does not light the selected gap with the hover wash too", () => {
    draw({ hoverGap: { trackId: "v1", start: 10, end: 30 }, gap: { trackId: "v1", start: 10, end: 30 } });
    expect(rects.some((rect) => rect.style === theme.color.hoverWash)).toBe(false);
    expect(strokes).toHaveLength(1);
  });

  it("draws the Razor's cut line across each clip it would cut, nothing off screen", () => {
    const project: Project = makeProject();
    project.media.m = makeMedia("m");
    const clips = [
      makeMediaClip(project, { id: "v", trackId: "v1", start: 0, duration: 100, mediaId: "m" }),
      makeMediaClip(project, { id: "a", trackId: "a1", start: 0, duration: 100, mediaId: "m", kind: "audio" }),
    ];
    const geometry = draw({ razor: { frame: 50, clips } });
    const lines = rects.filter((rect) => rect.style === theme.color.textPrimary);
    expect(lines.map((line) => [line.x, line.y, line.width])).toEqual([
      [376, (geometry.rowOf("v1")?.y ?? 0) + 2, 1],
      [376, (geometry.rowOf("a1")?.y ?? 0) + 2, 1],
    ]);
    rects.length = 0;
    draw({ razor: { frame: 50, clips } }, 500);
    expect(rects.filter((rect) => rect.style === theme.color.textPrimary)).toEqual([]);
  });
});
