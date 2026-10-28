// Writes fixtures/interop/captions-v2/ (Batch 59, spec §21.8): a project that uses every Captions v2 field,
// and words.json, the reels autopilot's words in its format ({ word, startMs, endMs } items) with the chunk
// list (`cues`, the emphasis words' indexes). The project's two cues are what importing words.json makes.
//   cue 1 (frames 0..44): progressive words, the track's coral emphasis word ("never"), a word box each,
//         a 2-frame fade in; frame 5 (first word playing), 20 (third playing), 40 (all spoken)
//   cue 2 (frames 50..89): reveal highlight and its own cue animation (pop out), word colors
// Run: node scripts/cli/make-captions-v2-fixture.mjs
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const basic = join(root, "fixtures", "interop", "basic");
const dir = join(root, "fixtures", "interop", "captions-v2");

const WHITE = { r: 1, g: 1, b: 1, a: 1 };
const INK = { r: 0.09, g: 0.09, b: 0.14, a: 1 };
const PAPER = { r: 0.96, g: 0.93, b: 0.85, a: 1 };
const GRAY = { r: 0.62, g: 0.6, b: 0.55, a: 1 };
const CORAL = { r: 1, g: 0.36, b: 0.3, a: 1 };
const BLUE = { r: 0.2, g: 0.35, b: 0.95, a: 1 };
const track = (id, kind, name, clipIds) => ({ id, kind, name, clipIds, locked: false, muted: false, solo: false, hidden: false, targeted: true, height: "M" });
const base = (id, trackId, kind, name, start, duration, extra = {}) => ({ id, trackId, kind, name, start, duration, enabled: true, ...extra });
const textStyle = (extra = {}) => ({
  fontFamily: "Silkscreen",
  fontWeight: 700,
  italic: false,
  fontSize: 64,
  fill: INK,
  stroke: { enabled: false, width: 6, color: INK },
  shadow: { enabled: false, x: 0, y: 6, blur: 16, color: { r: 0, g: 0, b: 0, a: 0.6 } },
  background: { enabled: false, color: { r: 0, g: 0, b: 0, a: 0.7 }, paddingX: 28, paddingY: 12, radius: 16, mode: "block" },
  textCase: "none",
  letterSpacing: 0,
  lineHeight: 1.2,
  align: "center",
  verticalAnchor: "bottom",
  ...extra,
});

// The words: 30 fps, so 1000 / 30 ms a frame. Eight words in two chunks.
const spoken = [
  ["You", 0, 4], ["will", 4, 8], ["never", 8, 15], ["guess", 15, 24],
  ["what", 0, 6], ["happens", 6, 16], ["next", 16, 25], ["today", 25, 38],
];
const ms = (frame) => Math.round((frame * 1000) / 30);
const words = {
  unit: "ms",
  words: spoken.map(([word, start, end], i) => {
    const cueStart = i < 4 ? 0 : 50;
    return { word, startMs: ms(cueStart + start), endMs: ms(cueStart + end) };
  }),
  cues: [
    { from: 0, to: 3, emphasis: [2] },
    { from: 4, to: 7, emphasis: [] },
  ],
};

const cueWords = (list, extra = {}) => list.map(([text, start, end], i) => ({ text, start, end, ...(extra[i] ?? {}) }));
const project = {
  schemaVersion: 6,
  id: "6d1c3a3e-8f5b-4f0c-9d6a-2b7e4c1a9a59",
  name: "Interop captions v2",
  settings: { width: 1080, height: 1920, fps: { num: 30, den: 1 }, background: PAPER, sampleRate: 48000 },
  media: {},
  bins: [],
  tracks: [track("v1", "video", "V1", ["bg"]), track("cc1", "caption", "CC1", ["q1", "q2"])],
  clips: {
    bg: base("bg", "v1", "solid", "Background", 0, 100, {
      shape: "rect", size: { w: 1080, h: 1920 }, cornerRadius: 0, fill: PAPER,
      transform: { x: 0, y: 0, scale: 1, rotation: 0, anchor: { x: 0.5, y: 0.5 }, flipH: false, flipV: false }, opacity: 1,
    }),
    q1: base("q1", "cc1", "caption", "Cue q1", 0, 45, { text: "You will never\nguess", words: cueWords(spoken.slice(0, 4), { 2: { emphasis: true } }) }),
    q2: base("q2", "cc1", "caption", "Cue q2", 50, 40, {
      text: "what happens\nnext today",
      words: cueWords(spoken.slice(4), { 3: { color: BLUE } }),
      styleOverride: { highlight: { mode: "reveal" }, anim: { in: { kind: "slideUp", frames: 4 }, out: { kind: "pop", frames: 2 } } },
    }),
  },
  markers: [],
  captionTracks: {
    cc1: {
      style: {
        text: textStyle({ background: { enabled: true, color: WHITE, paddingX: 14, paddingY: 6, radius: 12, mode: "word", stroke: { enabled: true, width: 3, color: INK }, shadow: { enabled: true, x: 5, y: 5, blur: 0, color: INK } } }),
        position: "center", x: 0, y: 0, maxWidth: 900, maxLines: 2,
        highlight: { mode: "progressive", color: INK, inactiveColor: GRAY, emphasisColor: CORAL },
        anim: { in: { kind: "fade", frames: 2 }, out: { kind: "fade", frames: 2 } },
      },
    },
  },
  textPresetsLocal: [],
  meta: { createdAt: "2026-11-07T08:00:00.000Z", modifiedAt: "2026-11-07T08:00:00.000Z", appVersion: "1.1.0", generator: { name: "interop-fixture", version: "1", source: "scripts/cli/make-captions-v2-fixture.mjs" } },
};

const fonts = JSON.parse(readFileSync(join(basic, "fonts", "fonts.json"), "utf8"));

const write = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
mkdirSync(join(dir, "fonts"), { recursive: true });
write(join(dir, "project.json"), project);
write(join(dir, "words.json"), words);
write(join(dir, "fonts", "fonts.json"), fonts);
copyFileSync(join(basic, "fonts", "silkscreen-latin-700-normal.woff2"), join(dir, "fonts", "silkscreen-latin-700-normal.woff2"));
console.log("fixtures/interop/captions-v2 written");
