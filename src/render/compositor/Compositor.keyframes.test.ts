import { describe, expect, it } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeSolidClip, makeTextClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import { animatedTransform } from "../../core/document/keyframes.js";
import type { Clip, Keyframes, MediaClip, Project, SolidClip, TextClip } from "../../core/document/types.js";
import { Compositor } from "./Compositor.js";
import { animatedCrop, animatedRadius, animatedSolidLook, newSolidScratch } from "./animatedLook.js";
import type { MediaLayer, SolidLayer, TextCompositeLayer } from "./drawList.js";
import { newTextMotion, textMotion } from "./animatedText.js";
import { DEFAULT_TEXT_STYLE } from "../../text/style.js";

const CORAL = [0.96, 0.43, 0.36, 1];
const INK = [0.07, 0.07, 0.1, 1];

function doc(clips: Clip[]): Project {
  const project = makeProject();
  project.tracks = [makeTrack("v1", "video"), makeTrack("a1", "audio")];
  project.media.m1 = { ...makeMedia("m1", "video"), width: 1920, height: 1080 };
  return withClips(project, clips);
}

const solid = (extra: Partial<SolidClip> = {}): SolidClip => ({
  ...makeSolidClip({ id: "s", trackId: "v1", start: 0, duration: 60 }),
  fill: { r: CORAL[0] as number, g: CORAL[1] as number, b: CORAL[2] as number, a: 1 },
  size: { w: 400, h: 200 },
  cornerRadius: 20,
  ...extra,
});

describe("solids with keyed looks (Batch 60)", () => {
  const fillKeys = (ease: "hold" | "linear"): Keyframes => ({
    fill: [
      { frame: 0, value: CORAL, ease },
      { frame: 30, value: INK, ease: "linear" },
    ],
  });
  const colorAt = (project: Project, frame: number) => {
    const layer = new Compositor().evaluate(project, frame).layers[0] as SolidLayer;
    return { ...layer.color };
  };

  it("changes the fill at the key with a hold ease", () => {
    const project = doc([solid({ keyframes: fillKeys("hold") })]);
    expect(colorAt(project, 29).r).toBeCloseTo(CORAL[0] as number, 6);
    expect(colorAt(project, 30).r).toBeCloseTo(INK[0] as number, 6);
  });

  it("fades smoothly with a linear ease", () => {
    const project = doc([solid({ keyframes: fillKeys("linear") })]);
    const mid = colorAt(project, 15);
    expect(mid.r).toBeCloseTo(((CORAL[0] as number) + (INK[0] as number)) / 2, 6);
    expect(mid.g).toBeCloseTo(((CORAL[1] as number) + (INK[1] as number)) / 2, 6);
  });

  it("keys size, corner radius, stroke width and shadow blur", () => {
    const clip = solid({
      shape: "roundedRect",
      stroke: { width: 2, color: { r: 1, g: 1, b: 1, a: 1 }, align: "center" },
      shadow: { x: 0, y: 4, blur: 4, spread: 0, color: { r: 0, g: 0, b: 0, a: 0.5 } },
      keyframes: {
        "size.w": [{ frame: 0, value: 400, ease: "linear" }, { frame: 20, value: 800, ease: "linear" }],
        cornerRadius: [{ frame: 0, value: 0, ease: "linear" }, { frame: 20, value: 100, ease: "linear" }],
        "stroke.width": [{ frame: 0, value: 2, ease: "linear" }, { frame: 20, value: 12, ease: "linear" }],
        "shadow.blur": [{ frame: 0, value: 4, ease: "linear" }, { frame: 20, value: 44, ease: "linear" }],
        "stroke.color": [{ frame: 0, value: [1, 1, 1, 1], ease: "linear" }, { frame: 20, value: [0, 0, 0, 1], ease: "linear" }],
      },
    });
    const layer = new Compositor().evaluate(doc([clip]), 10).layers[0] as SolidLayer;
    expect(layer.shape?.width).toBeCloseTo(600, 6);
    expect(layer.shape?.height).toBe(200);
    expect(layer.shape?.radius).toBeCloseTo(50, 6);
    expect(layer.style?.stroke?.width).toBeCloseTo(7, 6);
    expect(layer.style?.stroke?.color.r).toBeCloseTo(0.5, 6);
    expect(layer.style?.shadow?.blur).toBeCloseTo(24, 6);
  });

  it("returns the base look itself when nothing is keyed, and never edits the clip", () => {
    const clip = solid({ keyframes: { opacity: [{ frame: 0, value: 1, ease: "linear" }] } });
    const base = { shape: clip.shape, fill: clip.fill, size: clip.size, cornerRadius: clip.cornerRadius };
    expect(animatedSolidLook(clip, base, 5, newSolidScratch())).toBe(base);
    const keyed = solid({ keyframes: fillKeys("linear"), stroke: { width: 3, color: { r: 0, g: 0, b: 0, a: 1 }, align: "inside" } });
    const before = JSON.stringify(keyed);
    const look = animatedSolidLook(keyed, keyed, 15, newSolidScratch());
    expect(look.stroke?.align).toBe("inside");
    expect(JSON.stringify(keyed)).toBe(before);
  });

  it("ignores a stroke key on a solid without a stroke and a fill key on a gradient", () => {
    const clip = solid({ keyframes: { "stroke.width": [{ frame: 0, value: 9, ease: "linear" }], "shadow.blur": [{ frame: 0, value: 9, ease: "linear" }] } });
    const look = animatedSolidLook(clip, clip, 5, newSolidScratch());
    expect(look.stroke).toBeUndefined();
    expect(look.shadow).toBeUndefined();
  });
});

describe("pictures with keyed crop and corner radius (Batch 60)", () => {
  const picture = (extra: Partial<MediaClip> = {}): MediaClip => ({ ...makeMediaClip(doc([]), { id: "p", trackId: "v1", start: 0, duration: 60, mediaId: "m1" }), ...extra });

  it("reads the keyed crop edges and keeps the others", () => {
    const clip = picture({
      crop: { left: 0, top: 0.1, right: 0, bottom: 0 },
      keyframes: { "crop.left": [{ frame: 0, value: 0, ease: "linear" }, { frame: 10, value: 0.4, ease: "linear" }] },
    });
    const layer = new Compositor().evaluate(doc([clip]), 5).layers[0] as MediaLayer;
    expect(layer.crop.u0).toBeCloseTo(0.2, 6);
    expect(layer.crop.v0).toBeCloseTo(0.1, 6);
    expect(layer.crop.u1).toBeCloseTo(1, 6);
  });

  it("returns the clip's own crop when no edge is keyed", () => {
    const own = { left: 0.1, top: 0, right: 0, bottom: 0 };
    expect(animatedCrop(undefined, own, 3, { left: 0, top: 0, right: 0, bottom: 0 })).toBe(own);
  });

  it("rounds the picture's corners by the keyed radius", () => {
    const clip = picture({ cornerRadius: 0, keyframes: { cornerRadius: [{ frame: 0, value: 0, ease: "linear" }, { frame: 10, value: 80, ease: "linear" }] } });
    const layer = new Compositor().evaluate(doc([clip]), 5).layers[0] as MediaLayer;
    expect(layer.shape?.radii[0]).toBeCloseTo(40, 6);
    expect(animatedRadius(undefined, 12, 4)).toBe(12);
  });
});

describe("keyed anchors (Batch 60)", () => {
  it("moves the anchor per frame without touching the clip's own", () => {
    const clip = solid({ keyframes: { "transform.anchor.x": [{ frame: 0, value: 0, ease: "linear" }, { frame: 10, value: 1, ease: "linear" }] } });
    const own = clip.transform.anchor;
    const scratch = { ...clip.transform, anchor: own };
    const result = animatedTransform(clip, 5, scratch);
    expect(result.anchor.x).toBeCloseTo(0.5, 6);
    expect(result.anchor.y).toBe(own.y);
    expect(own.x).toBe(0.5);
    const other = animatedTransform(clip, 10, scratch);
    expect(other.anchor.x).toBe(1);
    expect(clip.transform.anchor.x).toBe(0.5);
    expect(animatedTransform({ ...clip, keyframes: undefined }, 5, scratch).anchor).toBe(clip.transform.anchor);
  });
});

describe("text with keyed style (Batch 60)", () => {
  const text = (keyframes: Keyframes): TextClip => ({ ...makeTextClip({ id: "t", trackId: "v1", start: 0, duration: 60, value: "Hello world" }), keyframes });
  const layers = (project: Project, frame: number) => new Compositor().evaluate(project, frame).layers.filter((l) => l.kind === "text") as TextCompositeLayer[];

  it("lays out at the largest keyed size and draws smaller sizes scaled", () => {
    const clip = text({ "style.fontSize": [{ frame: 0, value: 40, ease: "linear" }, { frame: 20, value: 120, ease: "linear" }] });
    const early = layers(doc([clip]), 0)[0] as TextCompositeLayer;
    const late = layers(doc([clip]), 20)[0] as TextCompositeLayer;
    expect(early.style.fontSize).toBe(120);
    expect(late.style).toBe(early.style);
    expect(Math.hypot(early.model[0], early.model[1])).toBeCloseTo(Math.hypot(late.model[0], late.model[1]) / 3, 4);
  });

  it("uses one raster style across the whole clip for a keyed size (never a new raster per frame)", () => {
    const clip = text({ "style.fontSize": [{ frame: 0, value: 40, ease: "linear" }, { frame: 20, value: 120, ease: "linear" }] });
    const styles = new Set([0, 5, 10, 15, 19, 30].map((frame) => (layers(doc([clip]), frame)[0] as TextCompositeLayer).style));
    expect(styles.size).toBe(1);
  });

  it("holds a fill color, then switches at the key, as one layer", () => {
    const clip = text({ "style.fill": [{ frame: 0, value: CORAL, ease: "hold" }, { frame: 30, value: INK, ease: "linear" }] });
    const before = layers(doc([clip]), 29);
    const after = layers(doc([clip]), 30);
    expect(before).toHaveLength(1);
    expect(after).toHaveLength(1);
    expect((before[0]?.style.fill as { r: number }).r).toBeCloseTo(CORAL[0] as number, 6);
    expect((after[0]?.style.fill as { r: number }).r).toBeCloseTo(INK[0] as number, 6);
  });

  it("fades between two key colors with a second layer at the mix opacity", () => {
    const clip = text({ "style.fill": [{ frame: 0, value: CORAL, ease: "linear" }, { frame: 20, value: INK, ease: "linear" }] });
    const [first, second] = layers(doc([clip]), 5) as [TextCompositeLayer, TextCompositeLayer];
    expect((first.style.fill as { r: number }).r).toBeCloseTo(CORAL[0] as number, 6);
    expect((second.style.fill as { r: number }).r).toBeCloseTo(INK[0] as number, 6);
    expect(second.opacity).toBeCloseTo(0.25, 6);
    expect(second.clipId).not.toBe(first.clipId);
    // The styles are the same objects frame after frame: the raster slots hold.
    const [again] = layers(doc([clip]), 6) as [TextCompositeLayer];
    expect(again.style).toBe(first.style);
  });

  it("spreads the characters of a keyed letter spacing from the character atlas", () => {
    const clip = text({ "style.letterSpacing": [{ frame: 0, value: 0, ease: "linear" }, { frame: 10, value: 10, ease: "linear" }] });
    const layer = layers(doc([clip]), 10)[0] as TextCompositeLayer;
    expect(layer.anim?.atlas).toBe("char");
    const xs = layer.anim?.units.map((u) => u.x) ?? [];
    expect(xs.length).toBe("Helloworld".length);
    expect(xs[0]).toBeCloseTo(-50, 4);
    expect(xs[1]).toBeCloseTo(-40, 4);
    expect(xs[5]).toBeCloseTo(10, 4);
    // The raster itself is the clip's own style: no new raster for each spacing.
    expect(layer.style).toBe(clip.style);
    const rest = layers(doc([makeTextClip({ id: "t", trackId: "v1", start: 0, duration: 60, value: "Hello world" })]), 10)[0] as TextCompositeLayer;
    expect(rest.anim).toBeNull();
  });

  it("changes nothing for an unkeyed text", () => {
    const clip = text({ opacity: [{ frame: 0, value: 1, ease: "linear" }] });
    const layer = layers(doc([clip]), 3)[0] as TextCompositeLayer;
    expect(layer.style).toBe(clip.style);
    expect(textMotion(clip.keyframes, clip.style, 3, newTextMotion(DEFAULT_TEXT_STYLE))).toBeNull();
  });
});
