// The Enhance commands (v1.3): Enhance (denoise and color correct), Auto denoise and Auto color correct. They
// measure the selected video and image clips (every one of the timeline when none is selected), decide each
// clip's values so the clips end up alike (core/enhance/solve.ts) and write the denoise and color correct
// effects in one undo step. The effects stay editable in the Effects section like any other.
import type { ClipId } from "../core/document/types.js";
import { DEFAULT_PRESET, planEnhancement, type ClipEnhancement, type EnhanceOptions } from "../core/enhance/solve.js";
import { applyEnhancement } from "../timeline/edit/enhance.js";
import { showToast } from "../ui/toasts.js";
import { isEnhanceable, measureClips, type SampleSource } from "./enhanceSampler.js";
import { sourceFile } from "./mediaOffline.js";
import { documentStore, sessionStore } from "./services.js";

/** The clips a run works on: the selected videos and images, or all of them when none is selected. */
export function enhanceTargets(): ClipId[] {
  const project = documentStore.getState();
  const selection = sessionStore.selection.getState();
  const selected = selection.kind === "clips" ? [...selection.clipIds].filter((id) => isEnhanceable(project, project.clips[id])) : [];
  if (selected.length > 0) return selected;
  return (Object.keys(project.clips) as ClipId[]).filter((id) => isEnhanceable(project, project.clips[id])).sort((a, b) => (project.clips[a]?.start ?? 0) - (project.clips[b]?.start ?? 0));
}

let running = false;

/**
 * Measures `ids` and plans their enhancement; nothing is written. `source` gives each media's file (the
 * project's by default). Used by the commands below and by the render page of the CLI.
 */
export async function planFor(ids: readonly ClipId[], options: EnhanceOptions, source: SampleSource = sourceFile, progress?: (done: number, total: number) => void): Promise<{ plan: ClipEnhancement[]; skipped: { clipId: string; reason: string }[] }> {
  const { measured, skipped } = await measureClips(documentStore.getState(), ids, source, progress);
  return { plan: planEnhancement(measured, options), skipped };
}

const LABELS = { both: "Enhance", denoise: "Auto denoise", color: "Auto color correct" } as const;

/** Runs an Enhance command on the targets; resolves true when effects were written. */
export async function enhance(what: keyof typeof LABELS, preset: string = DEFAULT_PRESET): Promise<boolean> {
  if (running) return false;
  const ids = enhanceTargets();
  if (ids.length === 0) {
    showToast({ tone: "info", message: "No video or image clip to enhance" });
    return false;
  }
  running = true;
  try {
    const { plan, skipped } = await planFor(ids, { preset, denoise: what !== "color", color: what !== "denoise" });
    // The clips may have changed while they were measured: the command leaves out what is gone or locked.
    const command = applyEnhancement(documentStore.getState(), plan, LABELS[what]);
    if (!command) {
      showToast({ tone: "warning", message: "Nothing could be enhanced", ...(skipped[0] && { detail: skipped[0].reason }) });
      return false;
    }
    documentStore.dispatch(command);
    showToast({ tone: "success", message: `${LABELS[what]}: ${plan.length} ${plan.length === 1 ? "clip" : "clips"}`, ...(skipped.length > 0 && { detail: `${skipped.length} skipped: ${skipped[0]?.reason}` }) });
    return true;
  } catch (error) {
    showToast({ tone: "warning", message: "Enhance failed", detail: error instanceof Error ? error.message : String(error) });
    return false;
  } finally {
    running = false;
  }
}
