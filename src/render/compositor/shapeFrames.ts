// A shape clip's paths at a frame (spec §21.12, Batch 65): the `paths.<id>.*` keys applied to trims,
// strokes, color fills and primitive params. Unkeyed paths are the same objects every frame (cached per
// clip), so the geometry cache and the draw list comparison see nothing change; keyed paths are written
// into frames reused per layer slot.
import { sampleKeys, sampleVector, SHAPE_PROP_PATTERN } from "../../core/document/keyframes.js";
import type { Frame, KeyData, Keyframes, PathStroke, PathTrim, Primitive, RGBA, ShapeClip, ShapePath } from "../../core/document/types.js";
import type { ShapePathFrame } from "./drawList.js";

const staticFrames = new WeakMap<ShapeClip, ShapePathFrame[]>();

/** A path as drawn when it has no keys. */
function frameOf(clip: ShapeClip, path: ShapePath): ShapePathFrame {
  return {
    id: path.id,
    source: path.primitive ? { primitive: path.primitive, w: clip.size.w, h: clip.size.h } : { d: path.d },
    fill: path.fill,
    fillRule: path.fillRule,
    stroke: path.stroke ?? null,
    trim: path.trim ?? null,
  };
}

/** The unkeyed frames of a clip's paths (made once per clip object). */
export function staticPathFrames(clip: ShapeClip): ShapePathFrame[] {
  let frames = staticFrames.get(clip);
  if (!frames) {
    frames = clip.paths.map((path) => frameOf(clip, path));
    staticFrames.set(clip, frames);
  }
  return frames;
}

/** A path's keyed fields: [field path, keys] (e.g. ["trim.end", keys]), by path id. */
const keyedFields = new WeakMap<Keyframes, Map<string, [string, KeyData[]][]>>();
function keyedOf(keyframes: Keyframes): Map<string, [string, KeyData[]][]> {
  let map = keyedFields.get(keyframes);
  if (!map) {
    map = new Map();
    for (const prop in keyframes) {
      const match = SHAPE_PROP_PATTERN.exec(prop);
      const keys = keyframes[prop];
      if (!match || !keys || keys.length === 0) continue;
      const id = match[1] as string;
      const list = map.get(id) ?? [];
      list.push([match[2] as string, keys]);
      map.set(id, list);
    }
    keyedFields.set(keyframes, map);
  }
  return map;
}

/** Whether any path of the clip has keys. */
export function hasPathKeys(keyframes: Keyframes | undefined): boolean {
  return keyframes !== undefined && keyedOf(keyframes).size > 0;
}

/** The objects a keyed path frame is written into (one set per layer slot and path index). */
export interface PathFrameScratch {
  frame: ShapePathFrame;
  stroke: PathStroke;
  trim: PathTrim;
  fill: RGBA;
  strokeColor: RGBA;
  primitive: Record<string, unknown>;
  source: { primitive: Primitive; w: number; h: number };
  vector: number[];
}

export function newPathFrameScratch(): PathFrameScratch {
  const primitive: Record<string, unknown> = { kind: "line", length: 0 };
  return {
    frame: { id: "", source: { d: "" }, fill: null, fillRule: "nonzero", stroke: null, trim: null },
    stroke: { width: 0, color: { r: 0, g: 0, b: 0, a: 1 }, align: "center", cap: "butt", join: "miter", miterLimit: 4 },
    trim: { start: 0, end: 1, offset: 0 },
    fill: { r: 0, g: 0, b: 0, a: 1 },
    strokeColor: { r: 0, g: 0, b: 0, a: 1 },
    primitive,
    source: { primitive: primitive as unknown as Primitive, w: 0, h: 0 },
    vector: [0, 0, 0, 0],
  };
}

const writeColor = (out: RGBA, v: readonly number[]): RGBA => {
  out.r = v[0] ?? 0;
  out.g = v[1] ?? 0;
  out.b = v[2] ?? 0;
  out.a = v[3] ?? 1;
  return out;
};

/**
 * The clip's paths at `rel` frames from its start into `out` (reused): the static frames for unkeyed
 * paths, the keyed values written into `scratch[i]` for keyed ones.
 */
export function pathFramesAt(clip: ShapeClip, rel: Frame, scratch: PathFrameScratch[], out: ShapePathFrame[]): readonly ShapePathFrame[] {
  const frames = staticPathFrames(clip);
  if (!hasPathKeys(clip.keyframes)) return frames;
  const keyed = keyedOf(clip.keyframes as Keyframes);
  out.length = 0;
  clip.paths.forEach((path, index) => {
    const fields = keyed.get(path.id);
    if (!fields) {
      out.push(frames[index] as ShapePathFrame);
      return;
    }
    const s = (scratch[index] ??= newPathFrameScratch());
    const f = s.frame;
    const base = frames[index] as ShapePathFrame;
    f.id = base.id;
    f.source = base.source;
    f.fill = base.fill;
    f.fillRule = base.fillRule;
    f.stroke = base.stroke;
    f.trim = base.trim;
    for (const [field, keys] of fields) {
      if (field.startsWith("trim.")) {
        if (f.trim !== s.trim) {
          const t = path.trim ?? { start: 0, end: 1, offset: 0 };
          s.trim.start = t.start;
          s.trim.end = t.end;
          s.trim.offset = t.offset;
          f.trim = s.trim;
        }
        // A keyed trim stays within 0..1 (springs and back eases overshoot).
        const value = sampleKeys(keys, rel);
        if (field === "trim.offset") s.trim.offset = value;
        else s.trim[field === "trim.start" ? "start" : "end"] = Math.min(1, Math.max(0, value));
      } else if (field.startsWith("stroke.") && path.stroke) {
        if (f.stroke !== s.stroke) {
          Object.assign(s.stroke, path.stroke);
          s.stroke.color = path.stroke.color;
          f.stroke = s.stroke;
        }
        if (field === "stroke.width") s.stroke.width = Math.max(0, sampleKeys(keys, rel));
        else if (field === "stroke.dashOffset") s.stroke.dashOffset = sampleKeys(keys, rel);
        else s.stroke.color = writeColor(s.strokeColor, sampleVector(keys, rel, s.vector));
      } else if (field === "fill") {
        f.fill = writeColor(s.fill, sampleVector(keys, rel, s.vector));
      } else if (field.startsWith("primitive.") && path.primitive) {
        if (f.source !== s.source) {
          for (const key in s.primitive) delete s.primitive[key];
          Object.assign(s.primitive, path.primitive);
          s.source.w = clip.size.w;
          s.source.h = clip.size.h;
          f.source = s.source;
        }
        s.primitive[field.slice(10)] = sampleKeys(keys, rel);
      }
    }
    out.push(f);
  });
  return out;
}
