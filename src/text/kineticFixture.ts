// The project of fixtures/interop/kinetic (Batch 68): a counter (0 to 85.6 %, easeOut), animator reveals (a
// keyed offset; every prop; a random order with a seed; a word animator) and one row for each new In preset.
// Shared by the fixture test (which checks the committed project.json against this build) and the script
// that writes it (`WRITE_KINETIC_FIXTURE=1 npx vitest run src/text/kineticFixture.test.ts`).
import { createProject, emptyTrack } from "../core/document/project.js";
import type { Project, TextAnimId, TextAnimator, TextClip } from "../core/document/types.js";
import { newTextClip } from "../timeline/edit/text.js";
import { newAnimator } from "./animators.js";
import { DEFAULT_TEXT_STYLE } from "./style.js";

const CORAL = { r: 1, g: 0.42, b: 0.32, a: 1 };
const YELLOW = { r: 1, g: 0.86, b: 0.2, a: 1 };
const WHITE = { r: 1, g: 1, b: 1, a: 1 };

const key = (frame: number, value: number | number[]) => ({ frame, value, ease: "linear" as const });

interface Row {
  id: string;
  value: string;
  patch: Partial<TextClip>;
}

/** The new In presets of spec §21.13, each on its own row. */
export const KINETIC_PRESETS: readonly TextAnimId[] = ["typeOn", "decode", "tumbleIn", "cascadeUp", "riseByLine", "popInByChar", "blurInByChar", "fadeInByChar", "highlightSweep"];

const animators = (): { reveal: TextAnimator; every: TextAnimator; scatter: TextAnimator; words: TextAnimator } => ({
  reveal: { ...newAnimator("reveal"), props: { y: 40, opacity: 0 } },
  every: {
    id: "every",
    unit: "char",
    selector: { start: 0, end: 1, offset: 0, shape: "smooth", ease: 0.5, order: "reverse", seed: 3 },
    props: { x: 6, y: -12, scale: 0.6, rotation: 20, opacity: 0.4, blur: 3, tracking: 4, fill: CORAL },
  },
  scatter: { id: "scatter", unit: "char", selector: { start: 0, end: 1, offset: 0, shape: "square", ease: 0, order: "random", seed: 11 }, props: { opacity: 0, scale: 0 } },
  words: { id: "words", unit: "word", selector: { start: 0, end: 1, offset: 0, shape: "triangle", ease: -0.3, order: "forward", seed: 1 }, props: { y: -30 } },
});

const rows = (): Row[] => {
  const a = animators();
  const base: Row[] = [
    {
      id: "counter",
      value: "85.6%",
      patch: { counter: { from: 0, to: 85.6, decimals: 1, prefix: "", suffix: "%", separator: "", ease: "easeOut" } },
    },
    {
      id: "revealRow",
      value: "ANIMATOR REVEAL",
      patch: { animators: [a.reveal], keyframes: { "animators.reveal.selector.offset": [key(0, 1), key(30, -1)] } },
    },
    {
      id: "everyRow",
      value: "ALL PROPS",
      patch: { animators: [a.every], keyframes: { "animators.every.props.y": [key(0, -12), key(30, 12)] } },
    },
    { id: "scatterRow", value: "SCATTER SEEDED", patch: { animators: [a.scatter], keyframes: { "animators.scatter.selector.offset": [key(0, 1), key(30, -1)] } } },
    { id: "wordsRow", value: "WORDS RISE TOGETHER", patch: { animators: [a.words], keyframes: { "animators.words.selector.end": [key(0, 0.5), key(30, 1)] } } },
  ];
  const presets: Row[] = KINETIC_PRESETS.map((id) => ({
    id: `preset-${id}`,
    value: id === "riseByLine" ? "RISE BY\nLINE" : id === "highlightSweep" ? "SWEEP THE WORDS" : id.toUpperCase(),
    patch: { animIn: { id, duration: 30 }, ...(id === "highlightSweep" ? { spans: [{ start: 0, end: 5, style: { highlight: YELLOW } }] } : {}) },
  }));
  return [...base, ...presets];
};

/** Rows are laid out in a column; the frame is 800 px wide. */
const ROW_HEIGHT = 96;

export function buildKineticFixture(): Project {
  const all = rows();
  const height = all.length * ROW_HEIGHT + 40;
  const project = createProject({ id: "8c1a4e72-3b5d-4f09-9a26-d0e7b3f15c84", name: "Interop kinetic", now: "2026-11-08T12:00:00.000Z", appVersion: "1.1.0" });
  project.settings = { ...project.settings, width: 800, height, background: { r: 0.1, g: 0.1, b: 0.12, a: 1 } };
  project.meta.generator = { name: "interop-fixture", version: "1", source: "fixtures/interop/kinetic (Batch 68)" };
  project.tracks = [emptyTrack("v1", "video", "V1")];
  all.forEach((row, i) => {
    const trackId = `v${i + 2}`;
    const track = emptyTrack(trackId, "video", `V${i + 2}`);
    const style = { ...structuredClone(DEFAULT_TEXT_STYLE), fontSize: row.id === "counter" ? 72 : 44, fill: WHITE, stroke: { ...DEFAULT_TEXT_STYLE.stroke, enabled: false }, shadow: { ...DEFAULT_TEXT_STYLE.shadow, enabled: false }, background: { ...DEFAULT_TEXT_STYLE.background, enabled: false } };
    const y = -height / 2 + 20 + ROW_HEIGHT * i + ROW_HEIGHT / 2;
    const clip = newTextClip({ id: row.id, trackId, start: 0, duration: 60, value: row.value, style, box: { mode: "auto", width: 700 }, transform: { x: 0, y, scale: 1, rotation: 0, anchor: { x: 0.5, y: 0.5 }, flipH: false, flipV: false } });
    Object.assign(clip, row.patch);
    track.clipIds.push(row.id);
    project.clips[row.id] = clip;
    project.tracks.push(track);
  });
  return project;
}
