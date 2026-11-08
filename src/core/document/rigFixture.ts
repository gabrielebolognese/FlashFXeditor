// The project of fixtures/interop/rig (Batch 69): a null with five children (rotating around the null's
// position), a text parented to a rotating card, and a shape on a curved motion path with auto-orient.
// Shared by the fixture test (which checks the committed project.json against this build) and the script
// that writes it (`WRITE_RIG_FIXTURE=1 npx vitest run src/core/document/rigFixture.test.ts`).
import { newTextClip } from "../../timeline/edit/text.js";
import { DEFAULT_TEXT_STYLE } from "../../text/style.js";
import { makeShapeClip } from "./fixtures.js";
import { createProject, emptyTrack } from "./project.js";
import type { Clip, KeyData, NullClip, Project, RGBA, ShapeClip, Transform } from "./types.js";

const WHITE: RGBA = { r: 1, g: 1, b: 1, a: 1 };
const COLORS: RGBA[] = [
  { r: 1, g: 0.42, b: 0.32, a: 1 },
  { r: 1, g: 0.86, b: 0.2, a: 1 },
  { r: 0.4, g: 0.85, b: 0.5, a: 1 },
  { r: 0.35, g: 0.7, b: 1, a: 1 },
  { r: 0.8, g: 0.5, b: 1, a: 1 },
];

const T = (patch: Partial<Transform> = {}): Transform => ({ x: 0, y: 0, scale: 1, rotation: 0, anchor: { x: 0.5, y: 0.5 }, flipH: false, flipV: false, ...patch });
const key = (frame: number, value: number | number[], extra: Partial<KeyData> = {}): KeyData => ({ frame, value, ease: "linear", ...extra });

const DURATION = 60;
const SQUARE = "M10 10 L90 10 L90 90 L10 90 Z";
const ARROW = "M10 20 L70 20 L70 5 L95 50 L70 95 L70 80 L10 80 Z";

function shape(id: string, trackId: string, fill: RGBA, d: string, patch: Partial<ShapeClip>): ShapeClip {
  return makeShapeClip({ id, trackId, start: 0, duration: DURATION, paths: [{ id: "p", d, fill, fillRule: "nonzero" }], ...patch });
}

export function buildRigFixture(): Project {
  const project = createProject({ id: "5d2e8b17-6a40-4c93-b1f8-27e0c94a3d56", name: "Interop rig", now: "2026-11-08T12:00:00.000Z", appVersion: "1.1.0" });
  project.settings = { ...project.settings, width: 800, height: 600, background: { r: 0.1, g: 0.1, b: 0.12, a: 1 } };
  project.meta.generator = { name: "interop-fixture", version: "1", source: "fixtures/interop/rig (Batch 69)" };
  const clips: Clip[] = [];
  const tracks = ["v1", "v2", "v3", "v4", "v5", "v6", "v7", "v8", "v9", "v10"].map((id, i) => emptyTrack(id, "video", `V${i + 1}`));
  project.tracks = tracks;
  let track = 0;
  const place = (build: (trackId: string) => Clip): void => {
    const t = tracks[track++] as (typeof tracks)[number];
    const clip = build(t.id);
    t.clipIds.push(clip.id);
    clips.push(clip);
  };

  // A null at the upper left turning a quarter turn, with five children at different distances.
  place((trackId): NullClip => ({
    id: "rig",
    trackId,
    kind: "null",
    name: "Rig",
    start: 0,
    duration: DURATION,
    enabled: true,
    size: { w: 100, h: 100 },
    transform: T({ x: -220, y: -170 }),
    keyframes: { "transform.rotation": [key(0, 0), key(DURATION - 1, 90)] },
  }));
  COLORS.forEach((fill, i) => {
    place((trackId) => shape(`dot${i}`, trackId, fill, SQUARE, { parentId: "rig", transform: T({ x: 60 + i * 30, y: 0, scale: 0.25 }) }));
  });

  // A card turning at the right, with a text parented to it.
  place((trackId) =>
    shape("card", trackId, WHITE, SQUARE, {
      size: { w: 100, h: 100 },
      transform: T({ x: 200, y: -100, scale: 2 }),
      keyframes: { "transform.rotation": [key(0, 0), key(DURATION - 1, 45)] },
    }),
  );
  place((trackId) => {
    const style = { ...structuredClone(DEFAULT_TEXT_STYLE), fontSize: 22, fill: { r: 0.1, g: 0.1, b: 0.12, a: 1 }, stroke: { ...DEFAULT_TEXT_STYLE.stroke, enabled: false }, shadow: { ...DEFAULT_TEXT_STYLE.shadow, enabled: false }, background: { ...DEFAULT_TEXT_STYLE.background, enabled: false } };
    const clip = newTextClip({ id: "label", trackId, start: 0, duration: DURATION, value: "CARD", style, box: { mode: "auto", width: 300 }, transform: T() });
    clip.parentId = "card";
    return clip;
  });

  // An arrow on a curved path, turned along it.
  place((trackId) =>
    shape("arrow", trackId, COLORS[3] as RGBA, ARROW, {
      transform: T({ scale: 0.6 }),
      autoOrient: true,
      keyframes: {
        "transform.position": [
          key(0, [-300, 220], { spatialOut: [0, -260] }),
          key(30, [0, 100], { spatialIn: [-120, 0], spatialOut: [120, 0] }),
          key(DURATION - 1, [300, 220], { spatialIn: [0, -260] }),
        ],
      },
    }),
  );
  for (const clip of clips) project.clips[clip.id] = clip;
  return project;
}
