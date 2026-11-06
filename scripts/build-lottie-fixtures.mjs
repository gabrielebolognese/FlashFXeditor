// Writes the three Lottie files of fixtures/interop/lottie/animations (Batch 79): original, hand-written
// animations (CC0, see LICENSE.md next to them). Run: node scripts/build-lottie-fixtures.mjs
import { deflateRawSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

const out = "fixtures/interop/lottie/animations";
mkdirSync(out, { recursive: true });
const still = (k) => ({ a: 0, k });
const ease = { o: { x: [0.42], y: [0] }, i: { x: [0.58], y: [1] } };
const keys = (list) => ({ a: 1, k: list.map(([t, s], n) => (n < list.length - 1 ? { t, s, ...ease } : { t, s })) });
const fill = (c) => ({ ty: "fl", c: still(c), o: still(100), r: 1, nm: "Fill" });
const group = (nm, items, tr = {}) => ({ ty: "gr", nm, it: [...items, { ty: "tr", p: still([0, 0]), a: still([0, 0]), s: still([100, 100]), r: still(0), o: still(100), ...tr }] });
const layer = (nm, ks, shapes, op) => ({ ddd: 0, ty: 4, nm, sr: 1, ks, ao: 0, shapes, ip: 0, op, st: 0, bm: 0 });
const ks = (o) => ({ o: still(100), r: still(0), p: still([0, 0]), a: still([0, 0]), s: still([100, 100]), ...o });

// 1. spinner: a rounded square turning around a blue disc, 60 fps, 2 s, 240 x 240.
const spinner = {
  v: "5.7.0", fr: 60, ip: 0, op: 120, w: 240, h: 240, nm: "spinner", ddd: 0, assets: [],
  layers: [
    layer("square", ks({ p: still([120, 120]), r: keys([[0, [0]], [120, [360]]]) }), [group("sq", [{ ty: "rc", d: 1, s: still([110, 110]), p: still([0, 0]), r: still(24), nm: "Rect" }, fill([1, 0.5, 0.1, 1])])], 120),
    layer("disc", ks({ p: still([120, 120]), s: keys([[0, [100, 100]], [60, [60, 60]], [120, [100, 100]]]) }), [group("d", [{ ty: "el", d: 1, s: still([60, 60]), p: still([0, 0]), nm: "Ellipse" }, fill([0.1, 0.5, 1, 1])])], 120),
  ],
};
// 2. bounce: a ball falling and rising while its color changes, 60 fps, 1.5 s, 320 x 200.
const bounce = {
  v: "5.7.0", fr: 60, ip: 0, op: 90, w: 320, h: 200, nm: "bounce", ddd: 0, assets: [],
  layers: [
    layer("ground", ks(), [group("g", [{ ty: "rc", d: 1, s: still([300, 10]), p: still([160, 185]), r: still(5), nm: "Rect" }, fill([0.2, 0.2, 0.25, 1])])], 90),
    layer("ball", ks({ p: keys([[0, [160, 30, 0]], [45, [160, 150, 0]], [90, [160, 30, 0]]]) }), [group("b", [{ ty: "el", d: 1, s: still([60, 60]), p: still([0, 0]), nm: "Ellipse" }, { ty: "fl", c: keys([[0, [0.95, 0.2, 0.3, 1]], [45, [0.2, 0.8, 0.4, 1]], [90, [0.95, 0.2, 0.3, 1]]]), o: still(100), r: 1, nm: "Fill" }])], 90),
  ],
};
// 3. pulse: a disc breathing inside a ring, 30 fps, 2 s, 200 x 200, as a .lottie archive.
const pulse = {
  v: "5.7.0", fr: 30, ip: 0, op: 60, w: 200, h: 200, nm: "pulse", ddd: 0, assets: [],
  layers: [
    layer("ring", ks({ p: still([100, 100]) }), [group("r", [{ ty: "el", d: 1, s: still([150, 150]), p: still([0, 0]), nm: "Ellipse" }, { ty: "st", c: still([0.9, 0.9, 0.95, 1]), o: still(100), w: still(8), lc: 2, lj: 2, nm: "Stroke" }])], 60),
    layer("disc", ks({ p: still([100, 100]), s: keys([[0, [60, 60]], [30, [100, 100]], [60, [60, 60]]]) }), [group("d", [{ ty: "el", d: 1, s: still([100, 100]), p: still([0, 0]), nm: "Ellipse" }, fill([0.9, 0.3, 0.7, 1])])], 60),
  ],
};

/** A minimal zip (deflate) for the .lottie archive. */
function zip(entries) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const parts = [], central = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const raw = Buffer.from(data), packed = deflateRawSync(raw), nameBytes = Buffer.from(name);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0, 6); head.writeUInt16LE(8, 8);
    head.writeUInt32LE(crc(raw), 14); head.writeUInt32LE(packed.length, 18); head.writeUInt32LE(raw.length, 22); head.writeUInt16LE(nameBytes.length, 26);
    parts.push(head, nameBytes, packed);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(8, 10);
    c.writeUInt32LE(crc(raw), 16); c.writeUInt32LE(packed.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(nameBytes.length, 28); c.writeUInt32LE(offset, 42);
    central.push(c, nameBytes);
    offset += head.length + nameBytes.length + packed.length;
  }
  const size = central.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(size, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, ...central, end]);
}

writeFileSync(`${out}/spinner.json`, JSON.stringify(spinner));
writeFileSync(`${out}/bounce.json`, JSON.stringify(bounce));
writeFileSync(`${out}/pulse.lottie`, zip([["manifest.json", JSON.stringify({ version: "1", generator: "shorts-editor fixtures", animations: [{ id: "pulse" }] })], ["animations/pulse.json", JSON.stringify(pulse)]]));
