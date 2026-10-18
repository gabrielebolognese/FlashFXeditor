// Fades and transitions (spec §6.15, §6.16, §11, §17; Batch 36), registered in the CommandRegistry (the
// command palette lists them from Batch 40): `Mod+Shift+D` (the default transition at the selected
// edit point, or at the cut nearest the playhead on the targeted tracks), the quick row's Fade in /
// Fade out (the selected clips and their linked audio) and transition chips, the clip menu's fade
// presets and Add transition rows, and the timeline's fade handle and transition block drags. Each edit
// is one command built by timeline/edit/fades.ts or timeline/edit/transitions.ts.
// - Where a transition chip (or a menu row) applies: the selected edit point, else the selected
//   transition (its kind changes), else the primary selected clip's cut nearest the playhead, else
//   the default transition's cut. A chip dragged onto the timeline applies at the cut under the pointer
//   (`pressTransitionChip`: a press past the dead zone becomes a drag with a floating chip; the
//   timeline lights the cut it would land on).
// - A new transition is selected (the properties panel shows its section); one made with repeated
//   edge frames (no handles) says so in a toast.
// - Linked selection on: the linked audio gets its crossfade with the picture's transition, and edits
//   of a transition (its ends, its section) follow on it.
import { TRANSITION_LABELS } from "../core/document/transitions.js";
import { editDefaults } from "../timeline/edit/editDefaults.js";
import { TRANSITION_KINDS, type ClipId, type Frame, type TransitionKind } from "../core/document/types.js";
import { selectTransition, type TransitionSelection } from "../core/store/sessionStore.js";
import { dragFade, FADE_PRESET_SECONDS, presetFade, quickFade, type FadeEdge } from "../timeline/edit/fades.js";
import { addTransition, clipCut, defaultTransitionCut, removeTransitions, transitionAt, updateTransition, type Cut } from "../timeline/edit/transitions.js";
import { showToast } from "../ui/toasts.js";
import { revealSection } from "./captionController.js";
import styles from "./MediaGestures.module.css";
import { fadePresetId } from "./commandCatalog.js";
import { actions, documentStore, sessionStore, themeBridge } from "./services.js";
import { timelineView } from "./timelineController.js";

const newId = () => crypto.randomUUID();
const playhead = () => sessionStore.state.getState().playhead;
const linked = () => sessionStore.state.getState().linkedSelection;

/** Menu preset ids: `clip.fadeIn.25` (0.25 s), `.50`, `.100`. */
// Fade preset ids (`clip.fadeIn.25`) are named by the command catalog.
export { fadePresetId };

function selectedIds(): ClipId[] {
  const selection = sessionStore.selection.getState();
  return selection.kind === "clips" ? [...selection.clipIds] : [];
}

/** The cut a transition chip or menu row applies to (see the header), or null. */
export function chipCut(): Cut | null {
  const project = documentStore.getState();
  const point = sessionStore.editPoint.getState();
  if (point) return { left: point.left, right: point.right };
  const transition = sessionStore.transition.getState();
  if (transition) return transition;
  const selection = sessionStore.selection.getState();
  const primary = selection.kind === "clips" ? (selection.primary ?? [...selection.clipIds][0]) : undefined;
  if (primary !== undefined) return clipCut(project, primary, playhead());
  return defaultTransitionCut(project, null, playhead());
}

/** Adds (or turns into) a `kind` transition at `cut`: one command; the transition is selected. False when the cut takes none. */
export function applyTransition(cut: Cut, kind: TransitionKind): boolean {
  const result = addTransition(documentStore.getState(), cut, kind, { linked: linked(), newId });
  if (!result) {
    showToast({ tone: "info", message: "No cut to add a transition to", detail: "Transitions go between two clips that touch on one track." });
    return false;
  }
  documentStore.dispatch(result.command);
  selectTransition(sessionStore, result.cut);
  if (result.repeated) showToast({ tone: "warning", message: "Not enough media for the transition", detail: "The clips have no frames beyond the cut: their edge frames repeat (striped on the timeline)." });
  return true;
}

function addAtChipCut(kind: TransitionKind): void {
  const cut = chipCut();
  if (cut) applyTransition(cut, kind);
  else showToast({ tone: "info", message: "No cut to add a transition to", detail: "Select an edit point, or a clip that touches another one." });
}

/** `Mod+Shift+D` (spec §6.15): the default transition at the selected edit point or the nearest cut. */
function defaultTransition(): void {
  const point = sessionStore.editPoint.getState();
  const cut = defaultTransitionCut(documentStore.getState(), point ? { left: point.left, right: point.right } : null, playhead());
  if (!cut) {
    showToast({ tone: "info", message: "No cut to add a transition to", detail: "Transitions go between two clips that touch on a targeted track." });
    return;
  }
  applyTransition(cut, editDefaults().transitionKind);
}

/** A fade handle drag's release (the view): one command. */
export function setFade(clipId: ClipId, edge: FadeEdge, frames: Frame): void {
  const command = dragFade(documentStore.getState(), clipId, edge, frames);
  if (command) documentStore.dispatch(command);
}

/** A transition block end drag's release (the view), and its linked crossfade with Linked selection on: one command. */
export function setTransitionSides(cut: Cut, before: Frame, after: Frame): void {
  const command = updateTransition(documentStore.getState(), cut, { before, after }, { linked: linked() });
  if (command) documentStore.dispatch(command);
}

/** A double-click on a block: its Transition section, scrolled to. */
export function openTransition(cut: Cut): void {
  selectTransition(sessionStore, cut);
  revealSection.set("transition");
}

/** Delete with a transition selected removes it (and its linked crossfade): true when it did. */
export function deleteSelectedTransition(): boolean {
  const selected = sessionStore.transition.getState();
  if (!selected) return false;
  const command = removeTransitions(documentStore.getState(), [selected], { linked: linked() });
  selectTransition(sessionStore, null);
  if (command) documentStore.dispatch(command);
  return true;
}

function quick(edge: FadeEdge): void {
  const command = quickFade(documentStore.getState(), selectedIds(), edge);
  if (command) documentStore.dispatch(command);
}

function preset(edge: FadeEdge, seconds: number): void {
  const command = presetFade(documentStore.getState(), selectedIds(), edge, seconds);
  if (command) documentStore.dispatch(command);
}

// --- Dragging a chip onto a cut ----------------------------------------------------------------

/** A chip press that becomes a drag past the dead zone (spec §6.8: 4 px). */
interface ChipDrag {
  kind: TransitionKind;
  pointerId: number;
  x: number;
  y: number;
  dragging: boolean;
  chip: HTMLElement | null;
  timeline: DOMRect | null;
}

let chipDrag: ChipDrag | null = null;
/** A drag just ended on the chip: its click does nothing. */
let swallowClick = false;

/** True once after a chip drag (the button's click that follows the release is not an apply). */
export function takeChipClick(): boolean {
  const swallowed = swallowClick;
  swallowClick = false;
  return swallowed;
}

/** A pointer press on a transition chip (`element`, the quick row): a drag onto a cut past the dead zone, else the click applies as usual. */
export function pressTransitionChip(event: Pick<PointerEvent, "button" | "pointerId" | "clientX" | "clientY">, kind: TransitionKind, element: HTMLElement): void {
  if (event.button !== 0 || chipDrag) return;
  const doc = element.ownerDocument;
  const win = doc.defaultView ?? window;
  chipDrag = { kind, pointerId: event.pointerId, x: event.clientX, y: event.clientY, dragging: false, chip: null, timeline: null };
  // Spec §6.8's dead zone.
  const threshold = 4;
  const move = (moved: PointerEvent) => {
    const drag = chipDrag;
    if (!drag || moved.pointerId !== drag.pointerId) return;
    if (!drag.dragging) {
      if (Math.hypot(moved.clientX - drag.x, moved.clientY - drag.y) <= threshold) return;
      drag.dragging = true;
      drag.timeline = timelineView.element?.getBoundingClientRect() ?? null;
      const chip = doc.createElement("div");
      chip.className = styles.chip ?? "";
      chip.textContent = TRANSITION_LABELS[kind];
      doc.body.append(chip);
      drag.chip = chip;
    }
    const rect = drag.timeline;
    const over = rect && moved.clientX >= rect.left && moved.clientX < rect.right && moved.clientY >= rect.top && moved.clientY < rect.bottom;
    const cut = over ? timelineView.dragTransition(moved.clientX - rect.left, moved.clientY - rect.top) : null;
    if (!over) timelineView.endTransitionDrag();
    // Off the timeline the chip follows the pointer; over a cut the timeline lights where it lands.
    if (drag.chip) {
      drag.chip.hidden = cut !== null;
      // The media drag chip's offset from the pointer.
      const offset = themeBridge.theme.space[3];
      drag.chip.style.transform = `translate(${moved.clientX + offset}px, ${moved.clientY + offset}px)`;
    }
  };
  const end = (ended: PointerEvent | KeyboardEvent) => {
    const drag = chipDrag;
    if (!drag) return;
    if (ended instanceof PointerEvent && ended.pointerId !== drag.pointerId) return;
    if (ended instanceof KeyboardEvent && ended.key !== "Escape") return;
    chipDrag = null;
    win.removeEventListener("pointermove", move, true);
    win.removeEventListener("pointerup", end, true);
    win.removeEventListener("pointercancel", end, true);
    win.removeEventListener("keydown", end, true);
    drag.chip?.remove();
    const cut = timelineView.endTransitionDrag();
    if (!drag.dragging) return;
    swallowClick = true;
    // A later click (another press) must apply: the swallow lasts for this release's click only.
    win.setTimeout(() => (swallowClick = false), 0);
    if (ended instanceof PointerEvent && ended.type === "pointerup" && cut) applyTransition(cut, drag.kind);
  };
  win.addEventListener("pointermove", move, true);
  win.addEventListener("pointerup", end, true);
  win.addEventListener("pointercancel", end, true);
  win.addEventListener("keydown", end, true);
}

/** The quick row's transition chips: a click (not the end of a drag) applies at the chip cut. */
export function clickTransitionChip(kind: TransitionKind): void {
  if (takeChipClick()) return;
  actions.run(`transition.add.${kind}`);
}

export function installTransitionController(): () => void {
  const stops = [
    actions.register("edit.defaultTransition", defaultTransition),
    ...TRANSITION_KINDS.map((kind) => actions.register(`transition.add.${kind}`, () => addAtChipCut(kind))),
    actions.register("transition.delete", () => void deleteSelectedTransition()),
    actions.register("clip.fadeIn", () => quick("in")),
    actions.register("clip.fadeOut", () => quick("out")),
    ...FADE_PRESET_SECONDS.flatMap((seconds) => [actions.register(fadePresetId("in", seconds), () => preset("in", seconds)), actions.register(fadePresetId("out", seconds), () => preset("out", seconds))]),
    // A selected transition that an edit removed is no longer selected.
    documentStore.subscribe(
      (state) => {
        const selected: TransitionSelection | null = sessionStore.transition.getState();
        if (selected && !transitionAt(state, selected)) selectTransition(sessionStore, null);
      },
      { affects: ["clips"] },
    ),
  ];
  return () => {
    for (const stop of stops) stop();
    selectTransition(sessionStore, null);
  };
}
