import { describe, expect, it } from "vitest";
import { makeProject, makeShapeClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { Project, ShapeClip } from "../../core/document/types.js";
import { applyToPoint } from "../mat3.js";
import { Compositor } from "./Compositor.js";
import type { ShapeCompositeLayer } from "./drawList.js";

function build(edit?: (clip: ShapeClip) => void): Project {
  const p = makeProject();
  p.tracks.push(makeTrack("v1"));
  const clip = makeShapeClip({ id: "s", trackId: "v1", start: 10, duration: 40 });
  clip.paths.push({
    id: "line",
    d: "M0 50 L100 50",
    fill: null,
    fillRule: "nonzero",
    stroke: { width: 4, color: { r: 1, g: 0, b: 0, a: 1 }, align: "center", cap: "round", join: "round", miterLimit: 4 },
  });
  edit?.(clip);
  return withClips(p, [clip]);
}

const shapeAt = (compositor: Compositor, p: Project, frame: number) => compositor.evaluate(p, frame).layers.find((l): l is ShapeCompositeLayer => l.kind === "shape");

describe("Compositor: shape clips (spec §21.12)", () => {
  it("places the view box like a solid's box: centred, scaled, flipped by mirroring the drawing", () => {
    const compositor = new Compositor();
    const p = build();
    const layer = shapeAt(compositor, p, 20)!;
    expect(layer).toMatchObject({ clipId: "s", trackId: "v1", width: 100, height: 100, scale: 1, opacity: 1 });
    const a = applyToPoint(layer.model, 0, 0);
    expect(a.x).toBeCloseTo(p.settings.width / 2 - 50);
    expect(a.y).toBeCloseTo(p.settings.height / 2 - 50);
    const flipped = build((clip) => {
      clip.transform.flipH = true;
      clip.transform.scale = 2;
    });
    const f = shapeAt(compositor, flipped, 20)!;
    expect(f.scale).toBeCloseTo(2);
    // View-box x 0 lands on the right edge.
    expect(applyToPoint(f.model, 0, 0).x).toBeCloseTo(p.settings.width / 2 + 100);
    expect(shapeAt(compositor, p, 9)).toBeUndefined();
    expect(shapeAt(compositor, p, 50)).toBeUndefined();
  });

  it("unkeyed paths are the same frame objects every frame (the geometry cache sees nothing change)", () => {
    const compositor = new Compositor();
    const p = build();
    const first = shapeAt(compositor, p, 20)!.paths;
    const firstPaths = [...first];
    const again = shapeAt(compositor, p, 30)!.paths;
    expect(again[0]).toBe(firstPaths[0]);
    expect(again[1]).toBe(firstPaths[1]);
    expect(again[1]).toMatchObject({ id: "line", source: { d: "M0 50 L100 50" }, trim: null });
  });

  it("applies the keys of paths.<id>: a trim end drawing on (clamped to 0..1), a stroke color, a dash offset, a primitive param", () => {
    const compositor = new Compositor();
    const p = build((clip) => {
      clip.paths.push({ id: "arc", d: "", fill: null, fillRule: "nonzero", stroke: { width: 6, color: { r: 0, g: 0, b: 1, a: 1 }, align: "center", cap: "round", join: "miter", miterLimit: 4 }, primitive: { kind: "arc", radius: 40, start: 0, end: 270 } });
      clip.keyframes = {
        "paths.line.trim.end": [{ frame: 0, value: 0, ease: "linear" }, { frame: 10, value: 1.4, ease: "linear" }],
        "paths.line.stroke.color": [{ frame: 0, value: [0, 1, 0, 1], ease: "hold" }],
        "paths.line.stroke.dashOffset": [{ frame: 0, value: 0, ease: "linear" }, { frame: 10, value: 20, ease: "linear" }],
        "paths.arc.primitive.end": [{ frame: 0, value: 0, ease: "linear" }, { frame: 10, value: 270, ease: "linear" }],
      };
    });
    const at = (frame: number) => shapeAt(compositor, p, frame)!.paths;
    const mid = at(15);
    expect(mid[1]?.trim).toEqual({ start: 0, end: 0.7, offset: 0 });
    expect(mid[1]?.stroke?.color).toEqual({ r: 0, g: 1, b: 0, a: 1 });
    expect(mid[1]?.stroke?.dashOffset).toBeCloseTo(10);
    expect((mid[2]?.source as { primitive: { end: number } }).primitive.end).toBeCloseTo(135);
    // The unkeyed square keeps its frame; the document is untouched.
    expect(mid[0]).toMatchObject({ id: "p", trim: null });
    expect(at(20)[1]?.trim?.end).toBe(1);
    expect((p.clips.s as ShapeClip).paths[1]?.trim).toBeUndefined();
    expect((p.clips.s as ShapeClip).paths[2]?.primitive).toMatchObject({ end: 270 });
  });

  it("fades and opacity multiply into the layer's group opacity; an empty clip draws nothing", () => {
    const compositor = new Compositor();
    const p = build((clip) => {
      clip.opacity = 0.5;
      clip.fades = { in: 10, out: 0 };
    });
    expect(shapeAt(compositor, p, 15)!.opacity).toBeCloseTo(0.25);
    const empty = build((clip) => {
      clip.paths = [];
    });
    expect(shapeAt(compositor, empty, 20)).toBeUndefined();
  });
});
