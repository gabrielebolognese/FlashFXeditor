// Media into the timeline (spec §6.14): insert and overwrite at the playhead (double-click, `,`, `.`,
// the media menu; the playhead then moves to the end, the append workflow), drags released over the
// timeline, drops on the preview canvas (and Add to canvas), and files dropped from the OS (imported,
// then placed: one undo step). Every placement is one command through the §6.8 drop rules, takes the
// items' source ranges (§12) and selects the new clips. Framework-free.
import type { MediaId, MediaItem, Project, SequenceId } from "../core/document/types.js";
import { selectClips, toSnapshot } from "../core/store/selection.js";
import { setSourceRange, type SourceRange } from "../core/store/sessionStore.js";
import { applyMediaDrop, commitPlan, dropLabel, planAtPlayhead, planCanvasDrop, requestItems, stageDrop, type DropItem, type DropPlan, type MediaDropItem, type MediaDropRequest } from "../timeline/edit/dropMedia.js";
import type { MoveMode, MoveResult } from "../timeline/edit/move.js";
import { showToast } from "../ui/toasts.js";
import { isSvgImage } from "../media/mediaKinds.js";
import { filesFromTransfer, importMediaFiles, selectedMedia } from "./mediaController.js";
import { actions, documentStore, sessionStore } from "./services.js";
import { movePlayhead, reportMoveRefusal } from "./timelineController.js";

const newId = () => crypto.randomUUID();

/** The media of `ids` (those still in the project) with their source ranges, in order. */
export function itemsOf(project: Project, ids: readonly MediaId[]): MediaDropItem[] {
  const ranges = sessionStore.state.getState().sourceRanges;
  const items: MediaDropItem[] = [];
  for (const id of ids) {
    const media = project.media[id];
    if (media) items.push({ media, range: ranges[id] ?? null });
  }
  return items;
}

/** The drop item of sequence `id` (an instance of its whole length), or null when it cannot be placed here (missing, or it would contain itself). */
export function compoundItem(project: Project, id: SequenceId): DropItem | null {
  return requestItems(project, { items: [{ compound: { sequenceId: id, name: "", duration: 1 } }] })[0] ?? null;
}

/** Double-click on a Compounds bin card: an instance at the playhead on the first targeted track (the playhead then moves to its end). */
export function placeCompoundAtPlayhead(id: SequenceId, mode: MoveMode = "overwrite"): void {
  const project = documentStore.getState();
  const item = compoundItem(project, id);
  if (!item) {
    showToast({ tone: "warning", message: "Can't add the compound", detail: "A compound cannot contain itself." });
    return;
  }
  const plan = planAtPlayhead(project, [item], sessionStore.state.getState().playhead, newId);
  if (plan.clips.length === 0) return;
  if (commit(commitPlan(project, plan, mode, "Add compound clip", newId), plan)) movePlayhead(plan.end);
}

/** A Compounds bin card dropped on the preview canvas: an instance at the playhead on the topmost free track. */
export function dropCompoundOnCanvas(id: SequenceId, point: { x: number; y: number } | null): void {
  const project = documentStore.getState();
  const item = compoundItem(project, id);
  if (!item) return;
  const plan = planCanvasDrop(project, [item], sessionStore.state.getState().playhead, point, newId);
  if (plan.clips.length > 0) commit(commitPlan(project, plan, "overwrite", "Add compound clip", newId), plan);
}

/**
 * The drop choice for an SVG (spec §21.12): a dropped SVG lands as an image clip, and its toast offers
 * "Make shapes". Set by the shape controller (it imports this module, so the call goes the other way).
 */
let svgDropChoice: ((mediaId: MediaId) => void) | null = null;

export function setSvgDropChoice(choose: ((mediaId: MediaId) => void) | null): void {
  svgDropChoice = choose;
}

/**
 * Dispatches a placement (one undo step), selecting its clips; a refusal gets a toast. True when it landed.
 * `offer`: false when the drop also imported its media (undoing it would remove the media the choice needs)
 * or when it is the shape import's own image fallback (the SVG was just refused as shapes).
 */
function commit(result: MoveResult, plan: DropPlan, offer = true): boolean {
  if (result.kind === "refused") reportMoveRefusal(result.refusal);
  if (result.kind !== "ok") return false;
  documentStore.dispatch(result.command, { selection: toSnapshot(selectClips(plan.clips.map((clip) => clip.id), plan.clips[0]?.id ?? null)) });
  if (offer) offerShapes(plan);
  return true;
}

/** A toast with "Make shapes" for the first SVG image among the dropped clips: one undo, then the shape import. */
function offerShapes(plan: DropPlan): void {
  const choose = svgDropChoice;
  if (!choose) return;
  const project = documentStore.getState();
  const clip = plan.clips.find((candidate) => candidate.kind === "image" && project.media[candidate.mediaId] && isSvgImage(project.media[candidate.mediaId] as MediaItem));
  if (!clip || clip.kind !== "image") return;
  const mediaId = clip.mediaId;
  const label = documentStore.history.getState().undoLabel;
  showToast({
    tone: "info",
    message: `${project.media[mediaId]?.name ?? "SVG"} added as an image`,
    detail: "Make shapes to get editable paths.",
    action: {
      label: "Make shapes",
      run: () => {
        if (documentStore.history.getState().undoLabel === label) documentStore.undo();
        choose(mediaId);
      },
    },
  });
}

function noDuration(items: readonly MediaDropItem[]): void {
  const [first] = items;
  if (first) showToast({ tone: "error", message: items.length === 1 ? `Can't insert ${first.media.name}` : "Can't insert these media", detail: "It has no duration." });
}

/**
 * Insert (`,`, double-click) or overwrite (`.`) at the playhead (spec §6.14): the items back to back from
 * the playhead on the first targeted tracks, then the playhead moves to the end of the last one, so
 * repeated inserts sequence clips.
 */
export function placeAtPlayhead(ids: readonly MediaId[], mode: MoveMode): void {
  const project = documentStore.getState();
  const items = itemsOf(project, ids);
  if (items.length === 0) return;
  const plan = planAtPlayhead(project, items, sessionStore.state.getState().playhead, newId);
  if (plan.clips.length === 0) {
    noDuration(items);
    return;
  }
  const result = commitPlan(project, plan, mode, dropLabel(mode === "insert" ? "Insert" : "Overwrite", items.length), newId);
  if (commit(result, plan)) movePlayhead(plan.end);
}

/** Double-click on a media item (spec §6.14): insert at the playhead with its source range. */
export function insertMediaAtPlayhead(mediaId: MediaId): void {
  placeAtPlayhead([mediaId], "insert");
}

/** A media (or text preset) drag released over the timeline (spec §6.14, P2): the one command of the gesture. */
export function dropMediaOnTimeline(request: MediaDropRequest): void {
  const { result, plan } = applyMediaDrop(documentStore.getState(), request, newId);
  if (plan.clips.length > 0) commit(result, plan);
}

/**
 * Media dropped on the preview canvas, or Add to canvas (spec §6.14): at the playhead on the topmost
 * video track (a new one when it is taken), each picture centered on `point` (project px; null: the
 * frame center). `offer: false`: no "Make shapes" choice for a dropped SVG (the shape import's image fallback).
 */
export function dropMediaOnCanvas(ids: readonly MediaId[], point: { x: number; y: number } | null, options: { offer?: boolean } = {}): void {
  const project = documentStore.getState();
  const items = itemsOf(project, ids);
  if (items.length === 0) return;
  const plan = planCanvasDrop(project, items, sessionStore.state.getState().playhead, point, newId);
  if (plan.clips.length === 0) {
    noDuration(items);
    return;
  }
  commit(commitPlan(project, plan, "overwrite", items.length === 1 ? "Add to canvas" : "Add clips to canvas", newId), plan, options.offer ?? true);
}

/**
 * Files from the OS dropped on the timeline (spec §6.14): imported, then placed back to back where they
 * were dropped, in one undo step with the import ("Drop files"). Refused files get the import's toast;
 * a drop refused on a locked track keeps the imported media.
 */
export function dropFilesOnTimeline(transfer: DataTransfer, request: MediaDropRequest): void {
  void filesFromTransfer(transfer).then((files) =>
    importMediaFiles(files, {
      label: "Drop files",
      place: (added: readonly MediaItem[]) => {
        const project = documentStore.getState();
        const plan = stageDrop(
          project,
          added.map((media) => ({ media, range: null })),
          request.start,
          request.lanes,
          newId,
        );
        if (plan.clips.length > 0) commit(commitPlan(project, plan, request.mode, dropLabel(request.mode === "insert" ? "Insert" : "Add", added.length), newId), plan, false);
      },
    }),
  );
}

/** I / O / Alt+X while hovering a card (spec §12): its source range (session state, not undoable). */
export function setMediaRange(mediaId: MediaId, range: SourceRange | null): void {
  setSourceRange(sessionStore, mediaId, range);
}

/** Registers the media placement actions (the media panel's keys and menu). Returns a stop function. */
export function installDropController(): () => void {
  const stops = [
    actions.register("media.insertAtPlayhead", () => placeAtPlayhead(selectedMedia(), "insert")),
    actions.register("media.overwriteAtPlayhead", () => placeAtPlayhead(selectedMedia(), "overwrite")),
    actions.register("media.addToCanvas", () => dropMediaOnCanvas(selectedMedia(), null)),
  ];
  return () => {
    for (const stop of stops) stop();
  };
}
