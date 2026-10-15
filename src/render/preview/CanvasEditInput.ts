// Selection and transforms on the preview canvas (spec §7.2, §7.3, P1, P2, P3): pointer and modifier
// input on the overlay canvas. Framework-free. The selection is the session's (shared with the
// timeline, §6.7); a gesture writes ephemeral transforms only (`transforms`: the compositor and the
// overlay draw from them) and the document gets one command on release.
// - Click: the topmost layer under the pointer (§7.2) with its partners (group, linked partners with
//   Linked selection on); Shift toggles it (with them), Mod toggles it alone, Alt+click cycles
//   through the layers under the pointer (alone); empty space clears. A press inside the gizmo box
//   moves the selection; released without a drag it is a click. A drag on empty space is a marquee
//   (intersecting layers, Shift adds), written once on release.
// - Gizmo (gizmo.ts): handles scale, the zones outside the corners rotate, the anchor marker moves the
//   anchor with Alt held; Shift and Alt change a running gesture at once. Drags start past the dead
//   zone and pause playback; Esc cancels (`cancel`).
// - Hover outlines the layer under the pointer; the cursor follows the gizmo zone.
// - The canvas rect is read once per pointer enter and after a panel resize (P9).
// TODO(batch 23): snapping and smart guides. TODO(batch 26): crop handles. TODO(batch 29): double-click
// edits text inline. TODO(batch 35): the keyframe diamond on the box corner.
import type { Command } from "../../core/commands/command.js";
import type { ClipId, Project, Transform } from "../../core/document/types.js";
import { isEditableTarget } from "../../core/keyboard/KeyDispatcher.js";
import type { Platform } from "../../core/keyboard/keys.js";
import type { FrameScheduler } from "../../core/scheduler/FrameScheduler.js";
import type { Store } from "../../core/store/createStore.js";
import type { DocumentStore } from "../../core/store/DocumentStore.js";
import type { LayoutState } from "../../core/store/layoutStore.js";
import { addToSelection, clickSelection, EMPTY_SELECTION, selectClips, type ClickModifier, type Selection } from "../../core/store/selection.js";
import { setSelection, type SessionStore } from "../../core/store/sessionStore.js";
import type { Theme, ThemeBridge } from "../../core/theme/theme.js";
import { setTransforms, type Point } from "../../timeline/edit/transform.js";
import { selectionPartners } from "../../timeline/model/queries.js";
import { canvasLayersAt, layersInRect, layersUnder, type CanvasLayer, type Quad, type Rect } from "./canvasLayers.js";
import { canvasCursors, type CanvasCursors } from "./canvasCursors.js";
import {
  AngleTracker,
  anchorGesture,
  gizmoBoxOf,
  hitGizmo,
  moveGesture,
  resizeCursor,
  rotateGesture,
  rotationPivot,
  scaleGesture,
  toScreen,
  type GestureResult,
  type GestureStart,
  type GizmoBox,
  type GizmoHit,
  type HandleId,
  type Modifiers,
} from "./gizmo.js";
import type { PreviewPlacement } from "./PreviewView.js";

export interface CanvasEditDeps {
  document: Pick<DocumentStore, "getState" | "subscribe">;
  session: SessionStore;
  scheduler: Pick<FrameScheduler, "invalidate">;
  theme: Pick<ThemeBridge, "theme" | "subscribe">;
  layout: Store<LayoutState>;
  platform: Platform;
  /** The frame on the canvas as last rendered (null before it and while a split preview shows). */
  placement(): PreviewPlacement | null;
  /** A pan (Space, middle button, Hand tool) owns the pointer. */
  panning(): boolean;
  /** One gesture's command (spec P2). */
  commit(command: Command): void;
  /** A drag starts (playback pauses). */
  onDragStart(): void;
  /** A right-click on a layer or the selection (client px); the layer is selected first. */
  onContextMenu(request: { x: number; y: number }): void;
}

/** What the overlay draws for selection and the gizmo; null parts are not drawn. */
export interface GizmoScene {
  /** The layer under the pointer (not selected), outlined thin. */
  hover: Quad | null;
  /** The selected layers at the playhead (and those a marquee would select). */
  outlines: readonly Quad[];
  /** The gizmo box with its handles; a group box when it holds several layers. */
  box: GizmoBox | null;
  group: boolean;
  /** The anchor marker (one layer, Alt held). */
  anchor: Point | null;
  marquee: Rect | null;
  /** The 100% scale snap of the dragged handle (§7.3: a snap line flashes on it). */
  snap: { handle: HandleId; x: boolean; y: boolean } | null;
  /** The numeric readout near the cursor (canvas CSS px). */
  readout: { text: string; x: number; y: number } | null;
}

type GestureKind = "move" | "scale" | "rotate" | "anchor";

interface Press {
  pointerId: number;
  /** Client px of the press, and its project point. */
  clientX: number;
  clientY: number;
  point: Point;
  /** What a drag does: a gizmo gesture or a marquee. */
  drag: { kind: GestureKind; handle?: HandleId } | { kind: "marquee"; additive: boolean };
  /** The selection a release without a drag applies (null: the press already selected). */
  click: Selection | null;
}

interface Drag {
  pointerId: number;
  kind: GestureKind;
  handle: HandleId | null;
  start: GestureStart;
  /** The document the gesture started from: another change under it cancels it. */
  project: Project;
  point: Point;
  tracker: AngleTracker | null;
  result: GestureResult | null;
}

interface Marquee {
  pointerId: number;
  additive: boolean;
  base: Selection;
  from: Point;
  to: Point;
  hits: readonly ClipId[];
}

const NO_MODS = { shift: false, alt: false, mod: false };

const LABELS: Record<GestureKind, [string, string]> = {
  move: ["Move layer", "Move layers"],
  scale: ["Scale layer", "Scale layers"],
  rotate: ["Rotate layer", "Rotate layers"],
  anchor: ["Move anchor point", "Move anchor point"],
};

export class CanvasEditInput {
  private element: HTMLElement | null = null;
  private rect: { left: number; top: number } | null = null;
  private over = false;
  private modifiers = NO_MODS;
  private press: Press | null = null;
  private drag: Drag | null = null;
  private marquee: Marquee | null = null;
  /** The pointer: client px, and canvas CSS px for the readout. */
  private pointer: { clientX: number; clientY: number; x: number; y: number } | null = null;
  private hover: ClipId | null = null;
  private theme: Theme;
  private cursors: CanvasCursors;
  private cache: { project: Project | null; frame: number; transforms: ReadonlyMap<ClipId, Transform> | null; layers: CanvasLayer[] } = { project: null, frame: -1, transforms: null, layers: [] };
  private readonly stops: (() => void)[] = [];
  /** Changes of what the overlay draws apart from the document, playhead and selection. */
  version = 0;

  constructor(private readonly deps: CanvasEditDeps) {
    this.theme = deps.theme.theme;
    this.cursors = canvasCursors(this.theme);
  }

  /** A running gesture's ephemeral transforms by clip id (the compositor reads them, P2), or null. */
  get transforms(): ReadonlyMap<ClipId, Transform> | null {
    return this.drag?.result?.transforms ?? null;
  }

  /** A gesture or marquee runs. */
  get active(): boolean {
    return this.drag !== null || this.marquee !== null;
  }

  attach(element: HTMLElement): () => void {
    this.detach();
    this.element = element;
    const win = element.ownerDocument.defaultView;
    const listen = <K extends keyof HTMLElementEventMap>(type: K, handler: (event: HTMLElementEventMap[K]) => void) => {
      element.addEventListener(type, handler as EventListener);
      this.stops.push(() => element.removeEventListener(type, handler as EventListener));
    };
    listen("pointerenter", (event) => {
      this.over = true;
      this.rect = null;
      this.modifiers = this.modifiersOf(event);
    });
    listen("pointerleave", () => {
      this.over = false;
      if (!this.press && !this.drag && !this.marquee) this.setPointer(null);
    });
    listen("pointerdown", (event) => this.onPointerDown(event));
    listen("pointermove", (event) => this.onPointerMove(event));
    listen("pointerup", (event) => this.onPointerUp(event));
    listen("pointercancel", (event) => {
      if (this.ownsPointer(event.pointerId)) this.cancel();
    });
    listen("contextmenu", (event) => this.onContextMenu(event));
    const onKey = (event: KeyboardEvent) => this.onModifierKey(event);
    const onBlur = () => this.cancel();
    win?.addEventListener("keydown", onKey, true);
    win?.addEventListener("keyup", onKey, true);
    win?.addEventListener("blur", onBlur);
    this.stops.push(
      () => {
        win?.removeEventListener("keydown", onKey, true);
        win?.removeEventListener("keyup", onKey, true);
        win?.removeEventListener("blur", onBlur);
      },
      this.deps.layout.select(
        (state) => state.panels.preview,
        () => {
          this.rect = null;
        },
      ),
      this.deps.session.selection.subscribe(() => this.invalidate()),
      this.deps.theme.subscribe((next) => {
        this.theme = next;
        this.cursors = canvasCursors(next);
        this.invalidate();
      }),
      // An edit under a gesture (undo from the keyboard, an autosave reload) ends it with no change.
      this.deps.document.subscribe((state) => {
        if (this.drag && state !== this.drag.project) this.cancel();
      }),
    );
    return () => this.detach();
  }

  detach(): void {
    this.cancel();
    for (const stop of this.stops.splice(0)) stop();
    this.element = null;
    this.rect = null;
    this.hover = null;
    this.pointer = null;
  }

  /** Esc (spec §6.8 for drags): drops a gesture or marquee with no document change; true when one ran. */
  cancel(): boolean {
    const running = this.press !== null || this.drag !== null || this.marquee !== null;
    const pointerId = this.press?.pointerId ?? this.drag?.pointerId ?? this.marquee?.pointerId;
    this.press = null;
    this.drag = null;
    this.marquee = null;
    if (pointerId !== undefined && this.element?.hasPointerCapture?.(pointerId)) this.element.releasePointerCapture(pointerId);
    if (running) {
      this.deps.scheduler.invalidate("preview");
      this.invalidate();
      this.updateCursor();
    }
    return running;
  }

  /** The canvas layers at the playhead with the gesture's transforms (cached per document, frame and gesture step). */
  layers(): CanvasLayer[] {
    const project = this.deps.document.getState();
    const frame = this.deps.session.state.getState().playhead;
    const transforms = this.transforms;
    const cache = this.cache;
    if (cache.project !== project || cache.frame !== frame || cache.transforms !== transforms) {
      cache.project = project;
      cache.frame = frame;
      cache.transforms = transforms;
      cache.layers = canvasLayersAt(project, frame, transforms);
    }
    return cache.layers;
  }

  /** The selected layers at the playhead, bottom first: what the gizmo holds. */
  selectedLayers(): CanvasLayer[] {
    const selection = this.deps.session.selection.getState();
    if (selection.kind !== "clips") return [];
    return this.layers().filter((layer) => selection.clipIds.has(layer.clipId));
  }

  /** What the overlay draws now. */
  scene(): GizmoScene {
    const layers = this.layers();
    const selection = this.deps.session.selection.getState();
    const selected = selection.kind === "clips" ? layers.filter((layer) => selection.clipIds.has(layer.clipId)) : [];
    const drag = this.drag;
    const marquee = this.marquee;
    // A marquee shows the selection it would make: its layers, plus the current ones when it adds.
    const outlined = marquee ? layers.filter((layer) => marquee.hits.includes(layer.clipId) || (marquee.additive && selected.includes(layer))) : selected;
    const outlines = outlined.map((layer) => layer.quad);
    const box = drag?.result?.box ?? (marquee ? null : gizmoBoxOf(outlines));
    const hoverLayer = !drag && !marquee && this.hover !== null ? layers.find((layer) => layer.clipId === this.hover && !selected.includes(layer)) : undefined;
    const single = selected.length === 1 ? selected[0] : undefined;
    const showAnchor = single !== undefined && (drag?.kind === "anchor" || (!drag && !marquee && this.modifiers.alt && this.over));
    const pointer = this.pointer;
    const result = drag?.result;
    const frame = this.deps.document.getState().settings;
    return {
      hover: hoverLayer?.quad ?? null,
      outlines,
      box,
      group: (drag?.start.layers.length ?? selected.length) > 1,
      anchor: showAnchor && single ? { x: frame.width / 2 + single.transform.x, y: frame.height / 2 + single.transform.y } : null,
      marquee: marquee ? { x0: marquee.from.x, y0: marquee.from.y, x1: marquee.to.x, y1: marquee.to.y } : null,
      snap: result && drag.handle && (result.snapX || result.snapY) ? { handle: drag.handle, x: result.snapX, y: result.snapY } : null,
      readout: result && pointer ? { text: result.readout, x: pointer.x, y: pointer.y } : null,
    };
  }

  // --- Pointer -----------------------------------------------------------------------------------

  private onPointerDown(event: PointerEvent): void {
    if (event.button !== 0 || this.press || this.drag || this.marquee) return;
    if (this.deps.panning() || this.deps.session.state.getState().activeTool === "hand") return;
    const placement = this.deps.placement();
    const point = this.projectPoint(event, placement);
    if (!placement || !point) return;
    this.modifiers = this.modifiersOf(event);
    this.setPointer(event);
    const { session } = this.deps;
    const selection = session.selection.getState();
    const held = this.selectedLayers();
    const box = gizmoBoxOf(held.map((layer) => layer.quad));
    const mods = this.modifiers;
    const hit = box ? this.hitBox(box, placement, event) : null;
    const under = layersUnder(this.layers(), point.x, point.y);
    const top = under[0];
    // Deep select (§7.2): the next layer under the pointer after the selected one, alone.
    const cycled = () => {
      const at = under.findIndex((layer) => selection.kind === "clips" && selection.clipIds.has(layer.clipId));
      return selectClips([(under[(at + 1) % under.length] as CanvasLayer).clipId]);
    };
    let press: Pick<Press, "drag" | "click"> | null = null;
    // Alt over the anchor marker drags the anchor; released without a drag it is the Alt+click.
    if (box && mods.alt && held.length === 1 && this.overAnchor(held[0] as CanvasLayer, placement, event)) press = { drag: { kind: "anchor" }, click: top ? cycled() : null };
    else if (hit?.kind === "handle") press = { drag: { kind: "scale", handle: hit.handle }, click: null };
    else if (hit?.kind === "rotate") press = { drag: { kind: "rotate", handle: hit.corner }, click: null };
    if (!press) {
      if (mods.alt && top) {
        setSelection(session, cycled());
        press = { drag: { kind: "move" }, click: null };
      } else if (hit?.kind === "body") {
        // Inside the gizmo box: a drag moves the selection; a click picks the layer on top there.
        const modifier = this.clickModifier();
        press = { drag: { kind: "move" }, click: top ? clickSelection(selection, top.clipId, modifier, this.partners(top.clipId, modifier)) : modifier === "none" ? EMPTY_SELECTION : null };
      } else if (top) {
        const modifier = this.clickModifier();
        const next = clickSelection(selection, top.clipId, modifier, this.partners(top.clipId, modifier));
        const selected = selection.kind === "clips" && selection.clipIds.has(top.clipId);
        if (!selected) setSelection(session, next);
        press = { drag: { kind: "move" }, click: selected ? next : null };
      } else {
        const additive = mods.shift || mods.mod;
        press = { drag: { kind: "marquee", additive }, click: additive ? null : EMPTY_SELECTION };
      }
    }
    event.preventDefault();
    this.press = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, point, ...press };
    this.element?.setPointerCapture?.(event.pointerId);
    this.hover = null;
    this.invalidate();
    this.updateCursor();
  }

  private onPointerMove(event: PointerEvent): void {
    this.setPointer(event);
    // The modifiers ride on pointer events too (a key pressed while the window had no focus).
    const mods = this.modifiersOf(event);
    if (mods.shift !== this.modifiers.shift || mods.alt !== this.modifiers.alt || mods.mod !== this.modifiers.mod) {
      this.modifiers = mods;
      this.invalidate();
    }
    const press = this.press;
    if (press && event.pointerId === press.pointerId) {
      const threshold = this.theme.gizmo.dragThreshold;
      if (Math.hypot(event.clientX - press.clientX, event.clientY - press.clientY) < threshold) return;
      this.begin(press);
    }
    if (this.drag && event.pointerId === this.drag.pointerId) {
      this.updateDrag();
      return;
    }
    if (this.marquee && event.pointerId === this.marquee.pointerId) {
      this.updateMarquee();
      return;
    }
    if (!this.press) this.updateHover(event);
  }

  private onPointerUp(event: PointerEvent): void {
    if (!this.ownsPointer(event.pointerId)) return;
    const { press, drag, marquee } = this;
    this.press = null;
    this.drag = null;
    this.marquee = null;
    if (this.element?.hasPointerCapture?.(event.pointerId)) this.element.releasePointerCapture(event.pointerId);
    if (press?.click) setSelection(this.deps.session, press.click);
    if (marquee) setSelection(this.deps.session, marquee.additive ? addToSelection(marquee.base, marquee.hits) : selectClips(marquee.hits));
    if (drag?.result) {
      const count = drag.start.layers.length;
      const labels = LABELS[drag.kind];
      const command = setTransforms(this.deps.document.getState(), drag.result.transforms, { label: count === 1 ? labels[0] : labels[1] });
      // The document takes over from the ephemeral transforms in the same frame.
      this.deps.scheduler.invalidate("preview");
      if (command) this.deps.commit(command);
    }
    this.updateHover(event);
    this.invalidate();
    this.updateCursor();
  }

  private onContextMenu(event: MouseEvent): void {
    event.preventDefault();
    if (this.press || this.drag || this.marquee || this.deps.panning()) return;
    const placement = this.deps.placement();
    const point = this.projectPoint(event, placement);
    if (!placement || !point) return;
    const { session } = this.deps;
    const selection = session.selection.getState();
    const top = layersUnder(this.layers(), point.x, point.y)[0];
    const box = gizmoBoxOf(this.selectedLayers().map((layer) => layer.quad));
    const inBox = box !== null && this.hitBox(box, placement, event)?.kind === "body";
    if (top && !(selection.kind === "clips" && selection.clipIds.has(top.clipId)) && !inBox) setSelection(session, clickSelection(selection, top.clipId, "none", this.partners(top.clipId, "none")));
    else if (!top && !inBox) {
      setSelection(session, EMPTY_SELECTION);
      return;
    }
    this.deps.onContextMenu({ x: event.clientX, y: event.clientY });
  }

  /** The press moved past the dead zone: its gesture or marquee starts. */
  private begin(press: Press): void {
    this.press = null;
    if (press.drag.kind === "marquee") {
      const base = this.deps.session.selection.getState();
      this.marquee = { pointerId: press.pointerId, additive: press.drag.additive, base, from: press.point, to: press.point, hits: [] };
      return;
    }
    const held = this.selectedLayers();
    const box = gizmoBoxOf(held.map((layer) => layer.quad));
    if (!box) return;
    const project = this.deps.document.getState();
    const start: GestureStart = { layers: held.map((layer) => ({ clipId: layer.clipId, transform: layer.transform, box: layer.box })), box, frame: project.settings };
    const kind = press.drag.kind;
    this.drag = {
      pointerId: press.pointerId,
      kind,
      handle: press.drag.handle ?? null,
      start,
      project,
      point: press.point,
      tracker: kind === "rotate" ? new AngleTracker(rotationPivot(start), press.point) : null,
      result: null,
    };
    this.deps.onDragStart();
  }

  private updateDrag(): void {
    const drag = this.drag;
    const placement = this.deps.placement();
    const pointer = this.pointer;
    if (!drag || !pointer) return;
    const point = this.projectPoint(pointer, placement);
    if (!point) return;
    const mods: Modifiers = { shift: this.modifiers.shift, alt: this.modifiers.alt };
    switch (drag.kind) {
      case "move":
        drag.result = moveGesture(drag.start, point.x - drag.point.x, point.y - drag.point.y, mods);
        break;
      case "scale":
        drag.result = scaleGesture(drag.start, drag.handle as HandleId, point, mods);
        break;
      case "rotate":
        drag.result = rotateGesture(drag.start, (drag.tracker as AngleTracker).update(point), mods);
        break;
      case "anchor":
        drag.result = anchorGesture(drag.start, point);
        break;
    }
    this.deps.scheduler.invalidate("preview");
    this.invalidate();
    this.updateCursor();
  }

  private updateMarquee(): void {
    const marquee = this.marquee;
    const pointer = this.pointer;
    const point = pointer ? this.projectPoint(pointer, this.deps.placement()) : null;
    if (!marquee || !point) return;
    marquee.to = point;
    marquee.hits = layersInRect(this.layers(), { x0: marquee.from.x, y0: marquee.from.y, x1: point.x, y1: point.y }).map((layer) => layer.clipId);
    this.invalidate();
  }

  private updateHover(event: { clientX: number; clientY: number }): void {
    const placement = this.deps.placement();
    const point = this.over ? this.projectPoint(event, placement) : null;
    const top = point ? (layersUnder(this.layers(), point.x, point.y)[0] ?? null) : null;
    const hover = top?.clipId ?? null;
    if (hover !== this.hover) {
      this.hover = hover;
      this.invalidate();
    }
    this.updateCursor();
  }

  // --- Keys ----------------------------------------------------------------------------------------

  /** Shift, Alt and Mod change a running gesture at once and show the anchor marker; the keys still reach the dispatcher. */
  private onModifierKey(event: KeyboardEvent): void {
    const next = this.modifiersOf(event);
    const busy = this.drag !== null || this.marquee !== null || this.press !== null;
    // A lone Alt press-and-release would move the focus to the browser menu (Windows).
    if (event.key === "Alt" && (this.over || busy) && !isEditableTarget(event.target)) event.preventDefault();
    if (next.shift === this.modifiers.shift && next.alt === this.modifiers.alt && next.mod === this.modifiers.mod) return;
    this.modifiers = next;
    if (this.drag) this.updateDrag();
    else if (this.over) {
      this.invalidate();
      this.updateCursor();
    }
  }

  // --- Helpers ---------------------------------------------------------------------------------------

  private clickModifier(): ClickModifier {
    return this.modifiers.mod ? "mod" : this.modifiers.shift ? "shift" : "none";
  }

  /** The clips a click selects with a layer (spec §6.7, §6.12): its group, and its linked partners with Linked selection on. */
  private partners(clipId: ClipId, modifier: ClickModifier): ClipId[] {
    if (modifier !== "none" && modifier !== "shift") return [];
    return selectionPartners(this.deps.document.getState(), clipId, this.deps.session.state.getState().linkedSelection);
  }

  private ownsPointer(pointerId: number): boolean {
    return this.press?.pointerId === pointerId || this.drag?.pointerId === pointerId || this.marquee?.pointerId === pointerId;
  }

  private modifiersOf(event: { shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean }) {
    return { shift: event.shiftKey, alt: event.altKey, mod: this.deps.platform === "mac" ? event.metaKey : event.ctrlKey };
  }

  private metrics(dpr: number) {
    const { handleHit, rotateZone, minEdge } = this.theme.gizmo;
    return { handleHit: handleHit * dpr, rotateZone: rotateZone * dpr, minEdge: minEdge * dpr };
  }

  /** The gizmo zone under the pointer (device px against the box on screen). */
  private hitBox(box: GizmoBox, placement: PreviewPlacement, event: { clientX: number; clientY: number }): GizmoHit | null {
    const device = this.devicePoint(event, placement.dpr);
    return device ? hitGizmo(box, placement.transform, device.x, device.y, this.metrics(placement.dpr)) : null;
  }

  private overAnchor(layer: CanvasLayer, placement: PreviewPlacement, event: { clientX: number; clientY: number }): boolean {
    const device = this.devicePoint(event, placement.dpr);
    if (!device) return false;
    const { width, height } = this.deps.document.getState().settings;
    const anchor = toScreen(placement.transform, { x: width / 2 + layer.transform.x, y: height / 2 + layer.transform.y });
    const reach = (this.theme.gizmo.handleHit * placement.dpr) / 2;
    return Math.abs(anchor.x - device.x) <= reach && Math.abs(anchor.y - device.y) <= reach;
  }

  private canvasRect(): { left: number; top: number } | null {
    const element = this.element;
    if (!element) return null;
    if (!this.rect) {
      const rect = element.getBoundingClientRect();
      this.rect = { left: rect.left, top: rect.top };
    }
    return this.rect;
  }

  private devicePoint(event: { clientX: number; clientY: number }, dpr: number): Point | null {
    const rect = this.canvasRect();
    return rect ? { x: (event.clientX - rect.left) * dpr, y: (event.clientY - rect.top) * dpr } : null;
  }

  /** The project point (px from the frame's top-left) under the pointer. */
  private projectPoint(event: { clientX: number; clientY: number }, placement: PreviewPlacement | null): Point | null {
    if (!placement) return null;
    const device = this.devicePoint(event, placement.dpr);
    const t = placement.transform;
    if (!device || !(t[0] > 0) || !(t[3] > 0)) return null;
    return { x: (device.x - t[4]) / t[0], y: (device.y - t[5]) / t[3] };
  }

  private setPointer(event: { clientX: number; clientY: number } | null): void {
    if (!event) {
      this.pointer = null;
      if (this.hover !== null) {
        this.hover = null;
        this.invalidate();
      }
      return;
    }
    const rect = this.canvasRect();
    this.pointer = { clientX: event.clientX, clientY: event.clientY, x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  }

  /** The cursor for the pointer (the viewport's pan cursors win while it pans). */
  cursor(): string {
    const drag = this.drag;
    const placement = this.deps.placement();
    if (drag) {
      if (drag.kind === "move") return "move";
      if (drag.kind === "rotate") return this.cursors.rotate;
      if (drag.kind === "anchor") return "crosshair";
      return placement && drag.result ? resizeCursor(drag.result.box, placement.transform, drag.handle as HandleId) : "";
    }
    if (this.marquee || this.press || !this.over || !this.pointer || !placement) return "";
    const held = this.selectedLayers();
    const box = gizmoBoxOf(held.map((layer) => layer.quad));
    if (!box) return "";
    if (this.modifiers.alt && held.length === 1 && this.overAnchor(held[0] as CanvasLayer, placement, this.pointer)) return "crosshair";
    const hit = this.hitBox(box, placement, this.pointer);
    if (hit?.kind === "handle") return resizeCursor(box, placement.transform, hit.handle);
    if (hit?.kind === "rotate") return this.cursors.rotate;
    return hit?.kind === "body" ? "move" : "";
  }

  private updateCursor(): void {
    const element = this.element;
    if (!element || this.deps.panning() || this.deps.session.state.getState().activeTool === "hand") return;
    const cursor = this.cursor();
    if (element.style.cursor !== cursor) element.style.cursor = cursor;
  }

  private invalidate(): void {
    this.version += 1;
    this.deps.scheduler.invalidate("gizmo");
  }
}
