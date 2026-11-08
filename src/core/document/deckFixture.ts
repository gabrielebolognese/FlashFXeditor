// The projects of fixtures/interop/deck and fixtures/interop/card (Batch 70, spec §21.15):
// - deck: six cards flying in from far away, turned on X, Y and Z, into a 3 x 2 grid in perspective
//   (the default 1600 px), their rotations and depth settling to 0 one after the other;
// - card: one checkered card turned 60° on Y with perspective 1600, the picture of the CSS reference
//   check (`perspective: 1600px; transform: rotateY(60deg)`, scripts/css-perspective-reference.mjs).
// Shared by the fixture test (which checks the committed project.json files against this build) and the
// script that writes them (`WRITE_DECK_FIXTURE=1 npx vitest run src/core/document/deckFixture.test.ts`).
import { makeShapeClip } from "./fixtures.js";
import { createProject, emptyTrack } from "./project.js";
import type { KeyData, Project, RGBA, ShapeClip, Transform } from "./types.js";

const T = (patch: Partial<Transform> = {}): Transform => ({ x: 0, y: 0, scale: 1, rotation: 0, anchor: { x: 0.5, y: 0.5 }, flipH: false, flipV: false, ...patch });
const key = (frame: number, value: number, ease: KeyData["ease"] = "cubicOut"): KeyData => ({ frame, value, ease });

export const DECK_DURATION = 60;
const WHITE: RGBA = { r: 1, g: 1, b: 1, a: 1 };
const INK: RGBA = { r: 0.08, g: 0.09, b: 0.12, a: 1 };
const COLORS: RGBA[] = [
  { r: 0.96, g: 0.36, b: 0.3, a: 1 },
  { r: 1, g: 0.75, b: 0.2, a: 1 },
  { r: 0.36, g: 0.8, b: 0.46, a: 1 },
  { r: 0.3, g: 0.62, b: 1, a: 1 },
  { r: 0.72, g: 0.46, b: 1, a: 1 },
  { r: 0.2, g: 0.82, b: 0.86, a: 1 },
];

/** Where each card lands (project px from the frame center) and where it starts. */
export const DECK_GRID: readonly { x: number; y: number }[] = [
  { x: -200, y: -140 },
  { x: 0, y: -140 },
  { x: 200, y: -140 },
  { x: -200, y: 140 },
  { x: 0, y: 140 },
  { x: 200, y: 140 },
];
const STARTS = [
  { x: -520, y: -620, z: 2400, rx: 70, ry: -160, r: -25 },
  { x: 60, y: -760, z: 3000, rx: -55, ry: 140, r: 15 },
  { x: 560, y: -520, z: 2000, rx: 45, ry: 200, r: 30 },
  { x: -600, y: 640, z: 2600, rx: -80, ry: 120, r: -10 },
  { x: -40, y: 780, z: 1800, rx: 60, ry: -210, r: 20 },
  { x: 520, y: 600, z: 2200, rx: -40, ry: -130, r: -30 },
];

/** The frame each card settles on (staggered). */
export const deckLanding = (i: number): number => 30 + i * 4;

/** A 100 x 140 card: colored body, a white band and a dark corner mark (its turn and its back show). */
function cardPaths(fill: RGBA): ShapeClip["paths"] {
  return [
    { id: "body", d: "M8 0 L92 0 Q100 0 100 8 L100 132 Q100 140 92 140 L8 140 Q0 140 0 132 L0 8 Q0 0 8 0 Z", fill, fillRule: "nonzero" },
    { id: "band", d: "M0 56 L100 56 L100 84 L0 84 Z", fill: WHITE, fillRule: "nonzero" },
    { id: "mark", d: "M12 12 L36 12 L36 36 L12 36 Z", fill: INK, fillRule: "nonzero" },
  ];
}

export function buildDeckFixture(): Project {
  const project = createProject({ id: "8f1c3a52-2d7e-4b61-9a0e-4c5d6e7f8a90", name: "Interop deck", now: "2026-11-08T12:00:00.000Z", appVersion: "1.1.0" });
  project.settings = { ...project.settings, width: 720, height: 1280, background: { r: 0.07, g: 0.07, b: 0.09, a: 1 } };
  project.meta.generator = { name: "interop-fixture", version: "1", source: "fixtures/interop/deck (Batch 70)" };
  project.tracks = COLORS.map((_, i) => emptyTrack(`v${i + 1}`, "video", `V${i + 1}`));
  COLORS.forEach((fill, i) => {
    const track = project.tracks[i] as Project["tracks"][number];
    const end = deckLanding(i);
    const from = STARTS[i] as (typeof STARTS)[number];
    const to = DECK_GRID[i] as { x: number; y: number };
    const clip = makeShapeClip({
      id: `card${i + 1}`,
      name: `Card ${i + 1}`,
      trackId: track.id,
      start: 0,
      duration: DECK_DURATION,
      size: { w: 100, h: 140 },
      paths: cardPaths(fill),
      transform: T({ x: to.x, y: to.y, scale: 1.5, rotationX: 0, rotationY: 0, z: 0 }),
      keyframes: {
        "transform.x": [key(0, from.x), key(end, to.x)],
        "transform.y": [key(0, from.y), key(end, to.y)],
        "transform.z": [key(0, from.z), key(end, 0)],
        "transform.rotation": [key(0, from.r), key(end, 0)],
        "transform.rotationX": [key(0, from.rx), key(end, 0)],
        "transform.rotationY": [key(0, from.ry), key(end, 0)],
      },
    });
    track.clipIds.push(clip.id);
    project.clips[clip.id] = clip;
  });
  return project;
}

/** The checkered card: 160 x 100 view box px, 20 px squares, scaled 2.5 (400 x 250 px). */
export const CARD_SIZE = { w: 160, h: 100, scale: 2.5 } as const;

function checker(): string {
  const parts: string[] = [];
  for (let row = 0; row < CARD_SIZE.h / 20; row++) {
    for (let col = 0; col < CARD_SIZE.w / 20; col++) {
      if ((row + col) % 2 === 1) continue;
      const x = col * 20;
      const y = row * 20;
      parts.push(`M${x} ${y} L${x + 20} ${y} L${x + 20} ${y + 20} L${x} ${y + 20} Z`);
    }
  }
  return parts.join(" ");
}

export function buildCardFixture(): Project {
  const project = createProject({ id: "3b7e9d14-5a26-4f80-8c1b-6d2e4f9a0b37", name: "Interop card", now: "2026-11-08T12:00:00.000Z", appVersion: "1.1.0" });
  project.settings = { ...project.settings, width: 800, height: 600, background: { r: 0.07, g: 0.07, b: 0.09, a: 1 }, perspective: 1600 };
  project.meta.generator = { name: "interop-fixture", version: "1", source: "fixtures/interop/card (Batch 70)" };
  project.tracks = [emptyTrack("v1", "video", "V1")];
  const clip = makeShapeClip({
    id: "card",
    name: "Card",
    trackId: "v1",
    start: 0,
    duration: 30,
    size: { w: CARD_SIZE.w, h: CARD_SIZE.h },
    paths: [
      { id: "paper", d: `M0 0 L${CARD_SIZE.w} 0 L${CARD_SIZE.w} ${CARD_SIZE.h} L0 ${CARD_SIZE.h} Z`, fill: { r: 0.98, g: 0.94, b: 0.82, a: 1 }, fillRule: "nonzero" },
      { id: "squares", d: checker(), fill: { r: 0.85, g: 0.2, b: 0.25, a: 1 }, fillRule: "nonzero" },
    ],
    transform: T({ scale: CARD_SIZE.scale, rotationY: 60 }),
  });
  (project.tracks[0] as Project["tracks"][number]).clipIds.push(clip.id);
  project.clips[clip.id] = clip;
  return project;
}
