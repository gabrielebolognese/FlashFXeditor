// Gestures on media cards (spec §12, §6.14): the hover-scrub (`mediaHover`) and dragging media out of
// the Media panel. A press on a card or a list row becomes a drag past the dead zone (§6.8: 4 px); the
// media list then captures the pointer, so the drag gets every move and the release wherever they
// happen. Over the timeline its view draws the ghosts on its overlay (`TimelineView.dragMedia`);
// anywhere else a small DOM chip follows the pointer (no React state, P1). Released over the timeline
// it drops there (one command), over the preview canvas it places the media at the playhead at that
// point (§7.2 drop target), elsewhere it does nothing; Esc cancels. The panels' page rects are read
// once, when the drag starts (P9). Several selected items drag together, in selection order.
import type { MediaId } from "../core/document/types.js";
import { detectPlatform } from "../core/keyboard/keys.js";
import { HoverScrub } from "../panels/media/hoverScrub.js";
import type { DropItem } from "../timeline/edit/dropMedia.js";
import type { DragModifiers } from "../timeline/view/gestures/moveClips.js";
import { dropMediaOnCanvas, dropMediaOnTimeline, placeAtPlayhead, setMediaRange } from "./dropController.js";
import styles from "./MediaGestures.module.css";
import { posterPainter, scrubSheets, selectedMedia } from "./mediaController.js";
import { previewView } from "./previewController.js";
import { documentStore, sessionStore, themeBridge } from "./services.js";
import { timelineView } from "./timelineController.js";

interface Press {
  kind: "press";
  pointerId: number;
  x: number;
  y: number;
  element: HTMLElement;
  ids: MediaId[];
}

interface Drag {
  kind: "drag";
  pointerId: number;
  element: HTMLElement;
  ids: MediaId[];
  items: DropItem[];
  /** Page rects of the timeline overlay and the preview canvas at the start. */
  timeline: DOMRect | null;
  preview: DOMRect | null;
  chip: HTMLElement;
  over: "timeline" | "preview" | null;
  /** The last pointer position (client px). */
  x: number;
  y: number;
}

let gesture: Press | Drag | null = null;
let clickAfterDrag = false;
const platform = detectPlatform();

/** Hover-scrub on the cards (spec §12). */
export const mediaHover = new HoverScrub({
  sheets: scrubSheets,
  painter: posterPainter,
  document: documentStore,
  session: sessionStore.state,
  setRange: setMediaRange,
  place: (mediaId, mode) => placeAtPlayhead([mediaId], mode),
  dragging: () => gesture?.kind === "drag",
});

const modifiersOf = (event: { shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean }): DragModifiers => ({
  shift: event.shiftKey,
  alt: event.altKey,
  mod: platform === "mac" ? event.metaKey : event.ctrlKey,
});

const inside = (rect: DOMRect | null, x: number, y: number): rect is DOMRect => rect !== null && x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom;

/**
 * A press on a media card or row (`element`: the list, which captures the pointer once it drags). The
 * drag takes the selection when the pressed item is in it, else the item alone. A release before the
 * dead zone is a click (the list's click handler selects).
 */
export function pressMediaCard(event: PointerEvent, element: HTMLElement, id: MediaId): void {
  finish(false);
  const selected = selectedMedia();
  gesture = { kind: "press", pointerId: event.pointerId, x: event.clientX, y: event.clientY, element, ids: selected.includes(id) ? selected : [id] };
  const win = element.ownerDocument.defaultView;
  win?.addEventListener("pointermove", onMove, true);
  win?.addEventListener("pointerup", onUp, true);
  win?.addEventListener("pointercancel", onCancel, true);
  win?.addEventListener("keydown", onKey, true);
}

/** True once for the click that follows a drag's release (it must not change the media selection). */
export function takeClickAfterDrag(): boolean {
  const taken = clickAfterDrag;
  clickAfterDrag = false;
  return taken;
}

/** True while media are dragged out of the panel. */
export function draggingMedia(): boolean {
  return gesture?.kind === "drag";
}

function start(press: Press, event: PointerEvent): void {
  const project = documentStore.getState();
  const ranges = sessionStore.state.getState().sourceRanges;
  const items: DropItem[] = [];
  for (const id of press.ids) {
    const media = project.media[id];
    if (media) items.push({ media, range: ranges[id] ?? null });
  }
  if (items.length === 0) {
    finish(false);
    return;
  }
  mediaHover.leave();
  // Reads first (P9): the drop targets do not move during the drag.
  const timeline = timelineView.element?.getBoundingClientRect() ?? null;
  const preview = previewView.element?.getBoundingClientRect() ?? null;
  const { element } = press;
  try {
    element.setPointerCapture(press.pointerId);
  } catch {
    // The pointer is gone: the release or cancel ends the press.
  }
  const chip = element.ownerDocument.createElement("div");
  chip.className = styles.chip ?? "";
  chip.textContent = items.length === 1 ? (items[0] as DropItem).media.name : `${items.length} items`;
  chip.hidden = true;
  element.ownerDocument.body.append(chip);
  gesture = { kind: "drag", pointerId: press.pointerId, element, ids: items.map((item) => item.media.id), items, timeline, preview, chip, over: null, x: event.clientX, y: event.clientY };
}

/** The drag follows the pointer: ghosts on the timeline, else the chip. */
function follow(drag: Drag, event: PointerEvent): void {
  const x = event.clientX;
  const y = event.clientY;
  drag.x = x;
  drag.y = y;
  if (inside(drag.timeline, x, y)) {
    drag.over = "timeline";
    timelineView.dragMedia(drag.items, x - drag.timeline.left, y - drag.timeline.top, modifiersOf(event));
    drag.chip.hidden = true;
    drag.element.style.cursor = timelineView.mediaDrop?.proposal?.refused ? "not-allowed" : "grabbing";
    return;
  }
  if (drag.over === "timeline") timelineView.leaveMediaDrag();
  drag.over = inside(drag.preview, x, y) ? "preview" : null;
  const offset = themeBridge.theme.space[3];
  drag.chip.hidden = false;
  drag.chip.style.transform = `translate(${x + offset}px, ${y + offset}px)`;
  drag.element.style.cursor = drag.over === "preview" ? "copy" : "grabbing";
}

const onMove = (event: PointerEvent): void => {
  const current = gesture;
  if (!current || event.pointerId !== current.pointerId) return;
  if (current.kind === "press") {
    if (Math.hypot(event.clientX - current.x, event.clientY - current.y) <= themeBridge.theme.timeline.dragThreshold) return;
    start(current, event);
  }
  if (gesture?.kind === "drag") follow(gesture, event);
};

const onUp = (event: PointerEvent): void => {
  const current = gesture;
  if (!current || event.pointerId !== current.pointerId) return;
  if (current.kind === "drag") follow(current, event);
  finish(current.kind === "drag");
};

const onCancel = (event: PointerEvent): void => {
  if (gesture && event.pointerId === gesture.pointerId) finish(false);
};

/** Esc cancels a drag (spec §6.8). */
const onKey = (event: KeyboardEvent): void => {
  if (event.key !== "Escape" || gesture?.kind !== "drag") return;
  event.preventDefault();
  event.stopPropagation();
  finish(false);
};

/** Ends the press or the drag; `commit` drops a drag where it is. */
function finish(commit: boolean): void {
  const current = gesture;
  if (!current) return;
  gesture = null;
  const win = current.element.ownerDocument.defaultView;
  win?.removeEventListener("pointermove", onMove, true);
  win?.removeEventListener("pointerup", onUp, true);
  win?.removeEventListener("pointercancel", onCancel, true);
  win?.removeEventListener("keydown", onKey, true);
  if (current.kind !== "drag") return;
  if (current.element.hasPointerCapture?.(current.pointerId)) current.element.releasePointerCapture(current.pointerId);
  current.chip.remove();
  current.element.style.cursor = "";
  // The click that follows the release must not select or clear (the list's click handler asks).
  clickAfterDrag = true;
  setTimeout(() => (clickAfterDrag = false), 0);
  if (current.over === "timeline") {
    const request = timelineView.endMediaDrag();
    if (commit && request) dropMediaOnTimeline(request);
  } else if (commit && current.over === "preview" && current.preview) {
    dropMediaOnCanvas(current.ids, previewView.projectPoint(current.x - current.preview.left, current.y - current.preview.top));
  }
}
