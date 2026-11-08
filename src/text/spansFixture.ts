// The project of fixtures/interop/spans (Batch 67): five text clips on an 800 x 700 frame that use every
// field of a span (fill, weight, italic, underline, strike, highlight) and a `wordPop` title whose words
// keep their span's style. Shared by the fixture test (which checks the committed project.json against
// this build) and the script that writes it (`WRITE_SPANS_FIXTURE=1 npx vitest run src/text/spansFixture.test.ts`).
import type { Project, TextClip, TextSpan } from "../core/document/types.js";
import { createProject, emptyTrack } from "../core/document/project.js";
import { newTextClip } from "../timeline/edit/text.js";
import { DEFAULT_TEXT_STYLE } from "./style.js";

const CORAL = { r: 1, g: 0.42, b: 0.32, a: 1 };
const YELLOW = { r: 1, g: 0.86, b: 0.2, a: 1 };
const INK = { r: 0.08, g: 0.08, b: 0.1, a: 1 };
const WHITE = { r: 1, g: 1, b: 1, a: 1 };

interface Row {
  id: string;
  value: string;
  y: number;
  spans: TextSpan[];
  animIn?: TextClip["animIn"];
}

const at = (value: string, word: string) => ({ start: value.indexOf(word), end: value.indexOf(word) + word.length });

const ROWS: Row[] = (() => {
  const save = "SAVE 3 HOURS";
  const kinds = "bold italic under strike";
  const mark = "Marked words stand out";
  const gradient = "Gradient word inside";
  const pop = "POP EACH WORD";
  return [
    { id: "save", value: save, y: -250, spans: [{ ...at(save, "3 HOURS"), style: { fill: CORAL } }] },
    {
      id: "kinds",
      value: kinds,
      y: -110,
      spans: [
        { ...at(kinds, "bold"), style: { fontWeight: 800 } },
        { ...at(kinds, "italic"), style: { italic: true } },
        { ...at(kinds, "under"), style: { underline: true } },
        { ...at(kinds, "strike"), style: { strike: true, fill: CORAL } },
      ],
    },
    { id: "mark", value: mark, y: 30, spans: [{ ...at(mark, "words"), style: { highlight: YELLOW, fill: INK } }] },
    {
      id: "gradient",
      value: gradient,
      y: 170,
      spans: [{ ...at(gradient, "word"), style: { fill: { from: CORAL, to: YELLOW }, fontWeight: 900 } }],
    },
    {
      id: "pop",
      value: pop,
      y: 290,
      spans: [{ ...at(pop, "EACH"), style: { fill: CORAL, highlight: INK } }],
      animIn: { id: "wordPop", duration: 18, stagger: 4 },
    },
  ];
})();

export function buildSpansFixture(): Project {
  const project = createProject({ id: "5b7d9f31-4c2e-4a68-b1d3-7e9a0c4f2d65", name: "Interop spans", now: "2026-11-08T08:00:00.000Z", appVersion: "1.1.0" });
  project.settings = { ...project.settings, width: 800, height: 700, background: { r: 0.1, g: 0.1, b: 0.12, a: 1 } };
  project.meta.generator = { name: "interop-fixture", version: "1", source: "fixtures/interop/spans (Batch 67)" };
  project.tracks = [emptyTrack("v1", "video", "V1")];
  ROWS.forEach((row, i) => {
    const trackId = `v${i + 2}`;
    const track = emptyTrack(trackId, "video", `V${i + 2}`);
    const style = { ...structuredClone(DEFAULT_TEXT_STYLE), fontSize: 56, fill: WHITE, stroke: { ...DEFAULT_TEXT_STYLE.stroke, enabled: false }, shadow: { ...DEFAULT_TEXT_STYLE.shadow, enabled: false }, background: { ...DEFAULT_TEXT_STYLE.background, enabled: false } };
    const clip = newTextClip({ id: row.id, trackId, start: 0, duration: 60, value: row.value, style, box: { mode: "auto", width: 700 }, transform: { x: 0, y: row.y, scale: 1, rotation: 0, anchor: { x: 0.5, y: 0.5 }, flipH: false, flipV: false }, ...(row.animIn && { animIn: row.animIn }) });
    clip.spans = row.spans;
    track.clipIds.push(row.id);
    project.clips[row.id] = clip;
    project.tracks.push(track);
  });
  return project;
}
