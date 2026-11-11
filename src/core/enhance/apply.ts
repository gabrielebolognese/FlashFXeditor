// Writing an enhancement into a clip's effect stack (v1.3), shared by the editor's command
// (timeline/edit/enhance.ts) and the CLI (scripts/cli/enhance.ts). The clip's first denoise and first color
// correct effects are updated (and switched on); a missing one is added at the head of the stack, the denoise
// first, so the correction and every later effect work on the clean picture. Other effects are kept. Pure.
import type { Effect } from "../document/types.js";
import { newEffect } from "../effects/effectParams.js";
import type { ClipEnhancement } from "./solve.js";

/** An effect id not used by `effects` (`fx1`, `fx2`, ...), as timeline/edit/effects.ts names them. */
function freeId(effects: readonly Effect[]): string {
  const used = new Set(effects.map((e) => e.id));
  let n = 1;
  while (used.has(`fx${n}`)) n += 1;
  return `fx${n}`;
}

function upsert(effects: Effect[], type: "denoise" | "colorCorrect", values: object, at: number): number {
  const index = effects.findIndex((effect) => effect.type === type);
  if (index >= 0) {
    const old = effects[index] as Effect;
    effects[index] = { ...old, enabled: true, params: { ...old.params, ...(values as Effect["params"]) } };
    return index;
  }
  const effect = newEffect(type, freeId(effects));
  effect.params = { ...effect.params, ...(values as Effect["params"]) };
  effects.splice(at, 0, effect);
  return at;
}

/** `effects` (a clip's stack, or undefined) with `enhancement` written in; a new list. */
export function enhancedEffects(effects: readonly Effect[] | undefined, enhancement: Pick<ClipEnhancement, "denoise" | "color">): Effect[] {
  const out = (effects ?? []).map((effect) => ({ ...effect, params: { ...effect.params } }));
  let head = 0;
  if (enhancement.denoise) head = upsert(out, "denoise", enhancement.denoise, 0) + 1;
  if (enhancement.color) {
    const denoise = out.findIndex((effect) => effect.type === "denoise");
    upsert(out, "colorCorrect", enhancement.color, enhancement.denoise ? head : denoise + 1);
  }
  return out;
}
