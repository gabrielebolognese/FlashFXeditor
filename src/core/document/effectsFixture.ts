// The project of fixtures/interop/effects-1 (Batch 74, spec §21.19), 360 x 640 at 30 fps over a dark blue
// gray, in 10-frame segments, each checked at its middle frame (`EFFECTS_FIXTURE_FRAMES`). Every effect at
// its defaults and at extreme settings:
// - 5, 15: gaussian blur on the video: default (radius 10); radius 120 with repeat edges.
// - 25, 35: directional blur on the video: default (length 20, 0°); length 200 at 45°.
// - 45, 55: glow on a title: default (outer, radius 20, white); outer radius 150, intensity 5, threshold 0.5, cyan.
// - 65: an inner glow on badge.png (radius 30, intensity 2, magenta): light inside its edges only.
// - 75, 85: drop shadow on badge.png (a transparent star with a hole): default; distance 80 at 135°, blur 60.
// - 95, 105: outline of the badge: default (6 px white); 60 px red.
// - 115, 125: the title's glow intensity keyed 0 -> 1 over the 20 frames (a quarter and three quarters in).
// - 135, 145: a stack and its swap: outline then drop shadow (the shadow of the outlined badge); drop shadow
//   then outline (the outline goes round the shadow too).
// - 155: a disabled blur before an outline: the same as the default outline.
// - 165: the badge turned 20° and scaled 1.5 with a drop shadow (the effects apply in the clip's own space).
// Media: the basic fixture's clip.mp4 and badge.png (scripts/fixtures/make-effects-images.mjs). Shared by the
// fixture test (which checks the committed project.json against this build) and the writer
// (`WRITE_EFFECTS_FIXTURE=1 npx vitest run src/core/document/effectsFixture.test.ts`).
import { DEFAULT_TEXT_STYLE, textContent } from "../../text/style.js";
import { EFFECT_DEFS } from "../effects/effectParams.js";
import { setKey } from "./keyframes.js";
import { makeMedia, makeMediaClip } from "./fixtures.js";
import { createProject, emptyTrack } from "./project.js";
import { frameToUs } from "./time.js";
import type { Clip, Effect, EffectType, MediaClip, MediaItem, Project, TextClip } from "./types.js";

export const EFFECTS_FIXTURE_SIZE = { width: 360, height: 640 } as const;
export const EFFECT_SEGMENT = 10;
export const BLUR_SEGMENT = 0;
export const DIRECTIONAL_SEGMENT = 2;
/** Three segments: default and outer extreme on a title, inner on the badge. */
export const GLOW_SEGMENT = 4;
export const SHADOW_SEGMENT = 7;
export const OUTLINE_SEGMENT = 9;
/** Two segments: the keyed intensity a quarter of the way, then three quarters. */
export const KEYED_GLOW_SEGMENT = 11;
/** Two segments: outline then shadow, then the swapped order. */
export const STACK_SEGMENT = 13;
export const DISABLED_SEGMENT = 15;
export const TURNED_SEGMENT = 16;
const SEGMENTS = TURNED_SEGMENT + 1;
export const EFFECTS_FIXTURE_FRAMES: readonly number[] = Array.from({ length: SEGMENTS }, (_, i) => i * EFFECT_SEGMENT + EFFECT_SEGMENT / 2);

/** An effect with its defaults, overridden by `params`. */
export function fixtureEffect(id: string, type: EffectType, params: Effect["params"] = {}, enabled = true): Effect {
  const base: Effect["params"] = {};
  for (const def of EFFECT_DEFS[type].params) base[def.name] = Array.isArray(def.default) ? [...def.default] : def.default;
  return { id, type, enabled, params: { ...base, ...params } };
}

const CYAN = [0.2, 0.85, 1, 1];
const MAGENTA = [1, 0.25, 0.8, 1];
const RED = [0.9, 0.12, 0.2, 1];

export function buildEffectsFixture(): Project {
  const project = createProject({ id: "e1f4a7c2-6b3d-4e85-9a10-3c7d2f8b5e64", name: "Interop effects-1", now: "2026-11-09T12:00:00.000Z", appVersion: "1.1.0" });
  project.settings = { ...project.settings, ...EFFECTS_FIXTURE_SIZE, background: { r: 0.16, g: 0.18, b: 0.24, a: 1 } };
  project.meta.generator = { name: "interop-fixture", version: "1", source: "fixtures/interop/effects-1 (Batch 74)" };
  project.tracks = [emptyTrack("v1", "video", "V1")];
  const video: MediaItem = { ...makeMedia("video", "video", 2_000_000), name: "clip.mp4", file: { relPath: "media/clip.mp4" }, width: 270, height: 480, fps: { num: 30, den: 1 }, codec: "h264", audioCodec: "aac", size: 18761, addedAt: "2026-11-09T12:00:00.000Z" };
  const badge: MediaItem = { ...makeMedia("badge", "image", 0), name: "badge.png", file: { relPath: "media/badge.png" }, codec: "png", width: 240, height: 240, hasAudio: false, size: 4462, addedAt: "2026-11-09T12:00:00.000Z" };
  project.media.video = video;
  project.media.badge = badge;
  const fps = project.settings.fps;

  const add = (clip: Clip) => {
    project.clips[clip.id] = clip;
    project.tracks.find((t) => t.id === clip.trackId)?.clipIds.push(clip.id);
  };
  const movie = (id: string, segment: number, effects: Effect[]): void => {
    add({ ...makeMediaClip(project, { id, trackId: "v1", start: segment * EFFECT_SEGMENT, duration: EFFECT_SEGMENT, mediaId: "video" }), in: 0, out: frameToUs(EFFECT_SEGMENT, fps), effects });
  };
  const image = (id: string, segment: number, effects: Effect[], extra: Partial<MediaClip> = {}): void => {
    add({ ...makeMediaClip(project, { id, trackId: "v1", start: segment * EFFECT_SEGMENT, duration: EFFECT_SEGMENT, mediaId: "badge", kind: "image" }), effects, ...extra });
  };
  const title = (id: string, segment: number, segments: number, effects: Effect[], extra: Partial<TextClip> = {}): void => {
    add({
      kind: "text",
      id,
      trackId: "v1",
      name: id,
      start: segment * EFFECT_SEGMENT,
      duration: segments * EFFECT_SEGMENT,
      enabled: true,
      text: textContent("GLOW\nTITLE", { mode: "auto", width: 300 }),
      style: { ...structuredClone(DEFAULT_TEXT_STYLE), fontSize: 80, lineHeight: 1 },
      transform: { x: 0, y: 0, scale: 1, rotation: 0, anchor: { x: 0.5, y: 0.5 }, flipH: false, flipV: false },
      opacity: 1,
      fades: { in: 0, out: 0 },
      effects,
      ...extra,
    });
  };

  movie("blur-default", BLUR_SEGMENT, [fixtureEffect("fx1", "gaussianBlur")]);
  movie("blur-extreme", BLUR_SEGMENT + 1, [fixtureEffect("fx1", "gaussianBlur", { radius: 120, repeatEdges: 1 })]);
  movie("directional-default", DIRECTIONAL_SEGMENT, [fixtureEffect("fx1", "directionalBlur")]);
  movie("directional-extreme", DIRECTIONAL_SEGMENT + 1, [fixtureEffect("fx1", "directionalBlur", { length: 200, angle: 45 })]);
  title("glow-default", GLOW_SEGMENT, 1, [fixtureEffect("fx1", "glow")]);
  title("glow-extreme", GLOW_SEGMENT + 1, 1, [fixtureEffect("fx1", "glow", { radius: 150, intensity: 5, threshold: 0.5, color: CYAN })]);
  image("glow-inner", GLOW_SEGMENT + 2, [fixtureEffect("fx1", "glow", { mode: "inner", radius: 30, intensity: 2, color: MAGENTA })]);
  image("shadow-default", SHADOW_SEGMENT, [fixtureEffect("fx1", "dropShadow")]);
  image("shadow-extreme", SHADOW_SEGMENT + 1, [fixtureEffect("fx1", "dropShadow", { distance: 80, angle: 135, blur: 60, color: [0.08, 0, 0.25, 0.9] })]);
  image("outline-default", OUTLINE_SEGMENT, [fixtureEffect("fx1", "outline")]);
  image("outline-extreme", OUTLINE_SEGMENT + 1, [fixtureEffect("fx1", "outline", { width: 60, color: RED })]);
  // The glow's intensity keyed 0 -> 1 over the clip.
  const keyed = 2 * EFFECT_SEGMENT;
  title("glow-keyed", KEYED_GLOW_SEGMENT, 2, [fixtureEffect("fx1", "glow", { color: CYAN, radius: 40 })], {
    keyframes: { "effects.fx1.intensity": setKey(setKey([], 0, 0), keyed - 1, 1) },
  });
  // The order of a stack matters.
  image("stack", STACK_SEGMENT, [fixtureEffect("fx1", "outline"), fixtureEffect("fx2", "dropShadow", { distance: 30, blur: 10, color: [0, 0, 0, 0.8] })]);
  image("stack-swapped", STACK_SEGMENT + 1, [fixtureEffect("fx2", "dropShadow", { distance: 30, blur: 10, color: [0, 0, 0, 0.8] }), fixtureEffect("fx1", "outline")]);
  // A disabled effect draws nothing.
  image("disabled", DISABLED_SEGMENT, [fixtureEffect("fx1", "gaussianBlur", { radius: 60 }, false), fixtureEffect("fx2", "outline")]);
  // Effects apply in the clip's own space: the shadow turns with the badge.
  image("turned", TURNED_SEGMENT, [fixtureEffect("fx1", "dropShadow", { distance: 30 })], {
    transform: { x: 0, y: 0, scale: 1.5, rotation: 20, anchor: { x: 0.5, y: 0.5 }, flipH: false, flipV: false },
  });
  return project;
}
