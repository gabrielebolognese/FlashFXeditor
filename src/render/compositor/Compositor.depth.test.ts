import { describe, expect, it } from "vitest";
import { makeCompoundClip, makeProject, makeSolidClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { Clip, Project, Sequence, Transform } from "../../core/document/types.js";
import { IDENTITY_TRANSFORM } from "../../timeline/edit/transform.js";
import { projectPoint } from "../projection.js";
import { applyToPoint } from "../mat3.js";
import { Compositor } from "./Compositor.js";
import type { CompoundCompositeLayer, DrawList, SolidLayer } from "./drawList.js";
import { DrawListSnapshot } from "./DrawListSnapshot.js";

// The compositor's 2.5D layers (spec §21.15, Batch 70): a projection per turned layer, culling, and
// the depth sort inside compounds.

const t = (fields: Partial<Transform> = {}): Transform => ({ ...IDENTITY_TRANSFORM, ...fields });

/** V1..Vn, a 100 x 100 solid on each for frames 0..29, transformed by `transforms[i]`. */
function project(transforms: Partial<Transform>[], clip: Partial<Clip> = {}): Project {
  const p = makeProject();
  p.tracks = transforms.map((_, i) => makeTrack(`v${i + 1}`));
  return withClips(
    p,
    transforms.map((fields, i) => ({ ...makeSolidClip({ id: `s${i + 1}`, trackId: `v${i + 1}`, start: 0, duration: 30 }), transform: t(fields), ...clip }) as Clip),
  );
}

const solids = (p: Project, frame = 0) => new Compositor().evaluate(p, frame).layers.filter((layer): layer is SolidLayer => layer.kind === "solid");

describe("Compositor: 2.5D layers (spec §21.15)", () => {
  it("gives a flat layer no projection and a turned one the CSS perspective of its corners", () => {
    expect(solids(project([{}]))[0]?.persp ?? null).toBeNull();
    const [layer] = solids(project([{ rotationY: 60, scale: 4 }]));
    const persp = layer?.persp;
    expect(persp).toBeTruthy();
    if (!layer || !persp) return;
    // The unit quad's top right corner through the model, then the projection: x 540 + 100 * 1600 / (1600 + 173.2).
    const flat = applyToPoint(layer.transform, 1, 0);
    expect(flat.x).toBeCloseTo(740, 6);
    const shown = projectPoint(persp, flat.x, flat.y);
    expect(shown?.x).toBeCloseTo(540 + (100 * 1600) / (1600 + 200 * Math.sin(Math.PI / 3)), 6);
    // Perspective null: parallel (the turned width only).
    const p = project([{ rotationY: 60, scale: 4 }]);
    p.settings.perspective = null;
    const parallel = solids(p)[0];
    const point = parallel?.persp && projectPoint(parallel.persp, flat.x, flat.y);
    expect(point?.x).toBeCloseTo(640, 6);
  });

  it("culls a hidden back side and a layer reaching the viewer's plane; the snapshot sees the projection", () => {
    expect(solids(project([{ rotationY: 120 }]))).toHaveLength(1);
    expect(solids(project([{ rotationY: 120 }], { backfaceHidden: true }))).toHaveLength(0);
    expect(solids(project([{ rotationX: -150 }], { backfaceHidden: true }))).toHaveLength(0);
    expect(solids(project([{ rotationY: 20 }], { backfaceHidden: true }))).toHaveLength(1);
    expect(solids(project([{ z: -1700 }]))).toHaveLength(0);
    expect(solids(project([{ z: 400 }]))).toHaveLength(1);
    // The projection is part of what a frame draws (a changed tilt is a changed frame).
    const snapshot = new DrawListSnapshot();
    const compositor = new Compositor();
    // Solids only: the composite is a draw list as it is.
    const drawn = (p: Project) => compositor.evaluate(p, 0) as unknown as DrawList;
    snapshot.update(drawn(project([{ rotationY: 10 }])));
    expect(snapshot.update(drawn(project([{ rotationY: 10 }])))).toBe(false);
    expect(snapshot.update(drawn(project([{ rotationY: 11 }])))).toBe(true);
  });

  it("draws a compound's inner layers by depth with its depth sort on, by track order with it off", () => {
    const p = makeProject();
    p.tracks.push(makeTrack("v1"));
    const tracks = ["a", "b", "c"].map((id) => makeTrack(`in-${id}`));
    const inner: Sequence = { id: "inner", name: "inner", size: { w: 1080, h: 1920 }, duration: 60, background: null, tracks };
    p.sequences.inner = inner;
    // Track order a, b, c (c on top); depths 0, 900 (farthest), -300 (nearest).
    const z = { a: 0, b: 900, c: -300 } as const;
    const RED = { a: 0.25, b: 0.5, c: 0.75 } as const;
    const NAME = new Map<number, string>(Object.entries(RED).map(([id, r]) => [r, id]));
    for (const id of ["a", "b", "c"] as const) {
      // Told apart by their red channel.
      const clip = { ...makeSolidClip({ id, trackId: `in-${id}`, start: 0, duration: 60 }), transform: t({ z: z[id] }), fill: { r: RED[id], g: 0, b: 0, a: 1 } };
      p.clips[id] = clip;
      (tracks.find((track) => track.id === `in-${id}`) as Sequence["tracks"][number]).clipIds.push(id);
    }
    const doc = withClips(p, [makeCompoundClip({ id: "c1", trackId: "v1", start: 0, duration: 60, sequenceId: "inner" })]);
    const order = (project: Project) => {
      const compound = new Compositor().evaluate(project, 10).layers.find((l): l is CompoundCompositeLayer => l.kind === "compound");
      return compound?.inner.layers.map((layer) => NAME.get((layer as SolidLayer).color.r));
    };
    expect(order(doc)).toEqual(["a", "b", "c"]);
    const sorted = { ...doc, sequences: { inner: { ...inner, depthSort: true } } };
    // Farthest first: b (900), a (0), c (-300); ties keep track order.
    expect(order(sorted)).toEqual(["b", "a", "c"]);
    const tied = { ...sorted, clips: { ...sorted.clips, b: { ...(sorted.clips.b as Clip), transform: t({ z: 0 }) } as Clip } };
    expect(order(tied)).toEqual(["a", "b", "c"]);
  });

  it("uses the sequence's own perspective inside a compound, not the project's", () => {
    const p = makeProject();
    p.tracks.push(makeTrack("v1"));
    const track = makeTrack("in-a");
    track.clipIds.push("a");
    p.sequences.inner = { id: "inner", name: "inner", size: { w: 1080, h: 1920 }, duration: 60, background: null, tracks: [track], perspective: null };
    p.clips.a = { ...makeSolidClip({ id: "a", trackId: "in-a", start: 0, duration: 60 }), transform: t({ rotationY: 60, scale: 4 }) };
    p.settings.perspective = 400;
    const doc = withClips(p, [makeCompoundClip({ id: "c1", trackId: "v1", start: 0, duration: 60, sequenceId: "inner" })]);
    const compound = new Compositor().evaluate(doc, 10).layers.find((l): l is CompoundCompositeLayer => l.kind === "compound");
    const layer = compound?.inner.layers[0] as SolidLayer | undefined;
    const flat = layer ? applyToPoint(layer.transform, 1, 0) : null;
    const shown = layer?.persp && flat ? projectPoint(layer.persp, flat.x, flat.y) : null;
    // Parallel inside (none), whatever the project's distance.
    expect(shown?.x).toBeCloseTo(640, 6);
  });
});
