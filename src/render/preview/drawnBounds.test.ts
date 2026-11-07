import { describe, expect, it } from "vitest";
import { makeProject, makeShapeClip, makeSolidClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import { canvasLayersAt, outlineQuad } from "./canvasLayers.js";
import { drawnReach } from "./drawnBounds.js";

const WHITE = { r: 1, g: 1, b: 1, a: 1 };

describe("drawn bounds (the Batch 58 follow-up: outlines include stroke and shadow)", () => {
  it("a solid's centered stroke reaches half its width out, an outside one all of it, a shadow its offset, spread and blur", () => {
    const solid = makeSolidClip({ id: "s", trackId: "v1", start: 0, duration: 10 });
    expect(drawnReach(solid)).toBeNull();
    solid.stroke = { width: 10, color: WHITE, align: "center" };
    expect(drawnReach(solid)).toEqual({ left: 5, top: 5, right: 5, bottom: 5 });
    solid.stroke.align = "outside";
    solid.shadow = { x: 20, y: 0, blur: 4, spread: 2, color: WHITE };
    expect(drawnReach(solid)).toEqual({ left: 10, top: 10, right: 28, bottom: 10 });
  });

  it("a shape reaches as far as its paths leave the view box plus their strokes (miters to their limit, mirrored by flips)", () => {
    const shape = makeShapeClip({ id: "s", trackId: "v1", start: 0, duration: 10 });
    expect(drawnReach(shape)).toBeNull();
    shape.paths = [{ id: "a", d: "M-20 50 L100 50", fill: null, fillRule: "nonzero", stroke: { width: 4, color: WHITE, align: "center", cap: "butt", join: "round", miterLimit: 4 } }];
    expect(drawnReach(shape)).toEqual({ left: 22, top: 0, right: 2, bottom: 0 });
    shape.transform = { ...shape.transform, flipH: true };
    expect(drawnReach(shape)).toEqual({ left: 2, top: 0, right: 22, bottom: 0 });
  });

  it("canvas layers keep the box for hits and give the outline the drawn bounds", () => {
    const p = makeProject();
    p.tracks.push(makeTrack("v1"));
    const solid = makeSolidClip({ id: "s", trackId: "v1", start: 0, duration: 10 });
    solid.stroke = { width: 20, color: WHITE, align: "outside" };
    const project = withClips(p, [solid]);
    const [layer] = canvasLayersAt(project, 0);
    const cx = project.settings.width / 2;
    expect(layer?.quad[0].x).toBeCloseTo(cx - 50);
    expect(outlineQuad(layer!)[0].x).toBeCloseTo(cx - 70);
  });
});
