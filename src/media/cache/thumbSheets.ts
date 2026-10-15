// Thumbnail sprite sheets (spec §9.6): frames 160 px tall (width by the shown aspect), at three
// levels of detail per video: LOD0 one frame every 2 s, LOD1 one every 0.5 s, LOD2 one every 5 media
// frames (made only for the ranges the timeline shows). A level's thumbnails are numbered from media
// time 0 and packed SHEET_COLUMNS x SHEET_ROWS per sheet, stored as cache/thumbs/<mediaId>/<lod>-<sheet>.webp
// with an index.json that lists the sheets written, stamped with the source file and its LOD (Batch 24
// switches the source to the proxy). A stale or damaged index reads as null: the sheets are made again.
import { US_PER_SECOND } from "../../core/document/time.js";
import type { MediaItem, Rational } from "../../core/document/types.js";
import type { SourceStamp } from "../demux/sampleIndexFile.js";
import { displaySize } from "../probe/rotation.js";
import type { Lod } from "./TexturePool.js";

export const THUMB_HEIGHT = 160;
export const SHEET_COLUMNS = 4;
export const SHEET_ROWS = 4;
export const THUMBS_PER_SHEET = SHEET_COLUMNS * SHEET_ROWS;
export const THUMB_INDEX_VERSION = 1;
/** Thumbnail widths are kept within these bounds (extreme aspects stay drawable). */
const MIN_WIDTH = 16;
const MAX_WIDTH = 4 * THUMB_HEIGHT;
/** Media frames between two LOD2 thumbnails. */
const LOD2_FRAMES = 5;
/** Frame rate assumed for a video with none (LOD2 spacing only). */
const DEFAULT_FPS: Rational = { num: 30, den: 1 };

export type ThumbLevel = 0 | 1 | 2;
export const THUMB_LEVELS: readonly ThumbLevel[] = [0, 1, 2];
/** Levels made after import; LOD2 waits for the timeline to show a range. */
export const EAGER_LEVELS: readonly ThumbLevel[] = [0, 1];

export interface ThumbLevelInfo {
  /** Media time between two thumbnails (integer us). */
  intervalUs: number;
  /** Thumbnails of the level: at 0, intervalUs, ... before the media's end. */
  count: number;
  sheets: number;
}

/** How a video's thumbnails are laid out. */
export interface ThumbLayout {
  /** One thumbnail, in px. */
  width: number;
  height: number;
  columns: number;
  perSheet: number;
  levels: readonly [ThumbLevelInfo, ThumbLevelInfo, ThumbLevelInfo];
}

export function levelIntervalUs(level: ThumbLevel, fps: Rational = DEFAULT_FPS): number {
  if (level === 0) return 2 * US_PER_SECOND;
  if (level === 1) return US_PER_SECOND / 2;
  return Math.max(1, Math.round((LOD2_FRAMES * US_PER_SECOND * fps.den) / fps.num));
}

/** The sheet layout of a video with a size and a duration; null for anything else. */
export function thumbLayout(media: Pick<MediaItem, "kind" | "width" | "height" | "rotation" | "durationUs" | "fps">): ThumbLayout | null {
  if (media.kind !== "video" || !media.width || !media.height || media.durationUs <= 0) return null;
  const shown = displaySize(media.width, media.height, media.rotation);
  const width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round((THUMB_HEIGHT * shown.width) / shown.height)));
  const level = (lod: ThumbLevel): ThumbLevelInfo => {
    const intervalUs = levelIntervalUs(lod, media.fps);
    const count = Math.floor((media.durationUs - 1) / intervalUs) + 1;
    return { intervalUs, count, sheets: Math.ceil(count / THUMBS_PER_SHEET) };
  };
  return { width, height: THUMB_HEIGHT, columns: SHEET_COLUMNS, perSheet: THUMBS_PER_SHEET, levels: [level(0), level(1), level(2)] };
}

export const sameLayout = (a: ThumbLayout, b: ThumbLayout) =>
  a.width === b.width && a.height === b.height && a.levels.every((level, i) => level.intervalUs === b.levels[i]?.intervalUs && level.count === b.levels[i]?.count);

/** Media times (us) of the thumbnails of one sheet, in cell order. */
export function sheetTimes(layout: ThumbLayout, level: ThumbLevel, sheet: number): number[] {
  const { intervalUs, count } = layout.levels[level];
  const first = sheet * layout.perSheet;
  const times: number[] = [];
  for (let i = first; i < Math.min(count, first + layout.perSheet); i++) times.push(i * intervalUs);
  return times;
}

/** The thumbnail of `level` nearest to media time `timeUs` (clamped to the level). */
export function thumbIndex(layout: ThumbLayout, level: ThumbLevel, timeUs: number): number {
  const { intervalUs, count } = layout.levels[level];
  return Math.min(count - 1, Math.max(0, Math.round(timeUs / intervalUs)));
}

/** The coarsest level whose spacing is at most `spacingUs` (every tile gets its own frame), else LOD2. */
export function chooseLevel(layout: ThumbLayout, spacingUs: number): ThumbLevel {
  for (const level of THUMB_LEVELS) if (layout.levels[level].intervalUs <= spacingUs) return level;
  return 2;
}

/** Top-left of a thumbnail's cell in its sheet. */
export function cellOrigin(layout: ThumbLayout, thumb: number): { x: number; y: number } {
  const cell = thumb % layout.perSheet;
  return { x: (cell % layout.columns) * layout.width, y: Math.floor(cell / layout.columns) * layout.height };
}

/** Size of a sheet holding `thumbs` thumbnails. */
export function sheetSize(layout: ThumbLayout, thumbs: number): { width: number; height: number } {
  return { width: Math.min(thumbs, layout.columns) * layout.width, height: Math.ceil(thumbs / layout.columns) * layout.height };
}

// --- index.json --------------------------------------------------------------------------------------

export interface ThumbIndex {
  version: number;
  source: Lod;
  stamp: SourceStamp;
  width: number;
  height: number;
  columns: number;
  perSheet: number;
  levels: { intervalUs: number; count: number; sheets: number[] }[];
}

export function emptyThumbIndex(layout: ThumbLayout, source: Lod, stamp: SourceStamp): ThumbIndex {
  return {
    version: THUMB_INDEX_VERSION,
    source,
    stamp: { size: stamp.size, lastModified: stamp.lastModified },
    width: layout.width,
    height: layout.height,
    columns: layout.columns,
    perSheet: layout.perSheet,
    levels: layout.levels.map(({ intervalUs, count }) => ({ intervalUs, count, sheets: [] })),
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

/** The index in `text` when it was written for this layout, source and file; else null. */
export function readThumbIndex(text: string, layout: ThumbLayout, source: Lod, stamp: SourceStamp): ThumbIndex | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(data) || data.version !== THUMB_INDEX_VERSION || data.source !== source) return null;
  const s = data.stamp;
  if (!isRecord(s) || s.size !== stamp.size || s.lastModified !== stamp.lastModified) return null;
  if (data.width !== layout.width || data.height !== layout.height || data.columns !== layout.columns || data.perSheet !== layout.perSheet) return null;
  const levels = data.levels;
  if (!Array.isArray(levels) || levels.length !== layout.levels.length) return null;
  const out: ThumbIndex["levels"] = [];
  for (const [i, level] of levels.entries()) {
    const expected = layout.levels[i] as ThumbLevelInfo;
    if (!isRecord(level) || level.intervalUs !== expected.intervalUs || level.count !== expected.count || !Array.isArray(level.sheets)) return null;
    const sheets = level.sheets.filter((n): n is number => Number.isInteger(n) && n >= 0 && n < expected.sheets);
    out.push({ intervalUs: expected.intervalUs, count: expected.count, sheets: [...new Set(sheets)] });
  }
  return { ...emptyThumbIndex(layout, source, stamp), levels: out };
}

export const hasSheet = (index: ThumbIndex, level: ThumbLevel, sheet: number) => index.levels[level]?.sheets.includes(sheet) === true;

export function addSheet(index: ThumbIndex, level: ThumbLevel, sheet: number): void {
  const entry = index.levels[level];
  if (entry && !entry.sheets.includes(sheet)) entry.sheets.push(sheet);
}

/** The first sheet of `levels` (in order) the index does not list and `skip` does not exclude, or null. */
export function firstMissingSheet(index: ThumbIndex, levels: readonly ThumbLevel[], skip?: (level: ThumbLevel, sheet: number) => boolean): { level: ThumbLevel; sheet: number } | null {
  for (const level of levels) {
    const entry = index.levels[level];
    if (!entry) continue;
    const sheets = Math.ceil(entry.count / index.perSheet);
    for (let sheet = 0; sheet < sheets; sheet++) if (!entry.sheets.includes(sheet) && !skip?.(level, sheet)) return { level, sheet };
  }
  return null;
}
