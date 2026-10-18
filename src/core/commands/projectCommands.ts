// Project settings commands (spec §11 Project section). Undoable like any other document change.
import { current, produce, type Draft } from "immer";
import { convertProjectFrames, sameFrameRate, type ConversionReport } from "../document/fpsConvert.js";
import { mapKeyValues } from "../document/keyframes.js";
import type { Clip, Keyframes, Project, Rational, RGBA, Transform } from "../document/types.js";
import type { Command } from "./command.js";

export const MAX_PROJECT_NAME = 120;
/** Encoders need even dimensions; 16..7680 covers phone formats up to 8K landscape. */
export const MIN_DIMENSION = 16;
export const MAX_DIMENSION = 7680;

/** Rounds to an even integer inside the supported range. */
export function clampDimension(value: number): number {
  const even = Math.round(value / 2) * 2;
  return Math.min(MAX_DIMENSION, Math.max(MIN_DIMENSION, even));
}

/** Trimmed, collapsed to one line and capped; empty names become null (rejected). */
export function cleanProjectName(name: string): string | null {
  const clean = name.replace(/\s+/g, " ").trim().slice(0, MAX_PROJECT_NAME);
  return clean === "" ? null : clean;
}

export function renameProject(name: string): Command {
  const clean = cleanProjectName(name);
  return {
    id: "project.rename",
    label: "Rename project",
    affects: ["settings"],
    run(draft) {
      if (clean !== null) draft.name = clean;
    },
  };
}

/** Clips with a transform the compositor draws (video, image, solid, text): what "Scale layout" scales. */
function hasLayout(clip: Clip): clip is Extract<Clip, { transform: Transform }> {
  return clip.kind === "video" || clip.kind === "image" || clip.kind === "solid" || clip.kind === "text";
}

/**
 * The layout scaled from one frame size to another (spec §15 "Scale layout": transforms scaled
 * proportionally): positions per axis, scale by the smaller ratio, so a layer that fits the old frame
 * fits the new one the same way (a same-aspect change scales everything exactly).
 */
export function scaledTransform(transform: Transform, from: { width: number; height: number }, to: { width: number; height: number }): Transform {
  const kx = to.width / from.width;
  const ky = to.height / from.height;
  const k = Math.min(kx, ky);
  const next: Transform = { ...transform, anchor: { ...transform.anchor }, x: transform.x * kx, y: transform.y * ky, scale: transform.scale * k };
  if (transform.scaleY !== undefined) next.scaleY = transform.scaleY * k;
  return next;
}

/**
 * New frame size, even and in range. With `scaleLayout` the clips' transforms follow the frame
 * (`scaledTransform`; locked tracks too: the frame changes under them), their position and scale keys
 * too (Batch 35), else they are kept ("Keep" of §15: every layer keeps its pixel size and its offset
 * from the frame center). The app asks which (app/conversionController.ts).
 */
export function setResolution(width: number, height: number, options: { scaleLayout?: boolean } = {}): Command {
  const w = clampDimension(width);
  const h = clampDimension(height);
  return {
    id: "project.setResolution",
    label: "Change resolution",
    affects: options.scaleLayout ? ["settings", "composite"] : ["settings"],
    run(draft) {
      const from = { width: draft.settings.width, height: draft.settings.height };
      draft.settings.width = w;
      draft.settings.height = h;
      if (!options.scaleLayout || (from.width === w && from.height === h)) return;
      for (const clip of Object.values(draft.clips)) {
        if (!hasLayout(clip)) continue;
        clip.transform = scaledTransform(clip.transform, from, { width: w, height: h });
        if ("keyframes" in clip && clip.keyframes) {
          const kx = w / from.width;
          const ky = h / from.height;
          const k = Math.min(kx, ky);
          clip.keyframes = mapKeyValues(current(clip.keyframes) as Keyframes, { "transform.x": (x) => x * kx, "transform.y": (y) => y * ky, "transform.scale": (s) => s * k, "transform.scaleY": (s) => s * k }) as Draft<Keyframes>;
        }
      }
    },
  };
}

/** The timeline has nothing to convert: no clips and no markers. O(1): no key listing. */
export function canChangeFrameRate(project: Project): boolean {
  for (const id in project.clips) if (Object.hasOwn(project.clips, id)) return false;
  return project.markers.length === 0;
}

/**
 * A new frame rate (spec §15): every frame value of the document converted by the rational ratio,
 * rounded to the nearest frame (`core/document/fpsConvert.ts`), in one undo step. `frameRateReport`
 * tells beforehand what a conversion would round.
 */
export function setFrameRate(fps: Rational): Command {
  if (!(Number.isInteger(fps.num) && Number.isInteger(fps.den) && fps.num > 0 && fps.den > 0)) {
    throw new Error(`project.setFrameRate: invalid frame rate ${fps.num}/${fps.den}`);
  }
  return {
    id: "project.setFrameRate",
    label: "Change frame rate",
    affects: ["settings", "timeline", "clips", "markers", "captions", "text", "audio", "composite"],
    run(draft) {
      if (sameFrameRate(draft.settings.fps, fps)) {
        draft.settings.fps = { num: fps.num, den: fps.den };
        return;
      }
      convertProjectFrames(draft, fps);
    },
  };
}

/** What converting `project` to `fps` would round (nothing for a lossless ratio or an empty timeline). */
export function frameRateReport(project: Project, fps: Rational): ConversionReport {
  let report: ConversionReport = { rounded: 0, merged: 0, shifted: 0 };
  if (canChangeFrameRate(project) || sameFrameRate(project.settings.fps, fps)) return report;
  produce(project, (draft) => {
    report = convertProjectFrames(draft, fps);
  });
  return report;
}

export function setBackground(color: RGBA): Command {
  return {
    id: "project.setBackground",
    label: "Change background color",
    affects: ["settings"],
    run(draft) {
      draft.settings.background = { r: color.r, g: color.g, b: color.b, a: color.a };
    },
  };
}
