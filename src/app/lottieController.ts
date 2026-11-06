// Lottie clip actions (spec §21.23, Batch 79): Loop, and the color replacements of the Lottie section. A new
// replacement starts from a color the animation really uses (read from the animation file), so the user picks
// only the color it becomes.
import type { RGBA } from "../core/document/types.js";
import { collectColors, readLottie, type ColorOverride } from "../media/lottie/lottieFile.js";
import { lottieClips, setColorOverrides, setLottieLoop } from "../timeline/edit/lottie.js";
import { showToast } from "../ui/toasts.js";
import { openMediaFile } from "./previewController.js";
import { actions, documentStore, sessionStore } from "./services.js";

function selectedIds(): string[] {
  const selection = sessionStore.selection.getState();
  return selection.kind === "clips" ? [...selection.clipIds] : [];
}

/** Loop on unless every selected Lottie clip already loops. */
export function toggleLottieLoop(): void {
  const project = documentStore.getState();
  const clips = lottieClips(project, selectedIds());
  const command = setLottieLoop(project, selectedIds(), !clips.every((clip) => clip.loop === true));
  if (command) documentStore.dispatch(command);
}

const same = (a: RGBA, b: RGBA) => Math.round(a.r * 255) === Math.round(b.r * 255) && Math.round(a.g * 255) === Math.round(b.g * 255) && Math.round(a.b * 255) === Math.round(b.b * 255);

/** The colors of the animation a Lottie media holds, that none of `taken` replaces yet. */
export async function animationColors(mediaId: string, taken: readonly ColorOverride[]): Promise<RGBA[]> {
  const file = await openMediaFile(mediaId);
  if (!file) return [];
  const { json } = await readLottie(new Uint8Array(await file.arrayBuffer()));
  return collectColors(json).filter((color) => !taken.some((o) => same(o.from, color)));
}

/** Adds a replacement for the next color of the animation (the primary Lottie clip's); the new color starts as the old one. */
export async function addColorOverride(): Promise<void> {
  const project = documentStore.getState();
  const ids = selectedIds();
  const clips = lottieClips(project, ids);
  const primary = clips[0];
  if (!primary) return;
  const taken = primary.colorOverrides ?? [];
  let colors: RGBA[];
  try {
    colors = await animationColors(primary.mediaId, taken);
  } catch (error) {
    showToast({ message: "Could not read the animation's colors", detail: error instanceof Error ? error.message : String(error), tone: "error" });
    return;
  }
  const next = colors[0];
  if (!next) {
    showToast({ message: "Every color of the animation is replaced already", tone: "info" });
    return;
  }
  const command = setColorOverrides(documentStore.getState(), ids, [...taken, { from: next, to: { ...next } }], "Replace animation color");
  if (command) documentStore.dispatch(command);
}

export function clearColorOverrides(): void {
  const command = setColorOverrides(documentStore.getState(), selectedIds(), [], "Remove color replacements");
  if (command) documentStore.dispatch(command);
}

/** Registers the Lottie actions. Returns a stop function. */
export function installLottieController(): () => void {
  const has = () => lottieClips(documentStore.getState(), selectedIds()).length > 0;
  const stops = [
    actions.register("clip.lottie.loop", toggleLottieLoop, { enabled: has }),
    actions.register("clip.lottie.addColor", () => void addColorOverride(), { enabled: has }),
    actions.register("clip.lottie.clearColors", clearColorOverrides, { enabled: has }),
  ];
  return () => stops.forEach((stop) => stop());
}
