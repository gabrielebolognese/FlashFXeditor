import { describe, expect, it } from "vitest";
import { makeCompoundClip, makeProject, makeSolidClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { Project, Sequence } from "../../core/document/types.js";
import { applyToPoint } from "../mat3.js";
import { Compositor } from "./Compositor.js";
import type { CompoundCompositeLayer, SolidLayer } from "./drawList.js";

function sequence(id: string, w: number, h: number, duration: number, clipIds: string[]): Sequence {
  const track = makeTrack(`${id}-v1`);
  track.clipIds.push(...clipIds);
  return { id, name: id, size: { w, h }, duration, background: null, tracks: [track] };
}

function build(): Project {
  const p = makeProject();
  p.tracks.push(makeTrack("v1"));
  p.sequences.inner = sequence("inner", 540, 960, 60, ["s"]);
  p.clips.s = makeSolidClip({ id: "s", trackId: "inner-v1", start: 10, duration: 30 });
  return withClips(p, [makeCompoundClip({ id: "c", trackId: "v1", start: 100, duration: 40, offset: 5, sequenceId: "inner" })]);
}

describe("Compositor: compound clips (spec §21.10)", () => {
  it("evaluates the sequence at the inner frame offset + (frame - start), inside a layer sized like the sequence", () => {
    const compositor = new Compositor();
    const p = build();
    const at = (frame: number) => compositor.evaluate(p, frame).layers.filter((layer): layer is CompoundCompositeLayer => layer.kind === "compound");
    // Inner frame 5 + 5 = 10: the solid starts.
    const layer = at(105)[0]!;
    expect(layer).toMatchObject({ clipId: "c", sequenceId: "inner", width: 540, height: 960 });
    expect(layer.inner).toMatchObject({ width: 540, height: 960 });
    expect(layer.inner.layers.filter((l) => l.kind === "solid")).toHaveLength(1);
    // Inner frame 5 + 0 = 5: nothing yet.
    expect(at(100)[0]!.inner.layers).toHaveLength(0);
    // Past the compound: no layer.
    expect(at(140)).toHaveLength(0);
    expect(at(99)).toHaveLength(0);
  });

  it("maps the unit quad onto the sequence frame centred in the project, scaled by the transform", () => {
    const compositor = new Compositor();
    const p = build();
    const layer = compositor.evaluate(p, 110).layers.find((l): l is CompoundCompositeLayer => l.kind === "compound")!;
    const a = applyToPoint(layer.model, 0, 0);
    const b = applyToPoint(layer.model, 1, 1);
    expect(b.x - a.x).toBeCloseTo(540);
    expect(b.y - a.y).toBeCloseTo(960);
    expect((a.x + b.x) / 2).toBeCloseTo(p.settings.width / 2);
    expect(layer.scale).toBeCloseTo(1);
    (p.clips.c as { transform: { scale: number } }).transform.scale = 2;
    const scaled = compositor.evaluate(p, 110).layers.find((l): l is CompoundCompositeLayer => l.kind === "compound")!;
    expect(scaled.scale).toBeCloseTo(2);
  });

  it("nests: the inner composite of a compound holds the compound layer of the next level", () => {
    const compositor = new Compositor();
    const p = build();
    p.sequences.outer = sequence("outer", 1080, 1920, 60, ["n"]);
    p.clips.n = makeCompoundClip({ id: "n", trackId: "outer-v1", start: 0, duration: 60, sequenceId: "inner" });
    const q = withClips(p, [makeCompoundClip({ id: "o", trackId: "v1", start: 200, duration: 60, sequenceId: "outer" })]);
    const outer = compositor.evaluate(q, 215).layers.find((l): l is CompoundCompositeLayer => l.kind === "compound")!;
    const nested = outer.inner.layers.find((l): l is CompoundCompositeLayer => l.kind === "compound")!;
    expect(nested.sequenceId).toBe("inner");
    expect(nested.inner.layers.some((l) => (l as SolidLayer).kind === "solid")).toBe(true);
  });
});
