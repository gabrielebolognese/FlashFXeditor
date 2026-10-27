// Text animations in the app (spec §10.4, §11 Animation section): a chip sets the in or out animation
// of the selected text clips (one undo step), then previews it; the preview plays the clip's start for
// the in animation plus PREVIEW_TAIL_FRAMES (the out animation: from PREVIEW_TAIL_FRAMES before it to
// the clip's end), then puts the playhead back where it was. Inline editing commits first (an edited
// text shows at rest).
import type { ClipId, TextAnimId } from "../core/document/types.js";
import { animLength, newTextAnim, TEXT_ANIMS } from "../text/anim.js";
import { animEdits, setTextAnims, type AnimSide } from "../timeline/edit/textAnim.js";
import { playbackEngine, textEditor } from "./previewController.js";
import { documentStore, sessionStore } from "./services.js";

/** Frames played after an in animation (before an out one) by its preview (spec §10.4 "plus 10 frames"). */
export const PREVIEW_TAIL_FRAMES = 10;

export const SIDE_NAMES: Record<AnimSide, string> = { animIn: "in", animOut: "out" };

/**
 * A chip of the Animation section: `id` as the `side` animation of the text clips among `ids` (null:
 * none), keeping each clip's duration, stagger and ease; then the preview on `primary` (or the first
 * text clip). Choosing a clip's own animation again only previews it.
 */
export function chooseTextAnim(ids: readonly ClipId[], side: AnimSide, id: TextAnimId | null, primary: ClipId | null): void {
  const project = documentStore.getState();
  const fps = project.settings.fps;
  const edits = animEdits(project, ids, side, (current) => {
    if (id === null) return current ? null : undefined;
    return current?.id === id ? undefined : newTextAnim(id, fps, current);
  });
  const command = setTextAnims(project, edits, { label: id === null ? `Remove ${SIDE_NAMES[side]} animation` : `${side === "animIn" ? "In" : "Out"} animation: ${TEXT_ANIMS[id].label}` });
  if (command) documentStore.dispatch(command);
  if (id === null) return;
  const target = primary !== null && ids.includes(primary) && documentStore.getState().clips[primary]?.kind === "text" ? primary : ids.find((clipId) => documentStore.getState().clips[clipId]?.kind === "text");
  if (target !== undefined) previewTextAnim(target, side);
}

/** Plays clip `clipId`'s `side` animation once (spec §10.4 "clicking a chip previews it"); false when it has none. */
export function previewTextAnim(clipId: ClipId, side: AnimSide): boolean {
  const clip = documentStore.getState().clips[clipId];
  if (clip?.kind !== "text") return false;
  const length = animLength(clip[side], clip.duration);
  if (length <= 0) return false;
  textEditor.end(true);
  const end = clip.start + clip.duration;
  const from = side === "animIn" ? clip.start : Math.max(clip.start, end - length - PREVIEW_TAIL_FRAMES);
  const to = side === "animIn" ? Math.min(end, clip.start + length + PREVIEW_TAIL_FRAMES) : end;
  const playhead = sessionStore.state.getState().playhead;
  playbackEngine.playRange(from, to, playhead);
  return true;
}
