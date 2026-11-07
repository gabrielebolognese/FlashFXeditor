// Shape geometry for the preview and the export (spec §21.12, Batch 65): a shape layer at its frame turned
// into the draws of a `PathLayer`. Geometry is cached by path and style in three parts, so each change
// rebuilds only what it touches: the flattened path (path data or primitive, and the tolerance bucket of the
// on-screen scale), the fill fans (the flattened path) and the stroke (the flattened path, the stroke style
// and the trim: an animated trim rebuilds the stroke only). Moving, scaling within a bucket, rotating or
// fading a shape rebuilds nothing (the counters show it). A path whose build took longer than 2 ms is
// built in a worker from then on (the preview draws its last geometry meanwhile and redraws when it lands);
// exact renders (export) always build at once.
import type { Fill, GradientFill, RGBA } from "../../core/document/types.js";
import { fillFans, flattenSource, vertexBounds, type Bounds, type PathGeometry, type PathGeometryInput, type PathSource } from "../../core/shapes/geometry.js";
import type { Polyline } from "../../core/shapes/flatten.js";
import { strokeGeometry, type StrokeParams } from "../../core/shapes/stroke.js";
import type { PathDraw, PathLayer, ShapeCompositeLayer, ShapePathFrame } from "../compositor/drawList.js";
import { IDENTITY, type Mat3 } from "../mat3.js";

/** Device px a flattened curve may stray from the true one. */
export const DEVICE_TOLERANCE = 0.2;
/** Builds slower than this move to the worker (spec §21.12). */
export const OFFLOAD_MS = 2;
const MAX_ENTRIES = 1024;

export interface ShapeGeometryStats {
  /** Paths flattened, fill fans and strokes built (cache misses), and draws served from the cache. */
  flattens: number;
  fillBuilds: number;
  strokeBuilds: number;
  hits: number;
  /** Builds sent to the worker. */
  offloaded: number;
}

/** What runs a build off the main thread (the geometry worker; tests pass a fake). */
export interface GeometryBuilder {
  build(input: PathGeometryInput): Promise<PathGeometry>;
}

export interface ShapeGeometryOptions {
  /** A worker build landed: draw again. */
  onReady?: () => void;
  /** Made on the first slow build; null: always build at once. */
  builder?: (() => GeometryBuilder | null) | null;
  now?: () => number;
}

export type WritablePathLayer = Omit<PathLayer, "transform" | "draws" | "bounds"> & { transform: Mat3; draws: PathDraw[]; bounds: [number, number, number, number] };

/** A small LRU over a Map (insertion order is recency). */
class Lru<V> {
  private readonly map = new Map<string, V>();
  constructor(private readonly max: number) {}
  get(key: string): V | undefined {
    const value = this.map.get(key);
    if (value !== undefined) {
      this.map.delete(key);
      this.map.set(key, value);
    }
    return value;
  }
  set(key: string, value: V): void {
    this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.max) this.map.delete(this.map.keys().next().value as string);
  }
  clear(): void {
    this.map.clear();
  }
}

const EMPTY = new Float32Array(0);

/** A path's geometry for one draw: fill fans (when filled), stroke triangles, the fans a cut stroke is cut by, the path's box. */
interface Shown {
  fill: Float32Array | null;
  stroke: Float32Array | null;
  clip: Float32Array | null;
  box: Bounds | null;
}

/** The scale bucket (steps of the square root of 2) a device scale draws with. */
export function scaleBucket(scale: number): number {
  if (!(scale > 0) || !Number.isFinite(scale)) return 1;
  return 2 ** (Math.round(Math.log2(scale) * 2) / 2);
}

/** Path data by short id: a long `d` is hashed once (the document's string keeps its hash), never copied into keys. */
const dataIds = new Map<string, string>();
const MAX_DATA_IDS = 4096;
/** Never reused (cleared ids must not name other data in the caches). */
let nextDataId = 0;

function sourceKey(source: PathSource): string {
  if ("d" in source) {
    let id = dataIds.get(source.d);
    if (id === undefined) {
      if (dataIds.size >= MAX_DATA_IDS) dataIds.clear();
      id = `d${nextDataId++}`;
      dataIds.set(source.d, id);
    }
    return id;
  }
  const p = source.primitive as unknown as Record<string, unknown>;
  let key = `p:${source.w},${source.h}`;
  for (const name in p) key += `,${name}=${String(p[name])}`;
  return key;
}

function strokeKey(params: StrokeParams, trim: ShapePathFrame["trim"]): string {
  let key = `${params.width},${params.cap},${params.join},${params.miterLimit}`;
  if (params.dash && params.dash.length > 0) key += `,d${params.dash.join(" ")}@${params.dashOffset ?? 0}`;
  if (trim) key += `,t${trim.start},${trim.end},${trim.offset}`;
  return key;
}

const isColor = (fill: Fill): fill is RGBA => "r" in fill;
const isStops = (fill: Fill): fill is GradientFill => "stops" in fill;
/** The v1 vertical two-stop gradient as a gradient with stops (top to bottom of the box). */
const twoStops = new WeakMap<object, GradientFill>();
function gradientOf(fill: Fill): GradientFill | null {
  if (isColor(fill)) return null;
  if (isStops(fill)) return fill;
  let g = twoStops.get(fill);
  if (!g) {
    g = { type: "linear", angle: 0, center: { x: 0.5, y: 0.5 }, radius: 1, stops: [{ at: 0, color: fill.from }, { at: 1, color: fill.to }] };
    twoStops.set(fill, g);
  }
  return g;
}

export class ShapeGeometryCache {
  private readonly flats = new Lru<{ lines: Polyline[]; box: Bounds | null }>(MAX_ENTRIES);
  private readonly fills = new Lru<Float32Array>(MAX_ENTRIES);
  private readonly strokes = new Lru<Float32Array>(MAX_ENTRIES);
  /** Whole geometries built by the worker, by full key; and the last one of each slow path (clip/path id). */
  private readonly built = new Lru<PathGeometry>(MAX_ENTRIES);
  private readonly lastOf = new Map<string, PathGeometry>();
  private readonly slow = new Set<string>();
  private readonly pending = new Set<string>();
  private builder: GeometryBuilder | null | undefined;
  private readonly counters: ShapeGeometryStats = { flattens: 0, fillBuilds: 0, strokeBuilds: 0, hits: 0, offloaded: 0 };
  private readonly now: () => number;
  private readonly shown: Shown = { fill: null, stroke: null, clip: null, box: null };

  constructor(private readonly options: ShapeGeometryOptions = {}) {
    this.now = options.now ?? (() => performance.now());
  }

  /** The counters so far (a copy). */
  stats(): ShapeGeometryStats {
    return { ...this.counters };
  }

  clear(): void {
    this.flats.clear();
    this.fills.clear();
    this.strokes.clear();
    this.built.clear();
    this.lastOf.clear();
  }

  /**
   * Writes the draws of `layer` into `out` for a render of `renderScale` device px per project px; false
   * when nothing is drawn. `exact`: never wait for the worker (export).
   */
  resolve(layer: ShapeCompositeLayer, renderScale: number, exact: boolean, out: WritablePathLayer): boolean {
    const bucket = scaleBucket(renderScale * layer.scale);
    const tolerance = DEVICE_TOLERANCE / bucket;
    // Exact renders keep the list across awaits: copy what the compositor reuses (its matrices and keyed colors).
    out.transform = exact ? ([...layer.model] as unknown as Mat3) : layer.model;
    out.opacity = layer.opacity;
    let count = 0;
    const bounds = out.bounds as Bounds;
    bounds[0] = bounds[1] = Infinity;
    bounds[2] = bounds[3] = -Infinity;
    for (const path of layer.paths) {
      const geometry = this.geometry(layer.clipId, path, tolerance, exact);
      if (!geometry) continue;
      const box = geometry.box ?? [0, 0, 0, 0];
      if (path.fill && geometry.fill) {
        const draw = (out.draws[count] ??= newDraw());
        count += 1;
        draw.rule = path.fillRule;
        draw.triangles = geometry.fill;
        draw.clip = null;
        draw.clipRule = path.fillRule;
        writeBounds(draw.cover, box);
        writeBounds(draw.box, box);
        draw.gradient = gradientOf(path.fill);
        const color = isColor(path.fill) ? path.fill : (draw.gradient?.stops[0]?.color ?? TRANSPARENT);
        draw.color = exact ? { ...color } : color;
        growBounds(bounds, box);
      }
      const stroke = path.stroke;
      if (stroke && geometry.stroke) {
        const draw = (out.draws[count] ??= newDraw());
        count += 1;
        const cut = stroke.align !== "center" && geometry.clip !== null;
        const reach = strokeBoundsOf(geometry.stroke);
        draw.rule = cut ? (stroke.align as "inside" | "outside") : "union";
        draw.triangles = geometry.stroke;
        draw.clip = cut ? geometry.clip : null;
        draw.clipRule = path.fillRule;
        // A cut stroke's cover also clears the fill's bit wherever the fans reach (a trimmed stroke may not).
        writeBounds(draw.cover, reach);
        if (cut) growBounds(draw.cover, box);
        writeBounds(draw.box, box);
        draw.gradient = null;
        draw.color = exact ? { ...stroke.color } : stroke.color;
        growBounds(bounds, reach);
      }
    }
    out.draws.length = count;
    return count > 0 && bounds[2] > bounds[0] - 1e-9;
  }

  /** A path's geometry from the caches (building what is missing), or the worker's. */
  private geometry(clipId: string, path: ShapePathFrame, tolerance: number, exact: boolean): Shown | null {
    const params = strokeParams(path);
    const cut = params !== null && path.stroke !== null && path.stroke.align !== "center";
    const wantFill = path.fill !== null || cut;
    if (!wantFill && params === null) return null;
    const src = sourceKey(path.source);
    const flatKey = `${src}@${tolerance}`;
    const lineage = `${clipId}/${path.id}`;
    const fullKey = `${flatKey}|${wantFill ? 1 : 0}|${params ? strokeKey(params, path.trim) : ""}`;
    if (!exact && this.slow.has(lineage)) {
      const done = this.built.get(fullKey);
      if (done) {
        this.counters.hits += 1;
        this.lastOf.set(lineage, done);
        return this.show(done.fill, done.stroke, done.box, path, cut);
      }
      const builder = this.workerBuilder();
      if (builder) {
        if (!this.pending.has(fullKey)) {
          this.pending.add(fullKey);
          this.counters.offloaded += 1;
          const input: PathGeometryInput = { source: path.source, tolerance, fill: wantFill, stroke: params, trim: path.trim };
          builder.build(input).then(
            (geometry) => {
              this.pending.delete(fullKey);
              this.built.set(fullKey, geometry);
              this.options.onReady?.();
            },
            () => this.pending.delete(fullKey),
          );
        }
        const last = this.lastOf.get(lineage);
        return last ? this.show(last.fill, last.stroke, last.box, path, cut) : null;
      }
    }
    const started = this.now();
    let flat = this.flats.get(flatKey);
    if (!flat) {
      flat = flattenSource(path.source, tolerance);
      this.flats.set(flatKey, flat);
      this.counters.flattens += 1;
    }
    let fill: Float32Array | null = null;
    if (wantFill) {
      fill = this.fills.get(flatKey) ?? null;
      if (!fill) {
        fill = fillFans(flat.lines);
        this.fills.set(flatKey, fill);
        this.counters.fillBuilds += 1;
      } else this.counters.hits += 1;
    }
    let stroke: Float32Array | null = null;
    if (params) {
      const key = `${flatKey}|${strokeKey(params, path.trim)}`;
      stroke = this.strokes.get(key) ?? null;
      if (!stroke) {
        stroke = strokeGeometry(flat.lines, params, path.trim, tolerance);
        this.strokes.set(key, stroke);
        this.counters.strokeBuilds += 1;
      } else this.counters.hits += 1;
    }
    if (this.now() - started > OFFLOAD_MS && this.options.builder) this.slow.add(lineage);
    if (this.slow.has(lineage)) this.lastOf.set(lineage, { fill, stroke, box: flat.box, bounds: null });
    return this.show(fill, stroke, flat.box, path, cut);
  }

  /** The reused result: empty arrays as null, the fill only when the path is filled, the fans as the clip of a cut stroke. */
  private show(fill: Float32Array | null, stroke: Float32Array | null, box: Bounds | null, path: ShapePathFrame, cut: boolean): Shown {
    const f = fill && fill.length > 0 ? fill : null;
    const out = this.shown;
    out.fill = path.fill !== null ? f : null;
    out.stroke = stroke && stroke.length > 0 ? stroke : null;
    out.clip = cut ? f : null;
    out.box = box;
    return out;
  }

  private workerBuilder(): GeometryBuilder | null {
    if (this.builder === undefined) this.builder = this.options.builder?.() ?? null;
    return this.builder;
  }
}

const TRANSPARENT: RGBA = { r: 0, g: 0, b: 0, a: 0 };

/** Grows `out` to take in `b` (no allocation). */
function growBounds(out: Bounds, b: Bounds): void {
  if (b[0] < out[0]) out[0] = b[0];
  if (b[1] < out[1]) out[1] = b[1];
  if (b[2] > out[2]) out[2] = b[2];
  if (b[3] > out[3]) out[3] = b[3];
}
const strokeBounds = new WeakMap<Float32Array, Bounds>();
/** The stroke triangles' box (cached per array). */
function strokeBoundsOf(stroke: Float32Array): Bounds {
  let b = strokeBounds.get(stroke);
  if (!b) {
    b = vertexBounds(stroke) ?? [0, 0, 0, 0];
    strokeBounds.set(stroke, b);
  }
  return b;
}

/** The stroke a path draws (inside and outside strokes at twice the width, cut by the fill); null for none. */
function strokeParams(path: ShapePathFrame): StrokeParams | null {
  const s = path.stroke;
  if (!s || !(s.width > 0) || !(s.color.a > 0)) return null;
  const width = s.align === "center" ? s.width : s.width * 2;
  return { width, cap: s.cap, join: s.join, miterLimit: s.miterLimit, dash: s.dash ?? null, dashOffset: s.dashOffset ?? 0 };
}

function newDraw(): PathDraw {
  return { rule: "nonzero", triangles: EMPTY, clip: null, clipRule: "nonzero", cover: [0, 0, 0, 0], color: { r: 0, g: 0, b: 0, a: 0 }, gradient: null, box: [0, 0, 0, 0] };
}

function writeBounds(out: Bounds, from: Bounds): void {
  out[0] = from[0];
  out[1] = from[1];
  out[2] = from[2];
  out[3] = from[3];
}

export function newPathLayer(): WritablePathLayer {
  return { kind: "path", transform: IDENTITY, opacity: 1, draws: [], bounds: [0, 0, 0, 0] };
}

/** Runs `buildPathGeometry` in the geometry worker. */
export function workerBuilder(worker: Worker): GeometryBuilder {
  let next = 0;
  const waiting = new Map<number, (geometry: PathGeometry) => void>();
  worker.onmessage = (event: MessageEvent<{ id: number; geometry: PathGeometry }>) => {
    const resolve = waiting.get(event.data.id);
    waiting.delete(event.data.id);
    resolve?.(event.data.geometry);
  };
  return {
    build(input) {
      const id = next++;
      return new Promise((resolve) => {
        waiting.set(id, resolve);
        worker.postMessage({ id, input });
      });
    },
  };
}
