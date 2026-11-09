// Writes the media of fixtures/interop/effects-2 (Batch 75):
// - chart.png, 240 x 240 RGB: a hue sweep (left to right) from light to dark (top to bottom) over the top
//   160 rows, a gray ramp (black to white) over the next 40, and six patches (skin, sky, foliage, red, white,
//   black) over the last 40. The color effects, the sharpen, the luma key and the LUT act on it.
// - greenscreen.png, 240 x 320 RGB: a subject (a head and shoulders in a skin tone, shaded) in front of an
//   unevenly lit green screen (0, 177, 64 at its brightest), with green spill on the subject's rim (8 px
//   inside its edge: green up to +110, red -40, blue -20 at the edge). The chroma key removes the screen; its spill
//   suppression pulls the rim's green back.
// - luts/warm.cube: a 17-point 3D LUT, a warm look (red and shadows lifted, blue lowered, a soft S curve).
// - clip.mp4 is the basic fixture's (copied from effects-1).
// Pixel values are deterministic: the expected frames only change with the renderer.
// Usage: node scripts/fixtures/make-effects2-media.mjs
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../../fixtures/interop/effects-2/", import.meta.url));
const media = join(root, "media");
const luts = join(root, "luts");
mkdirSync(media, { recursive: true });
mkdirSync(luts, { recursive: true });

const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a + (b - a) * t;

const table = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buffer) => {
  let c = 0xffffffff;
  for (const byte of buffer) c = table[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, tail]);
}

/** An RGB (color type 2) PNG of `pixel(x, y)` -> [r, g, b] (0..255). */
function png(w, h, pixel) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const p = pixel(x, y);
      const o = y * (w * 3 + 1) + 1 + x * 3;
      for (let c = 0; c < 3; c++) raw[o + c] = clamp(p[c]);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(w, 0);
  header.writeUInt32BE(h, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

function hsl(h, s, l) {
  const k = (n) => (n + h * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

const PATCHES = [
  [194, 150, 130],
  [98, 122, 157],
  [87, 108, 67],
  [200, 40, 45],
  [243, 243, 242],
  [20, 20, 20],
];

function chart(x, y) {
  if (y < 160) return hsl(x / 240, 0.85, lerp(0.8, 0.2, y / 159));
  if (y < 200) {
    const v = (x / 239) * 255;
    return [v, v, v];
  }
  return PATCHES[Math.min(5, Math.floor(x / 40))];
}

// The subject: a head (ellipse) over shoulders (a rounded box), centered.
const GW = 240;
const GH = 320;
function subjectDistance(px, py) {
  const head = (Math.hypot((px - 120) / 52, (py - 120) / 64) - 1) * 56;
  const sx = Math.max(Math.abs(px - 120) - 70, 0);
  const sy = Math.max(Math.abs(py - 285) - 60, 0);
  const shoulders = Math.hypot(sx, sy) - 30 + Math.min(Math.max(Math.abs(px - 120) - 70, Math.abs(py - 285) - 60), 0);
  return Math.min(head, shoulders);
}

function greenscreen(x, y) {
  const px = x + 0.5;
  const py = y + 0.5;
  // The screen, lit brighter in the middle (88 % at the corners).
  const light = 1 - 0.12 * Math.min(1, Math.hypot((px - 120) / 120, (py - 160) / 160) / 1.41);
  const screen = [0, 177 * light, 64 * light];
  const d = subjectDistance(px, py);
  const coverage = clamp01(0.5 - d);
  if (coverage === 0) return screen;
  // Skin, shaded from the upper left; the rim picks up the screen's green.
  const shade = 0.8 + 0.2 * clamp01(1 - (px - 60) / 160) * clamp01(1 - (py - 60) / 260);
  // Spill: green added and red and blue lowered, strongest at the edge, gone 8 px inside.
  const spill = 0.5 * clamp01(1 + d / 8);
  const skin = [224 * shade - 40 * spill * 2, 172 * shade + 110 * spill * 2, 140 * shade - 20 * spill * 2];
  return skin.map((c, i) => lerp(screen[i], c, coverage));
}

// The warm LUT.
const N = 17;
function warm(r, g, b) {
  const curve = (v) => clamp01(v * v * (3 - 2 * v) * 0.35 + v * 0.65);
  return [clamp01(curve(r) * 1.06 + 0.035), clamp01(curve(g) * 1.0 + 0.012), clamp01(curve(b) * 0.84 + 0.01)];
}
const lines = ['TITLE "Interop warm"', `LUT_3D_SIZE ${N}`];
for (let bi = 0; bi < N; bi++) {
  for (let gi = 0; gi < N; gi++) {
    for (let ri = 0; ri < N; ri++) lines.push(warm(ri / (N - 1), gi / (N - 1), bi / (N - 1)).map((v) => v.toFixed(6)).join(" "));
  }
}
writeFileSync(join(luts, "warm.cube"), `${lines.join("\n")}\n`);

const files = { "chart.png": png(240, 240, chart), "greenscreen.png": png(GW, GH, greenscreen) };
for (const [name, data] of Object.entries(files)) {
  writeFileSync(join(media, name), data);
  console.log(`wrote ${name} (${data.length} bytes)`);
}
copyFileSync(fileURLToPath(new URL("../../fixtures/interop/effects-1/media/clip.mp4", import.meta.url)), join(media, "clip.mp4"));
console.log("wrote luts/warm.cube, copied clip.mp4");
