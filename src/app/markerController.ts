// Markers and the in/out range (spec §6.3, §6.11, §6.13, §6.16). Markers are document (undoable): `M`
// adds one at the playhead (on a marker already there it opens that marker's inline editor, as a second
// M does in Premiere); the timeline drags them, the inline editor, the properties panel and the ruler
// menu edit and delete them; Delete removes the selected one. The in/out range is session state (not
// undoable): `I`, `O`, `Alt+I/O`, `Alt+X`, `X` (mark the clip under the playhead), the handle drags in
// the ruler, Set in/out to selection. Lift (`;`) and Extract (`'`) remove the marked range on the
// targeted tracks, each one undo step (a transaction); then the range is cleared and the playhead goes to
// where it started. Go to in/out (Shift+I/O) are in timelineController with the other playhead jumps.
import type { CommandRun } from "../core/commands/CommandRegistry.js";
import { addMarker, MAX_MARKER_LABEL, removeMarker, updateMarker, type MarkerPatch } from "../core/commands/markerCommands.js";
import type { Frame, LabelColor, Marker } from "../core/document/types.js";
import { createStore } from "../core/store/createStore.js";
import { filterSelection, fromSnapshot, toSnapshot } from "../core/store/selection.js";
import { selectMarker, setInOut, setPlayhead, setSelection } from "../core/store/sessionStore.js";
import { closeExtracted, liftRange, rangeTracks } from "../timeline/edit/liftExtract.js";
import type { GapLimit } from "../timeline/edit/gaps.js";
import { clipToMark, markedRange, markIn, markOut, selectionSpan } from "../timeline/model/inOut.js";
import { contentEnd } from "../timeline/model/queries.js";
import { showToast } from "../ui/toasts.js";
import { actions, documentStore, focusScopes, sessionStore } from "./services.js";

/** New markers' color (Premiere's default marker color). */
export const DEFAULT_MARKER_COLOR: LabelColor = "green";

const newId = () => crypto.randomUUID();
const playhead = () => sessionStore.state.getState().playhead;
const findMarker = (markerId: string): Marker | undefined => documentStore.getState().markers.find((marker) => marker.id === markerId);

// --- Markers -------------------------------------------------------------------------------------

/** The marker whose inline editor is open over the ruler (spec §6.13), or null. React renders the popover from it. */
export const markerEditor = createStore<string | null>(null);

/** Adds a marker at `frame` (one undo step) and returns its id; on a frame that has one, adds none and returns that one's. */
export function addMarkerAt(frame: Frame): string {
  const at = Math.max(0, Math.round(frame));
  const existing = documentStore.getState().markers.find((marker) => marker.frame === at);
  if (existing) return existing.id;
  const id = newId();
  documentStore.dispatch(addMarker({ id, frame: at, color: DEFAULT_MARKER_COLOR, label: "" }));
  return id;
}

/** `M` (spec §6.13): a marker at the playhead; on a marker already there, its inline editor. */
const addMarkerAction: CommandRun = () => {
  const frame = playhead();
  const existing = documentStore.getState().markers.find((marker) => marker.frame === frame);
  if (existing) openMarkerEditor(existing.id);
  else addMarkerAt(frame);
};

/** Opens a marker's inline editor (double-click, `M` on it, the ruler menu's Edit marker); the marker is selected. */
export function openMarkerEditor(markerId: string): void {
  if (!findMarker(markerId)) return;
  selectMarker(sessionStore, markerId);
  markerEditor.set(markerId);
}

/** The inline editor closed: the keyboard goes back to the timeline (the popover owned it as a dialog). */
export function closeMarkerEditor(): void {
  if (markerEditor.getState() === null) return;
  markerEditor.set(null);
  focusScopes.set("timeline");
}

/** A marker drag ended, or the properties panel's time field (one undo step). */
export function moveMarker(markerId: string, frame: Frame): void {
  const marker = findMarker(markerId);
  const at = Math.max(0, Math.round(frame));
  if (marker && marker.frame !== at) documentStore.dispatch(updateMarker(markerId, { frame: at }));
}

/** Label and color edits (inline editor, properties panel): one undo step when something changes; labels are trimmed to one line. */
export function setMarkerFields(markerId: string, patch: Pick<MarkerPatch, "label" | "color">): void {
  const marker = findMarker(markerId);
  if (!marker) return;
  const next: MarkerPatch = {};
  if (patch.label !== undefined) {
    const label = patch.label.replace(/\s+/g, " ").trim().slice(0, MAX_MARKER_LABEL);
    if (label !== marker.label) next.label = label;
  }
  if (patch.color !== undefined && patch.color !== marker.color) next.color = patch.color;
  if (Object.keys(next).length > 0) documentStore.dispatch(updateMarker(markerId, next));
}

/** Deletes a marker (one undo step). */
export function deleteMarker(markerId: string): void {
  if (!findMarker(markerId)) return;
  documentStore.dispatch(removeMarker(markerId));
}

/** `Delete` with a marker selected (spec §6.3): deletes it. False when no marker is selected. */
export function deleteSelectedMarker(): boolean {
  const markerId = sessionStore.marker.getState();
  if (markerId === null) return false;
  deleteMarker(markerId);
  return true;
}

// --- In/out --------------------------------------------------------------------------------------

function setRange(range: { inPoint: Frame | null; outPoint: Frame | null }): void {
  setInOut(sessionStore, range.inPoint, range.outPoint);
}

/** `X` (spec §6.13): the range becomes the bounds of the clip under the playhead (a selected one first, then targeted tracks). */
const markClip: CommandRun = () => {
  const selection = sessionStore.selection.getState();
  const clip = clipToMark(documentStore.getState(), playhead(), selection.kind === "clips" ? selection.clipIds : undefined, selection.kind === "clips" ? selection.primary : null);
  if (!clip) {
    showToast({ tone: "info", message: "No clip under the playhead", detail: "X marks the clip under the playhead: move the playhead onto a clip first." });
    return;
  }
  setRange({ inPoint: clip.start, outPoint: clip.start + clip.duration });
};

/** Ruler menu Set in/out to selection (spec §6.16): the selected clips, gap or edit point. */
const rangeToSelection: CommandRun = () => {
  const span = selectionSpan(documentStore.getState(), sessionStore.selection.getState(), sessionStore.gap.getState(), sessionStore.editPoint.getState());
  if (span) setRange({ inPoint: span.start, outPoint: span.end });
};

// --- Lift and Extract ----------------------------------------------------------------------------

/** A ripple that stopped short (spec §6.11: "a toast explains"), as for ripple deletes. */
function reportExtractLimit(limit: GapLimit, none: boolean): void {
  const project = documentStore.getState();
  const clip = project.clips[limit.clipId]?.name ?? "A clip";
  const track = project.tracks.find((candidate) => candidate.id === limit.trackId)?.name ?? "another track";
  showToast({ tone: "info", message: none ? "Extracted without closing the gap" : "Extract closed the gap partly", detail: `${clip} on ${track} can't move further left without overlapping.` });
}

/**
 * `;` Lift and `'` Extract (spec §6.11): the marked range ([in, out), the in point defaulting to 0 and
 * the out point to the content end) on the targeted, unlocked tracks, as one undo step. Afterwards the
 * range is cleared and the playhead stands where it started; removed clips leave the selection.
 */
function liftOrExtract(extract: boolean): CommandRun {
  return () => {
    const project = documentStore.getState();
    const range = markedRange(sessionStore.state.getState(), contentEnd(project));
    const name = extract ? "Extract" : "Lift";
    if (!range) {
      showToast({ tone: "info", message: "Set an in or out point first", detail: `${name} removes the range between the in point (I) and the out point (O).` });
      return;
    }
    const tracks = rangeTracks(project);
    if (tracks.length === 0) {
      showToast({ tone: "info", message: "No targeted track", detail: `${name} acts on targeted, unlocked tracks: turn on a track's target toggle.` });
      return;
    }
    const before = documentStore.getState();
    const limit = documentStore.transaction(name, () => {
      const lift = liftRange(documentStore.getState(), range, newId, tracks);
      if (lift) documentStore.dispatch(lift);
      if (!extract) return null;
      const close = closeExtracted(documentStore.getState(), range, tracks);
      if (close.command) documentStore.dispatch(close.command);
      return close.limit ? { limit: close.limit, none: close.closed.every((frames) => frames === 0) } : null;
    });
    if (limit) reportExtractLimit(limit.limit, limit.none);
    if (documentStore.getState() === before) return;
    const after = documentStore.getState();
    setSelection(sessionStore, fromSnapshot(filterSelection(toSnapshot(sessionStore.selection.getState()), (id) => Object.hasOwn(after.clips, id))));
    setRange({ inPoint: null, outPoint: null });
    setPlayhead(sessionStore, range.start);
  };
}

/** Registers the marker, range, lift and extract actions. Returns a stop function. */
export function installMarkerController(): () => void {
  const stops = [
    actions.register("marker.add", addMarkerAction),
    // The ruler menu's Add marker: at the frame right-clicked (its argument), else at the playhead.
    actions.register("marker.addHere", (_context, frame) => void addMarkerAt(frame !== undefined && Number.isFinite(Number(frame)) ? Number(frame) : playhead())),
    // The ruler menu acts on the marker it selected.
    actions.register(
      "marker.edit",
      () => {
        const markerId = sessionStore.marker.getState();
        if (markerId !== null) openMarkerEditor(markerId);
      },
      { enabled: () => sessionStore.marker.getState() !== null },
    ),
    actions.register("marker.delete", () => void deleteSelectedMarker(), { enabled: () => sessionStore.marker.getState() !== null }),
    actions.register("range.markIn", () => setRange(markIn(sessionStore.state.getState(), playhead()))),
    actions.register("range.markOut", () => setRange(markOut(sessionStore.state.getState(), playhead()))),
    actions.register("range.clearIn", () => setRange({ ...sessionStore.state.getState(), inPoint: null })),
    actions.register("range.clearOut", () => setRange({ ...sessionStore.state.getState(), outPoint: null })),
    actions.register("range.clearInOut", () => setRange({ inPoint: null, outPoint: null })),
    actions.register("range.markClip", markClip),
    actions.register("range.toSelection", rangeToSelection),
    actions.register("edit.lift", liftOrExtract(false)),
    actions.register("edit.extract", liftOrExtract(true)),
    // A selected marker or an open editor whose marker is gone (undo, a project change) lets go of it.
    documentStore.subscribe(
      (state) => {
        const exists = (markerId: string | null) => markerId !== null && state.markers.some((marker) => marker.id === markerId);
        const selected = sessionStore.marker.getState();
        if (selected !== null && !exists(selected)) selectMarker(sessionStore, null);
        const editing = markerEditor.getState();
        if (editing !== null && !exists(editing)) closeMarkerEditor();
      },
      { affects: ["markers"] },
    ),
  ];
  return () => {
    for (const stop of stops) stop();
    markerEditor.set(null);
  };
}
