// The project of fixtures/interop/templates (Batch 80, spec §21.24), 360 x 640 at 30 fps: a "Paper card"
// template (a compound's sequence with five parameters) shown by three instances of the one sequence, one per
// 30-frame segment, over a dark backdrop. `TEMPLATE_VALUES` is the committed `values.json` that
// `npm run cli -- fill` applies: it names instances by clip name.
// - segment 0: "Card A", no values of its own (the card as the sequence has it);
// - segment 1: "Card B", a title, a body, an orange accent, a wider accent bar;
// - segment 2: "Card C", another title, body and accent, the accent bar hidden.
// Parameters: Title and Body (text), Accent color (color: the bar and the dot), Accent width (number), Show accent (toggle).
// Shared by the fixture test (which checks the committed project.json against this build) and the writer
// (`WRITE_TEMPLATES_FIXTURE=1 npx vitest run src/core/document/templatesFixture.test.ts`).
import { makeCompoundClip, makeSolidClip, makeTextClip } from "./fixtures.js";
import { createProject, emptyTrack } from "./project.js";
import type { Clip, CompoundClip, JsonValue, Project, RGBA, Sequence, TextClip, Track } from "./types.js";

export const TEMPLATES_SEGMENT = 30;
export const TEMPLATES_FIXTURE_SIZE = { width: 360, height: 640 } as const;
/** One frame per segment, checked in the expected folder. */
export const TEMPLATES_FIXTURE_FRAMES: readonly number[] = [15, 45, 75];
const SEGMENTS = 3;
const SEQUENCE_ID = "paper-card";

const rgba = (r: number, g: number, b: number): RGBA => ({ r, g, b, a: 1 });
const PAPER = rgba(0.97, 0.94, 0.86);
const INK = rgba(0.13, 0.12, 0.16);
const TEAL = { r: 0.12, g: 0.62, b: 0.62, a: 1 };

/** What `fill` sets: instances by clip name, parameters by id (the file the CLI reads). */
export const TEMPLATE_VALUES: Record<string, Record<string, JsonValue>> = {
  "Card B": { title: "Launch day", body: "Doors open at nine. Bring a friend.", accent: { r: 0.95, g: 0.5, b: 0.12, a: 1 }, width: 260 },
  "Card C": { title: "Thank you", body: "See you next week.", accent: { r: 0.55, g: 0.3, b: 0.85, a: 1 }, show: false },
};

/** `filled`: Card B and Card C carry the values of `TEMPLATE_VALUES` (the committed project); otherwise they have none (what `fill` starts from). */
export function buildTemplatesFixture(filled = true): Project {
  const project = createProject({ id: "5b0e3c92-7a41-4d68-93f5-2c8d1e06b7a4", name: "Interop templates", now: "2026-11-09T12:00:00.000Z", appVersion: "1.1.0" });
  project.settings = { ...project.settings, ...TEMPLATES_FIXTURE_SIZE, fps: { num: 30, den: 1 }, background: rgba(0.08, 0.09, 0.12) };
  project.meta.generator = { name: "interop-fixture", version: "1", source: "fixtures/interop/templates (Batch 80)" };
  project.tracks = [emptyTrack("v1", "video", "V1"), emptyTrack("v2", "video", "V2")];

  // The template's sequence: paper, accent bar, dot, title, body, each on its own inner track.
  const innerTracks: Track[] = ["paper", "bar", "dot", "title", "body"].map((name) => emptyTrack(`t-${name}`, "video", name));
  const inner: Clip[] = [];
  const place = (clip: Clip, track: string) => {
    inner.push(clip);
    innerTracks.find((t) => t.id === `t-${track}`)?.clipIds.push(clip.id);
  };
  const T = (patch: { x?: number; y?: number }) => ({ x: 0, y: 0, scale: 1, rotation: 0, anchor: { x: 0.5, y: 0.5 }, flipH: false, flipV: false, ...patch });
  const dur = TEMPLATES_SEGMENT;
  place({ ...makeSolidClip({ id: "card-paper", trackId: "t-paper", start: 0, duration: dur }), fill: PAPER, size: { w: 300, h: 420 }, cornerRadius: 18, shape: "roundedRect", transform: T({}) }, "paper");
  place({ ...makeSolidClip({ id: "card-bar", trackId: "t-bar", start: 0, duration: dur }), fill: TEAL, size: { w: 220, h: 14 }, transform: T({ y: -150 }) }, "bar");
  place({ ...makeSolidClip({ id: "card-dot", trackId: "t-dot", start: 0, duration: dur }), fill: TEAL, shape: "ellipse", size: { w: 36, h: 36 }, transform: T({ x: -110, y: 150 }) }, "dot");
  const text = (id: string, track: string, value: string, size: number, y: number): TextClip => {
    const clip = makeTextClip({ id, trackId: `t-${track}`, start: 0, duration: dur, value });
    return { ...clip, style: { ...clip.style, fontSize: size, fill: INK }, text: { ...clip.text, box: { mode: "fixed", width: 250 } }, transform: T({ y }) } as TextClip;
  };
  place(text("card-title", "title", "Paper card", 44, -60), "title");
  place(text("card-body", "body", "A small card with a title and a few words.", 26, 40), "body");
  const sequence: Sequence = {
    id: SEQUENCE_ID,
    name: "Paper card",
    size: { w: TEMPLATES_FIXTURE_SIZE.width, h: TEMPLATES_FIXTURE_SIZE.height },
    duration: dur,
    background: null,
    tracks: innerTracks,
    params: [
      { id: "title", label: "Title", kind: "text", targets: [{ clipId: "card-title", path: "text.value" }], default: "Paper card" },
      { id: "body", label: "Body", kind: "text", targets: [{ clipId: "card-body", path: "text.value" }], default: "A small card with a title and a few words." },
      { id: "accent", label: "Accent color", kind: "color", targets: [{ clipId: "card-bar", path: "fill" }, { clipId: "card-dot", path: "fill" }], default: { ...TEAL } },
      { id: "width", label: "Accent width", kind: "number", targets: [{ clipId: "card-bar", path: "size.w" }], default: 220, min: 40, max: 280 },
      { id: "show", label: "Show accent", kind: "toggle", targets: [{ clipId: "card-bar", path: "enabled" }, { clipId: "card-dot", path: "enabled" }], default: true },
    ],
  };
  project.sequences[SEQUENCE_ID] = sequence;
  for (const clip of inner) project.clips[clip.id] = clip;

  // The project's own tracks: a backdrop, and one instance per segment.
  const add = (clip: Clip) => {
    project.clips[clip.id] = clip;
    project.tracks.find((t) => t.id === clip.trackId)?.clipIds.push(clip.id);
  };
  add({ ...makeSolidClip({ id: "backdrop", trackId: "v1", start: 0, duration: SEGMENTS * dur }), fill: rgba(0.16, 0.18, 0.28), size: { w: TEMPLATES_FIXTURE_SIZE.width, h: TEMPLATES_FIXTURE_SIZE.height } });
  const instance = (segment: number, name: string): CompoundClip => {
    const values = filled ? TEMPLATE_VALUES[name] : undefined;
    const clip = makeCompoundClip({ id: `card-${name.slice(-1).toLowerCase()}`, trackId: "v2", start: segment * dur, duration: dur, sequenceId: SEQUENCE_ID });
    return { ...clip, name, ...(values && { params: structuredClone(values) }) };
  };
  add(instance(0, "Card A"));
  add(instance(1, "Card B"));
  add(instance(2, "Card C"));
  return project;
}
