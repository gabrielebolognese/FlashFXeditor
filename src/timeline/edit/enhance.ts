// The Enhance commands (v1.3): the denoise and color correction values core/enhance/solve.ts decided, written
// into the clips' effect stacks in one undo step. Locked clips and clips that take no effects are left out.
import type { Draft } from "immer";
import type { Command } from "../../core/commands/command.js";
import type { Clip, ClipId, Effect, Project } from "../../core/document/types.js";
import { enhancedEffects } from "../../core/enhance/apply.js";
import type { ClipEnhancement } from "../../core/enhance/solve.js";
import { effectClips } from "./effects.js";

export function applyEnhancement(project: Project, plan: readonly ClipEnhancement[], label = "Enhance"): Command | null {
  const targets = new Set(effectClips(project, plan.map((item) => item.clipId as ClipId)).map((clip) => clip.id));
  const edits = plan.filter((item) => targets.has(item.clipId as ClipId) && (item.denoise || item.color));
  if (edits.length === 0) return null;
  const next = edits.map((item) => ({ id: item.clipId as ClipId, effects: enhancedEffects((project.clips[item.clipId as ClipId] as Clip & { effects?: Effect[] }).effects, item) }));
  return {
    id: "clip.enhance",
    label,
    affects: ["clips", "composite"],
    run(draft) {
      for (const { id, effects } of next) (draft.clips[id] as Draft<Clip & { effects?: Effect[] }>).effects = effects;
    },
  };
}
