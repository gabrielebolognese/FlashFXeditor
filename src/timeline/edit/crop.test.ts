import { describe, expect, it } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeSolidClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { Clip, Crop, MediaClip, Project, Transform } from "../../core/document/types.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createSessionStore } from "../../core/store/sessionStore.js";
import { clampCrop, cropRect, cropSize, cropToFrame, MIN_CROP_PX, NO_CROP, quickCrops, rectCrop, setCrops, withCropEdge } from "./crop.js";
import { IDENTITY_TRANSFORM, layerContent, layerCorners, quickTransforms, type ContentBox, type Point } from "./transform.js";

const FRAME = { width: 1080, height: 1920 };
const WIDE = { width: 1920, height: 1080 };
const t = (fields: Partial<Transform> = {}): Transform => ({ ...IDENTITY_TRANSFORM, ...fields, anchor: { ...IDENTITY_TRANSFORM.anchor, ...fields.anchor } });
/** The 16:9 media at Fit in the 9:16 frame (spec §6.19). */
const FIT = t({ scale: 1080 / 1920 });

function project(clips: Clip[] = []): Project {
  const p = makeProject();
  p.media.m = { ...makeMedia("m", "video"), width: 1920, height: 1080 };
  p.media.r = { ...makeMedia("r", "video"), width: 1920, height: 1080, rotation: 90 };
  p.tracks.push(makeTrack("v1"), makeTrack("v2"), makeTrack("a1", "audio"));
  return withClips(p, clips);
}

function video(id: string, fields: Partial<MediaClip> = {}): MediaClip {
  return { ...makeMediaClip(makeProject(), { id, trackId: "v1", start: 0, duration: 30, mediaId: "m" }), transform: FIT, ...fields };
}

function store(p: Project): DocumentStore {
  return new DocumentStore(p, { session: createSessionStore(), validate: true });
}

function expectCrop(actual: Crop | null, expected: Crop, digits = 9): void {
  expect(actual).not.toBeNull();
  for (const key of ["left", "top", "right", "bottom"] as const) expect((actual as Crop)[key]).toBeCloseTo(expected[key], digits);
}

function expectPoints(actual: readonly Point[], expected: readonly Point[], digits = 6): void {
  actual.forEach((p, i) => {
    expect(p.x).toBeCloseTo((expected[i] as Point).x, digits);
    expect(p.y).toBeCloseTo((expected[i] as Point).y, digits);
  });
}

const FRAME_CORNERS: Point[] = [
  { x: 0, y: 0 },
  { x: 1080, y: 0 },
  { x: 1080, y: 1920 },
  { x: 0, y: 1920 },
];

describe("crop geometry (spec §5.2 Crop, §11)", () => {
  it("maps crops to visible rectangles in media px and back", () => {
    const crop = { left: 0.25, top: 0.1, right: 0.5, bottom: 0 };
    expect(cropRect(crop, WIDE)).toEqual({ left: 480, top: 108, right: 960, bottom: 1080 });
    expect(rectCrop(cropRect(crop, WIDE), WIDE)).toEqual(crop);
  });

  it("gives the shown media size (rotation metadata swaps it), none for solids", () => {
    const p = project([video("a"), video("b", { mediaId: "r", trackId: "v2" }), makeSolidClip({ id: "s", trackId: "v2", start: 40, duration: 10 })]);
    expect(cropSize(p, p.clips.a as Clip)).toEqual(WIDE);
    expect(cropSize(p, p.clips.b as Clip)).toEqual({ width: 1080, height: 1920 });
    expect(cropSize(p, p.clips.s as Clip)).toBeNull();
  });

  it("clamps fractions into 0..1 and keeps at least one media px visible", () => {
    expect(clampCrop({ left: -0.2, top: 0.3, right: 1.5, bottom: 0.9 }, WIDE)).toEqual({ left: 0, top: 0.3, right: 1 - 1 / 1920, bottom: 1 - 1 / 1080 - 0.3 });
    expect(clampCrop({ left: Number.NaN, top: 0, right: 0, bottom: 0 }, WIDE)).toBeNull();
  });
});

describe("withCropEdge (Crop section fields, spec §11)", () => {
  it("sets one edge, stopping a px before the opposite one", () => {
    expect(withCropEdge(NO_CROP, WIDE, "left", 0.25, false)).toEqual({ left: 0.25, top: 0, right: 0, bottom: 0 });
    const tight = withCropEdge({ left: 0, top: 0, right: 0.5, bottom: 0 }, WIDE, "left", 0.9, false);
    expect(cropRect(tight, WIDE).right - cropRect(tight, WIDE).left).toBeCloseTo(MIN_CROP_PX, 9);
    expect(withCropEdge(NO_CROP, WIDE, "bottom", -1, false)).toEqual(NO_CROP);
  });

  it("keeps the visible aspect with the lock: the other axis follows around its center", () => {
    // 1920 x 1080 cut to 1440 wide: 810 tall, 135 px off the top and the bottom.
    expectCrop(withCropEdge(NO_CROP, WIDE, "left", 0.25, true), { left: 0.25, top: 0.125, right: 0, bottom: 0.125 });
    // Shrinking the height of a 16:9 crop narrows it around its horizontal center.
    expectCrop(withCropEdge(NO_CROP, WIDE, "top", 0.5, true), { left: 0.25, top: 0.5, right: 0.25, bottom: 0 });
  });

  it("stops the edge where the other axis reaches the media (lock)", () => {
    // A 9:16 window of the 16:9 media cannot grow wider: its height is already the media's.
    const portrait = { left: 656.25 / 1920, top: 0, right: 656.25 / 1920, bottom: 0 };
    expectCrop(withCropEdge(portrait, WIDE, "left", 0, true), portrait);
    // The other axis shifts to stay inside the media when its center is off.
    const low = { left: 0.5, top: 0.5, right: 0, bottom: 0 };
    const grown = cropRect(withCropEdge(low, WIDE, "left", 0.25, true), WIDE);
    expect(grown.bottom).toBeCloseTo(1080, 9);
    expect((grown.right - grown.left) / (grown.bottom - grown.top)).toBeCloseTo(960 / 540, 9);
  });
});

describe("cropToFrame (spec §11 Crop to frame)", () => {
  it("cuts a fitted 16:9 clip to the frame's 9:16 around its center", () => {
    const crop = cropToFrame(FIT, WIDE, FRAME);
    // 607.5 x 1080 media px are left: 9:16.
    expectCrop(crop, { left: 656.25 / 1920, top: 0, right: 656.25 / 1920, bottom: 0 });
  });

  it("makes the visible area the frame exactly when the layer covers it", () => {
    const fill = t({ scale: 2, x: 120, y: -40 });
    const crop = cropToFrame(fill, WIDE, FRAME) as Crop;
    const p = project([video("a", { transform: fill, crop })]);
    expectPoints(layerCorners(fill, layerContent(p, p.clips.a as Clip) as ContentBox, FRAME), FRAME_CORNERS);
  });

  it("keeps the frame's aspect inside the part of the frame a layer covers", () => {
    // A 9:16 layer pushed half out to the right: its left half shows, 540 x 960 of it in the middle.
    const media = { width: 1080, height: 1920 };
    expectCrop(cropToFrame(t({ x: 540 }), media, FRAME), { left: 0, top: 0.25, right: 0.5, bottom: 0.25 });
    expect(cropToFrame(t({ x: 2000 }), media, FRAME)).toBeNull();
  });

  it("follows quarter turns, flips and uneven scales", () => {
    // Turned a quarter, the fitted 16:9 media covers the 9:16 frame exactly: nothing to cut.
    expectCrop(cropToFrame(t({ rotation: 90 }), WIDE, FRAME), NO_CROP);
    expect(cropToFrame({ ...FIT, flipH: true, flipV: true }, WIDE, FRAME)).toEqual(cropToFrame(FIT, WIDE, FRAME));
    // Squashed vertically: the cut keeps the frame's aspect on screen.
    const squashed = t({ scale: 1, scaleY: 0.5 });
    const rect = cropRect(cropToFrame(squashed, WIDE, FRAME) as Crop, WIDE);
    expect(((rect.right - rect.left) * 1) / ((rect.bottom - rect.top) * 0.5)).toBeCloseTo(1080 / 1920, 9);
  });

  it("stays inside the frame and the media for a turned layer", () => {
    const turned = t({ scale: 1.5, rotation: 30, x: 60, y: -90 });
    const crop = cropToFrame(turned, WIDE, FRAME) as Crop;
    const p = project([video("a", { transform: turned, crop })]);
    const box = layerContent(p, p.clips.a as Clip) as ContentBox;
    for (const corner of layerCorners(turned, box, FRAME)) {
      expect(corner.x).toBeGreaterThanOrEqual(-1e-6);
      expect(corner.x).toBeLessThanOrEqual(1080 + 1e-6);
      expect(corner.y).toBeGreaterThanOrEqual(-1e-6);
      expect(corner.y).toBeLessThanOrEqual(1920 + 1e-6);
    }
    expect((box.right - box.left) / (box.bottom - box.top)).toBeCloseTo(1080 / 1920, 9);
  });
});

describe("crop commands", () => {
  it("writes crops as one composite-only undo step, skipping locked clips, solids and no-ops", () => {
    let p = project([video("a"), video("b", { trackId: "v2" }), makeSolidClip({ id: "s", trackId: "v2", start: 40, duration: 10 })]);
    p = { ...p, tracks: p.tracks.map((track) => (track.id === "v2" ? { ...track, locked: true } : track)) };
    const command = setCrops(
      p,
      new Map([
        ["a", { left: 0.1, top: 0, right: 0.2, bottom: 0 }],
        ["b", { left: 0.3, top: 0, right: 0, bottom: 0 }],
        ["s", { left: 0.3, top: 0, right: 0, bottom: 0 }],
      ]),
      { label: "Crop layer" },
    );
    expect(command?.id).toBe("clip.crop");
    expect(command?.affects).toEqual(["composite"]);
    const s = store(p);
    s.dispatch(command!);
    expect((s.getState().clips.a as MediaClip).crop).toEqual({ left: 0.1, top: 0, right: 0.2, bottom: 0 });
    expect((s.getState().clips.b as MediaClip).crop).toEqual(NO_CROP);
    expect(s.history.getState().undoLabel).toBe("Crop layer");
    s.undo();
    expect(s.history.getState().canUndo).toBe(false);
    s.redo();
    expect(setCrops(s.getState(), new Map([["a", { left: 0.1, top: 0, right: 0.2, bottom: 0 }]]), { label: "x" })).toBeNull();
  });

  it("reframes landscape footage in two clicks: Crop to frame, then Fill fills the frame exactly (acceptance 1)", () => {
    const s = store(project([video("a")]));
    s.dispatch(quickCrops(s.getState(), ["a"], "frame")!);
    expect(s.history.getState().undoLabel).toBe("Crop to frame");
    s.dispatch(quickTransforms(s.getState(), ["a"], "fill")!);
    const p = s.getState();
    const clip = p.clips.a as MediaClip;
    expect(clip.transform.scale).toBeCloseTo(1920 / 1080, 9);
    expectPoints(layerCorners(clip.transform, layerContent(p, clip) as ContentBox, FRAME), FRAME_CORNERS);
  });

  it("fits, fills and centers the cropped part", () => {
    // The left half of the 16:9 media (960 x 1080), off to one side: Fit makes it 1080 wide, centered.
    const s = store(project([video("a", { crop: { left: 0, top: 0, right: 0.5, bottom: 0 }, transform: t({ x: 300, y: 50 }) })]));
    s.dispatch(quickTransforms(s.getState(), ["a"], "fit")!);
    const p = s.getState();
    const clip = p.clips.a as MediaClip;
    expect(clip.transform.scale).toBeCloseTo(1080 / 960, 9);
    expectPoints(layerCorners(clip.transform, layerContent(p, clip) as ContentBox, FRAME), [
      { x: 0, y: 960 - 607.5 },
      { x: 1080, y: 960 - 607.5 },
      { x: 1080, y: 960 + 607.5 },
      { x: 0, y: 960 + 607.5 },
    ]);
  });

  it("resets crops in one step, and does nothing to uncropped or non-media clips", () => {
    const s = store(project([video("a", { crop: { left: 0.1, top: 0.1, right: 0.1, bottom: 0.1 } }), video("b", { trackId: "v2" }), makeSolidClip({ id: "s", trackId: "v2", start: 40, duration: 10 })]));
    const command = quickCrops(s.getState(), ["a", "b", "s"], "reset");
    expect(command?.label).toBe("Reset crop");
    s.dispatch(command!);
    expect((s.getState().clips.a as MediaClip).crop).toEqual(NO_CROP);
    expect(quickCrops(s.getState(), ["a", "b", "s"], "reset")).toBeNull();
  });
});
