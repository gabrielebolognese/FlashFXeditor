// Ported from FlashFX-v2 src/core/effects/lut.ts @ a91c675, adapted.
// 3D LUTs (spec §21.19, Batch 75): parses Adobe / IRIDAS `.cube` files, samples them trilinearly (the CPU
// reference the GPU pass mirrors) and packs them into the RGBA8 atlas both renderers sample: N slices of N x N
// side by side (x = r + b * N, y = g), each texel the LUT's output for that grid point. Adapted: DOMAIN_MIN /
// DOMAIN_MAX are applied (inputs mapped into the domain before sampling), a size cap, and the atlas packer.
// Pure.

export interface LUT3D {
  /** Grid size N (the LUT is N x N x N). */
  size: number;
  /** N^3 * 3 floats, red fastest: index = (b*N*N + g*N + r)*3 + channel. */
  data: Float32Array;
  /** The input range each channel maps from (DOMAIN_MIN / DOMAIN_MAX; 0..1 by default). */
  domainMin: readonly [number, number, number];
  domainMax: readonly [number, number, number];
}

/** The largest grid this editor loads (65 is the largest common size; its atlas is 4225 x 65). */
export const MAX_LUT_SIZE = 65;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** An identity LUT of grid size N (output = input). */
export function identityLUT(size: number): LUT3D {
  const n = Math.max(2, Math.floor(size));
  const data = new Float32Array(n * n * n * 3);
  const d = n - 1;
  let i = 0;
  for (let b = 0; b < n; b++) {
    for (let g = 0; g < n; g++) {
      for (let r = 0; r < n; r++) {
        data[i++] = r / d;
        data[i++] = g / d;
        data[i++] = b / d;
      }
    }
  }
  return { size: n, data, domainMin: [0, 0, 0], domainMax: [1, 1, 1] };
}

function triple(parts: string[]): [number, number, number] | null {
  const values = parts.slice(1, 4).map(Number);
  return values.length === 3 && values.every(Number.isFinite) ? (values as [number, number, number]) : null;
}

/**
 * Parses a `.cube` 3D LUT: comments (#), TITLE, LUT_3D_SIZE, DOMAIN_MIN / DOMAIN_MAX and the N^3 "r g b" rows
 * (red fastest). Null for malformed input, a 1D LUT, a grid past MAX_LUT_SIZE or an empty domain.
 */
export function parseCube(text: string): LUT3D | null {
  let size = 0;
  let domainMin: [number, number, number] = [0, 0, 0];
  let domainMax: [number, number, number] = [1, 1, 1];
  const values: number[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const upper = line.toUpperCase();
    const parts = line.split(/\s+/);
    if (upper.startsWith("TITLE")) continue;
    if (upper.startsWith("LUT_1D_SIZE")) return null;
    if (upper.startsWith("LUT_3D_SIZE")) {
      const n = parseInt(parts[1] ?? "", 10);
      if (!Number.isFinite(n) || n < 2 || n > MAX_LUT_SIZE) return null;
      size = n;
      continue;
    }
    if (upper.startsWith("DOMAIN_MIN") || upper.startsWith("DOMAIN_MAX")) {
      const value = triple(parts);
      if (!value) return null;
      if (upper.startsWith("DOMAIN_MIN")) domainMin = value;
      else domainMax = value;
      continue;
    }
    if (/^[A-Z_]+(\s|$)/.test(upper)) continue; // other keywords (LUT_3D_INPUT_RANGE, ...)
    if (parts.length < 3) continue;
    const r = Number(parts[0]);
    const g = Number(parts[1]);
    const b = Number(parts[2]);
    if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return null;
    values.push(r, g, b);
  }
  if (size < 2 || values.length !== size * size * size * 3) return null;
  if (domainMin.some((min, i) => !(min < (domainMax[i] as number)))) return null;
  return { size, data: Float32Array.from(values), domainMin, domainMax };
}

/** `v` mapped from the LUT's domain on channel `c` into 0..1 (clamped). */
function inDomain(lut: LUT3D, v: number, c: number): number {
  const min = lut.domainMin[c] as number;
  const max = lut.domainMax[c] as number;
  return clamp01((v - min) / (max - min));
}

/** Trilinearly samples the LUT at (r, g, b) (in its domain). Returns [r, g, b] clamped to 0..1. */
export function sampleLUT(lut: LUT3D, r: number, g: number, b: number): [number, number, number] {
  const n = lut.size;
  const d = n - 1;
  const fr = inDomain(lut, r, 0) * d;
  const fg = inDomain(lut, g, 1) * d;
  const fb = inDomain(lut, b, 2) * d;
  const r0 = Math.floor(fr);
  const g0 = Math.floor(fg);
  const b0 = Math.floor(fb);
  const r1 = Math.min(r0 + 1, d);
  const g1 = Math.min(g0 + 1, d);
  const b1 = Math.min(b0 + 1, d);
  const dr = fr - r0;
  const dg = fg - g0;
  const db = fb - b0;
  const idx = (ri: number, gi: number, bi: number) => (bi * n * n + gi * n + ri) * 3;
  const lerp = (a: number, x: number, t: number) => a + (x - a) * t;
  const at = (i: number) => lut.data[i] as number;
  const out: [number, number, number] = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const x00 = lerp(at(idx(r0, g0, b0) + c), at(idx(r1, g0, b0) + c), dr);
    const x10 = lerp(at(idx(r0, g1, b0) + c), at(idx(r1, g1, b0) + c), dr);
    const x01 = lerp(at(idx(r0, g0, b1) + c), at(idx(r1, g0, b1) + c), dr);
    const x11 = lerp(at(idx(r0, g1, b1) + c), at(idx(r1, g1, b1) + c), dr);
    out[c] = clamp01(lerp(lerp(x00, x10, dg), lerp(x01, x11, dg), db));
  }
  return out;
}

/** The RGBA8 atlas of a LUT (what both renderers upload): width N*N, height N, alpha 255. */
export interface LutAtlas {
  size: number;
  width: number;
  height: number;
  rgba: Uint8Array;
  domainMin: readonly [number, number, number];
  domainMax: readonly [number, number, number];
}

/** Packs `lut` into its atlas: texel (r + b*N, g) holds grid point (r, g, b), rounded to 8 bits. */
export function lutAtlas(lut: LUT3D): LutAtlas {
  const n = lut.size;
  const width = n * n;
  const rgba = new Uint8Array(width * n * 4);
  for (let b = 0; b < n; b++) {
    for (let g = 0; g < n; g++) {
      for (let r = 0; r < n; r++) {
        const src = (b * n * n + g * n + r) * 3;
        const dst = (g * width + b * n + r) * 4;
        for (let c = 0; c < 3; c++) rgba[dst + c] = Math.round(clamp01(lut.data[src + c] as number) * 255);
        rgba[dst + 3] = 255;
      }
    }
  }
  return { size: n, width, height: n, rgba, domainMin: lut.domainMin, domainMax: lut.domainMax };
}

/**
 * Samples an atlas as the GPU pass does (the CPU reference of the renderers): the input mapped into the
 * domain, the 8 grid texels around it read exactly and mixed trilinearly.
 */
export function sampleAtlas(atlas: LutAtlas, r: number, g: number, b: number): [number, number, number] {
  const n = atlas.size;
  const d = n - 1;
  const map = (v: number, c: number) => clamp01((v - (atlas.domainMin[c] as number)) / ((atlas.domainMax[c] as number) - (atlas.domainMin[c] as number))) * d;
  const fr = map(r, 0);
  const fg = map(g, 1);
  const fb = map(b, 2);
  const r0 = Math.floor(fr);
  const g0 = Math.floor(fg);
  const b0 = Math.floor(fb);
  const r1 = Math.min(r0 + 1, d);
  const g1 = Math.min(g0 + 1, d);
  const b1 = Math.min(b0 + 1, d);
  const texel = (ri: number, gi: number, bi: number, c: number) => (atlas.rgba[(gi * atlas.width + bi * n + ri) * 4 + c] as number) / 255;
  const lerp = (a: number, x: number, t: number) => a + (x - a) * t;
  const out: [number, number, number] = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const x00 = lerp(texel(r0, g0, b0, c), texel(r1, g0, b0, c), fr - r0);
    const x10 = lerp(texel(r0, g1, b0, c), texel(r1, g1, b0, c), fr - r0);
    const x01 = lerp(texel(r0, g0, b1, c), texel(r1, g0, b1, c), fr - r0);
    const x11 = lerp(texel(r0, g1, b1, c), texel(r1, g1, b1, c), fr - r0);
    out[c] = lerp(lerp(x00, x10, fg - g0), lerp(x01, x11, fg - g0), fb - b0);
  }
  return out;
}

/** A `.cube` file of `lut` (used by the fixture writer and the tests). */
export function writeCube(lut: LUT3D, title: string): string {
  const lines = [`TITLE "${title.replace(/"/g, "'")}"`, `LUT_3D_SIZE ${lut.size}`];
  if (lut.domainMin.some((v) => v !== 0) || lut.domainMax.some((v) => v !== 1)) {
    lines.push(`DOMAIN_MIN ${lut.domainMin.join(" ")}`, `DOMAIN_MAX ${lut.domainMax.join(" ")}`);
  }
  for (let i = 0; i < lut.data.length; i += 3) lines.push(`${(lut.data[i] as number).toFixed(6)} ${(lut.data[i + 1] as number).toFixed(6)} ${(lut.data[i + 2] as number).toFixed(6)}`);
  return `${lines.join("\n")}\n`;
}
