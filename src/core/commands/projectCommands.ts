// Project settings commands (spec §11 Project section). Undoable like any other document change.
import type { Project, Rational, RGBA } from "../document/types.js";
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

/** "Keep" mode: transforms are not scaled. TODO(batch 42): offer "Scale layout". */
export function setResolution(width: number, height: number): Command {
  const w = clampDimension(width);
  const h = clampDimension(height);
  return {
    id: "project.setResolution",
    label: "Change resolution",
    affects: ["settings"],
    run(draft) {
      draft.settings.width = w;
      draft.settings.height = h;
    },
  };
}

/** Frame values would need converting once anything sits on the timeline. O(1): no key listing. */
export function canChangeFrameRate(project: Project): boolean {
  for (const id in project.clips) if (Object.hasOwn(project.clips, id)) return false;
  return project.markers.length === 0;
}

/** Only for a project without clips or markers. TODO(batch 42): fps conversion of frame values. */
export function setFrameRate(fps: Rational): Command {
  if (!(Number.isInteger(fps.num) && Number.isInteger(fps.den) && fps.num > 0 && fps.den > 0)) {
    throw new Error(`project.setFrameRate: invalid frame rate ${fps.num}/${fps.den}`);
  }
  return {
    id: "project.setFrameRate",
    label: "Change frame rate",
    affects: ["settings", "timeline"],
    run(draft) {
      if (!canChangeFrameRate(draft)) throw new Error("project.setFrameRate: the project has clips or markers; frame values would need converting");
      draft.settings.fps = { num: fps.num, den: fps.den };
    },
  };
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
