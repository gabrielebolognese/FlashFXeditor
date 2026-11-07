// Writes fixtures/interop/styles/project.json and its media (Batch 58, spec §21.7): the style gallery whose
// expected frames (fixtures/interop/styles/expected/) the render check compares with. One layout, three
// frames: 10 (cue 1), 40 (cue 2), 70 (cue 3, whose override turns the box border off).
//   paper card: white fill, 3 px ink stroke inside, hard 7/7 ink shadow, square corners
//   pill: a rounded rect with radius past half its height, same stroke and shadow
//   dashed outline: no fill, a 6 px dashed stroke centered on the edge
//   radial: a four-stop radial gradient
//   gradient text: a linear gradient fill
//   rounded video: radius 40, 4 px border, soft shadow
//   captions: a white box with a 3 px ink border and a hard shadow; cue 3 has no border
// Run: node scripts/cli/make-styles-fixture.mjs
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const basic = join(root, "fixtures", "interop", "basic");
const dir = join(root, "fixtures", "interop", "styles");

const WHITE = { r: 1, g: 1, b: 1, a: 1 };
const INK = { r: 0.09, g: 0.09, b: 0.14, a: 1 };
const PAPER = { r: 0.96, g: 0.93, b: 0.85, a: 1 };
const YELLOW = { r: 1, g: 0.82, b: 0.25, a: 1 };
const transform = (extra = {}) => ({ x: 0, y: 0, scale: 1, rotation: 0, anchor: { x: 0.5, y: 0.5 }, flipH: false, flipV: false, ...extra });
const track = (id, kind, name, clipIds) => ({ id, kind, name, clipIds, locked: false, muted: false, solo: false, hidden: false, targeted: true, height: "M" });
const base = (id, trackId, kind, name, start, duration, extra = {}) => ({ id, trackId, kind, name, start, duration, enabled: true, ...extra });
const solid = (id, trackId, name, x, y, w, h, extra) => base(id, trackId, "solid", name, 0, 90, { shape: "roundedRect", size: { w, h }, cornerRadius: 0, transform: transform({ x, y }), opacity: 1, ...extra });
const stroke = (extra = {}) => ({ width: 3, color: INK, align: "inside", ...extra });
const hard = { x: 7, y: 7, blur: 0, spread: 0, color: INK };
const textStyle = (extra = {}) => ({
  fontFamily: "Silkscreen",
  fontWeight: 700,
  italic: false,
  fontSize: 96,
  fill: WHITE,
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
const cue = (id, start, text, words, extra = {}) => base(id, "cc1", "caption", `Cue ${id}`, start, 30, { text, words: words.map(([w, s, e]) => ({ text: w, start: s, end: e })), ...extra });

const project = {
  schemaVersion: 5,
  id: "0b6d6b43-5c4e-4f5d-9d0a-58a3a1c2e158",
  name: "Interop styles",
  settings: { width: 1080, height: 1920, fps: { num: 30, den: 1 }, background: PAPER, sampleRate: 48000 },
  media: {
    m1: { id: "m1", kind: "video", name: "clip.mp4", file: { relPath: "media/clip.mp4" }, durationUs: 2000000, hasAudio: true, analysis: { thumbs: "none", peaks: "none" }, addedAt: "2026-11-07T08:00:00.000Z", width: 270, height: 480, fps: { num: 30, den: 1 }, codec: "h264", audioCodec: "aac", size: 18761 },
  },
  bins: [],
  tracks: [
    track("v1", "video", "V1", ["video"]),
    track("v2", "video", "V2", ["card"]),
    track("v3", "video", "V3", ["pill"]),
    track("v4", "video", "V4", ["dashed"]),
    track("v5", "video", "V5", ["radial"]),
    track("v6", "video", "V6", ["gradtext"]),
    track("cc1", "caption", "CC1", ["q1", "q2", "q3"]),
  ],
  clips: {
    video: base("video", "v1", "video", "Rounded video", 0, 60, {
      mediaId: "m1", in: 0, out: 2000000, speed: 1,
      transform: transform({ y: 330, scale: 1.1 }), opacity: 1, crop: { left: 0, top: 0, right: 0, bottom: 0 }, volume: { gainDb: 0, muted: true }, fades: { in: 0, out: 0 },
      cornerRadius: 40, stroke: stroke({ width: 4 }), shadow: { x: 0, y: 14, blur: 36, spread: 0, color: { r: 0, g: 0, b: 0, a: 0.45 } },
    }),
    card: solid("card", "v2", "Paper card", -255, -720, 440, 260, { shape: "rect", fill: WHITE, stroke: stroke(), shadow: hard }),
    pill: solid("pill", "v3", "Pill", 255, -720, 440, 110, { cornerRadius: 500, fill: YELLOW, stroke: stroke(), shadow: hard }),
    dashed: solid("dashed", "v4", "Dashed outline", -255, -430, 440, 240, { fill: { r: 1, g: 1, b: 1, a: 0 }, cornerRadius: 56, stroke: stroke({ width: 6, align: "center", dash: [24, 16] }) }),
    radial: solid("radial", "v5", "Four-stop radial", 255, -430, 440, 240, {
      cornerRadius: 28,
      fill: {
        type: "radial", angle: 0, center: { x: 0.5, y: 0.5 }, radius: 1,
        stops: [
          { at: 0, color: { r: 1, g: 0.95, b: 0.4, a: 1 } },
          { at: 0.35, color: { r: 0.95, g: 0.35, b: 0.3, a: 1 } },
          { at: 0.7, color: { r: 0.4, g: 0.2, b: 0.7, a: 1 } },
          { at: 1, color: { r: 0.08, g: 0.1, b: 0.3, a: 1 } },
        ],
      },
    }),
    gradtext: base("gradtext", "v6", "text", "Gradient text", 0, 90, {
      text: { value: "GRADIENT", box: { mode: "auto", width: 900 } },
      style: textStyle({ fill: { type: "linear", angle: 0, center: { x: 0.5, y: 0.5 }, radius: 1, stops: [{ at: 0, color: { r: 0.95, g: 0.35, b: 0.3, a: 1 } }, { at: 1, color: { r: 0.25, g: 0.3, b: 0.9, a: 1 } }] } }),
      transform: transform({ y: -140 }), opacity: 1, fades: { in: 0, out: 0 },
    }),
    q1: cue("q1", 0, "Boxed caption", [["Boxed", 0, 14], ["caption", 14, 30]]),
    q2: cue("q2", 30, "Second cue", [["Second", 0, 15], ["cue", 15, 30]]),
    q3: cue("q3", 60, "No border here", [["No", 0, 8], ["border", 8, 18], ["here", 18, 30]], { styleOverride: { text: { background: { stroke: { enabled: false, width: 3, color: INK } } } } }),
  },
  markers: [],
  captionTracks: {
    cc1: {
      style: {
        text: textStyle({
          fontSize: 64,
          fill: INK,
          background: { enabled: true, color: WHITE, paddingX: 32, paddingY: 18, radius: 0, mode: "block", stroke: { enabled: true, width: 3, color: INK }, shadow: { enabled: true, x: 7, y: 7, blur: 0, color: INK } },
        }),
        position: "bottom", x: 0, y: 0, maxWidth: 900, maxLines: 2,
        highlight: { mode: "none", color: YELLOW, inactiveColor: INK },
      },
    },
  },
  textPresetsLocal: [],
  meta: { createdAt: "2026-11-07T08:00:00.000Z", modifiedAt: "2026-11-07T08:00:00.000Z", appVersion: "1.1.0", generator: { name: "interop-fixture", version: "1", source: "scripts/cli/make-styles-fixture.mjs" } },
};

const fonts = {
  version: 2,
  faces: [{ family: "Silkscreen", style: "Bold", weight: 700, italic: false, postscriptName: "Silkscreen-Bold", file: "silkscreen-latin-700-normal.woff2", source: "library", origin: "silkscreen/silkscreen-latin-700-normal.woff2" }],
};

const write = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
mkdirSync(join(dir, "media"), { recursive: true });
mkdirSync(join(dir, "fonts"), { recursive: true });
write(join(dir, "project.json"), project);
write(join(dir, "fonts", "fonts.json"), fonts);
copyFileSync(join(basic, "media", "clip.mp4"), join(dir, "media", "clip.mp4"));
copyFileSync(join(basic, "fonts", "silkscreen-latin-700-normal.woff2"), join(dir, "fonts", "silkscreen-latin-700-normal.woff2"));
console.log("fixtures/interop/styles written");
