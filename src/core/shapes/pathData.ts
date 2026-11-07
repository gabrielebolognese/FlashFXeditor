// SVG path data (spec §21.12, Batch 65): the grammar of the `d` attribute (M L H V C S Q T A Z, absolute
// and relative, implicit repeats, compact arc flags), parsed into subpaths of lines and cubics. Quadratics
// are raised to cubics and arcs converted to cubics (SVG 1.1 F.6.5, at most 90 degrees per cubic), so
// everything downstream (flattening, bounds, primitives) handles two segment kinds. Pure: no DOM.

/** A segment: `LINE, x, y` or `CUBIC, x1, y1, x2, y2, x, y` in `Subpath.cmds`. */
export const LINE = 0;
export const CUBIC = 1;

/** One subpath: starts at (x, y), then its segments; `closed` when it ended with Z. */
export interface Subpath {
  x: number;
  y: number;
  cmds: number[];
  closed: boolean;
}

export type ParsedPath = Subpath[];

export class PathDataError extends Error {}

const COMMANDS = "MmLlHhVvCcSsQqTtAaZz";
const isSpace = (c: string) => c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\f" || c === ",";
const NUMBER = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;

/** Parses `d`; throws a `PathDataError` naming the first problem. An empty or blank `d` is an empty path. */
export function parsePathData(d: string): ParsedPath {
  const out: ParsedPath = [];
  let i = 0;
  const n = d.length;
  const skip = () => {
    while (i < n && isSpace(d[i] as string)) i += 1;
  };
  const atNumber = () => {
    skip();
    if (i >= n) return false;
    const c = d[i] as string;
    return c === "+" || c === "-" || c === "." || (c >= "0" && c <= "9");
  };
  const number = (): number => {
    skip();
    NUMBER.lastIndex = i;
    const match = NUMBER.exec(d);
    if (!match) throw new PathDataError(`a number is expected at position ${i}`);
    i = NUMBER.lastIndex;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) throw new PathDataError(`the number at position ${i} is not finite`);
    return value;
  };
  const flag = (): number => {
    skip();
    const c = d[i];
    if (c !== "0" && c !== "1") throw new PathDataError(`an arc flag (0 or 1) is expected at position ${i}`);
    i += 1;
    return c === "1" ? 1 : 0;
  };

  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  // The last control point (reflection for S and T) and the command it came from.
  let lastCubic: [number, number] | null = null;
  let lastQuad: [number, number] | null = null;
  let current: Subpath | null = null;
  const begin = (x: number, y: number) => {
    current = { x, y, cmds: [], closed: false };
    out.push(current);
    sx = x;
    sy = y;
  };
  const sub = (): Subpath => {
    // A drawing command after Z (or first) without M starts at the current point.
    if (current === null || current.closed) begin(cx, cy);
    return current as unknown as Subpath;
  };
  const cubic = (x1: number, y1: number, x2: number, y2: number, x: number, y: number) => {
    sub().cmds.push(CUBIC, x1, y1, x2, y2, x, y);
    cx = x;
    cy = y;
  };

  skip();
  if (i < n && d[i] !== "M" && d[i] !== "m") throw new PathDataError("path data must start with M or m");
  let command = "";
  while (true) {
    skip();
    if (i >= n) break;
    const c = d[i] as string;
    if (COMMANDS.includes(c)) {
      command = c;
      i += 1;
    } else if (!atNumber() || command === "" || command === "Z" || command === "z") {
      throw new PathDataError(`unexpected "${c}" at position ${i}`);
    }
    const rel = command === command.toLowerCase();
    const ox = rel ? cx : 0;
    const oy = rel ? cy : 0;
    switch (command) {
      case "M":
      case "m": {
        const x = ox + number();
        const y = oy + number();
        begin(x, y);
        cx = x;
        cy = y;
        // Further pairs are line-tos.
        command = rel ? "l" : "L";
        lastCubic = lastQuad = null;
        continue;
      }
      case "L":
      case "l": {
        const x = ox + number();
        const y = oy + number();
        sub().cmds.push(LINE, x, y);
        cx = x;
        cy = y;
        lastCubic = lastQuad = null;
        break;
      }
      case "H":
      case "h": {
        const x = ox + number();
        sub().cmds.push(LINE, x, cy);
        cx = x;
        lastCubic = lastQuad = null;
        break;
      }
      case "V":
      case "v": {
        const y = oy + number();
        sub().cmds.push(LINE, cx, y);
        cy = y;
        lastCubic = lastQuad = null;
        break;
      }
      case "C":
      case "c": {
        const x1 = ox + number();
        const y1 = oy + number();
        const x2 = ox + number();
        const y2 = oy + number();
        const x = ox + number();
        const y = oy + number();
        cubic(x1, y1, x2, y2, x, y);
        lastCubic = [x2, y2];
        lastQuad = null;
        break;
      }
      case "S":
      case "s": {
        const x1 = lastCubic ? 2 * cx - lastCubic[0] : cx;
        const y1 = lastCubic ? 2 * cy - lastCubic[1] : cy;
        const x2 = ox + number();
        const y2 = oy + number();
        const x = ox + number();
        const y = oy + number();
        cubic(x1, y1, x2, y2, x, y);
        lastCubic = [x2, y2];
        lastQuad = null;
        break;
      }
      case "Q":
      case "q": {
        const qx = ox + number();
        const qy = oy + number();
        const x = ox + number();
        const y = oy + number();
        quad(cx, cy, qx, qy, x, y, cubic);
        lastQuad = [qx, qy];
        lastCubic = null;
        break;
      }
      case "T":
      case "t": {
        const qx: number = lastQuad ? 2 * cx - lastQuad[0] : cx;
        const qy: number = lastQuad ? 2 * cy - lastQuad[1] : cy;
        const x = ox + number();
        const y = oy + number();
        quad(cx, cy, qx, qy, x, y, cubic);
        lastQuad = [qx, qy];
        lastCubic = null;
        break;
      }
      case "A":
      case "a": {
        const rx = number();
        const ry = number();
        const rotation = number();
        const large = flag();
        const sweep = flag();
        const x = ox + number();
        const y = oy + number();
        if (rx < 0 || ry < 0) throw new PathDataError("arc radii must not be negative");
        const s = sub();
        arcToCubics(cx, cy, rx, ry, rotation, large === 1, sweep === 1, x, y, s.cmds);
        cx = x;
        cy = y;
        lastCubic = lastQuad = null;
        break;
      }
      case "Z":
      case "z": {
        if (current !== null && !(current as Subpath).closed) (current as Subpath).closed = true;
        cx = sx;
        cy = sy;
        lastCubic = lastQuad = null;
        continue;
      }
    }
  }
  return out;
}

/** Whether `d` parses; the problem when it does not. */
export function pathDataIssue(d: string): string | null {
  try {
    parsePathData(d);
    return null;
  } catch (error) {
    return error instanceof PathDataError ? error.message : String(error);
  }
}

function quad(x0: number, y0: number, qx: number, qy: number, x: number, y: number, cubic: (x1: number, y1: number, x2: number, y2: number, x: number, y: number) => void): void {
  cubic(x0 + (2 / 3) * (qx - x0), y0 + (2 / 3) * (qy - y0), x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), x, y);
}

/**
 * The SVG elliptical arc from (x0, y0) to (x, y) as cubics appended to `out` (endpoint to center
 * conversion of SVG 1.1 F.6.5, radii scaled up when too small, a line when a radius is 0).
 */
export function arcToCubics(x0: number, y0: number, rx: number, ry: number, rotation: number, large: boolean, sweep: boolean, x: number, y: number, out: number[]): void {
  if (x0 === x && y0 === y) return;
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  if (rx === 0 || ry === 0) {
    out.push(LINE, x, y);
    return;
  }
  const phi = (rotation * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x0 - x) / 2;
  const dy = (y0 - y) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const k = Math.sqrt(lambda);
    rx *= k;
    ry *= k;
  }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  let coef = den === 0 ? 0 : Math.sqrt(Math.max(0, num / den));
  if (large === sweep) coef = -coef;
  const cxp = (coef * rx * y1p) / ry;
  const cyp = (-coef * ry * x1p) / rx;
  const ccx = cos * cxp - sin * cyp + (x0 + x) / 2;
  const ccy = sin * cxp + cos * cyp + (y0 + y) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let delta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  else if (sweep && delta < 0) delta += 2 * Math.PI;
  ellipseCubics(ccx, ccy, rx, ry, phi, theta1, delta, out);
  // Land exactly on the end point.
  out[out.length - 2] = x;
  out[out.length - 1] = y;
}

/**
 * The arc of the ellipse centered (cx, cy) with radii rx, ry turned by `phi` (radians), from parameter
 * angle `theta` over `delta` (radians, signed), as cubics of at most 90 degrees appended to `out`.
 */
export function ellipseCubics(cx: number, cy: number, rx: number, ry: number, phi: number, theta: number, delta: number, out: number[]): void {
  const count = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2) - 1e-9));
  const step = delta / count;
  const k = (4 / 3) * Math.tan(step / 4);
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  // A point (px, py) of the unturned ellipse frame, turned by phi and moved to the center.
  const put = (px: number, py: number) => out.push(cx + cos * px - sin * py, cy + sin * px + cos * py);
  let a = theta;
  for (let s = 0; s < count; s++) {
    const b = a + step;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const cb = Math.cos(b);
    const sb = Math.sin(b);
    out.push(CUBIC);
    put(rx * (ca - k * sa), ry * (sa + k * ca));
    put(rx * (cb + k * sb), ry * (sb - k * cb));
    put(rx * cb, ry * sb);
    a = b;
  }
}

/** The bounding box of the path's points and control points (x0, y0, x1, y1); null when empty. */
export function controlBounds(path: ParsedPath): [number, number, number, number] | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const add = (x: number, y: number) => {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  };
  for (const s of path) {
    add(s.x, s.y);
    const c = s.cmds;
    for (let i = 0; i < c.length; ) {
      if (c[i] === LINE) {
        add(c[i + 1] as number, c[i + 2] as number);
        i += 3;
      } else {
        add(c[i + 1] as number, c[i + 2] as number);
        add(c[i + 3] as number, c[i + 4] as number);
        add(c[i + 5] as number, c[i + 6] as number);
        i += 7;
      }
    }
  }
  return x0 <= x1 ? [x0, y0, x1, y1] : null;
}

const fmt = (v: number) => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? "0" : String(r);
};

/** `path` as SVG path data (absolute M, L, C and Z, three decimals). */
export function formatPathData(path: ParsedPath): string {
  const parts: string[] = [];
  for (const s of path) {
    parts.push(`M${fmt(s.x)} ${fmt(s.y)}`);
    const c = s.cmds;
    for (let i = 0; i < c.length; ) {
      if (c[i] === LINE) {
        parts.push(`L${fmt(c[i + 1] as number)} ${fmt(c[i + 2] as number)}`);
        i += 3;
      } else {
        parts.push(`C${fmt(c[i + 1] as number)} ${fmt(c[i + 2] as number)} ${fmt(c[i + 3] as number)} ${fmt(c[i + 4] as number)} ${fmt(c[i + 5] as number)} ${fmt(c[i + 6] as number)}`);
        i += 7;
      }
    }
    if (s.closed) parts.push("Z");
  }
  return parts.join("");
}
