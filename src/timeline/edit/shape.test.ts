import { describe, expect, it } from "vitest";
import { makeProject, makeShapeClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import { sampleKeys } from "../../core/document/keyframes.js";
import { PRIMITIVE_KINDS, type Project, type ShapeClip } from "../../core/document/types.js";
import { pathDataIssue } from "../../core/shapes/pathData.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createSessionStore } from "../../core/store/sessionStore.js";
import { BUILT_IN_EDIT_DEFAULTS } from "./editDefaults.js";
import {
  addShape,
  adjacentShapeKey,
  clampPrimitiveParam,
  defaultShape,
  editShapes,
  fitScale,
  SHAPE_KINDS,
  setPathFill,
  setShapeField,
  setShapeStopwatch,
  shapeKeyFrames,
  shapeStopwatchOn,
  toggleShapeKey,
} from "./shape.js";

let ids = 0;
const newId = () => `id${++ids}`;
const FRAME = { width: 1080, height: 1920 };

function project(): Project {
  const p = makeProject();
  p.tracks = [makeTrack("v1"), makeTrack("v2")];
  return p;
}
const store = (p: Project) => new DocumentStore(p, { session: createSessionStore(), validate: true });

/** A store holding a star shape clip `s` (the `+ Shape` default) on v1. */
function withStar() {
  const spec = defaultShape("star", FRAME, newId);
  const p = project();
  const clip = makeShapeClip({ id: "s", trackId: "v1", start: 0, duration: 90, size: spec.size, paths: spec.paths });
  const s = store(withClips(p, [clip]));
  return { s, pathId: (spec.paths[0] as { id: string }).id };
}
const shape = (s: DocumentStore) => s.getState().clips.s as ShapeClip;

describe("defaultShape", () => {
  it("makes every dropdown shape from a primitive with valid path data inside its view box", () => {
    expect([...SHAPE_KINDS].sort()).toEqual([...PRIMITIVE_KINDS].sort());
    for (const kind of SHAPE_KINDS) {
      const spec = defaultShape(kind, FRAME, newId);
      const path = spec.paths[0];
      expect(path?.primitive?.kind, kind).toBe(kind);
      expect(pathDataIssue(path?.d ?? ""), kind).toBeNull();
      expect(path?.d.length, kind).toBeGreaterThan(0);
      expect(spec.size.w).toBeGreaterThan(0);
    }
  });

  it("fills closed shapes white and strokes the arc and the line with round caps", () => {
    expect(defaultShape("star", FRAME, newId).paths[0]).toMatchObject({ fill: { r: 1, g: 1, b: 1, a: 1 } });
    for (const kind of ["arc", "line"] as const) {
      const path = defaultShape(kind, FRAME, newId).paths[0];
      expect(path?.fill).toBeNull();
      expect(path?.stroke).toMatchObject({ cap: "round", color: { r: 1, g: 1, b: 1, a: 1 } });
    }
  });

  it("scales an imported icon so its long side is half the frame's short side", () => {
    expect(fitScale({ w: 24, h: 24 }, FRAME)).toBe(22.5);
    expect(fitScale({ w: 48, h: 24 }, { width: 1920, height: 1080 })).toBe(11.25);
  });
});

describe("addShape", () => {
  it("adds the shape at the playhead on the free top video track, centered, the default solid length, one undo step", () => {
    const p = project();
    const s = store(p);
    const result = addShape(p, 120, newId, defaultShape("star", FRAME, newId));
    s.dispatch(result.command);
    const clip = s.getState().clips[result.clipId] as ShapeClip;
    expect(clip).toMatchObject({ kind: "shape", trackId: "v2", start: 120, duration: (BUILT_IN_EDIT_DEFAULTS.solidMs / 1000) * 30, name: "Star", opacity: 1, enabled: true });
    expect(clip.transform).toMatchObject({ x: 0, y: 0, scale: 1, rotation: 0 });
    expect(s.history.getState().undoLabel).toBe("Add star");
    s.undo();
    expect(s.getState().clips[result.clipId]).toBeUndefined();
  });

  it("puts it on a new video track when the top one is taken, and gives an imported icon its scale", () => {
    const p = withClips(project(), [makeShapeClip({ id: "x", trackId: "v2", start: 100, duration: 30, size: { w: 10, h: 10 }, paths: [] })]);
    const s = store(p);
    const result = addShape(p, 50, newId, { ...defaultShape("rect", FRAME, newId), scale: 4 });
    s.dispatch(result.command);
    const state = s.getState();
    expect(state.tracks).toHaveLength(3);
    expect(state.clips[result.clipId]?.trackId).toBe(state.tracks[2]?.id);
    expect((state.clips[result.clipId] as ShapeClip).transform.scale).toBe(4);
  });
});

describe("editShapes", () => {
  it("changes a star's points and then its inner radius as one undo step each, regenerating the path data", () => {
    const { s, pathId } = withStar();
    const before = (shape(s).paths[0] as { d: string }).d;
    const points = editShapes(s.getState(), ["s"], (clip, rel) => void setShapeField(clip, pathId, "primitive.points", 7, rel), { label: "Change points", at: 0 });
    expect(points).not.toBeNull();
    if (points) s.dispatch(points);
    expect(shape(s).paths[0]?.primitive).toMatchObject({ kind: "star", points: 7 });
    expect(shape(s).paths[0]?.d).not.toBe(before);
    const afterPoints = shape(s).paths[0]?.d as string;
    const inner = editShapes(s.getState(), ["s"], (clip, rel) => void setShapeField(clip, pathId, "primitive.inner", 40, rel), { label: "Change inner radius", at: 0 });
    if (inner) s.dispatch(inner);
    expect(shape(s).paths[0]?.primitive).toMatchObject({ points: 7, inner: 40 });
    expect(shape(s).paths[0]?.d).not.toBe(afterPoints);
    s.undo();
    expect(shape(s).paths[0]?.primitive).toMatchObject({ points: 7 });
    expect((shape(s).paths[0]?.primitive as { inner: number }).inner).not.toBe(40);
    s.undo();
    expect(shape(s).paths[0]?.d).toBe(before);
  });

  it("clamps counts, roundness and lengths to what the primitive accepts", () => {
    expect(clampPrimitiveParam("points", 2)).toBe(3);
    expect(clampPrimitiveParam("points", 99.4)).toBe(64);
    expect(clampPrimitiveParam("sides", 5.6)).toBe(6);
    expect(clampPrimitiveParam("roundness", 3)).toBe(1);
    expect(clampPrimitiveParam("inner", -5)).toBe(0);
    expect(clampPrimitiveParam("end", 9999)).toBe(3600);
    expect(clampPrimitiveParam("outer", Number.NaN)).toBe(0);
  });

  it("returns null when nothing changes, and skips locked and missing clips", () => {
    const { s, pathId } = withStar();
    const same = shape(s).paths[0]?.primitive as { points: number };
    expect(editShapes(s.getState(), ["s"], (clip, rel) => void setShapeField(clip, pathId, "primitive.points", same.points, rel), { label: "x", at: 0 })).toBeNull();
    expect(editShapes(s.getState(), ["nope"], (clip, rel) => void setShapeField(clip, pathId, "primitive.points", 9, rel), { label: "x", at: 0 })).toBeNull();
    if (s.getState().tracks[0]) s.dispatch({ id: "t.lock", label: "Lock", affects: ["tracks"], run: (draft) => void (draft.tracks[0] && (draft.tracks[0].locked = true)) });
    expect(editShapes(s.getState(), ["s"], (clip, rel) => void setShapeField(clip, pathId, "primitive.points", 9, rel), { label: "x", at: 0 })).toBeNull();
  });

  it("edits each shape's own path by index across several selected shapes", () => {
    const p = project();
    const a = defaultShape("star", FRAME, newId);
    const b = defaultShape("star", FRAME, newId);
    const s = store(withClips(p, [makeShapeClip({ id: "a", trackId: "v1", start: 0, duration: 30, size: a.size, paths: a.paths }), makeShapeClip({ id: "b", trackId: "v2", start: 0, duration: 30, size: b.size, paths: b.paths })]));
    const command = editShapes(s.getState(), ["a", "b"], (clip, rel) => void setShapeField(clip, clip.paths[0]?.id ?? "", "primitive.points", 8, rel), { label: "Change points", at: 0 });
    if (command) s.dispatch(command);
    for (const id of ["a", "b"]) expect((s.getState().clips[id] as ShapeClip).paths[0]?.primitive).toMatchObject({ points: 8 });
  });

  it("writes an edit of a keyed property as a key at the playhead", () => {
    const { s, pathId } = withStar();
    const on = setShapeStopwatch(s.getState(), ["s"], 0, "trim", true, 0);
    if (on) s.dispatch(on);
    const edit = editShapes(s.getState(), ["s"], (clip, rel) => void setShapeField(clip, pathId, "trim.end", 0.25, rel), { label: "Change trim end", at: 30 });
    if (edit) s.dispatch(edit);
    const keys = shape(s).keyframes?.[`paths.${pathId}.trim.end`] ?? [];
    expect(keys.map((k) => [k.frame, k.value])).toEqual([[0, 1], [30, 0.25]]);
    // The base value is untouched: the animation owns the property.
    expect(shape(s).paths[0]?.trim).toBeUndefined();
    expect(sampleKeys(keys, 15)).toBeCloseTo(0.625, 5);
  });
});

describe("stopwatches", () => {
  it("on keys the group's fields at the playhead; off bakes the values shown there and removes the keys", () => {
    const { s, pathId } = withStar();
    expect(shapeStopwatchOn(shape(s), 0, "trim")).toBe(false);
    const on = setShapeStopwatch(s.getState(), ["s"], 0, "trim", true, 10);
    if (on) s.dispatch(on);
    expect(shapeStopwatchOn(shape(s), 0, "trim")).toBe(true);
    expect(shapeKeyFrames(shape(s), 0, "trim")).toEqual([10]);
    for (const field of ["start", "end", "offset"]) expect(shape(s).keyframes?.[`paths.${pathId}.trim.${field}`]).toHaveLength(1);
    // Key the end later, then switch off at frame 20: the trim end keeps what it showed there.
    const edit = editShapes(s.getState(), ["s"], (clip, rel) => void setShapeField(clip, pathId, "trim.end", 0, rel), { label: "e", at: 30 });
    if (edit) s.dispatch(edit);
    const off = setShapeStopwatch(s.getState(), ["s"], 0, "trim", false, 20);
    if (off) s.dispatch(off);
    expect(shape(s).keyframes).toBeUndefined();
    expect(shape(s).paths[0]?.trim?.end).toBeCloseTo(0.5, 5);
  });

  it("the stroke group only exists with a stroke, and the shape group keys the primitive's parameters", () => {
    const { s, pathId } = withStar();
    expect(setShapeStopwatch(s.getState(), ["s"], 0, "stroke", true, 0)).toBeNull();
    const on = setShapeStopwatch(s.getState(), ["s"], 0, "shape", true, 0);
    if (on) s.dispatch(on);
    for (const param of ["points", "inner", "outer", "roundness"]) expect(shape(s).keyframes?.[`paths.${pathId}.primitive.${param}`], param).toHaveLength(1);
  });

  it("the navigator adds a key at the playhead, removes it when every shape has one there, and finds the neighbors", () => {
    const { s } = withStar();
    const on = setShapeStopwatch(s.getState(), ["s"], 0, "trim", true, 0);
    if (on) s.dispatch(on);
    const add = toggleShapeKey(s.getState(), ["s"], 0, "trim", 20);
    if (add) s.dispatch(add);
    expect(shapeKeyFrames(shape(s), 0, "trim")).toEqual([0, 20]);
    expect(adjacentShapeKey(s.getState(), ["s"], 0, "trim", 5, 1)).toBe(20);
    expect(adjacentShapeKey(s.getState(), ["s"], 0, "trim", 20, -1)).toBe(0);
    expect(adjacentShapeKey(s.getState(), ["s"], 0, "trim", 20, 1)).toBeNull();
    const remove = toggleShapeKey(s.getState(), ["s"], 0, "trim", 20);
    if (remove) s.dispatch(remove);
    expect(shapeKeyFrames(shape(s), 0, "trim")).toEqual([0]);
  });

  it("a gradient or none replaces a color fill and drops its keys", () => {
    const { s, pathId } = withStar();
    const on = setShapeStopwatch(s.getState(), ["s"], 0, "fill", true, 0);
    if (on) s.dispatch(on);
    expect(shape(s).keyframes?.[`paths.${pathId}.fill`]).toHaveLength(1);
    const clear = editShapes(s.getState(), ["s"], (clip, rel) => setPathFill(clip, 0, null, rel), { label: "Change fill", at: 0 });
    if (clear) s.dispatch(clear);
    expect(shape(s).paths[0]?.fill).toBeNull();
    expect(shape(s).keyframes).toBeUndefined();
  });
});
