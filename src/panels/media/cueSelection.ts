// Several cues selected in the cue list (spec §20.3 "Shift and Ctrl click select several cues"). Pure.
// - Ctrl (Cmd on macOS) click toggles the cue; the other selected cues stay (clips that are not cues
//   leave the selection: the list selects cues).
// - Shift click selects the cues shown from the anchor (the primary selected cue) to the clicked one,
//   in list order; the anchor stays the primary, so the next Shift click extends from it again.
import type { ClipId } from "../../core/document/types.js";
import { clickSelection, selectClips, type Selection } from "../../core/store/selection.js";

export type CueClick = "toggle" | "range";

/** The selection a modified click on cue `cueId` makes, `order` being the cues the list shows. */
export function cueClickSelection(selection: Selection, cueId: ClipId, click: CueClick, order: readonly ClipId[]): Selection {
  const shown = new Set(order);
  const cues = selection.kind === "clips" ? [...selection.clipIds].filter((id) => shown.has(id)) : [];
  const base = selectClips(cues, selection.primary);
  if (click === "toggle") return clickSelection(base, cueId, "mod");
  const anchor = base.kind === "clips" && base.primary !== null ? base.primary : cueId;
  const from = order.indexOf(anchor);
  const to = order.indexOf(cueId);
  if (from === -1 || to === -1) return selectClips([cueId], cueId);
  return selectClips(order.slice(Math.min(from, to), Math.max(from, to) + 1), anchor);
}
