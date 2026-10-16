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
// - Snapping (§7.4, snap.ts) while the session's snap toggle is on (held S inverts it during a drag,
//   one snap state with the timeline): a move snaps the box's edges and center, a scale the dragged
//   edge of an axis-aligned box; the candidates come from `CanvasSnapIndex` (rebuilt only when the
//   other layers, the frame or the overlays shown change). Other layers and equal spacing count while
//   smart guides are on (`preview.guides`), which also gives the Alt measure mode (no drag). The other
//   layers are the picture's (`pictureLayersAt`: locked tracks included, muted ones out), not just the
//   selectable ones.
// - Crop mode (spec §7.3 "crop handles as a gizmo mode", §11 Crop; cropGizmo.ts): one video or image
//   layer at a time (`cropMode`: entered by a double-click on the layer or from the Crop section).
//   Its gizmo gets 8 crop handles instead of the scale handles and rotate zones; a handle drag writes
//   the layer's ephemeral crop through `crops` (the compositor and the Crop fields read it) and
//   commits one `clip.crop` command on release. Shift inverts the aspect lock, Alt crops around the
//   center; crop edges snap to the frame edges, center and thirds while snapping is on and the layer
//   is axis-aligned. A body drag still moves the layer. It ends on Esc, a double-click on the layer,
//   or a selection that is no longer that layer alone.
// - Text layers (spec §7.3, §7.7; textGizmo.ts, InlineTextEditor.ts): one selected text layer's gizmo has
//   corner handles that size its font (keeping the layout) and side handles (left, right) that set
//   its box width (the text reflows); a drag shows its text live (`texts`) and commits one `clip.text`
//   command. A double-click on a text layer edits it inline with the caret there. While a text is
//   edited, a press on its box places the caret (Shift extends, a double press selects a word) and a
//   drag selects; a press anywhere else commits the edit first, then does what it does. The edited
//   box keeps its outline, without handles, and the overlay draws the caret.
// - Hover outlines the layer under the pointer; the cursor follows the gizmo zone.
// - The canvas rect is read once per pointer enter and after a panel resize (P9).
// TODO(batch 35): the keyframe diamond on the box corner.
import type { Command } from "../../core/commands/command.js";
import type { ClipId, Crop, Project, TextContent, TextStyle, Transform } from "../../core/document/types.js";
import { isEditableTarget } from "../../core/keyboard/KeyDispatcher.js";
import { isSnapKey, type Platform } from "../../core/keyboard/keys.js";
import type { FrameScheduler } from "../../core/scheduler/FrameScheduler.js";
import type { Store } from "../../core/store/createStore.js";
import type { DocumentStore } from "../../core/store/DocumentStore.js";
import type { LayoutState } from "../../core/store/layoutStore.js";
import { addToSelection, clickSelection, EMPTY_SELECTION, selectClips, type ClickModifier, type Selection } from "../../core/store/selection.js";
import { setSelection, type SessionStore } from "../../core/store/sessionStore.js";
import type { Theme, ThemeBridge } from "../../core/theme/theme.js";
import { isCropClip, setCrops } from "../../timeline/edit/crop.js";
import { setTexts } from "../../timeline/edit/text.js";
import { isLayerClip, layerCorners, setTransforms, type Point } from "../../timeline/edit/transform.js";
import { isClipLocked, selectionPartners } from "../../timeline/model/queries.js";
import type { LiveText } from "../compositor/Compositor.js";
import { onTextLayoutsChanged, textLayoutVersion } from "../text/layoutCache.js";
import { canvasLayersAt, layersInRect, layersUnder, pictureLayersAt, quadsBounds, type CanvasLayer, type Quad, type Rect } from "./canvasLayers.js";
import { canvasCursors, type CanvasCursors } from "./canvasCursors.js";
import { cropGesture, type CropModeState, type CropStart } from "./cropGizmo.js";
import {
  AngleTracker,
  anchorGesture,
  boxPoint,
  gizmoBoxOf,
  HANDLES,
  handlePoint,
  hitGizmo,
  isCorner,
  moveDelta,
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
import type { TextEditScene } from "./InlineTextEditor.js";
import { ACTION_SAFE, centeredRect, safeZoneOn, TITLE_SAFE } from "./overlays.js";
import type { PreviewPlacement } from "./PreviewView.js";
import type { ZoneRect } from "./safeZones.js";
import { CanvasSnapIndex, handleGuides, isAxisAligned, measureGuides, moveGuides, snapHandle, snapMove, type CanvasSnapCandidates, type Guides } from "./snap.js";
import { textHandleKind, textSizeGesture, textWidthGesture, type TextGestureStart } from "./textGizmo.js";

/** Inline text editing as the canvas drives it (InlineTextEditor, spec §7.7). */
export interface CanvasTextEditing {
  /** The clip edited inline, or null. */
  readonly editing: ClipId | null;
  /** Edits a text clip with the caret at a project point. */
  begin(clipId: ClipId, at: Point): boolean;
  /** Commits and ends editing; false when nothing was edited. */
  end(commit?: boolean): boolean;
  /** Whether a project point is on the edited box (grown by `reach` project px). */
  contains(point: Point, reach?: number): boolean;
  press(point: Point, shift: boolean): void;
  drag(point: Point): void;
  release(): void;
  scene(): TextEditScene | null;
}

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
  /** Ephemeral transforms written outside the canvas (a properties field scrub, spec §11, P2), or null; the gizmo follows them. */
  live?(): ReadonlyMap<ClipId, Transform> | null;
  /**
   * Ephemeral crops (P2): a Crop field scrub's (`read`), and this canvas's crop handle drags (`write`,
   * null when the drag ends); the compositor and the Crop fields read the same values.
   */
  crops?: { read(): ReadonlyMap<ClipId, Crop> | null; write(crops: ReadonlyMap<ClipId, Crop> | null): void };
  /** Ephemeral texts and styles (a Text field scrub, spec §11, P2), or null: text boxes follow them. */
  texts?(): ReadonlyMap<ClipId, LiveText> | null;
  /** Crop mode (spec §7.3, §11), shared with the Crop section and the crop chip; without it there is no crop mode. */
  cropMode?: Store<CropModeState>;
  /** Inline text editing (spec §7.7); without it a double-click on text does nothing. */
  textEditor?: CanvasTextEditing;
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
  /** Smart guides (§7.4): the snap lines and distances of a drag, or the Alt measure mode. */
  guides: Guides | null;
  /** Crop mode (§7.3): the box holds crop handles, `media` is the whole media's quad (outlined dashed). */
  crop: { media: Quad } | null;
  /** The box is one text layer's: corner and side handles only (§7.3). */
  textBox: boolean;
  /** Inline text editing (§7.7): the caret and the composition underline. */
  text: TextEditScene | null;
}

type GestureKind = "move" | "scale" | "rotate" | "anchor" | "crop" | "textSize" | "textWidth";

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
  /** The layers it holds (no snap targets). */
  held: ReadonlySet<ClipId>;
  /** The document the gesture started from: another change under it cancels it. */
  project: Project;
  point: Point;
  tracker: AngleTracker | null;
  result: GestureResult | null;
  guides: Guides | null;
  /** A crop handle drag: the layer it crops, and the crops it leaves (ephemeral until the release). */
  crop: CropStart | null;
  crops: ReadonlyMap<ClipId, Crop> | null;
  /** A text handle drag: the text layer, and its text and style as the drag leaves them (ephemeral until the release). */
  text: TextGestureStart | null;
  texts: ReadonlyMap<ClipId, { text: TextContent; style: TextStyle }> | null;
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
  crop: ["Crop layer", "Crop layers"],
  textSize: ["Resize text", "Resize text"],
  textWidth: ["Change text box width", "Change text box width"],
};

export class CanvasEditInput {
  private element: HTMLElement | null = null;
  private rect: { left: number; top: number } | null = null;
  private over = false;
  private modifiers = NO_MODS;
  private press: Press | null = null;
  private drag: Drag | null = null;
  private marquee: Marquee | null = null;
  /** A press placing the caret or selecting in the text edited inline. */
  private textPress: number | null = null;
  /** The pointer: client px, and canvas CSS px for the readout. */
  private pointer: { clientX: number; clientY: number; x: number; y: number } | null = null;
  private hover: ClipId | null = null;
  private theme: Theme;
  private cursors: CanvasCursors;
  /** The canvas layers, per document, frame, gesture values and text layouts (fonts that load move text boxes). */
  private cache: {
    project: Project | null;
    frame: number;
    transforms: ReadonlyMap<ClipId, Transform> | null;
    crops: ReadonlyMap<ClipId, Crop> | null;
    texts: ReadonlyMap<ClipId, LiveText> | null;
    version: number;
    layers: CanvasLayer[];
  } = {
    project: null,
    frame: -1,
    transforms: null,
    crops: null,
    texts: null,
    version: -1,
    layers: [],
  };
  /** The picture layers at the playhead (the smart guides' other layers), with the document's transforms. */
  private picture: { project: Project | null; frame: number; version: number; layers: CanvasLayer[] } = { project: null, frame: -1, version: -1, layers: [] };
  /** S held during the current drag: snapping inverted (§7.4, §6.9). */
  private snapHeld = false;
  private readonly snapIndex = new CanvasSnapIndex();
  /** Crop edges snap to the frame alone: edges, center, thirds (Batch 26). */
  private readonly cropSnapIndex = new CanvasSnapIndex();
  private readonly stops: (() => void)[] = [];
  /** Changes of what the overlay draws apart from the document, playhead and selection. */
  version = 0;

  constructor(private readonly deps: CanvasEditDeps) {
    this.theme = deps.theme.theme;
    this.cursors = canvasCursors(this.theme);
  }

  /** A running gesture's (else a field scrub's) ephemeral transforms by clip id (the compositor reads them, P2), or null. */
  get transforms(): ReadonlyMap<ClipId, Transform> | null {
    const drag = this.drag;
    return (drag?.kind !== "crop" ? drag?.result?.transforms : null) ?? this.deps.live?.() ?? null;
  }

  /** A text handle drag's ephemeral texts and styles (the compositor reads them, P2), or null. */
  get texts(): ReadonlyMap<ClipId, { text: TextContent; style: TextStyle }> | null {
    return this.drag?.texts ?? null;
  }

  /** The clip in crop mode (spec §7.3), or null. */
  get cropTarget(): ClipId | null {
    return this.deps.cropMode?.getState().target ?? null;
  }

  /**
   * Crop mode on a video or image clip (spec §7.3, §11): its gizmo gets crop handles while it is the
   * selected layer. False (and no change) for other clips and clips on locked tracks.
   */
  enterCropMode(clipId: ClipId): boolean {
    const store = this.deps.cropMode;
    const project = this.deps.document.getState();
    const clip = project.clips[clipId];
    if (!store || !clip || !isCropClip(clip) || isClipLocked(project, clipId)) return false;
    if (store.getState().target !== clipId) store.set({ ...store.getState(), target: clipId });
    return true;
  }

  /** Leaves crop mode (a running crop drag is dropped); true when it was on (Esc, spec §18). */
  exitCropMode(): boolean {
    const store = this.deps.cropMode;
    if (!store || store.getState().target === null) return false;
    if (this.drag?.kind === "crop") this.cancel();
    store.set({ ...store.getState(), target: null });
    return true;
  }

  /** A gesture or marquee runs. */
  get active(): boolean {
    return this.drag !== null || this.marquee !== null || this.textPress !== null;
  }

  /** The snap toggle, inverted while S is held during a drag (one snap state with the timeline). */
  get snapping(): boolean {
    return this.deps.session.state.getState().snap !== this.snapHeld;
  }

  /** Snap candidate rebuilds and queries so far (dev stats: rebuilds only when the candidates change). */
  get snapStats(): { readonly rebuilds: number; readonly queries: number } {
    return this.snapIndex;
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
      // Alt held: the anchor marker and the measure mode show over the canvas only.
      if (this.modifiers.alt) this.invalidate();
    });
    listen("pointerleave", () => {
      this.over = false;
      if (this.modifiers.alt) this.invalidate();
      if (!this.press && !this.drag && !this.marquee) this.setPointer(null);
    });
    listen("pointerdown", (event) => this.onPointerDown(event));
    listen("pointermove", (event) => this.onPointerMove(event));
    listen("pointerup", (event) => this.onPointerUp(event));
    listen("pointercancel", (event) => {
      if (this.ownsPointer(event.pointerId)) this.cancel();
    });
    listen("contextmenu", (event) => this.onContextMenu(event));
    listen("dblclick", (event) => this.onDoubleClick(event));
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
      this.deps.session.selection.subscribe(() => {
        this.checkCropMode();
        this.invalidate();
      }),
      this.deps.theme.subscribe((next) => {
        this.theme = next;
        this.cursors = canvasCursors(next);
        this.invalidate();
      }),
      // An edit under a gesture (undo from the keyboard, an autosave reload) ends it with no change.
      this.deps.document.subscribe((state) => {
        if (this.drag && state !== this.drag.project) this.cancel();
        this.checkCropMode();
      }),
      // A font that loads moves text boxes and glyph bounds.
      onTextLayoutsChanged(() => this.invalidate()),
    );
    const cropMode = this.deps.cropMode;
    if (cropMode) {
      this.stops.push(
        cropMode.subscribe(() => {
          this.invalidate();
          this.updateCursor();
        }),
      );
    }
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
    const pointerId = this.press?.pointerId ?? this.drag?.pointerId ?? this.marquee?.pointerId ?? this.textPress ?? undefined;
    if (this.drag?.kind === "crop") this.deps.crops?.write(null);
    if (this.textPress !== null) this.deps.textEditor?.release();
    this.press = null;
    this.drag = null;
    this.marquee = null;
    this.textPress = null;
    this.snapHeld = false;
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
    const crops = this.deps.crops?.read() ?? null;
    const texts = this.deps.texts?.() ?? null;
    const version = textLayoutVersion();
    const cache = this.cache;
    if (cache.project !== project || cache.frame !== frame || cache.transforms !== transforms || cache.crops !== crops || cache.texts !== texts || cache.version !== version) {
      cache.project = project;
      cache.frame = frame;
      cache.transforms = transforms;
      cache.crops = crops;
      cache.texts = texts;
      cache.version = version;
      cache.layers = canvasLayersAt(project, frame, transforms, crops, texts);
    }
    return cache.layers;
  }

  /**
   * The layers in the picture at the playhead (cached per document and frame): the snap targets and
   * measure neighbours. The document's transforms are enough: a gesture's layers are held out.
   */
  private pictureLayers(): CanvasLayer[] {
    const project = this.deps.document.getState();
    const frame = this.deps.session.state.getState().playhead;
    const picture = this.picture;
    const version = textLayoutVersion();
    if (picture.project !== project || picture.frame !== frame || picture.version !== version) {
      picture.project = project;
      picture.frame = frame;
      picture.version = version;
      picture.layers = pictureLayersAt(project, frame);
    }
    return picture.layers;
  }

  /** The selected layers at the playhead, bottom first: what the gizmo holds. */
  selectedLayers(): CanvasLayer[] {
    const selection = this.deps.session.selection.getState();
    if (selection.kind !== "clips") return [];
    return this.layers().filter((layer) => selection.clipIds.has(layer.clipId));
  }

  /** The layer crop mode works on now: the crop target when it is the one layer `held` (the selected ones at the playhead). */
  private cropLayer(held: readonly CanvasLayer[]): CanvasLayer | null {
    const target = this.cropTarget;
    const only = held.length === 1 ? held[0] : undefined;
    return target !== null && only?.clipId === target ? only : null;
  }

  /**
   * Ends crop mode when its clip is gone, locked or no longer a video or image, or when the selection
   * is not that layer alone any more (other clips may come with it: a linked audio partner).
   */
  private checkCropMode(): void {
    const target = this.cropTarget;
    if (target === null) return;
    const project = this.deps.document.getState();
    const clip = project.clips[target];
    const selection = this.deps.session.selection.getState();
    const alone =
      selection.kind === "clips" &&
      selection.clipIds.has(target) &&
      ![...selection.clipIds].some((id) => {
        const other = project.clips[id];
        return id !== target && other !== undefined && isLayerClip(other);
      });
    if (!clip || !isCropClip(clip) || isClipLocked(project, target) || !alone) this.exitCropMode();
  }

  /** What the overlay draws now. */
  scene(): GizmoScene {
    const layers = this.layers();
    const editing = this.deps.textEditor?.editing ?? null;
    if (editing !== null) {
      // Inline editing (§7.7): the edited box outlined, no handles, the caret.
      const edited = layers.find((layer) => layer.clipId === editing);
      return { hover: null, outlines: edited ? [edited.quad] : [], box: null, group: false, anchor: null, marquee: null, snap: null, readout: null, guides: null, crop: null, textBox: false, text: this.deps.textEditor?.scene() ?? null };
    }
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
    // Measure mode (§7.4): Alt over the canvas with no drag shows the distances around the selection.
    const cropLayer = marquee ? null : this.cropLayer(selected);
    const measuring = !drag && !marquee && !this.press && !cropLayer && this.modifiers.alt && this.over && box !== null && this.deps.session.state.getState().preview.guides;
    const guides = drag ? drag.guides : measuring && box ? measureGuides(this.snapCandidates(new Set(selected.map((layer) => layer.clipId))), quadsBounds([box]) as Rect) : null;
    return {
      hover: hoverLayer?.quad ?? null,
      outlines,
      box,
      group: (drag?.start.layers.length ?? selected.length) > 1,
      anchor: showAnchor && single && !cropLayer ? { x: frame.width / 2 + single.transform.x, y: frame.height / 2 + single.transform.y } : null,
      marquee: marquee ? { x0: marquee.from.x, y0: marquee.from.y, x1: marquee.to.x, y1: marquee.to.y } : null,
      snap: result && drag.handle && (result.snapX || result.snapY) ? { handle: drag.handle, x: result.snapX, y: result.snapY } : null,
      readout: result && pointer ? { text: result.readout, x: pointer.x, y: pointer.y } : null,
      guides,
      crop: cropLayer ? { media: layerCorners(cropLayer.transform, { ...cropLayer.box, left: 0, top: 0, right: cropLayer.box.width, bottom: cropLayer.box.height }, frame) } : null,
      textBox: !marquee && !cropLayer && this.textLayer(drag ? drag.start.layers.length : selected.length, single) !== null,
      text: null,
    };
  }

  /** The text clip of the one layer a gizmo holds (`count` layers, `single` the one), or null. */
  private textLayer(count: number, single: { clipId: ClipId } | undefined): ClipId | null {
    if (count !== 1 || !single) return null;
    return this.deps.document.getState().clips[single.clipId]?.kind === "text" ? single.clipId : null;
  }

  // --- Pointer -----------------------------------------------------------------------------------

  private onPointerDown(event: PointerEvent): void {
    if (event.button !== 0 || this.press || this.drag || this.marquee || this.textPress !== null) return;
    if (this.deps.panning() || this.deps.session.state.getState().activeTool === "hand") return;
    const placement = this.deps.placement();
    const point = this.projectPoint(event, placement);
    if (!placement || !point) return;
    this.modifiers = this.modifiersOf(event);
    this.setPointer(event);
    const editor = this.deps.textEditor;
    if (editor?.editing) {
      // On the edited text a press places the caret (§7.7); elsewhere it commits the edit, then acts.
      if (editor.contains(point, (this.theme.gizmo.handleHit * placement.dpr) / 2 / placement.transform[0])) {
        event.preventDefault();
        editor.press(point, this.modifiers.shift);
        this.textPress = event.pointerId;
        this.element?.setPointerCapture?.(event.pointerId);
        this.updateCursor();
        return;
      }
      editor.end(true);
    }
    const { session } = this.deps;
    const selection = session.selection.getState();
    const held = this.selectedLayers();
    const box = gizmoBoxOf(held.map((layer) => layer.quad));
    const mods = this.modifiers;
    const cropLayer = this.cropLayer(held);
    const textLayer = cropLayer ? null : this.textLayer(held.length, held[0]);
    const hit = box ? this.hitBox(box, placement, event, cropLayer !== null, textLayer !== null) : null;
    const under = layersUnder(this.layers(), point.x, point.y);
    const top = under[0];
    // Deep select (§7.2): the next layer under the pointer after the selected one, alone.
    const cycled = () => {
      const at = under.findIndex((layer) => selection.kind === "clips" && selection.clipIds.has(layer.clipId));
      return selectClips([(under[(at + 1) % under.length] as CanvasLayer).clipId]);
    };
    let press: Pick<Press, "drag" | "click"> | null = null;
    // Alt over the anchor marker drags the anchor; released without a drag it is the Alt+click.
    if (box && mods.alt && held.length === 1 && !cropLayer && this.overAnchor(held[0] as CanvasLayer, placement, event)) press = { drag: { kind: "anchor" }, click: top ? cycled() : null };
    else if (hit?.kind === "handle") press = { drag: { kind: cropLayer ? "crop" : textLayer ? textHandleKind(hit.handle) : "scale", handle: hit.handle }, click: null };
    // In crop mode a click on its layer keeps the selection (a group would end crop mode).
    else if (cropLayer && hit?.kind === "body" && !mods.alt && !mods.shift && !mods.mod && top?.clipId === cropLayer.clipId) press = { drag: { kind: "move" }, click: null };
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
    if (this.textPress === event.pointerId) {
      const point = this.projectPoint(event, this.deps.placement());
      if (point) this.deps.textEditor?.drag(point);
      return;
    }
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
    if (this.textPress === event.pointerId) {
      this.textPress = null;
      this.deps.textEditor?.release();
      if (this.element?.hasPointerCapture?.(event.pointerId)) this.element.releasePointerCapture(event.pointerId);
      this.updateCursor();
      return;
    }
    if (!this.ownsPointer(event.pointerId)) return;
    const { press, drag, marquee } = this;
    this.press = null;
    this.drag = null;
    this.marquee = null;
    this.snapHeld = false;
    if (this.element?.hasPointerCapture?.(event.pointerId)) this.element.releasePointerCapture(event.pointerId);
    if (press?.click) setSelection(this.deps.session, press.click);
    if (marquee) setSelection(this.deps.session, marquee.additive ? addToSelection(marquee.base, marquee.hits) : selectClips(marquee.hits));
    if (drag?.result) {
      const count = drag.start.layers.length;
      const labels = LABELS[drag.kind];
      const label = count === 1 ? labels[0] : labels[1];
      const project = this.deps.document.getState();
      const command =
        drag.kind === "crop"
          ? drag.crops
            ? setCrops(project, drag.crops, { label })
            : null
          : drag.texts
            ? setTexts(project, new Map([...drag.texts].map(([id, text]) => [id, { ...text, transform: drag.result?.transforms.get(id) as Transform }])), { label })
            : setTransforms(project, drag.result.transforms, { label });
      // The document takes over from the ephemeral values in the same frame.
      this.deps.scheduler.invalidate("preview");
      if (command) this.deps.commit(command);
      if (drag.kind === "crop") this.deps.crops?.write(null);
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

  /**
   * A double-click on a video or image layer enters crop mode on it alone (spec §7.3, Batch 26); on the
   * layer in crop mode it leaves crop mode. On a text layer it edits the text inline with the caret
   * there (§7.7); while editing, presses count clicks themselves (a word, everything).
   */
  private onDoubleClick(event: MouseEvent): void {
    if (event.button !== 0 || this.drag || this.marquee || this.deps.panning() || this.deps.session.state.getState().activeTool === "hand") return;
    const editor = this.deps.textEditor;
    if (editor?.editing) return;
    const placement = this.deps.placement();
    const point = this.projectPoint(event, placement);
    if (!placement || !point) return;
    const top = layersUnder(this.layers(), point.x, point.y)[0];
    const target = this.cropTarget;
    if (target !== null && top?.clipId === target) {
      this.exitCropMode();
      return;
    }
    const clip = top ? this.deps.document.getState().clips[top.clipId] : undefined;
    if (top && clip?.kind === "text" && editor) {
      this.cancel();
      setSelection(this.deps.session, selectClips([top.clipId]));
      editor.begin(top.clipId, point);
      this.invalidate();
      this.updateCursor();
      return;
    }
    if (!top || !clip || !isCropClip(clip)) return;
    setSelection(this.deps.session, selectClips([top.clipId]));
    this.enterCropMode(top.clipId);
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
    const cropLayer = kind === "crop" ? this.cropLayer(held) : null;
    if (kind === "crop" && !cropLayer) return;
    this.drag = {
      pointerId: press.pointerId,
      kind,
      handle: press.drag.handle ?? null,
      start,
      held: new Set(held.map((layer) => layer.clipId)),
      project,
      point: press.point,
      tracker: kind === "rotate" ? new AngleTracker(rotationPivot(start), press.point) : null,
      result: null,
      guides: null,
      crop: cropLayer ? { clipId: cropLayer.clipId, transform: cropLayer.transform, box: cropLayer.box, frame: project.settings } : null,
      crops: null,
      text: kind === "textSize" || kind === "textWidth" ? this.textStart(held[0] as CanvasLayer, project) : null,
      texts: null,
    };
    if ((kind === "textSize" || kind === "textWidth") && !this.drag.text) {
      this.drag = null;
      return;
    }
    this.deps.onDragStart();
  }

  private updateDrag(): void {
    const drag = this.drag;
    const placement = this.deps.placement();
    const pointer = this.pointer;
    if (!drag || !pointer) return;
    const point = this.projectPoint(pointer, placement);
    if (!point || !placement) return;
    const mods: Modifiers = { shift: this.modifiers.shift, alt: this.modifiers.alt };
    const snapping = this.snapping;
    drag.guides = null;
    switch (drag.kind) {
      case "move": {
        const dx = point.x - drag.point.x;
        const dy = point.y - drag.point.y;
        if (!snapping) {
          drag.result = moveGesture(drag.start, dx, dy, mods);
          break;
        }
        // The box's edges and center snap on the free axes (§7.4); the guides show what it meets.
        const candidates = this.snapCandidates(drag.held);
        const delta = moveDelta(dx, dy, mods.shift);
        const box = quadsBounds([drag.start.box]) as Rect;
        const moved = { x0: box.x0 + delta.x, y0: box.y0 + delta.y, x1: box.x1 + delta.x, y1: box.y1 + delta.y };
        drag.result = moveGesture(drag.start, dx, dy, mods, snapMove(candidates, moved, this.snapReach(placement), delta.free));
        drag.guides = moveGuides(candidates, quadsBounds([drag.result.box]) as Rect);
        break;
      }
      case "scale": {
        const handle = drag.handle as HandleId;
        let result = scaleGesture(drag.start, handle, point, mods, snapping);
        // The dragged edge snaps (§7.4) while the box is axis-aligned: the gesture aims at the target.
        if (snapping && isAxisAligned(drag.start.box)) {
          const candidates = this.snapCandidates(drag.held);
          const { u, v } = HANDLES[handle];
          const fixed = boxPoint(drag.start.box, mods.alt ? 0.5 : 1 - u, mods.alt ? 0.5 : 1 - v);
          const grab = handlePoint(drag.start.box, handle);
          const free = { x: Math.abs(grab.x - fixed.x) > 1e-9, y: Math.abs(grab.y - fixed.y) > 1e-9 };
          const aim = snapHandle(candidates, handlePoint(result.box, handle), fixed, free, isCorner(handle) && !mods.shift, this.snapReach(placement));
          if (aim) result = scaleGesture(drag.start, handle, aim, mods, snapping);
          drag.guides = handleGuides(candidates, quadsBounds([result.box]) as Rect, handlePoint(result.box, handle), free);
        }
        drag.result = result;
        break;
      }
      case "rotate":
        drag.result = rotateGesture(drag.start, (drag.tracker as AngleTracker).update(point), mods);
        break;
      case "anchor":
        drag.result = anchorGesture(drag.start, point);
        break;
      case "crop":
        this.updateCrop(drag, point, placement, mods, snapping);
        break;
      case "textSize":
      case "textWidth": {
        const start = drag.text as TextGestureStart;
        const handle = drag.handle as HandleId;
        const result = drag.kind === "textSize" ? textSizeGesture(start, handle, point, mods) : textWidthGesture(start, handle, point, mods);
        drag.result = { transforms: new Map([[start.clipId, result.transform]]), box: result.box, snapX: false, snapY: false, readout: result.readout };
        drag.texts = new Map([[start.clipId, { text: result.text, style: result.style }]]);
        break;
      }
    }
    this.deps.scheduler.invalidate("preview");
    this.invalidate();
    this.updateCursor();
  }

  /** A text layer as a text handle drag starts from it: its shown text and style (a field scrub's live ones), its transform. */
  private textStart(layer: CanvasLayer, project: Project): TextGestureStart | null {
    const clip = project.clips[layer.clipId];
    if (clip?.kind !== "text") return null;
    const live = this.deps.texts?.()?.get(layer.clipId);
    return { clipId: layer.clipId, text: live?.text ?? clip.text, style: live?.style ?? clip.style, transform: layer.transform, frame: project.settings };
  }

  /** A crop handle drag step: the crop gesture, its edge snapped to the frame, the crop written live (P2). */
  private updateCrop(drag: Drag, point: Point, placement: PreviewPlacement, mods: Modifiers, snapping: boolean): void {
    const start = drag.crop;
    const handle = drag.handle;
    if (!start || !handle) return;
    // Shift inverts the Crop section's aspect lock (as Shift inverts the corners' uniform scale, §7.3).
    const lock = (this.deps.cropMode?.getState().aspectLock ?? false) !== mods.shift;
    let result = cropGesture(start, handle, point, mods, lock);
    // The dragged edge snaps to the frame's edges, center and thirds while the layer is axis-aligned.
    if (snapping && isAxisAligned(drag.start.box)) {
      const { width, height } = start.frame;
      const candidates = this.cropSnapIndex.get({ frame: { width, height }, thirds: true, safe: [], layers: [] });
      const { u, v } = HANDLES[handle];
      const fixed = boxPoint(drag.start.box, mods.alt ? 0.5 : 1 - u, mods.alt ? 0.5 : 1 - v);
      const grab = handlePoint(drag.start.box, handle);
      const free = { x: Math.abs(grab.x - fixed.x) > 1e-9, y: Math.abs(grab.y - fixed.y) > 1e-9 };
      const aim = snapHandle(candidates, handlePoint(result.box, handle), fixed, free, lock && isCorner(handle), this.snapReach(placement));
      if (aim) result = cropGesture(start, handle, aim, mods, lock);
      drag.guides = handleGuides(candidates, quadsBounds([result.box]) as Rect, handlePoint(result.box, handle), free);
    }
    drag.result = { transforms: new Map(), box: result.box, snapX: false, snapY: false, readout: result.readout };
    drag.crops = new Map([[start.clipId, result.crop]]);
    this.deps.crops?.write(drag.crops);
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

  /**
   * Shift, Alt and Mod change a running gesture at once and show the anchor marker (and the measure
   * mode); the keys still reach the dispatcher. During a drag S is the hold-to-invert snapping modifier
   * (§7.4, as on the timeline, §6.9), read here in the capture phase so it never reaches the shortcuts
   * (S, Shift+S, Mod+S); its key-up goes on.
   */
  private onModifierKey(event: KeyboardEvent): void {
    let snapChanged = false;
    if (this.drag && isSnapKey(event)) {
      if (event.type === "keydown") {
        event.preventDefault();
        event.stopPropagation();
        // A repeat comes from a press before the drag (that one toggled the setting): no hold.
        if (!event.repeat && !this.snapHeld) {
          this.snapHeld = true;
          snapChanged = true;
        }
      } else if (this.snapHeld) {
        this.snapHeld = false;
        snapChanged = true;
      }
    }
    const next = this.modifiersOf(event);
    const busy = this.drag !== null || this.marquee !== null || this.press !== null;
    // A lone Alt press-and-release would move the focus to the browser menu (Windows).
    if (event.key === "Alt" && (this.over || busy) && !isEditableTarget(event.target)) event.preventDefault();
    if (!snapChanged && next.shift === this.modifiers.shift && next.alt === this.modifiers.alt && next.mod === this.modifiers.mod) return;
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

  /** The snap candidates without the layers in `exclude` (§7.4); the index rebuilds them only when they change. */
  private snapCandidates(exclude: ReadonlySet<ClipId>): CanvasSnapCandidates {
    const { width, height } = this.deps.document.getState().settings;
    const frame = { width, height };
    const preview = this.deps.session.state.getState().preview;
    const safe: ZoneRect[] = [];
    const zone = safeZoneOn(preview.safeZone, frame);
    if (zone) safe.push(zone.safe);
    if (preview.safeMargins) safe.push(centeredRect(frame, ACTION_SAFE), centeredRect(frame, TITLE_SAFE));
    const layers: Rect[] = [];
    // Other layers in the picture (smart guides on): locked tracks included, muted and hidden ones out.
    if (preview.guides) for (const layer of this.pictureLayers()) if (!exclude.has(layer.clipId)) layers.push(quadsBounds([layer.quad]) as Rect);
    return this.snapIndex.get({ frame, thirds: preview.grid === "thirds", safe, layers });
  }

  /** The snap threshold (§7.4: CSS px on screen, zoom-independent) in project px. */
  private snapReach(placement: PreviewPlacement): number {
    return (this.theme.gizmo.snapThreshold * placement.dpr) / placement.transform[0];
  }

  private metrics(dpr: number) {
    const { handleHit, rotateZone, minEdge } = this.theme.gizmo;
    return { handleHit: handleHit * dpr, rotateZone: rotateZone * dpr, minEdge: minEdge * dpr };
  }

  /** The gizmo zone under the pointer (device px against the box on screen); `crop`: crop handles, no rotate zones; `text`: no top and bottom handles. */
  private hitBox(box: GizmoBox, placement: PreviewPlacement, event: { clientX: number; clientY: number }, crop = false, text = false): GizmoHit | null {
    const device = this.devicePoint(event, placement.dpr);
    return device ? hitGizmo(box, placement.transform, device.x, device.y, this.metrics(placement.dpr), crop, text) : null;
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
      // Scale and crop handles: the resize cursor of the handle's direction on screen.
      return placement && drag.result ? resizeCursor(drag.result.box, placement.transform, drag.handle as HandleId) : "";
    }
    if (this.textPress !== null) return "text";
    if (this.marquee || this.press || !this.over || !this.pointer || !placement) return "";
    const editor = this.deps.textEditor;
    if (editor?.editing) {
      const point = this.projectPoint(this.pointer, placement);
      return point && editor.contains(point, (this.theme.gizmo.handleHit * placement.dpr) / 2 / placement.transform[0]) ? "text" : "";
    }
    const held = this.selectedLayers();
    const box = gizmoBoxOf(held.map((layer) => layer.quad));
    if (!box) return "";
    const cropping = this.cropLayer(held) !== null;
    if (!cropping && this.modifiers.alt && held.length === 1 && this.overAnchor(held[0] as CanvasLayer, placement, this.pointer)) return "crosshair";
    const hit = this.hitBox(box, placement, this.pointer, cropping, !cropping && this.textLayer(held.length, held[0]) !== null);
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
