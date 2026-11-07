// Writes fixtures/interop/basic/project.json and fonts/fonts.json, and the copies in fixtures/interop/broken/
// (each with one error). The media files of basic/media are committed (made once with ffmpeg: a 2 s 270x480
// H.264/AAC clip, a 0.5 s mono WAV tone, a 64x64 PNG). Run: node scripts/cli/make-interop-fixtures.mjs
import { cpSync, mkdirSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const basic = join(root, "fixtures", "interop", "basic");
const broken = join(root, "fixtures", "interop", "broken");

const WHITE = { r: 1, g: 1, b: 1, a: 1 };
const BLACK = { r: 0, g: 0, b: 0, a: 1 };
const transform = (extra = {}) => ({ x: 0, y: 0, scale: 1, rotation: 0, anchor: { x: 0, y: 0 }, flipH: false, flipV: false, ...extra });
const track = (id, kind, name, clipIds) => ({ id, kind, name, clipIds, locked: false, muted: false, solo: false, hidden: false, targeted: true, height: "M" });
const base = (id, trackId, kind, name, start, duration, extra = {}) => ({ id, trackId, kind, name, start, duration, enabled: true, ...extra });
const textStyle = (family) => ({
  fontFamily: family,
  fontWeight: 700,
  italic: false,
  fontSize: 96,
  fill: WHITE,
  stroke: { enabled: true, width: 6, color: BLACK },
  shadow: { enabled: false, x: 0, y: 6, blur: 16, color: { r: 0, g: 0, b: 0, a: 0.6 } },
  background: { enabled: false, color: { r: 0, g: 0, b: 0, a: 0.7 }, paddingX: 28, paddingY: 12, radius: 16, mode: "block" },
  textCase: "none",
  letterSpacing: 0,
  lineHeight: 1.2,
  align: "center",
  verticalAnchor: "middle",
});
const mediaClip = (id, trackId, kind, name, start, duration, mediaId, inUs, outUs, extra = {}) =>
  base(id, trackId, kind, name, start, duration, {
    mediaId,
    in: inUs,
    out: outUs,
    speed: 1,
    transform: transform(),
    opacity: 1,
    crop: { left: 0, top: 0, right: 0, bottom: 0 },
    volume: { gainDb: 0, muted: false },
    fades: { in: 0, out: 0 },
    ...extra,
  });
const mediaItem = (id, kind, name, relPath, durationUs, extra = {}) => ({ id, kind, name, file: { relPath }, durationUs, hasAudio: false, analysis: { thumbs: "none", peaks: "none" }, addedAt: "2026-11-07T08:00:00.000Z", ...extra });

const cue = (id, start, duration, text, words) =>
  base(id, "cc1", "caption", `Cue ${id}`, start, duration, { text, words: words.map(([w, s, e]) => ({ text: w, start: s, end: e })) });

const project = {
  schemaVersion: 4,
  id: "5f0a3c1e-9d3b-4c52-8a70-1b6f2d9e7a11",
  name: "Interop basic",
  settings: { width: 1080, height: 1920, fps: { num: 30, den: 1 }, background: BLACK, sampleRate: 48000 },
  media: {
    m1: mediaItem("m1", "video", "clip.mp4", "media/clip.mp4", 2000000, { width: 270, height: 480, fps: { num: 30, den: 1 }, hasAudio: true, codec: "h264", audioCodec: "aac", size: 18761 }),
    m2: mediaItem("m2", "audio", "tone.wav", "media/tone.wav", 500000, { hasAudio: true, audioCodec: "pcm", size: 48078 }),
    m3: mediaItem("m3", "image", "badge.png", "media/badge.png", 0, { width: 64, height: 64, codec: "png", size: 207 }),
  },
  bins: [{ id: "bin-audio", name: "Audio" }],
  tracks: [track("v1", "video", "V1", ["c-video", "c-image"]), track("v2", "video", "V2", ["c-solid", "c-text", "c-standin"]), track("cc1", "caption", "CC1", ["q1", "q2"]), track("a1", "audio", "A1", ["c-audio"])],
  clips: {
    "c-video": mediaClip("c-video", "v1", "video", "Intro clip", 0, 60, "m1", 0, 2000000, { color: "blue" }),
    "c-image": mediaClip("c-image", "v1", "image", "Badge", 60, 30, "m3", 0, 1000000, { transform: transform({ scale: 4 }) }),
    "c-solid": base("c-solid", "v2", "solid", "Bar", 0, 30, { fill: { from: { r: 0.1, g: 0.1, b: 0.6, a: 1 }, to: { r: 0.6, g: 0.1, b: 0.1, a: 1 } }, shape: "roundedRect", size: { w: 800, h: 120 }, cornerRadius: 24, transform: transform({ y: -600 }), opacity: 0.9, keyframes: { opacity: [{ frame: 0, value: 0, ease: "easeOut" }, { frame: 10, value: 0.9, ease: "linear" }] } }),
    "c-text": base("c-text", "v2", "text", "Title", 30, 40, { text: { value: "Hello\nworld", box: { mode: "auto", width: 900 } }, style: textStyle("Silkscreen"), animIn: { id: "pop", duration: 8 }, transform: transform({ y: 200 }), opacity: 1, fades: { in: 0, out: 5 } }),
    "c-standin": base("c-standin", "v2", "solid", "Baked overlay", 70, 20, {
      fill: WHITE,
      shape: "rect",
      size: { w: 400, h: 400 },
      cornerRadius: 0,
      transform: transform(),
      opacity: 1,
      color: "orange",
      fallbackOf: { kind: "shape", reason: "A vector shape (Batch 65) baked to a solid", schemaVersion: 4, headTrim: 5, data: { kind: "shape", name: "Star", transform: { x: 0, y: 0 } } },
    }),
    q1: cue("q1", 0, 30, "Hello there", [["Hello", 0, 12], ["there", 12, 30]]),
    q2: cue("q2", 30, 30, "welcome back", [["welcome", 0, 15], ["back", 15, 30]]),
    "c-audio": mediaClip("c-audio", "a1", "audio", "Tone", 0, 15, "m2", 0, 500000, { color: "green" }),
  },
  markers: [{ id: "mk1", frame: 0, color: "green", label: "Scene 1" }, { id: "mk2", frame: 60, color: "blue", label: "Scene 2" }],
  captionTracks: {
    cc1: {
      style: {
        text: { ...textStyle("Silkscreen"), fontSize: 72 },
        position: "bottom",
        x: 0,
        y: 0,
        maxWidth: 900,
        maxLines: 2,
        highlight: { mode: "color", color: { r: 1, g: 0.85, b: 0.2, a: 1 }, inactiveColor: WHITE },
      },
    },
  },
  textPresetsLocal: [],
  meta: { createdAt: "2026-11-07T08:00:00.000Z", modifiedAt: "2026-11-07T08:00:00.000Z", appVersion: "1.1.0", generator: { name: "interop-fixture", version: "1", source: "scripts/cli/make-interop-fixtures.mjs" } },
};
project.media.m2.binId = "bin-audio";

const fonts = {
  version: 2,
  faces: [
    { family: "Silkscreen", style: "Bold", weight: 700, italic: false, postscriptName: "Silkscreen-Bold", file: "silkscreen-latin-700-normal.woff2", source: "library", origin: "silkscreen/silkscreen-latin-700-normal.woff2" },
  ],
};

const write = (dir, name, value) => writeFileSync(join(dir, name), `${JSON.stringify(value, null, 2)}\n`);

mkdirSync(join(basic, "fonts"), { recursive: true });
write(basic, "project.json", project);
write(join(basic, "fonts"), "fonts.json", fonts);
copyFileSync(join(root, "public", "fonts", "library", "silkscreen", "silkscreen-latin-700-normal.woff2"), join(basic, "fonts", "silkscreen-latin-700-normal.woff2"));

// --- broken copies: one error each --------------------------------------------------------------------
const BROKEN = {
  "clip-past-media-end": (p) => void (p.media.m1.durationUs = 1500000),
  "overlapping-clips": (p) => void (p.clips["c-image"].start = 50),
  "missing-media-file": (p) => void (p.media.m3.file.relPath = "media/missing.png"),
  "caption-below-video": (p) => void (p.tracks = [p.tracks[0], p.tracks[2], p.tracks[1], p.tracks[3]]),
  "bad-font-file": () => {},
  "fractional-frame": (p) => void (p.clips["c-text"].start = 30.5),
  "opacity-string": (p) => void (p.clips["c-solid"].opacity = "1"),
  "transform-without-anchor": (p) => void delete p.clips["c-video"].transform.anchor,
  "unknown-clip-field": (p) => void (p.clips["c-video"].glow = true),
};

rmSync(broken, { recursive: true, force: true });
for (const [name, mutate] of Object.entries(BROKEN)) {
  const dir = join(broken, name);
  cpSync(basic, dir, { recursive: true });
  const copy = structuredClone(project);
  mutate(copy);
  write(dir, "project.json", copy);
  if (name === "bad-font-file") writeFileSync(join(dir, "fonts", "silkscreen-latin-700-normal.woff2"), "this is not a font file\n");
}
console.log(`fixtures written: basic and ${Object.keys(BROKEN).length} broken copies`);
