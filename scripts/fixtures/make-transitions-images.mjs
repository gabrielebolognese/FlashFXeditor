// Writes the two pictures of fixtures/interop/transitions (Batch 71): media/a.png (warm, a white bar
// on the left and a dark grid on top) and media/b.png (cool, a white disc and a dark triangle), both
// 360 x 640. Their content is asymmetric so a direction, an angle or an iris center shows in the
// midpoint frames. Usage: node scripts/fixtures/make-transitions-images.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const W = 360;
const H = 640;
const out = fileURLToPath(new URL("../../fixtures/interop/transitions/media/", import.meta.url));
mkdirSync(out, { recursive: true });

const lerp = (a, b, t) => Math.round(a + (b - a) * t);

function pictureA(x, y) {
  const t = y / H;
  let px = [lerp(255, 200, t), lerp(150, 40, t), lerp(40, 120, t)];
  if (x > 30 && x < 90) px = [255, 255, 255];
  if (y < 200 && ((Math.floor(x / 30) + Math.floor(y / 30)) & 1) === 0 && x > 110) px = [40, 20, 50];
  return px;
}

function pictureB(x, y) {
  const t = (x / W + y / H) / 2;
  let px = [lerp(20, 30, t), lerp(180, 60, t), lerp(170, 200, t)];
  if (Math.hypot(x - W / 2, y - H / 2) < 110) px = [255, 255, 255];
  if (x > 220 && y > 440 && x - 220 > (640 - y) * 0.5) px = [15, 25, 60];
  return px;
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

function png(pixel) {
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 3 + 1)] = 0;
    for (let x = 0; x < W; x++) {
      const [r, g, b] = pixel(x, y);
      const o = y * (W * 3 + 1) + 1 + x * 3;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(W, 0);
  header.writeUInt32BE(H, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

writeFileSync(join(out, "a.png"), png(pictureA));
writeFileSync(join(out, "b.png"), png(pictureB));
console.log("wrote a.png and b.png");
