// Inline text editing on the preview canvas (spec §7.7, §10.2). Framework-free.
// - A transparent <textarea> (the `textEditing` keyboard scope) sits over the edited text's block at
//   the current zoom, with the text's font, size, spacing, line height and alignment, so the browser's
//   caret (and the IME window that follows it) is where ours is. It only provides keys, IME and the
//   clipboard: it draws nothing (no text, no caret, no selection color) and takes no pointer input.
// - The draft (the textarea's value), the selection and the IME composition are this editor's; the
//   preview and the canvas show the draft through `live()` (ephemeral, P2): the text with the box
//   moved by its anchor (`keepAnchored`, as a committed edit would) and the selection highlight drawn
//   in the text's raster (WYSIWYG). The caret and the composition underline are drawn on the overlay
//   canvas (`scene()`) from the rasterizer's own measurements (render/text/caret.ts): a blink never
//   re-rasterizes (P11).
// - Keys: typing, deletion, Left / Right, word moves, Mod+A, the clipboard and undo of the typing are
//   the textarea's; Up / Down / Home / End (Shift extends) follow the drawn lines (wraps included).
//   Enter and Shift+Enter insert a line break. Mod+Enter, Esc (`text.commit`, `text.cancel`) commit
//   and exit (the app's actions call `end`).
// - Pointer (from CanvasEditInput): a press on the edited text places the caret (Shift extends, a
//   double press selects a word, a triple press everything) and a drag selects.
// - The edit is one command ("Edit text") when editing ends: Esc, Mod+Enter, a press or focus outside
//   the textarea, the canvas and the kept areas (the properties panel and its popovers stay live while
//   editing: a font size change keeps the caret and the draft), the clip leaving the selection, the
//   playhead leaving the clip, or its track hiding. A removed or locked clip ends it with no command.
import type { Command } from "../../core/commands/command.js";
import type { ClipId, TextContent, TextStyle, Transform } from "../../core/document/types.js";
import type { Platform } from "../../core/keyboard/keys.js";
import type { FrameScheduler, RenderView } from "../../core/scheduler/FrameScheduler.js";
import { createStore } from "../../core/store/createStore.js";
import type { DocumentStore } from "../../core/store/DocumentStore.js";
import type { SessionStore } from "../../core/store/sessionStore.js";
import type { Theme, ThemeBridge } from "../../core/theme/theme.js";
import { keepAnchored, setTexts } from "../../timeline/edit/text.js";
import { layerPoint, rotationTrig, scaleYOf, type Point, type Size } from "../../timeline/edit/transform.js";
import { isClipLocked } from "../../timeline/model/queries.js";
import { caretAt, indexAtPoint, lineEdge, selectionRects, verticalMove, wordAt, type CaretContext } from "../text/caret.js";
import type { TextLayout } from "../text/layout.js";
import { currentMeasurer, textFallback, textLayout, textLayoutVersion } from "../text/layoutCache.js";
import { cappedScale, rasterRect, type TextHighlight } from "../text/raster.js";
import { textScaleBucket } from "../text/TextRasterCache.js";
import { toScreen } from "./gizmo.js";
import type { PreviewPlacement } from "./PreviewView.js";

/** A text clip as shown apart from the draft: the document's, or a Text field scrub's live values. */
export interface ShownText {
  text: TextContent;
  style: TextStyle;
  transform: Transform;
}

export interface InlineTextEditorDeps {
  document: Pick<DocumentStore, "getState" | "subscribe">;
  session: SessionStore;
  scheduler: Pick<FrameScheduler, "invalidate" | "register">;
  theme: Pick<ThemeBridge, "theme" | "subscribe">;
  platform: Platform;
  /** The frame on the canvas as last rendered (null before it and while a split preview shows). */
  placement(): PreviewPlacement | null;
  /** Device px per project px the last render rasterized text at. */
  textScale(): number;
  /** The clip as shown apart from the draft, or null when it is not a text clip. */
  shown(clipId: ClipId): ShownText | null;
  /** The edit's one command (spec P2). */
  commit(command: Command): void;
  /** Whether a press or focus at `target` keeps editing on (the canvas, the properties panel, popovers). */
  keeps(target: EventTarget | null): boolean;
  /** Editing started or took the keyboard back (a press on the text: the clip), or ended (null). */
  onEditing?(clipId: ClipId | null): void;
}

/** The edited text as the preview and the canvas show it. */
export interface DraftText extends ShownText {
  clipId: ClipId;
  layout: TextLayout;
  /** The selection highlight (drawn in the raster), or null with no selection. */
  highlight: TextHighlight | null;
  /** Raster px per content px the text is drawn at (its carets are measured at it). */
  scale: number;
}

/** What the overlay draws for inline editing, in project px. */
export interface TextEditScene {
  /** The caret (top to bottom of the em box), null while blinked off or with a selection. */
  caret: [Point, Point] | null;
  /** The IME composition's underline, one segment per line. */
  underline: readonly [Point, Point][];
}

interface Session {
  clipId: ClipId;
  value: string;
  start: number;
  end: number;
  backward: boolean;
  /** The caret sits at the end of a wrapped line rather than the start of the next. */
  upstream: boolean;
  /** The x a run of Up / Down keeps to. */
  goalX: number | null;
  composition: { from: number; to: number } | null;
  /** The selection this editor set (its echo keeps the goal x). */
  own: { start: number; end: number } | null;
}

/** Presses this close in time and space count as a double (triple) press. */
const MULTI_PRESS_MS = 500;
const MULTI_PRESS_PX = 4;

/** Content point (`x`, `y`) of a text layer in project px (flips mirror the text inside its box, as the compositor). */
export function textToProject(transform: Transform, size: Size, frame: Size, x: number, y: number): Point {
  return layerPoint(transform, size, frame, transform.flipH ? size.width - x : x, transform.flipV ? size.height - y : y);
}

/** The text layer's content point under project point `p` (the inverse of `textToProject`), or null for a zero scale. */
export function projectToText(transform: Transform, size: Size, frame: Size, p: Point): Point | null {
  const sx = transform.scale;
  const sy = scaleYOf(transform);
  if (!sx || !sy) return null;
  const { sin, cos } = rotationTrig(transform.rotation);
  const wx = p.x - frame.width / 2 - transform.x;
  const wy = p.y - frame.height / 2 - transform.y;
  let x = (cos * wx + sin * wy) / sx + transform.anchor.x * size.width;
  let y = (-sin * wx + cos * wy) / sy + transform.anchor.y * size.height;
  if (transform.flipH) x = size.width - x;
  if (transform.flipV) y = size.height - y;
  return { x, y };
}

export class InlineTextEditor implements RenderView {
  private textarea: HTMLTextAreaElement | null = null;
  private session: Session | null = null;
  private theme: Theme;
  private caretOn = true;
  private blink: ReturnType<typeof setInterval> | null = null;
  private lastPress: { time: number; point: Point; count: number } | null = null;
  /** The selection end a press drag keeps (its anchor). */
  private dragAnchor: number | null = null;
  private memo: { key: unknown[]; draft: DraftText } | null = null;
  private textMemo: { base: TextContent; value: string; text: TextContent } | null = null;
  private placed = "";
  private readonly stops: (() => void)[] = [];
  /** The edited clip and its draft, for React (the properties content field shows the draft). */
  readonly state = createStore<{ clipId: ClipId | null; value: string }>({ clipId: null, value: "" });

  constructor(private readonly deps: InlineTextEditorDeps) {
    this.theme = deps.theme.theme;
  }

  /** The clip edited inline, or null. */
  get editing(): ClipId | null {
    return this.session?.clipId ?? null;
  }

  /** The editing textarea (tests, acceptance scripts), or null before `mount`. */
  get element(): HTMLTextAreaElement | null {
    return this.textarea;
  }

  /** Creates the editing textarea in `host` (over the canvases), with `className` (transparent, no selection color). */
  mount(host: HTMLElement, className: string): () => void {
    this.unmount();
    const doc = host.ownerDocument;
    const textarea = doc.createElement("textarea");
    textarea.className = className;
    textarea.setAttribute("data-scope", "textEditing");
    textarea.setAttribute("aria-label", "Edit text");
    textarea.spellcheck = false;
    textarea.setAttribute("autocomplete", "off");
    textarea.setAttribute("autocorrect", "off");
    textarea.setAttribute("autocapitalize", "off");
    textarea.tabIndex = -1;
    textarea.hidden = true;
    host.append(textarea);
    this.textarea = textarea;
    const on = <K extends keyof HTMLElementEventMap>(target: HTMLElement, type: K, handler: (event: HTMLElementEventMap[K]) => void) => {
      target.addEventListener(type, handler as EventListener);
      this.stops.push(() => target.removeEventListener(type, handler as EventListener));
    };
    const onDoc = <K extends keyof DocumentEventMap>(type: K, handler: (event: DocumentEventMap[K]) => void, capture: boolean) => {
      doc.addEventListener(type, handler as EventListener, capture);
      this.stops.push(() => doc.removeEventListener(type, handler as EventListener, capture));
    };
    on(textarea, "input", () => this.sync(true));
    on(textarea, "keydown", (event) => this.onKeyDown(event));
    // Keys move the selection after their listeners ran: read it once they did.
    on(textarea, "keyup", () => this.sync(false));
    on(textarea, "select", () => this.sync(false));
    on(textarea, "compositionstart", () => {
      const s = this.session;
      if (s) s.composition = { from: Math.min(textarea.selectionStart, textarea.selectionEnd), to: Math.max(textarea.selectionStart, textarea.selectionEnd) };
    });
    on(textarea, "compositionupdate", (event) => {
      const s = this.session;
      if (s?.composition) s.composition = { from: s.composition.from, to: s.composition.from + event.data.length };
      this.changed();
    });
    on(textarea, "compositionend", () => {
      if (this.session) this.session.composition = null;
      this.sync(true);
    });
    on(textarea, "focus", () => this.restartBlink());
    on(textarea, "blur", () => {
      this.stopBlink();
      this.caretOn = true;
      this.deps.scheduler.invalidate("gizmo");
    });
    onDoc("selectionchange", () => {
      if (doc.activeElement === textarea) this.sync(false);
    }, false);
    // A press or focus elsewhere commits (spec §7.7 "clicking elsewhere commits").
    onDoc("pointerdown", (event) => this.outside(event.target), true);
    onDoc("focusin", (event) => this.outside(event.target), true);
    // The browser scrolls the textarea's caret into view, and the panels around it clip (overflow
    // hidden: they scroll). They never scroll otherwise: put them back.
    onDoc("scroll", (event) => {
      const target = event.target;
      if (this.session && target instanceof Element && target !== textarea && target.contains(textarea)) {
        target.scrollTop = 0;
        target.scrollLeft = 0;
      }
    }, true);
    this.stops.push(
      this.deps.scheduler.register("preview", this),
      this.deps.scheduler.register("gizmo", this),
      this.deps.theme.subscribe((next) => {
        this.theme = next;
        this.memo = null;
        this.deps.scheduler.invalidate("preview");
        this.deps.scheduler.invalidate("gizmo");
      }),
      this.deps.document.subscribe(() => this.check()),
      this.deps.session.selection.subscribe(() => this.check()),
      this.deps.session.state.select((state) => state.playhead, () => this.check()),
      () => {
        textarea.remove();
        this.textarea = null;
      },
    );
    return () => this.unmount();
  }

  unmount(): void {
    this.end(false);
    for (const stop of this.stops.splice(0)) stop();
  }

  /**
   * Starts editing text clip `clipId` (spec §7.7): the whole text selected (`"all"`, a new title or
   * Enter), or the caret at project point `at` (a double-click). Another clip's editing ends first
   * (committed). False when the clip cannot be edited (gone, not text, locked, hidden) or nothing is mounted.
   */
  begin(clipId: ClipId, at: "all" | Point): boolean {
    const textarea = this.textarea;
    if (this.session && this.session.clipId !== clipId) this.end(true);
    const project = this.deps.document.getState();
    const clip = project.clips[clipId];
    if (!textarea || clip?.kind !== "text" || isClipLocked(project, clipId)) return false;
    if (project.tracks.find((track) => track.id === clip.trackId)?.hidden) return false;
    if (!this.session) {
      const value = clip.text.value;
      this.session = { clipId, value, start: 0, end: 0, backward: false, upstream: false, goalX: null, composition: null, own: null };
      this.memo = null;
      this.placed = "";
      textarea.value = value;
      textarea.hidden = false;
      this.state.set({ clipId, value });
      this.deps.onEditing?.(clipId);
      // Placed before it takes the focus, so the browser has nothing to scroll.
      this.render();
    }
    textarea.focus({ preventScroll: true });
    if (at === "all") this.select(0, textarea.value.length, false);
    else this.press(at, false);
    this.restartBlink();
    return true;
  }

  /** Ends editing (spec §7.7): the draft becomes one "Edit text" command unless `commit` is false. False when nothing was edited. */
  end(commit = true): boolean {
    const s = this.session;
    if (!s) return false;
    if (commit) {
      const project = this.deps.document.getState();
      const clip = project.clips[s.clipId];
      if (clip?.kind === "text" && clip.text.value !== s.value) {
        const command = setTexts(project, new Map([[s.clipId, { text: { ...clip.text, value: s.value } }]]), { label: "Edit text", at: this.deps.session.state.getState().playhead });
        if (command) this.deps.commit(command);
      }
    }
    this.session = null;
    this.memo = null;
    this.textMemo = null;
    this.dragAnchor = null;
    this.lastPress = null;
    this.stopBlink();
    const textarea = this.textarea;
    if (textarea) {
      if (textarea.ownerDocument.activeElement === textarea) textarea.blur();
      textarea.value = "";
      textarea.hidden = true;
      textarea.style.cssText = "";
      this.placed = "";
    }
    this.state.set({ clipId: null, value: "" });
    this.deps.onEditing?.(null);
    this.deps.scheduler.invalidate("preview");
    this.deps.scheduler.invalidate("gizmo");
    return true;
  }

  /** The edited text as shown (the draft over the clip's shown text and style), or null; the same object while nothing changed. */
  live(): DraftText | null {
    const s = this.session;
    if (!s) return null;
    const base = this.deps.shown(s.clipId);
    if (!base) return null;
    const frame = this.deps.document.getState().settings;
    const text = this.draftContent(base.text, s.value);
    const layout = textLayout(text, base.style);
    const scale = this.rasterScale(layout, base.transform);
    const color = this.theme.gizmo.textSelection;
    const key = [base.text, base.style, base.transform, text, s.start, s.end, scale, color, textLayoutVersion(), frame.width, frame.height];
    const memo = this.memo;
    if (memo && memo.key.length === key.length && memo.key.every((value, i) => value === key[i])) return memo.draft;
    const transform = keepAnchored(base.transform, textLayout(base.text, base.style), layout, base.style, frame);
    const draft: DraftText = { clipId: s.clipId, text, style: base.style, transform, layout, highlight: null, scale };
    if (s.start !== s.end) draft.highlight = { rects: selectionRects(this.context(draft, s.value), s.start, s.end), color };
    this.memo = { key, draft };
    return draft;
  }

  /** The caret and the composition underline for the overlay, or null when not editing. */
  scene(): TextEditScene | null {
    const s = this.session;
    const draft = this.live();
    if (!s || !draft) return null;
    const frame = this.deps.document.getState().settings;
    const context = this.context(draft, s.value);
    const at = (x: number, y: number) => textToProject(draft.transform, draft.layout, frame, x, y);
    let caret: [Point, Point] | null = null;
    if (this.caretOn && s.start === s.end) {
      const c = caretAt(context, s.start, s.upstream);
      caret = [at(c.x, c.top), at(c.x, c.bottom)];
    }
    const underline: [Point, Point][] = [];
    if (s.composition && s.composition.to > s.composition.from) {
      // Along each line's em box bottom.
      const { descent } = context.measurer.fontMetrics(draft.layout.font, draft.style.fontSize);
      for (const rect of selectionRects(context, s.composition.from, s.composition.to)) {
        const line = draft.layout.lines.find((candidate) => candidate.top === rect.y);
        const y = line ? line.baseline + descent : rect.y + rect.height;
        underline.push([at(rect.x, y), at(rect.x + rect.width, y)]);
      }
    }
    return { caret, underline };
  }

  /** Whether project point `p` is on the edited text's box (grown by `reach` project px). */
  contains(p: Point, reach = 0): boolean {
    const draft = this.live();
    if (!draft) return false;
    const c = projectToText(draft.transform, draft.layout, this.deps.document.getState().settings, p);
    const scale = Math.max(Math.abs(draft.transform.scale), Math.abs(scaleYOf(draft.transform))) || 1;
    const r = reach / scale;
    return c !== null && c.x >= -r && c.y >= -r && c.x <= draft.layout.width + r && c.y <= draft.layout.height + r;
  }

  /**
   * A press at project point `p` on the edited text: the caret there (Shift extends the selection; a
   * second press selects a word, a third everything). The keyboard comes back to the textarea.
   */
  press(p: Point, shift: boolean): void {
    const s = this.session;
    const draft = this.live();
    const textarea = this.textarea;
    if (!s || !draft || !textarea) return;
    const hit = this.hit(draft, p);
    if (!hit) return;
    const now = performance.now();
    const placement = this.deps.placement();
    const reach = placement ? (MULTI_PRESS_PX * placement.dpr) / (placement.transform[0] || 1) : MULTI_PRESS_PX;
    const last = this.lastPress;
    const count = last && now - last.time < MULTI_PRESS_MS && Math.hypot(last.point.x - p.x, last.point.y - p.y) <= reach ? last.count + 1 : 1;
    this.lastPress = { time: now, point: p, count };
    if (textarea.ownerDocument.activeElement !== textarea) textarea.focus({ preventScroll: true });
    // The press went to the canvas (the preview scope): the keyboard is the editor's again.
    this.deps.onEditing?.(s.clipId);
    if (count >= 3) {
      this.dragAnchor = null;
      this.select(0, s.value.length, false);
      return;
    }
    if (count === 2) {
      // The character under the pointer: the one before the nearest boundary when that is right of it.
      const content = projectToText(draft.transform, draft.layout, this.deps.document.getState().settings, p);
      const caretX = caretAt(this.context(draft, s.value), hit.index, hit.upstream).x;
      const index = content && caretX > content.x ? Math.max(0, hit.index - 1) : hit.index;
      const word = wordAt(s.value, index);
      this.dragAnchor = null;
      this.select(word.from, word.to, false);
      return;
    }
    const anchor = shift ? (s.backward ? s.end : s.start) : hit.index;
    this.dragAnchor = anchor;
    this.select(Math.min(anchor, hit.index), Math.max(anchor, hit.index), hit.index < anchor, hit.upstream);
  }

  /** A press drags to project point `p`: the selection runs from the press to it. */
  drag(p: Point): void {
    const s = this.session;
    const draft = this.live();
    const anchor = this.dragAnchor;
    if (!s || !draft || anchor === null) return;
    const hit = this.hit(draft, p);
    if (hit) this.select(Math.min(anchor, hit.index), Math.max(anchor, hit.index), hit.index < anchor, hit.upstream);
  }

  /** The press ended. */
  release(): void {
    this.dragAnchor = null;
  }

  /** Places the textarea over the edited text (DOM writes only, in the scheduler's pass). */
  render(): void {
    const textarea = this.textarea;
    const draft = this.live();
    const placement = this.deps.placement();
    if (!textarea || !draft) return;
    if (!placement) {
      if (this.placed !== "hidden") textarea.style.cssText = "visibility: hidden";
      this.placed = "hidden";
      return;
    }
    const frame = this.deps.document.getState().settings;
    const { layout, style } = draft;
    const block = layout.block;
    const dpr = placement.dpr || 1;
    const point = (x: number, y: number) => toScreen(placement.transform, textToProject(draft.transform, layout, frame, x, y));
    const o = point(block.x, block.y);
    const ex = point(block.x + 1, block.y);
    const ey = point(block.x, block.y + 1);
    const m = [(ex.x - o.x) / dpr, (ex.y - o.y) / dpr, (ey.x - o.x) / dpr, (ey.y - o.y) / dpr, o.x / dpr, o.y / dpr].map((v) => Math.round(v * 1e4) / 1e4);
    const fixed = draft.text.box.mode === "fixed";
    const css = [
      `transform: matrix(${m.join(", ")})`,
      `width: ${block.width}px`,
      `height: ${block.height + layout.lineHeight}px`,
      `font: ${layout.font}`,
      `line-height: ${layout.lineHeight}px`,
      `letter-spacing: ${style.letterSpacing}px`,
      `text-align: ${style.align}`,
      `white-space: ${fixed ? "pre-wrap" : "pre"}`,
    ].join("; ");
    if (css !== this.placed) {
      textarea.style.cssText = css;
      this.placed = css;
    }
  }

  // --- Keys and selection ------------------------------------------------------------------------

  private onKeyDown(event: KeyboardEvent): void {
    const s = this.session;
    if (!s || event.isComposing) return;
    const mod = this.deps.platform === "mac" ? event.metaKey : event.ctrlKey;
    const vertical = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
    const edge = event.key === "Home" ? "start" : event.key === "End" ? "end" : null;
    if ((vertical === 0 && !edge) || mod || event.altKey) {
      // The textarea moves the selection after this listener: read it once it did.
      setTimeout(() => this.sync(false), 0);
      return;
    }
    const draft = this.live();
    if (!draft) return;
    event.preventDefault();
    const context = this.context(draft, s.value);
    const focus = s.backward ? s.start : s.end;
    const anchor = s.backward ? s.end : s.start;
    let next: { index: number; upstream: boolean };
    let goalX: number | null = null;
    if (vertical !== 0) {
      goalX = s.goalX ?? caretAt(context, focus, s.upstream).x;
      next = verticalMove(context, focus, vertical as -1 | 1, goalX, s.upstream);
    } else next = lineEdge(context, focus, edge as "start" | "end", s.upstream);
    if (event.shiftKey) this.select(Math.min(anchor, next.index), Math.max(anchor, next.index), next.index < anchor, next.upstream);
    else this.select(next.index, next.index, false, next.upstream);
    s.goalX = goalX;
  }

  /** Sets the selection (`backward`: the caret at its start) in the textarea and here. */
  private select(start: number, end: number, backward: boolean, upstream = false): void {
    const s = this.session;
    const textarea = this.textarea;
    if (!s || !textarea) return;
    textarea.setSelectionRange(start, end, backward ? "backward" : "forward");
    s.start = start;
    s.end = end;
    s.backward = backward && start !== end;
    s.upstream = upstream && start === end;
    s.goalX = null;
    s.own = { start, end };
    this.changed();
  }

  /** Reads the draft and the selection from the textarea (`typed`: the value changed). */
  private sync(typed: boolean): void {
    const s = this.session;
    const textarea = this.textarea;
    if (!s || !textarea) return;
    const value = textarea.value;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const backward = textarea.selectionDirection === "backward";
    if (!typed && value === s.value && start === s.start && end === s.end && backward === s.backward) return;
    const echo = s.own !== null && s.own.start === start && s.own.end === end && value === s.value;
    if (!echo) {
      s.goalX = null;
      s.upstream = false;
      s.own = null;
    }
    s.value = value;
    s.start = start;
    s.end = end;
    s.backward = backward && start !== end;
    if (this.state.getState().value !== value) this.state.set({ clipId: s.clipId, value });
    this.changed();
  }

  private changed(): void {
    this.restartBlink();
    this.deps.scheduler.invalidate("preview");
    this.deps.scheduler.invalidate("gizmo");
  }

  // --- Session end -------------------------------------------------------------------------------

  /** A press or focus at `target`: editing ends unless it is the textarea or a kept area. */
  private outside(target: EventTarget | null): void {
    if (!this.session || target === this.textarea || this.deps.keeps(target)) return;
    this.end(true);
  }

  /** Ends editing when its clip went (no command), locked or hid, left the selection or the playhead. */
  private check(): void {
    const s = this.session;
    if (!s) return;
    const project = this.deps.document.getState();
    const clip = project.clips[s.clipId];
    if (clip?.kind !== "text" || isClipLocked(project, s.clipId)) {
      this.end(false);
      return;
    }
    const track = project.tracks.find((candidate) => candidate.id === clip.trackId);
    const selection = this.deps.session.selection.getState();
    const playhead = this.deps.session.state.getState().playhead;
    if (track?.hidden || selection.kind !== "clips" || !selection.clipIds.has(s.clipId) || playhead < clip.start || playhead >= clip.start + clip.duration) this.end(true);
  }

  // --- Helpers -------------------------------------------------------------------------------------

  /** The draft as content: the base text itself while the value is the same (its raster stays shared). */
  private draftContent(base: TextContent, value: string): TextContent {
    if (base.value === value) return base;
    const memo = this.textMemo;
    if (memo && memo.base === base && memo.value === value) return memo.text;
    const text = { value, box: base.box };
    this.textMemo = { base, value, text };
    return text;
  }

  /** The raster scale of the text as the preview draws it: the scale bucket of the render scale times the layer's, capped (raster.ts). */
  private rasterScale(layout: TextLayout, transform: Transform): number {
    const layer = Math.max(Math.abs(transform.scale), Math.abs(scaleYOf(transform)));
    const bucket = textScaleBucket(this.deps.textScale() * layer);
    const rect = rasterRect(layout);
    return rect ? cappedScale(rect, bucket) : bucket;
  }

  private context(draft: DraftText, value: string): CaretContext {
    return { layout: draft.layout, style: draft.style, value, measurer: currentMeasurer(), fallback: textFallback(), scale: draft.scale };
  }

  /** The index under project point `p`. */
  private hit(draft: DraftText, p: Point): { index: number; upstream: boolean } | null {
    const s = this.session;
    const content = projectToText(draft.transform, draft.layout, this.deps.document.getState().settings, p);
    return s && content ? indexAtPoint(this.context(draft, s.value), content.x, content.y) : null;
  }

  private restartBlink(): void {
    this.caretOn = true;
    this.stopBlink();
    const textarea = this.textarea;
    const period = this.theme.gizmo.caretBlink;
    if (!this.session || !textarea || textarea.ownerDocument.activeElement !== textarea || !(period > 0)) return;
    this.blink = setInterval(() => {
      this.caretOn = !this.caretOn;
      this.deps.scheduler.invalidate("gizmo");
    }, period);
  }

  private stopBlink(): void {
    if (this.blink !== null) clearInterval(this.blink);
    this.blink = null;
  }
}
