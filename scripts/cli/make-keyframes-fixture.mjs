// Writes fixtures/interop/keyframes/ (Batch 60, spec §21.9): a project with keys on every new property.
//   hold    solid: coral to ink fill, a hold ease: instant change at frame 30
//   fade    solid: coral to ink fill, a linear ease: a fade from frame 0 to 30
//   motion  solid: size, corner radius, stroke width and color, shadow blur and color, and the anchor, with
//           GSAP-like eases (backOut, expoInOut), a custom bezier and a spring
//   video   picture: crop edges and corner radius keyed
//   label   text: font size, letter spacing and a fill that holds then fades
// Sampled frames: 0, 15, 30, 45, 59 (`--frames 0,15,30,45,59`).
// Run: node scripts/cli/make-keyframes-fixture.mjs
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const basic = join(root, "fixtures", "interop", "basic");
const styles = join(root, "fixtures", "interop", "styles");
const dir = join(root, "fixtures", "interop", "keyframes");

const INK = { r: 0.09, g: 0.09, b: 0.14, a: 1 };
const PAPER = { r: 0.96, g: 0.93, b: 0.85, a: 1 };
const CORAL = { r: 1, g: 0.36, b: 0.3, a: 1 };
const arr = (c) => [c.r, c.g, c.b, c.a];
const track = (id, kind, name, clipIds) => ({ id, kind, name, clipIds, locked: false, muted: false, solo: false, hidden: false, targeted: true, height: "M" });
const base = (id, trackId, kind, name, start, duration, extra = {}) => ({ id, trackId, kind, name, start, duration, enabled: true, ...extra });
const at = (x, y, extra = {}) => ({ x, y, scale: 1, rotation: 0, anchor: { x: 0.5, y: 0.5 }, flipH: false, flipV: false, ...extra });
const key = (frame, value, ease = "linear", extra = {}) => ({ frame, value, ease, ...extra });
const solid = (id, trackId, name, x, y, w, h, extra = {}) =>
  base(id, trackId, "solid", name, 0, 60, { shape: "roundedRect", size: { w, h }, cornerRadius: 24, fill: CORAL, transform: at(x, y), opacity: 1, ...extra });

const textStyle = (extra = {}) => ({
  fontFamily: "Silkscreen",
  fontWeight: 700,
  italic: false,
  fontSize: 96,
  fill: CORAL,
  stroke: { enabled: false, width: 6, color: INK },
  shadow: { enabled: false, x: 0, y: 6, blur: 16, color: { r: 0, g: 0, b: 0, a: 0.6 } },
  background: { enabled: false, color: { r: 0, g: 0, b: 0, a: 0.7 }, paddingX: 28, paddingY: 12, radius: 16, mode: "block" },
  textCase: "none",
  letterSpacing: 0,
  lineHeight: 1.2,
  align: "center",
  verticalAnchor: "middle",
  ...extra,
});

const clips = {
  bg: solid("bg", "v1", "Background", 0, 0, 1080, 1920, { shape: "rect", cornerRadius: 0, fill: PAPER }),
  hold: solid("hold", "v2", "Hold fill", -270, -780, 440, 220, {
    keyframes: { fill: [key(0, arr(CORAL), "hold"), key(30, arr(INK))] },
  }),
  fade: solid("fade", "v3", "Fade fill", 270, -780, 440, 220, {
    keyframes: { fill: [key(0, arr(CORAL), "linear"), key(30, arr(INK))] },
  }),
  motion: solid("motion", "v4", "Motion", 0, -420, 360, 180, {
    stroke: { width: 4, color: INK, align: "inside", dash: [24, 14], dashOffset: 0 },
    shadow: { x: 0, y: 12, blur: 8, spread: 0, color: { r: 0, g: 0, b: 0, a: 0.5 } },
    keyframes: {
      "size.w": [key(0, 360, "backOut"), key(30, 720, "expoInOut"), key(59, 360)],
      "size.h": [key(0, 180, "bezier", { bezier: [0.68, -0.55, 0.27, 1.55] }), key(30, 300, "spring", { spring: { damping: 0.7, frequency: 4 } }), key(59, 180)],
      cornerRadius: [key(0, 0, "quadOut"), key(30, 90, "bounceOut"), key(59, 0)],
      "stroke.width": [key(0, 4, "cubicInOut"), key(30, 24), key(59, 4)],
      "stroke.color": [key(0, arr(INK), "hold"), key(30, arr(CORAL))],
      "shadow.blur": [key(0, 8, "sineInOut"), key(30, 60), key(59, 8)],
      "stroke.dashOffset": [key(0, 0, "linear"), key(59, 76)],
      "shadow.x": [key(0, 0, "linear"), key(59, 24)],
      "shadow.y": [key(0, 12, "linear"), key(59, 40)],
      "shadow.spread": [key(0, 0, "linear"), key(59, 10)],
      "shadow.color": [key(0, [0, 0, 0, 0.5], "linear"), key(59, [1, 0.36, 0.3, 0.9])],
      "transform.anchor.x": [key(0, 0.5, "linear"), key(30, 0, "linear"), key(59, 0.5)],
      "transform.anchor.y": [key(0, 0.5, "linear"), key(30, 1, "linear"), key(59, 0.5)],
      "transform.rotation": [key(0, 0, "linear"), key(59, 30)],
    },
  }),
  video: base("video", "v5", "video", "Picture", 0, 60, {
    mediaId: "m1", in: 0, out: 2000000, speed: 1, transform: at(0, 120, { scale: 1.1 }), opacity: 1,
    crop: { left: 0, top: 0, right: 0, bottom: 0 }, volume: { gainDb: 0, muted: true }, fades: { in: 0, out: 0 },
    cornerRadius: 0,
    keyframes: {
      "crop.left": [key(0, 0, "linear"), key(30, 0.3, "linear"), key(59, 0)],
      "crop.right": [key(0, 0, "linear"), key(30, 0.3, "linear"), key(59, 0)],
      "crop.top": [key(0, 0.2, "linear"), key(59, 0)],
      "crop.bottom": [key(0, 0, "linear"), key(30, 0.15, "linear"), key(59, 0)],
      cornerRadius: [key(0, 0, "cubicOut"), key(30, 120, "linear"), key(59, 0)],
    },
  }),
  label: base("label", "v6", "text", "Label", 0, 60, {
    text: { value: "Keys", box: { mode: "auto", width: 900 } },
    style: textStyle(),
    transform: at(0, 640),
    opacity: 1,
    fades: { in: 0, out: 0 },
    keyframes: {
      "style.fontSize": [key(0, 48, "backOut"), key(30, 140, "linear"), key(59, 96)],
      "style.letterSpacing": [key(0, 0, "linear"), key(30, 24, "linear"), key(59, 0)],
      "style.fill": [key(0, arr(CORAL), "hold"), key(30, arr(INK), "linear"), key(59, arr(CORAL))],
    },
  }),
};

const project = {
  schemaVersion: 7,
  id: "0b9c1d84-5f24-4c3e-8a1e-3d6f6f7e2b10",
  name: "Interop keyframes",
  settings: { width: 1080, height: 1920, fps: { num: 30, den: 1 }, background: PAPER, sampleRate: 48000 },
  media: JSON.parse(readFileSync(join(styles, "project.json"), "utf8")).media,
  bins: [],
  tracks: [
    track("v1", "video", "V1", ["bg"]),
    track("v2", "video", "V2", ["hold"]),
    track("v3", "video", "V3", ["fade"]),
    track("v4", "video", "V4", ["motion"]),
    track("v5", "video", "V5", ["video"]),
    track("v6", "video", "V6", ["label"]),
  ],
  clips,
  markers: [],
  captionTracks: {},
  textPresetsLocal: [],
  meta: { createdAt: "2026-11-07T08:00:00.000Z", modifiedAt: "2026-11-07T08:00:00.000Z", appVersion: "1.1.0", generator: { name: "interop-fixture", version: "1", source: "scripts/cli/make-keyframes-fixture.mjs" } },
};

const fonts = JSON.parse(readFileSync(join(basic, "fonts", "fonts.json"), "utf8"));
const write = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
mkdirSync(join(dir, "fonts"), { recursive: true });
mkdirSync(join(dir, "media"), { recursive: true });
write(join(dir, "project.json"), project);
write(join(dir, "fonts", "fonts.json"), fonts);
copyFileSync(join(basic, "fonts", "silkscreen-latin-700-normal.woff2"), join(dir, "fonts", "silkscreen-latin-700-normal.woff2"));
copyFileSync(join(styles, "media", "clip.mp4"), join(dir, "media", "clip.mp4"));
console.log("fixtures/interop/keyframes written");
