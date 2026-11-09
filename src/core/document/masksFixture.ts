// The project of fixtures/interop/masks (Batch 73, spec §21.18), 360 x 640 at 30 fps over black, in
// 10-frame segments, each checked at its middle frame (`MASKS_FIXTURE_FRAMES`):
// - 5: the video inside an ellipse mask with feather 40.
// - 15: subtract: a white solid kept inside a rectangle, minus an ellipse in its middle.
// - 25: intersect: a white solid kept where two ellipses overlap.
// - 35: invert: a white solid with an inverted ellipse (feather 12): a hole.
// - 45, 55: a title revealed left to right by a rectangle mask whose width is keyed (0 -> 360 content px over the 20 frames).
// - 65, 75: a path mask morphing from a square to a diamond (4 points each; keys at the clip's frames 0 and 19).
// - 85: a masked matte source (the Batch 72 follow-up): the video through an alpha matte from a matte-only
//   solid kept inside an ellipse; and the video's own rectangle mask applied before the matte.
// Media: the basic fixture's clip.mp4. Shared by the fixture test (which checks the committed
// project.json against this build) and the writer
// (`WRITE_MASKS_FIXTURE=1 npx vitest run src/core/document/masksFixture.test.ts`).
import { DEFAULT_TEXT_STYLE, textContent } from "../../text/style.js";
import { setKey } from "./keyframes.js";
import { makeMedia, makeMediaClip, makeSolidClip } from "./fixtures.js";
import { createProject, emptyTrack } from "./project.js";
import { frameToUs } from "./time.js";
import type { Clip, Mask, MediaClip, MediaItem, Project, SolidClip, TextClip } from "./types.js";

export const MASKS_FIXTURE_SIZE = { width: 360, height: 640 } as const;
export const MASK_SEGMENT = 10;
export const FEATHER_SEGMENT = 0;
export const SUBTRACT_SEGMENT = 1;
export const INTERSECT_SEGMENT = 2;
export const INVERT_SEGMENT = 3;
/** Two segments: the reveal half way, then near its end. */
export const REVEAL_SEGMENT = 4;
/** Two segments: the morph a quarter of the way, then three quarters. */
export const MORPH_SEGMENT = 6;
export const MATTE_SEGMENT = 8;
const SEGMENTS = MATTE_SEGMENT + 1;
export const MASKS_FIXTURE_FRAMES: readonly number[] = Array.from({ length: SEGMENTS }, (_, i) => i * MASK_SEGMENT + MASK_SEGMENT / 2);
/** The square and the diamond of the morph (content px of a 360 x 640 solid). */
export const MORPH_FROM = [80, 220, 280, 220, 280, 420, 80, 420];
export const MORPH_TO = [180, 170, 330, 320, 180, 470, 30, 320];

const mask = (id: string, shape: Mask["shape"], fields: Partial<Mask> = {}): Mask => ({ id, shape, mode: "add", feather: 0, expansion: 0, opacity: 1, inverted: false, ...fields });
const pathOf = (p: readonly number[]) => `M${p[0]} ${p[1]}L${p[2]} ${p[3]}L${p[4]} ${p[5]}L${p[6]} ${p[7]}Z`;

export function buildMasksFixture(): Project {
  const project = createProject({ id: "5b0f7d3e-2c81-4a96-9e47-81c3d2a6f0b5", name: "Interop masks", now: "2026-11-09T12:00:00.000Z", appVersion: "1.1.0" });
  project.settings = { ...project.settings, ...MASKS_FIXTURE_SIZE, background: { r: 0, g: 0, b: 0, a: 1 } };
  project.meta.generator = { name: "interop-fixture", version: "1", source: "fixtures/interop/masks (Batch 73)" };
  project.tracks = [emptyTrack("v1", "video", "V1"), emptyTrack("v2", "video", "V2")];
  const video: MediaItem = { ...makeMedia("video", "video", 2_000_000), name: "clip.mp4", file: { relPath: "media/clip.mp4" }, width: 270, height: 480, fps: { num: 30, den: 1 }, codec: "h264", audioCodec: "aac", size: 18761, addedAt: "2026-11-09T12:00:00.000Z" };
  project.media.video = video;
  const fps = project.settings.fps;

  const add = (clip: Clip) => {
    project.clips[clip.id] = clip;
    project.tracks.find((t) => t.id === clip.trackId)?.clipIds.push(clip.id);
  };
  const movie = (id: string, trackId: string, segment: number, extra: Partial<MediaClip> = {}): void => {
    add({ ...makeMediaClip(project, { id, trackId, start: segment * MASK_SEGMENT, duration: MASK_SEGMENT, mediaId: "video" }), in: 0, out: frameToUs(MASK_SEGMENT, fps), ...extra });
  };
  const solid = (id: string, trackId: string, segment: number, segments: number, extra: Partial<SolidClip> = {}): void => {
    add({ ...makeSolidClip({ id, trackId, start: segment * MASK_SEGMENT, duration: segments * MASK_SEGMENT }), size: { w: 360, h: 640 }, ...extra });
  };

  // An ellipse with feather 40 on the video (shown 270 x 480: the ellipse inset 35 x 60).
  movie("feather-video", "v1", FEATHER_SEGMENT, { masks: [mask("e", { kind: "ellipse", x: 35, y: 60, w: 200, h: 360 }, { feather: 40 })] });
  // Subtract and intersect.
  solid("subtract", "v1", SUBTRACT_SEGMENT, 1, { masks: [mask("r", { kind: "rect", x: 40, y: 120, w: 280, h: 400, radius: 24 }), mask("hole", { kind: "ellipse", x: 100, y: 220, w: 160, h: 200 }, { mode: "subtract", feather: 6 })] });
  solid("intersect", "v1", INTERSECT_SEGMENT, 1, { masks: [mask("a", { kind: "ellipse", x: 20, y: 160, w: 240, h: 320 }), mask("b", { kind: "ellipse", x: 100, y: 160, w: 240, h: 320 }, { mode: "intersect" })] });
  // Invert.
  solid("invert", "v1", INVERT_SEGMENT, 1, { fill: { r: 0.95, g: 0.75, b: 0.2, a: 1 }, masks: [mask("e", { kind: "ellipse", x: 80, y: 220, w: 200, h: 200 }, { feather: 12, inverted: true })] });
  // A title revealed by a rectangle whose width is keyed.
  const reveal = 2 * MASK_SEGMENT;
  const title: TextClip = {
    kind: "text",
    id: "title",
    trackId: "v1",
    name: "Title",
    start: REVEAL_SEGMENT * MASK_SEGMENT,
    duration: reveal,
    enabled: true,
    text: textContent("REVEAL\nTITLE", { mode: "auto", width: 300 }),
    style: { ...structuredClone(DEFAULT_TEXT_STYLE), fontSize: 72, lineHeight: 1 },
    transform: { x: 0, y: 0, scale: 1, rotation: 0, anchor: { x: 0.5, y: 0.5 }, flipH: false, flipV: false },
    opacity: 1,
    fades: { in: 0, out: 0 },
    masks: [mask("wipe", { kind: "rect", x: 0, y: -200, w: 0, h: 1000, radius: 0 })],
    keyframes: { "masks.wipe.w": setKey(setKey([], 0, 0), reveal - 1, 360) },
  };
  add(title);
  // A path morph (equal point counts).
  solid("morph", "v1", MORPH_SEGMENT, 2, {
    fill: { r: 0.3, g: 0.8, b: 0.95, a: 1 },
    masks: [mask("p", { kind: "path", d: pathOf(MORPH_FROM) }, { feather: 2 })],
    keyframes: { "masks.p.path": setKey(setKey([], 0, MORPH_FROM), reveal - 1, MORPH_TO) },
  });
  // A masked matte source; the video's own mask applies before the matte.
  movie("matte-video", "v1", MATTE_SEGMENT, { masks: [mask("r", { kind: "rect", x: 0, y: 0, w: 270, h: 300, radius: 0 })], matte: { clipId: "matte", mode: "alpha" } });
  solid("matte", "v2", MATTE_SEGMENT, 1, { matteOnly: true, masks: [mask("e", { kind: "ellipse", x: 60, y: 140, w: 240, h: 360 }, { feather: 20 })] });
  return project;
}
