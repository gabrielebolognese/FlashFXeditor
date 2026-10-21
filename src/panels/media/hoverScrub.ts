// Hover-scrub on media cards (spec §12): moving the pointer across a card's thumbnail scrubs through
// the media with the thumbnail sheets (no decoding). The x position maps to a time (in project
// frames); a thin progress line marks it, the badge shows its timecode, and the card picture shows the
// LOD1 thumbnail nearest to it (a LOD0 one while that sheet loads). While a card is hovered, I / O set
// its source range there (session state, the range bar on the card), Alt+X clears it, and `,` / `.`
// insert or overwrite it at the playhead. Framework-free: the media list hands over its pointer moves
// (delegated) and the class writes the DOM directly (no React render while hovering, P1); the card
// picture goes through the PosterPainter (the FrameScheduler loop). The thumbnail's page rect is read
// once when the pointer enters it (P9).
import { formatTimecode, frameToUs, usToFrameFloor } from "../../core/document/time.js";
import type { Frame, MediaId, MediaItem, Project, Us } from "../../core/document/types.js";
import { isEditableTarget } from "../../core/keyboard/KeyDispatcher.js";
import type { Store } from "../../core/store/createStore.js";
import type { SessionState, SourceRange } from "../../core/store/sessionStore.js";
import { cellOrigin, thumbIndex, type ThumbLayout, type ThumbLevel } from "../../media/cache/thumbSheets.js";
import type { CardImage, SheetKey } from "../../media/ThumbnailStore.js";
import type { PosterTarget } from "./PosterPainter.js";

/** The position (project frames into the media, 0..`total`) under a pointer at `fraction` (0..1) of the thumbnail's width. */
export function hoverFrame(fraction: number, total: Frame): Frame {
  return Math.min(total, Math.max(0, Math.round(fraction * total)));
}

/** Whole project frames of a media item (its hover-scrub positions run 0..this); 0 for stills. */
export function scrubFrames(media: MediaItem, fps: Project["settings"]["fps"]): Frame {
  return media.kind === "image" || media.durationUs <= 0 ? 0 : usToFrameFloor(media.durationUs, fps);
}

/**
 * I / O while hovering (spec §12): the range with its in or out point at `timeUs` (the out point is the
 * range's exclusive end: O at 5 s ends it there). A point on the wrong side of the other clears the other
 * (as on the timeline, §6.13). Null when the point is refused: an in point with less than a frame
 * (`frameUs`) after it, an out point at the media start.
 */
export function markSource(range: SourceRange | null, point: "in" | "out", timeUs: Us, durationUs: Us, frameUs: Us): SourceRange | null {
  if (point === "in") {
    if (timeUs < 0 || durationUs - timeUs < frameUs) return null;
    const outUs = range?.outUs ?? null;
    return { inUs: timeUs, outUs: outUs !== null && outUs <= timeUs ? null : outUs };
  }
  if (timeUs <= 0 || timeUs > durationUs) return null;
  const inUs = range?.inUs ?? null;
  return { inUs: inUs !== null && inUs >= timeUs ? null : inUs, outUs: timeUs };
}

/** The range bar on a card (spec §12): the range's start and end as fractions of the media. */
export function rangeFractions(range: SourceRange, durationUs: Us): { from: number; to: number } {
  if (durationUs <= 0) return { from: 0, to: 1 };
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  return { from: clamp((range.inUs ?? 0) / durationUs), to: clamp((range.outUs ?? durationUs) / durationUs) };
}

/** The scrub's picture: a cell of the LOD1 sheet nearest `timeUs` when it is in memory, else of LOD0; and the LOD1 sheet to load. */
export function scrubCell(layout: ThumbLayout, timeUs: Us, sheetOf: (level: ThumbLevel, sheet: number) => ImageBitmap | null): { image: CardImage | null; key: string; want: number } {
  const want = Math.floor(thumbIndex(layout, 1, timeUs) / layout.perSheet);
  for (const level of [1, 0] as const) {
    const index = thumbIndex(layout, level, timeUs);
    const bitmap = sheetOf(level, Math.floor(index / layout.perSheet));
    if (!bitmap || bitmap.width === 0) continue;
    const { x, y } = cellOrigin(layout, index);
    return { image: { bitmap, sx: x, sy: y, sw: layout.width, sh: layout.height }, key: `${level}/${index}`, want };
  }
  return { image: null, key: "", want };
}

/** The thumbnail sheets as the hover-scrub reads them (the open project's ThumbnailStore). */
export interface ScrubSheets {
  layout(mediaId: MediaId): ThumbLayout | null;
  sheet(mediaId: MediaId, level: ThumbLevel, sheet: number): ImageBitmap | null;
  /** The sheet to load first and keep (null: the hover ended). */
  hover(key: SheetKey | null): void;
  /** Calls `listener` when a sheet arrives. */
  subscribe(listener: () => void): () => void;
}

export interface HoverScrubDeps {
  sheets: ScrubSheets;
  painter: { scrub(canvas: PosterTarget, image: CardImage): void; endScrub(canvas: PosterTarget): void };
  document: { getState(): Project };
  session: Store<SessionState>;
  /** I / O / Alt+X on the hovered card. */
  setRange(mediaId: MediaId, range: SourceRange | null): void;
  /** `,` (insert) / `.` (overwrite) on the hovered card: at the playhead with its range. */
  place(mediaId: MediaId, mode: "insert" | "overwrite"): void;
  /** True while media are dragged out of the panel: no hover then. */
  dragging(): boolean;
}

interface Hovered {
  mediaId: MediaId;
  thumb: HTMLElement;
  canvas: HTMLCanvasElement | null;
  progress: HTMLElement | null;
  time: HTMLElement | null;
  left: number;
  width: number;
  /** The scrub position (project frames into the media), -1 before the first. */
  frame: Frame;
  /** The cell drawn ("" none yet) and the LOD1 sheet asked for (-1 none). */
  cell: string;
  want: number;
}

export class HoverScrub {
  private hovered: Hovered | null = null;
  private stopArrivals: (() => void) | null = null;

  constructor(private readonly deps: HoverScrubDeps) {}

  /** The hovered media, or null. */
  get mediaId(): MediaId | null {
    return this.hovered?.mediaId ?? null;
  }

  /** The hover position in project frames into the media, or null. */
  get frame(): Frame | null {
    return this.hovered && this.hovered.frame >= 0 ? this.hovered.frame : null;
  }

  /** A pointer move over the media list: enters, scrubs or leaves the thumbnail (`[data-thumb]`) under it. */
  move(event: Pick<PointerEvent, "target" | "clientX" | "buttons">): void {
    const thumb = event.buttons === 0 && !this.deps.dragging() ? ((event.target as Element | null)?.closest?.<HTMLElement>("[data-thumb]") ?? null) : null;
    if (!thumb) {
      this.leave();
      return;
    }
    if (this.hovered?.thumb !== thumb) {
      this.leave();
      if (!this.enter(thumb)) return;
    }
    this.scrubTo(event.clientX);
  }

  /** The pointer left the list (or it scrolled): the card shows its poster and duration again. */
  leave(): void {
    const hovered = this.hovered;
    if (!hovered) return;
    this.hovered = null;
    delete hovered.thumb.dataset.scrubbing;
    if (hovered.canvas) this.deps.painter.endScrub(hovered.canvas);
    this.deps.sheets.hover(null);
    this.stopArrivals?.();
    this.stopArrivals = null;
    hovered.thumb.ownerDocument.defaultView?.removeEventListener("keydown", this.onKey, true);
  }

  private enter(thumb: HTMLElement): boolean {
    const mediaId = thumb.closest<HTMLElement>("[data-media-id]")?.dataset.mediaId;
    if (mediaId === undefined || !this.deps.document.getState().media[mediaId]) return false;
    const rect = thumb.getBoundingClientRect();
    this.hovered = {
      mediaId,
      thumb,
      canvas: thumb.querySelector("canvas"),
      progress: thumb.querySelector<HTMLElement>("[data-progress]"),
      time: thumb.querySelector<HTMLElement>("[data-hover-time]"),
      left: rect.left,
      width: rect.width,
      frame: -1,
      cell: "",
      want: -1,
    };
    // Capture phase, ahead of the KeyDispatcher: I / O / Alt+X / , / . belong to the hovered card.
    thumb.ownerDocument.defaultView?.addEventListener("keydown", this.onKey, true);
    this.stopArrivals = this.deps.sheets.subscribe(() => this.showPicture());
    return true;
  }

  private media(): MediaItem | null {
    return this.hovered ? (this.deps.document.getState().media[this.hovered.mediaId] ?? null) : null;
  }

  private scrubTo(clientX: number): void {
    const hovered = this.hovered;
    const media = this.media();
    if (!hovered || !media || hovered.width <= 0) return;
    const project = this.deps.document.getState();
    const total = scrubFrames(media, project.settings.fps);
    if (total < 1) return;
    const frame = hoverFrame((clientX - hovered.left) / hovered.width, total);
    if (frame === hovered.frame) return;
    hovered.frame = frame;
    hovered.thumb.dataset.scrubbing = "";
    // The line stays inside the thumbnail at both ends.
    const fraction = frame / total;
    if (hovered.progress) hovered.progress.style.left = `calc(${fraction * 100}% - ${fraction} * var(--playhead-width))`;
    if (hovered.time) hovered.time.textContent = formatTimecode(frame, project.settings.fps, this.deps.session.getState().timecodeFormat);
    this.showPicture();
  }

  /** Draws the thumbnail at the scrub position (again when a sheet arrives). */
  private showPicture(): void {
    const hovered = this.hovered;
    const media = this.media();
    if (!hovered?.canvas || !media || hovered.frame < 0) return;
    const layout = this.deps.sheets.layout(media.id);
    if (!layout) return;
    const timeUs = Math.min(frameToUs(hovered.frame, this.deps.document.getState().settings.fps), media.durationUs - 1);
    const pick = scrubCell(layout, timeUs, (level, sheet) => this.deps.sheets.sheet(media.id, level, sheet));
    if (pick.want !== hovered.want) {
      hovered.want = pick.want;
      this.deps.sheets.hover({ mediaId: media.id, level: 1, sheet: pick.want });
    }
    if (pick.image && pick.key !== hovered.cell) {
      hovered.cell = pick.key;
      this.deps.painter.scrub(hovered.canvas, pick.image);
    }
  }

  private readonly onKey = (event: KeyboardEvent): void => {
    const hovered = this.hovered;
    const media = this.media();
    if (!hovered || !media || event.repeat || event.ctrlKey || event.metaKey || isEditableTarget(event.target)) return;
    let handled = false;
    if (!event.altKey && !event.shiftKey && (event.code === "KeyI" || event.code === "KeyO")) {
      handled = this.mark(media, event.code === "KeyI" ? "in" : "out");
    } else if (event.altKey && !event.shiftKey && event.code === "KeyX") {
      handled = scrubFrames(media, this.deps.document.getState().settings.fps) > 0;
      if (handled) this.deps.setRange(media.id, null);
    } else if (!event.altKey && (event.key === "," || event.key === ".")) {
      handled = true;
      this.deps.place(media.id, event.key === "," ? "insert" : "overwrite");
    }
    if (!handled) return;
    event.preventDefault();
    event.stopPropagation();
  };

  /** I / O on media with a duration (stills have no range: the key goes on to the shortcuts). */
  private mark(media: MediaItem, point: "in" | "out"): boolean {
    const hovered = this.hovered;
    const fps = this.deps.document.getState().settings.fps;
    if (!hovered || hovered.frame < 0 || scrubFrames(media, fps) < 1) return false;
    const current = this.deps.session.getState().sourceRanges[media.id] ?? null;
    const next = markSource(current, point, frameToUs(hovered.frame, fps), media.durationUs, frameToUs(1, fps));
    if (next) this.deps.setRange(media.id, next);
    return true;
  }
}
