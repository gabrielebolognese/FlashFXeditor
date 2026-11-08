/* eslint-disable no-restricted-syntax -- hex strings are SVG color data, not UI colors */
// SVG import as shapes (spec §21.12, Batch 66): the supported subset of an SVG document turned into the
// paths of a shape clip. Supported: `path`, `rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon`,
// `g` with transforms (baked into the path data), fill, stroke and opacity as attributes or `style`
// declarations, linear and radial gradients (as `GradientFill`) and `viewBox`. Anything else (filters,
// masks, clip paths, text, images, patterns, `use`, ...) is not imported: the result names it and the
// caller keeps the SVG as an image clip.
// Approximations (logged in PROGRESS.md): an element's opacity multiplies its fill and stroke alpha (exact
// without overlaps), a stroke is scaled by the square root of its transform's determinant, a gradient
// stroke and a focal radial point are not supported (named as unsupported / ignored), gradient circles
// in a non-square box become the box's mean radius. Pure: it reads a parsed DOM `Element` (DOMParser in
// the app, jsdom in tests).
import { colorAt, cleanStops } from "../document/fill.js";
import type { Fill, GradientFill, GradientStop, PathStroke, RGBA, ShapePath } from "../document/types.js";
import { MAX_GRADIENT_STOPS } from "../document/types.js";
import { CUBIC, controlBounds, formatPathData, LINE, parsePathData, type ParsedPath } from "./pathData.js";

/** The result of reading an SVG: the shape clip's view box and paths, or the names of what is not supported. */
export type SvgImportResult = { ok: true; size: { w: number; h: number }; paths: ShapePath[] } | { ok: false; unsupported: string[] };

type Matrix = readonly [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** `a` applied after `b` (SVG's `transform="b a"` order: b is the parent). */
function multiply(b: Matrix, a: Matrix): Matrix {
  return [
    b[0] * a[0] + b[2] * a[1], b[1] * a[0] + b[3] * a[1],
    b[0] * a[2] + b[2] * a[3], b[1] * a[2] + b[3] * a[3],
    b[0] * a[4] + b[2] * a[5] + b[4], b[1] * a[4] + b[3] * a[5] + b[5],
  ];
}

const NUM = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g;

/** Parses a `transform` attribute; null when a function is unknown or malformed. */
export function parseTransform(text: string): Matrix | null {
  let m: Matrix = IDENTITY;
  const re = /\s*([a-zA-Z]+)\s*\(([^)]*)\)\s*,?/y;
  let at = 0;
  const source = text.trim();
  if (source === "") return IDENTITY;
  while (at < source.length) {
    re.lastIndex = at;
    const match = re.exec(source);
    if (!match) return null;
    at = re.lastIndex;
    const args = (match[2] as string).match(NUM)?.map(Number) ?? [];
    const a = (i: number, fallback = 0) => args[i] ?? fallback;
    let t: Matrix;
    switch (match[1]) {
      case "translate":
        t = [1, 0, 0, 1, a(0), a(1)];
        break;
      case "scale":
        t = [a(0, 1), 0, 0, args.length > 1 ? a(1) : a(0, 1), 0, 0];
        break;
      case "rotate": {
        const r = (a(0) * Math.PI) / 180;
        const rot: Matrix = [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0];
        t = args.length >= 3 ? multiply(multiply([1, 0, 0, 1, a(1), a(2)], rot), [1, 0, 0, 1, -a(1), -a(2)]) : rot;
        break;
      }
      case "skewX":
        t = [1, 0, Math.tan((a(0) * Math.PI) / 180), 1, 0, 0];
        break;
      case "skewY":
        t = [1, Math.tan((a(0) * Math.PI) / 180), 0, 1, 0, 0];
        break;
      case "matrix":
        if (args.length !== 6) return null;
        t = [a(0), a(1), a(2), a(3), a(4), a(5)];
        break;
      default:
        return null;
    }
    m = multiply(m, t);
  }
  return m;
}

/** `path` with every point moved by `m`. */
export function transformPath(path: ParsedPath, m: Matrix): ParsedPath {
  const px = (x: number, y: number) => m[0] * x + m[2] * y + m[4];
  const py = (x: number, y: number) => m[1] * x + m[3] * y + m[5];
  return path.map((s) => {
    const cmds: number[] = [];
    for (let i = 0; i < s.cmds.length; ) {
      if (s.cmds[i] === LINE) {
        const x = s.cmds[i + 1] as number;
        const y = s.cmds[i + 2] as number;
        cmds.push(LINE, px(x, y), py(x, y));
        i += 3;
      } else {
        cmds.push(CUBIC);
        for (let k = 1; k < 7; k += 2) {
          const x = s.cmds[i + k] as number;
          const y = s.cmds[i + k + 1] as number;
          cmds.push(px(x, y), py(x, y));
        }
        i += 7;
      }
    }
    return { x: px(s.x, s.y), y: py(s.x, s.y), cmds, closed: s.closed };
  });
}

const NAMED: Readonly<Record<string, string>> = {
  black: "#000000", white: "#ffffff", red: "#ff0000", green: "#008000", lime: "#00ff00", blue: "#0000ff", yellow: "#ffff00", cyan: "#00ffff", aqua: "#00ffff",
  magenta: "#ff00ff", fuchsia: "#ff00ff", gray: "#808080", grey: "#808080", silver: "#c0c0c0", maroon: "#800000", olive: "#808000", purple: "#800080",
  teal: "#008080", navy: "#000080", orange: "#ffa500", pink: "#ffc0cb", brown: "#a52a2a", gold: "#ffd700", transparent: "#00000000",
};

/** A CSS color (hex, rgb(), rgba(), a common name); null when it is not one of those. */
export function parseColor(value: string): RGBA | null {
  const text = value.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3,8})$/.exec(NAMED[text] ?? text)?.[1];
  if (hex && [3, 4, 6, 8].includes(hex.length)) {
    const full = hex.length <= 4 ? [...hex].map((c) => c + c).join("") : hex;
    const channel = (i: number) => Number.parseInt(full.slice(i * 2, i * 2 + 2), 16) / 255;
    return { r: channel(0), g: channel(1), b: channel(2), a: full.length === 8 ? channel(3) : 1 };
  }
  const fn = /^rgba?\(([^)]*)\)$/.exec(text);
  if (fn) {
    const parts = (fn[1] as string).split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const part = (s: string, scale: number) => (s.endsWith("%") ? Number.parseFloat(s) / 100 : Number.parseFloat(s) / scale);
    const [r, g, b] = [part(parts[0] as string, 255), part(parts[1] as string, 255), part(parts[2] as string, 255)];
    const a = parts[3] === undefined ? 1 : part(parts[3], 1);
    if ([r, g, b, a].some((v) => !Number.isFinite(v))) return null;
    const c = (v: number) => Math.min(1, Math.max(0, v));
    return { r: c(r), g: c(g), b: c(b), a: c(a) };
  }
  return null;
}

/** Inherited presentation properties. */
interface Style {
  fill: string;
  stroke: string;
  strokeWidth: number;
  cap: PathStroke["cap"];
  join: PathStroke["join"];
  miterLimit: number;
  dash: number[];
  dashOffset: number;
  fillRule: ShapePath["fillRule"];
  fillOpacity: number;
  strokeOpacity: number;
  /** Product of the group opacities above. */
  opacity: number;
  color: string;
}

const INITIAL: Style = { fill: "#000000", stroke: "none", strokeWidth: 1, cap: "butt", join: "miter", miterLimit: 4, dash: [], dashOffset: 0, fillRule: "nonzero", fillOpacity: 1, strokeOpacity: 1, opacity: 1, color: "#000000" };

const PROPERTIES = ["fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-dasharray", "stroke-dashoffset", "fill-rule", "fill-opacity", "stroke-opacity", "opacity", "color", "display", "visibility", "filter", "mask", "clip-path", "clip-rule"] as const;

/** An element's presentation properties: attributes, then the `style` declarations over them. */
function declared(el: Element): Map<string, string> {
  const out = new Map<string, string>();
  for (const name of PROPERTIES) {
    const value = el.getAttribute(name);
    if (value !== null) out.set(name, value.trim());
  }
  for (const part of (el.getAttribute("style") ?? "").split(";")) {
    const at = part.indexOf(":");
    if (at > 0) out.set(part.slice(0, at).trim().toLowerCase(), part.slice(at + 1).trim());
  }
  return out;
}

const number = (value: string | null | undefined, fallback: number) => {
  if (value === null || value === undefined) return fallback;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
};

/** A length with an optional unit as a fraction (`50%`) or a plain number (px). */
function unitNumber(value: string | null, fallback: number): { n: number; percent: boolean } {
  if (value === null) return { n: fallback, percent: false };
  const percent = value.trim().endsWith("%");
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? { n: percent ? n / 100 : n, percent } : { n: fallback, percent: false };
}

const IGNORED = new Set(["defs", "title", "desc", "metadata", "lineargradient", "radialgradient", "stop", "namedview"]);
const SHAPES = new Set(["path", "rect", "circle", "ellipse", "line", "polyline", "polygon"]);

const localName = (el: Element) => (el.localName ?? el.nodeName).toLowerCase();

class Importer {
  readonly unsupported = new Set<string>();
  readonly paths: ShapePath[] = [];
  private readonly ids = new Map<string, Element>();

  constructor(private readonly root: Element, private readonly newId: () => string) {
    for (const el of Array.from(root.querySelectorAll("[id]"))) this.ids.set(el.getAttribute("id") as string, el);
  }

  private flag(name: string): void {
    this.unsupported.add(name);
  }

  run(base: Matrix): void {
    this.walk(this.root, base, INITIAL, true);
  }

  private walk(el: Element, parent: Matrix, inherited: Style, isRoot = false): void {
    const name = localName(el);
    // Foreign namespaces (editor metadata) are ignored whole.
    if (el.namespaceURI && el.namespaceURI !== "http://www.w3.org/2000/svg") return;
    if (!isRoot) {
      if (IGNORED.has(name)) return;
      if (name === "style") {
        if ((el.textContent ?? "").trim() !== "") this.flag("style sheet");
        return;
      }
      if (name !== "g" && !SHAPES.has(name)) {
        this.flag(name === "clippath" ? "clipPath" : name === "foreignobject" ? "foreignObject" : name);
        return;
      }
    }
    const props = declared(el);
    for (const effect of ["filter", "mask", "clip-path"] as const) {
      const value = props.get(effect);
      if (value && value !== "none") this.flag(effect === "clip-path" ? "clip-path" : effect);
    }
    if (props.get("display") === "none" || props.get("visibility") === "hidden") return;
    const style = this.style(inherited, props);
    const own = parseTransform(el.getAttribute("transform") ?? "");
    if (own === null) {
      this.flag("transform");
      return;
    }
    const matrix = multiply(parent, own);
    if (name === "g" || isRoot) {
      for (const child of Array.from(el.children)) this.walk(child, matrix, style);
      return;
    }
    this.shape(el, name, matrix, style);
  }

  private style(parent: Style, props: Map<string, string>): Style {
    const s: Style = { ...parent, opacity: parent.opacity * Math.min(1, Math.max(0, number(props.get("opacity"), 1))) };
    const get = (name: string) => props.get(name);
    if (get("color") !== undefined) s.color = get("color") as string;
    if (get("fill") !== undefined) s.fill = get("fill") as string;
    if (get("stroke") !== undefined) s.stroke = get("stroke") as string;
    s.strokeWidth = number(get("stroke-width"), s.strokeWidth);
    const cap = get("stroke-linecap");
    if (cap === "butt" || cap === "round" || cap === "square") s.cap = cap;
    const join = get("stroke-linejoin");
    if (join === "miter" || join === "round" || join === "bevel") s.join = join;
    s.miterLimit = number(get("stroke-miterlimit"), s.miterLimit);
    const dash = get("stroke-dasharray");
    if (dash !== undefined) s.dash = dash === "none" ? [] : (dash.match(NUM)?.map(Number) ?? []);
    s.dashOffset = number(get("stroke-dashoffset"), s.dashOffset);
    const rule = get("fill-rule");
    if (rule === "nonzero" || rule === "evenodd") s.fillRule = rule;
    s.fillOpacity = Math.min(1, Math.max(0, number(get("fill-opacity"), s.fillOpacity)));
    s.strokeOpacity = Math.min(1, Math.max(0, number(get("stroke-opacity"), s.strokeOpacity)));
    return s;
  }

  /** The element's geometry as path data in its own user space. */
  private geometry(el: Element, name: string): string | null {
    const attr = (n: string, fallback = 0) => number(el.getAttribute(n), fallback);
    switch (name) {
      case "path":
        return el.getAttribute("d") ?? "";
      case "rect": {
        const [x, y, w, h] = [attr("x"), attr("y"), attr("width"), attr("height")];
        if (!(w > 0 && h > 0)) return "";
        let rx = el.hasAttribute("rx") ? attr("rx") : attr("ry");
        let ry = el.hasAttribute("ry") ? attr("ry") : rx;
        rx = Math.min(Math.max(rx, 0), w / 2);
        ry = Math.min(Math.max(ry, 0), h / 2);
        if (rx === 0 || ry === 0) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
        return `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`;
      }
      case "circle":
      case "ellipse": {
        const cx = attr("cx");
        const cy = attr("cy");
        const rx = name === "circle" ? attr("r") : attr("rx");
        const ry = name === "circle" ? rx : attr("ry");
        if (!(rx > 0 && ry > 0)) return "";
        return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;
      }
      case "line":
        return `M${attr("x1")} ${attr("y1")}L${attr("x2")} ${attr("y2")}`;
      default: {
        const points = (el.getAttribute("points") ?? "").match(NUM)?.map(Number) ?? [];
        if (points.length < 4) return "";
        let d = `M${points[0]} ${points[1]}`;
        for (let i = 2; i + 1 < points.length; i += 2) d += `L${points[i]} ${points[i + 1]}`;
        return name === "polygon" ? `${d}Z` : d;
      }
    }
  }

  private shape(el: Element, name: string, matrix: Matrix, style: Style): void {
    let parsed: ParsedPath;
    try {
      parsed = parsePathData(this.geometry(el, name) ?? "");
    } catch {
      this.flag("path data");
      return;
    }
    if (parsed.length === 0) return;
    const path = transformPath(parsed, matrix);
    const box = controlBounds(path);
    const d = formatPathData(path);
    const fill = this.paint(style.fill, style, style.fillOpacity, box, "fill", matrix);
    const strokePaint = this.paint(style.stroke, style, style.strokeOpacity, box, "stroke", matrix);
    if (strokePaint && !isColor(strokePaint)) {
      this.flag("gradient stroke");
      return;
    }
    const entry: ShapePath = { id: this.newId(), d, fill: fill ?? null, fillRule: style.fillRule };
    if (strokePaint && style.strokeWidth > 0) {
      const scale = Math.sqrt(Math.abs(matrix[0] * matrix[3] - matrix[1] * matrix[2]));
      const stroke: PathStroke = { width: style.strokeWidth * scale, color: strokePaint, align: "center", cap: style.cap, join: style.join, miterLimit: Math.max(1, style.miterLimit) };
      const dash = style.dash.length > 0 && style.dash.every((v) => v >= 0) && style.dash.some((v) => v > 0) ? style.dash.slice(0, 4).map((v) => v * scale) : [];
      if (dash.length > 0) {
        stroke.dash = dash;
        if (style.dashOffset !== 0) stroke.dashOffset = style.dashOffset * scale;
      }
      entry.stroke = stroke;
    }
    if (entry.fill !== null || entry.stroke) this.paths.push(entry);
  }

  /** A paint value as a fill: a color (opacity folded into alpha), a gradient in the path's box, or null for none. */
  private paint(value: string, style: Style, opacity: number, box: [number, number, number, number] | null, what: string, matrix: Matrix): Fill | null {
    const text = value.trim();
    if (text === "none" || text === "") return null;
    const alpha = opacity * style.opacity;
    const url = /^url\(\s*['"]?#([^'")\s]+)['"]?\s*\)/.exec(text);
    if (url) {
      const target = this.ids.get(url[1] as string);
      const kind = target ? localName(target) : "";
      if (kind === "lineargradient" || kind === "radialgradient") return this.gradient(target as Element, kind === "radialgradient", alpha, box, matrix);
      this.flag(kind === "pattern" ? "pattern" : `${what} reference`);
      return null;
    }
    const color = parseColor(text === "currentColor" || text === "currentcolor" ? style.color : text);
    if (!color) {
      this.flag(`color ${text}`);
      return null;
    }
    return { ...color, a: color.a * alpha };
  }

  /** The gradient element's own attribute or the first one down its `href` chain. */
  private inherited(el: Element, name: string): string | null {
    const seen = new Set<Element>();
    for (let cur: Element | undefined = el; cur && !seen.has(cur); ) {
      seen.add(cur);
      const own = cur.getAttribute(name);
      if (own !== null) return own;
      const ref: string | null = cur.getAttribute("href") ?? cur.getAttribute("xlink:href");
      cur = ref?.startsWith("#") ? this.ids.get(ref.slice(1)) : undefined;
    }
    return null;
  }

  private stops(el: Element, alpha: number): GradientStop[] {
    const seen = new Set<Element>();
    for (let cur: Element | undefined = el; cur && !seen.has(cur); ) {
      seen.add(cur);
      const list = Array.from(cur.children).filter((child) => localName(child) === "stop");
      if (list.length > 0) {
        let last = 0;
        const stops: GradientStop[] = [];
        for (const stop of list) {
          const props = declared(stop);
          const offset = unitNumber(stop.getAttribute("offset"), 0);
          last = Math.min(1, Math.max(last, offset.n));
          const css = props.get("stop-color") ?? stop.getAttribute("stop-color") ?? "#000000";
          const color = parseColor(css) ?? { r: 0, g: 0, b: 0, a: 1 };
          const opacity = number(props.get("stop-opacity") ?? stop.getAttribute("stop-opacity"), 1);
          stops.push({ at: last, color: { ...color, a: color.a * Math.min(1, Math.max(0, opacity)) * alpha } });
        }
        return stops;
      }
      const ref: string | null = cur.getAttribute("href") ?? cur.getAttribute("xlink:href");
      cur = ref?.startsWith("#") ? this.ids.get(ref.slice(1)) : undefined;
    }
    return [];
  }

  private gradient(el: Element, radial: boolean, alpha: number, box: [number, number, number, number] | null, matrix: Matrix): Fill | null {
    const stops = this.stops(el, alpha);
    if (stops.length === 0) return null;
    if (stops.length === 1) return { ...(stops[0] as GradientStop).color };
    if (!box) return null;
    const bw = Math.max(box[2] - box[0], 1e-6);
    const bh = Math.max(box[3] - box[1], 1e-6);
    const userSpace = this.inherited(el, "gradientUnits") === "userSpaceOnUse";
    const gt = parseTransform(this.inherited(el, "gradientTransform") ?? "");
    if (gt === null) {
      this.flag("gradientTransform");
      return null;
    }
    // Positions in the path's box (px from its top left): bbox units scale by the box, user-space ones go through the element transform.
    const point = (x: number, y: number): [number, number] => {
      if (!userSpace) return [box[0] + x * bw, box[1] + y * bh];
      const gx = gt[0] * x + gt[2] * y + gt[4];
      const gy = gt[1] * x + gt[3] * y + gt[5];
      return [matrix[0] * gx + matrix[2] * gy + matrix[4], matrix[1] * gx + matrix[3] * gy + matrix[5]];
    };
    // Percentages act as fractions of the box (user-space ones refer to the viewport, which an icon rarely uses).
    const len = (name: string, fallback: number) => unitNumber(this.inherited(el, name), fallback).n;
    let fill: GradientFill;
    if (!radial) {
      const [x1, y1] = point(len("x1", 0), len("y1", 0));
      const [x2, y2] = point(len("x2", 1), len("y2", 0));
      const dx = x2 - x1;
      const dy = y2 - y1;
      const length = Math.hypot(dx, dy);
      if (length < 1e-9) return { ...(stops.at(-1) as GradientStop).color };
      const angle = (Math.atan2(-dx, dy) * 180) / Math.PI;
      // The renderer's gradient line is centered on the box and as long as the box's extent along the direction.
      const dir: [number, number] = [dx / length, dy / length];
      const extent = Math.max(Math.abs(dir[0]) * bw + Math.abs(dir[1]) * bh, 1e-6);
      const cx = box[0] + bw / 2;
      const cy = box[1] + bh / 2;
      const t1 = 0.5 + ((x1 - cx) * dir[0] + (y1 - cy) * dir[1]) / extent;
      const t2 = 0.5 + ((x2 - cx) * dir[0] + (y2 - cy) * dir[1]) / extent;
      fill = { type: "linear", angle, center: { x: 0.5, y: 0.5 }, radius: 1, stops: remapStops(stops, t1, t2) };
    } else {
      const [cx, cy] = point(len("cx", 0.5), len("cy", 0.5));
      const r = len("r", 0.5);
      const rpx = userSpace ? r * Math.sqrt(Math.abs(matrix[0] * matrix[3] - matrix[1] * matrix[2])) * Math.sqrt(Math.abs(gt[0] * gt[3] - gt[1] * gt[2])) : r * ((bw + bh) / 2);
      const half = Math.hypot(bw, bh) / 2;
      fill = { type: "radial", angle: 0, center: { x: (cx - box[0]) / bw, y: (cy - box[1]) / bh }, radius: Math.max(0.001, rpx / half), stops: stops.map((s) => ({ at: s.at, color: s.color })) };
    }
    return fill;
  }
}

const isColor = (fill: Fill): fill is RGBA => "r" in fill;

/**
 * `stops` (0..1 along the SVG's vector) re-expressed along the renderer's gradient line, where the SVG
 * vector runs from `t1` to `t2`: the parts outside the vector hold the end colors.
 */
function remapStops(stops: readonly GradientStop[], t1: number, t2: number): GradientStop[] {
  const clean = cleanStops(stops);
  const scaled = clean.map((s) => ({ at: t1 + s.at * (t2 - t1), color: s.color }));
  const first = clean[0] as GradientStop;
  const last = clean.at(-1) as GradientStop;
  const out: GradientStop[] = [];
  const at = (t: number): RGBA => {
    // The color the SVG paints at line position t (padded beyond its ends).
    if (t2 === t1) return t >= t1 ? last.color : first.color;
    return colorAt(clean, Math.min(1, Math.max(0, (t - t1) / (t2 - t1))));
  };
  out.push({ at: 0, color: at(0) });
  for (const s of scaled) if (s.at > 0 && s.at < 1) out.push({ at: s.at, color: s.color });
  out.push({ at: 1, color: at(1) });
  const result = out.filter((s, i) => i === 0 || s.at > (out[i - 1] as GradientStop).at);
  if (result.length > MAX_GRADIENT_STOPS) {
    const keep: GradientStop[] = [];
    for (let i = 0; i < MAX_GRADIENT_STOPS; i++) keep.push(result[Math.round((i * (result.length - 1)) / (MAX_GRADIENT_STOPS - 1))] as GradientStop);
    return keep;
  }
  return result.length >= 2 ? result : [{ at: 0, color: first.color }, { at: 1, color: last.color }];
}

/** The SVG's view box (project px at scale 1): its `viewBox`, else its width and height. Null when it has neither. */
export function svgViewBox(root: Element): { x: number; y: number; w: number; h: number } | null {
  const box = (root.getAttribute("viewBox") ?? "").match(NUM)?.map(Number) ?? [];
  if (box.length === 4 && (box[2] as number) > 0 && (box[3] as number) > 0) return { x: box[0] as number, y: box[1] as number, w: box[2] as number, h: box[3] as number };
  const w = number(root.getAttribute("width"), 0);
  const h = number(root.getAttribute("height"), 0);
  return w > 0 && h > 0 ? { x: 0, y: 0, w, h } : null;
}

/**
 * Reads `root` (the parsed `<svg>` element) as shape paths. `newId` makes the path ids. The view box's
 * top left becomes the origin and its size the clip's `size` (whole px, at least 1).
 */
export function importSvgShapes(root: Element, newId: () => string): SvgImportResult {
  if (localName(root) !== "svg") return { ok: false, unsupported: ["not an SVG document"] };
  const view = svgViewBox(root);
  if (!view) return { ok: false, unsupported: ["no size"] };
  const importer = new Importer(root, newId);
  importer.run([1, 0, 0, 1, -view.x, -view.y]);
  if (importer.unsupported.size > 0) return { ok: false, unsupported: [...importer.unsupported] };
  if (importer.paths.length === 0) return { ok: false, unsupported: ["no drawable shapes"] };
  return { ok: true, size: { w: Math.max(1, Math.round(view.w)), h: Math.max(1, Math.round(view.h)) }, paths: importer.paths };
}
