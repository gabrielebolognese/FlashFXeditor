// Writes the pictures of fixtures/interop/compositing (Batch 72), all 360 x 640 RGBA:
// - bars.png: the test chart's backdrop: six vertical color bars over a gray ramp (dark to light, top to bottom).
// - ramp.png: the blended layer of the chart: a horizontal gray ramp (black to white) crossed by a color
//   band; opaque in the top half, half transparent in the bottom half (the alpha terms of each formula).
// - paper.png: a warm paper backdrop with soft fibers; texture.png: a mid-gray grain blended with multiply.
// - leak.png: a light leak (an orange and pink glow on black) blended with screen.
// - radial.png: a white disc fading to black at the edges: the inverted luma matte.
// Pixel values are deterministic (no random): the expected frames only change with the renderer.
// Usage: node scripts/fixtures/make-compositing-images.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const W = 360;
const H = 640;
const out = fileURLToPath(new URL("../../fixtures/interop/compositing/media/", import.meta.url));
mkdirSync(out, { recursive: true });

const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
const lerp = (a, b, t) => a + (b - a) * t;
/** A smooth deterministic noise in 0..1 (sums of sines; no Math.random). */
const noise = (x, y) => 0.5 + 0.25 * Math.sin(x * 0.37 + Math.sin(y * 0.11) * 3) * Math.cos(y * 0.23 + x * 0.05) + 0.25 * Math.sin((x + y * 1.7) * 0.9) * Math.sin(y * 0.6 - x * 0.2);

const BARS = [
  [235, 64, 52],
  [245, 190, 40],
  [80, 200, 90],
  [40, 190, 220],
  [60, 80, 230],
  [200, 70, 200],
];

function bars(x, y) {
  if (y > H * 0.7) {
    const v = lerp(10, 245, x / (W - 1));
    return [v, v, v, 255];
  }
  const [r, g, b] = BARS[Math.min(BARS.length - 1, Math.floor((x / W) * BARS.length))];
  const shade = lerp(0.35, 1, y / (H * 0.7));
  return [r * shade, g * shade, b * shade, 255];
}

function ramp(x, y) {
  const v = lerp(0, 255, x / (W - 1));
  let px = [v, v, v];
  // A color band across the middle of each half.
  const band = (y % (H / 2)) / (H / 2);
  if (band > 0.4 && band < 0.6) px = [lerp(255, 30, x / W), lerp(60, 220, x / W), lerp(120, 60, x / W)];
  const a = y < H / 2 ? 255 : 128;
  // Premultiplied by the PNG decoder: write straight color.
  return [...px, a];
}

function paper(x, y) {
  const n = noise(x, y);
  const fiber = Math.abs(Math.sin(x * 0.05 + y * 0.31 + Math.sin(x * 0.02) * 4)) < 0.04 ? -18 : 0;
  return [242 + n * 10 + fiber, 232 + n * 8 + fiber, 212 + n * 6 + fiber, 255];
}

function texture(x, y) {
  const n = noise(x * 1.9, y * 1.9);
  const v = lerp(90, 235, n);
  const scratch = Math.abs(Math.sin(x * 0.013 - y * 0.041)) < 0.012 ? 60 : 0;
  return [v - scratch, v - scratch * 0.9, v - scratch * 0.8, 255];
}

function leak(x, y) {
  const d1 = Math.hypot(x - W * 0.85, y - H * 0.2) / (W * 0.9);
  const d2 = Math.hypot(x - W * 0.1, y - H * 0.85) / (W * 0.8);
  const g1 = Math.max(0, 1 - d1) ** 2;
  const g2 = Math.max(0, 1 - d2) ** 2;
  return [255 * g1 + 230 * g2, 140 * g1 + 60 * g2, 40 * g1 + 150 * g2, 255];
}

function radial(x, y) {
  const d = Math.hypot(x - W / 2, y - H / 2) / (W * 0.55);
  const v = 255 * Math.max(0, Math.min(1, 1.4 - d * 1.4));
  return [v, v, v, 255];
}

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

/** An RGBA (color type 6) PNG of `pixel(x, y)` -> [r, g, b, a] (straight alpha). */
function png(pixel) {
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0;
    for (let x = 0; x < W; x++) {
      const px = pixel(x, y);
      const o = y * (W * 4 + 1) + 1 + x * 4;
      for (let c = 0; c < 4; c++) raw[o + c] = clamp(px[c]);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(W, 0);
  header.writeUInt32BE(H, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

const pictures = { bars, ramp, paper, texture, leak, radial };
for (const [name, pixel] of Object.entries(pictures)) writeFileSync(join(out, `${name}.png`), png(pixel));
console.log(`wrote ${Object.keys(pictures).map((name) => `${name}.png`).join(", ")}`);
