// Media into the timeline (spec §6.14): insert and overwrite at the playhead (double-click, `,`, `.`,
// the media menu; the playhead then moves to the end, the append workflow), drags released over the
// timeline, drops on the preview canvas (and Add to canvas), and files dropped from the OS (imported,
// then placed: one undo step). Every placement is one command through the §6.8 drop rules, takes the
// items' source ranges (§12) and selects the new clips. Framework-free.
import type { MediaId, MediaItem, Project } from "../core/document/types.js";
import { selectClips, toSnapshot } from "../core/store/selection.js";
import { setSourceRange, type SourceRange } from "../core/store/sessionStore.js";
import { applyMediaDrop, commitPlan, dropLabel, planAtPlayhead, planCanvasDrop, stageDrop, type DropItem, type DropPlan, type MediaDropRequest } from "../timeline/edit/dropMedia.js";
import type { MoveMode, MoveResult } from "../timeline/edit/move.js";
import { showToast } from "../ui/toasts.js";
import { filesFromTransfer, importMediaFiles, selectedMedia } from "./mediaController.js";
import { actions, documentStore, sessionStore } from "./services.js";
import { movePlayhead, reportMoveRefusal } from "./timelineController.js";

const newId = () => crypto.randomUUID();

/** The media of `ids` (those still in the project) with their source ranges, in order. */
function itemsOf(project: Project, ids: readonly MediaId[]): DropItem[] {
  const ranges = sessionStore.state.getState().sourceRanges;
  const items: DropItem[] = [];
  for (const id of ids) {
    const media = project.media[id];
    if (media) items.push({ media, range: ranges[id] ?? null });
  }
  return items;
}

/** Dispatches a placement (one undo step), selecting its clips; a refusal gets a toast. True when it landed. */
function commit(result: MoveResult, plan: DropPlan): boolean {
  if (result.kind === "refused") reportMoveRefusal(result.refusal);
  if (result.kind !== "ok") return false;
  documentStore.dispatch(result.command, { selection: toSnapshot(selectClips(plan.clips.map((clip) => clip.id), plan.clips[0]?.id ?? null)) });
  return true;
}

function noDuration(items: readonly DropItem[]): void {
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

/** A media drag released over the timeline (spec §6.14, P2): the one command of the gesture. */
export function dropMediaOnTimeline(request: MediaDropRequest): void {
  const { result, plan } = applyMediaDrop(documentStore.getState(), request, newId);
  if (plan.clips.length > 0) commit(result, plan);
}

/**
 * Media dropped on the preview canvas, or Add to canvas (spec §6.14): at the playhead on the topmost
 * video track (a new one when it is taken), each picture centered on `point` (project px; null: the
 * frame center).
 */
export function dropMediaOnCanvas(ids: readonly MediaId[], point: { x: number; y: number } | null): void {
  const project = documentStore.getState();
  const items = itemsOf(project, ids);
  if (items.length === 0) return;
  const plan = planCanvasDrop(project, items, sessionStore.state.getState().playhead, point, newId);
  if (plan.clips.length === 0) {
    noDuration(items);
    return;
  }
  commit(commitPlan(project, plan, "overwrite", items.length === 1 ? "Add to canvas" : "Add clips to canvas", newId), plan);
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
        if (plan.clips.length > 0) commit(commitPlan(project, plan, request.mode, dropLabel(request.mode === "insert" ? "Insert" : "Add", added.length), newId), plan);
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
