// Writes the picture of fixtures/interop/effects-1 (Batch 74): badge.png, 240 x 240 RGBA, a transparent
// picture whose alpha has a shape: a five-pointed star (orange to yellow, top to bottom) with a round hole
// in its middle, antialiased over one pixel. The drop shadow and the outline of the fixture follow its alpha.
// Pixel values are deterministic: the expected frames only change with the renderer.
// Usage: node scripts/fixtures/make-effects-images.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const W = 240;
const H = 240;
const out = fileURLToPath(new URL("../../fixtures/interop/effects-1/media/", import.meta.url));
mkdirSync(out, { recursive: true });

const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
const lerp = (a, b, t) => a + (b - a) * t;

// The star: 10 points alternating between the outer and the inner radius, the first one straight up.
const CX = W / 2;
const CY = H / 2 + 8;
const OUTER = 112;
const INNER = 50;
const HOLE = 22;
const STAR = Array.from({ length: 10 }, (_, i) => {
  const r = i % 2 === 0 ? OUTER : INNER;
  const a = -Math.PI / 2 + (i * Math.PI) / 5;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
});

/** Signed distance to the star's edge (negative inside), from the closest edge and the even-odd rule. */
function starDistance(x, y) {
  let inside = false;
  let best = Infinity;
  for (let i = 0, j = STAR.length - 1; i < STAR.length; j = i++) {
    const [xi, yi] = STAR[i];
    const [xj, yj] = STAR[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    const dx = xi - xj;
    const dy = yi - yj;
    const t = Math.max(0, Math.min(1, ((x - xj) * dx + (y - yj) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(x - (xj + t * dx), y - (yj + t * dy)));
  }
  return inside ? -best : best;
}

function badge(x, y) {
  const px = x + 0.5;
  const py = y + 0.5;
  // Inside the star and outside the hole, each edge over one pixel.
  const star = Math.max(0, Math.min(1, 0.5 - starDistance(px, py)));
  const hole = Math.max(0, Math.min(1, 0.5 + (Math.hypot(px - CX, py - CY) - HOLE)));
  const t = y / (H - 1);
  return [lerp(245, 255, t), lerp(110, 210, t), lerp(40, 60, t), 255 * star * hole];
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
      const p = pixel(x, y);
      const o = y * (W * 4 + 1) + 1 + x * 4;
      for (let c = 0; c < 4; c++) raw[o + c] = clamp(p[c]);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(W, 0);
  header.writeUInt32BE(H, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

const file = png(badge);
writeFileSync(join(out, "badge.png"), file);
console.log(`wrote badge.png (${file.length} bytes)`);
