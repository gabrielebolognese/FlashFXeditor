// session.json (spec §5.3): session state, the selection and the panel layout of one project. Harmless
// to lose, so parsing never throws: every invalid or missing field falls back to its default.
import { isKeyframeSection, type KeyframeSection } from "../core/document/keyframes.js";
import { sanitizeExportLog } from "../export/log.js";
import { isPresetSetKey } from "../text/presets.js";
import type { TimecodeMode } from "../core/document/time.js";
import type { LayoutRatios } from "../core/store/layoutStore.js";
import { sanitizeRatios } from "../core/store/layoutStore.js";
import type { SelectionKind, SelectionSnapshot } from "../core/store/selection.js";
import { DEFAULT_SESSION, GRID_DIVISIONS_MAX, GRID_DIVISIONS_MIN, MEDIA_COLUMNS, PREVIEW_MAX_ZOOM, PREVIEW_MIN_ZOOM, type MediaColumn, type MediaFilters, type MediaSort, type MediaTab, type MediaView, type PresetScope, type PreviewGrid, type PreviewQuality, type SafeZone, type SessionState, type SourceRange, type Tool } from "../core/store/sessionStore.js";

export const SESSION_FILE_VERSION = 1;

export interface SessionFileData {
  state: SessionState;
  selection: SelectionSnapshot;
  /** null: use the global (last used) layout. */
  layout: LayoutRatios | null;
}

export const EMPTY_SELECTION_SNAPSHOT: SelectionSnapshot = { clipIds: [], primary: null, kind: "none" };

export function defaultSessionFile(): SessionFileData {
  return { state: structuredClone(DEFAULT_SESSION), selection: EMPTY_SELECTION_SNAPSHOT, layout: null };
}

export function serializeSession(data: SessionFileData): string {
  return `${JSON.stringify({ version: SESSION_FILE_VERSION, ...data }, null, 2)}\n`;
}

// Records keyed by every member of a union: the compiler flags a missing one when the union grows.
const TOOLS: Record<Tool, true> = { select: true, razor: true, hand: true, slip: true, slide: true, rateStretch: true };
const QUALITIES: Record<PreviewQuality, true> = { auto: true, full: true, proxy: true, half: true, quarter: true };
const SAFE_ZONES: Record<SafeZone, true> = { none: true, reels: true, tiktok: true, shorts: true };
const GRIDS: Record<PreviewGrid, true> = { none: true, thirds: true, squares: true, custom: true };
const MEDIA_TABS: Record<MediaTab, true> = { media: true, presets: true, captions: true };
const MEDIA_SORTS: Record<MediaSort, true> = { name: true, date: true, duration: true, kind: true, resolution: true, fps: true, codec: true, audio: true, used: true };
const MEDIA_VIEWS: Record<MediaView, true> = { grid: true, list: true };
const PRESET_SCOPES: Record<PresetScope, true> = { global: true, project: true };
const SELECTION_KINDS: Record<SelectionKind, true> = { clips: true, track: true, cue: true, none: true };
const TIMECODE_FORMATS: Record<TimecodeMode, true> = { frames: true, ms: true };

type Raw = Record<string, unknown>;
const obj = (value: unknown): Raw => (typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Raw) : {});
const oneOf = <T extends string>(set: Record<T, true>, value: unknown, fallback: T): T =>
  typeof value === "string" && Object.hasOwn(set, value) ? (value as T) : fallback;
const bool = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);
const finite = (value: unknown, fallback: number) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
const frame = (value: unknown, fallback: number) => (typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : fallback);
const frameOrNull = (value: unknown) => (value === null ? null : frame(value, -1) === -1 ? null : (value as number));

/** Source ranges (spec §12): integer microseconds >= 0 or null, at least one end, the out after the in. */
function sanitizeRanges(value: unknown): Record<string, SourceRange> {
  const ranges: Record<string, SourceRange> = {};
  for (const [mediaId, entry] of Object.entries(obj(value))) {
    const range = obj(entry);
    const inUs = frameOrNull(range.inUs);
    const outUs = frameOrNull(range.outUs);
    if ((inUs === null && outUs === null) || (inUs !== null && outUs !== null && outUs <= inUs) || outUs === 0) continue;
    ranges[mediaId] = { inUs, outUs };
  }
  return ranges;
}

/** The media filter chips (Batch 41): known kinds once each, `unused` a boolean. */
function sanitizeFilters(value: unknown): MediaFilters {
  const raw = obj(value);
  const kinds = Array.isArray(raw.kinds) ? [...new Set(raw.kinds.filter((kind): kind is MediaFilters["kinds"][number] => kind === "video" || kind === "audio" || kind === "image"))] : [];
  return { kinds, unused: bool(raw.unused, false) };
}

/** List column widths (Batch 41): known columns, finite widths within 1..4096 CSS px. */
function sanitizeColumns(value: unknown): Partial<Record<MediaColumn, number>> {
  const columns: Partial<Record<MediaColumn, number>> = {};
  for (const [key, width] of Object.entries(obj(value))) {
    if ((MEDIA_COLUMNS as readonly string[]).includes(key) && typeof width === "number" && Number.isFinite(width) && width >= 1 && width <= 4096) columns[key as MediaColumn] = Math.round(width);
  }
  return columns;
}

/** Keyframe lane choices by clip id (Batch 35): known sections only. */
function sanitizeLanes(value: unknown): Record<string, KeyframeSection> {
  const lanes: Record<string, KeyframeSection> = {};
  for (const [id, section] of Object.entries(obj(value))) if (isKeyframeSection(section)) lanes[id] = section;
  return lanes;
}

function sanitizeState(value: unknown): SessionState {
  const raw = obj(value);
  const d = DEFAULT_SESSION;
  const timeline = obj(raw.timeline);
  const preview = obj(raw.preview);
  const mediaPanel = obj(raw.mediaPanel);
  const presetBar = obj(raw.presetBar);
  const pxPerFrame = finite(timeline.pxPerFrame, d.timeline.pxPerFrame);
  const zoom = preview.zoom === "fit" ? "fit" : finite(preview.zoom, 0) > 0 ? Math.min(PREVIEW_MAX_ZOOM, Math.max(PREVIEW_MIN_ZOOM, preview.zoom as number)) : d.preview.zoom;
  const divisions = preview.gridDivisions;
  const gridDivisions = typeof divisions === "number" && Number.isInteger(divisions) && divisions >= GRID_DIVISIONS_MIN && divisions <= GRID_DIVISIONS_MAX ? divisions : d.preview.gridDivisions;
  const collapsedSections: Record<string, boolean> = {};
  for (const [key, collapsed] of Object.entries(obj(raw.collapsedSections))) {
    if (typeof collapsed === "boolean") collapsedSections[key] = collapsed;
  }
  const inPoint = frameOrNull(raw.inPoint);
  const outPoint = frameOrNull(raw.outPoint);
  return {
    playhead: frame(raw.playhead, d.playhead),
    inPoint,
    // The out point is the range's exclusive end: one at or before the in point is dropped.
    outPoint: outPoint !== null && inPoint !== null && outPoint <= inPoint ? null : outPoint,
    timeline: {
      pxPerFrame: pxPerFrame > 0 ? pxPerFrame : d.timeline.pxPerFrame,
      scrollFrame: Math.max(0, finite(timeline.scrollFrame, d.timeline.scrollFrame)),
      // Relative to the resting divider: negative when scrolled up to high video tracks.
      scrollY: finite(timeline.scrollY, d.timeline.scrollY),
    },
    preview: {
      zoom,
      panX: finite(preview.panX, d.preview.panX),
      panY: finite(preview.panY, d.preview.panY),
      quality: oneOf(QUALITIES, preview.quality, d.preview.quality),
      safeZone: oneOf(SAFE_ZONES, preview.safeZone, d.preview.safeZone),
      grid: oneOf(GRIDS, preview.grid, d.preview.grid),
      gridDivisions,
      centerCross: bool(preview.centerCross, d.preview.centerCross),
      safeMargins: bool(preview.safeMargins, d.preview.safeMargins),
      rulers: bool(preview.rulers, d.preview.rulers),
      pixelGrid: bool(preview.pixelGrid, d.preview.pixelGrid),
      guides: bool(preview.guides, d.preview.guides),
    },
    activeTool: oneOf(TOOLS, raw.activeTool, d.activeTool),
    snap: bool(raw.snap, d.snap),
    linkedSelection: bool(raw.linkedSelection, d.linkedSelection),
    ripple: bool(raw.ripple, d.ripple),
    loop: bool(raw.loop, d.loop),
    audioScrub: bool(raw.audioScrub, d.audioScrub),
    timecodeFormat: oneOf(TIMECODE_FORMATS, raw.timecodeFormat, d.timecodeFormat),
    mediaPanel: {
      tab: oneOf(MEDIA_TABS, mediaPanel.tab, d.mediaPanel.tab),
      view: oneOf(MEDIA_VIEWS, mediaPanel.view, d.mediaPanel.view),
      sort: oneOf(MEDIA_SORTS, mediaPanel.sort, d.mediaPanel.sort),
      descending: bool(mediaPanel.descending, d.mediaPanel.descending),
      presetScope: oneOf(PRESET_SCOPES, mediaPanel.presetScope, d.mediaPanel.presetScope),
      // A bin id that is no longer in the project falls back to All when the panel reads it.
      bin: typeof mediaPanel.bin === "string" && mediaPanel.bin !== "" ? mediaPanel.bin : d.mediaPanel.bin,
      filters: sanitizeFilters(mediaPanel.filters),
      columns: sanitizeColumns(mediaPanel.columns),
    },
    sourceRanges: sanitizeRanges(raw.sourceRanges),
    collapsedSections,
    clipKeyframes: bool(raw.clipKeyframes, d.clipKeyframes),
    keyframeLanes: sanitizeLanes(raw.keyframeLanes),
    exportRange: raw.exportRange === "inOut" ? "inOut" : "whole",
    exportLog: sanitizeExportLog(raw.exportLog),
    presetBar: { visible: bool(presetBar.visible, d.presetBar.visible), set: isPresetSetKey(presetBar.set) ? presetBar.set : d.presetBar.set },
  };
}

function sanitizeSelection(value: unknown): SelectionSnapshot {
  const raw = obj(value);
  const clipIds = Array.isArray(raw.clipIds) ? [...new Set(raw.clipIds.filter((id): id is string => typeof id === "string"))] : [];
  const primary = typeof raw.primary === "string" && clipIds.includes(raw.primary) ? raw.primary : (clipIds[0] ?? null);
  const kind = oneOf<SelectionKind>(SELECTION_KINDS, raw.kind, "none");
  if (kind === "clips" && clipIds.length === 0) return EMPTY_SELECTION_SNAPSHOT;
  if (kind !== "track") return { clipIds, primary, kind };
  // A track selection lists its tracks (Batch 16); one without any is no selection.
  const trackIds = Array.isArray(raw.trackIds) ? [...new Set(raw.trackIds.filter((id): id is string => typeof id === "string"))] : [];
  return trackIds.length > 0 ? { clipIds: [], primary: null, kind, trackIds } : EMPTY_SELECTION_SNAPSHOT;
}

/** Never throws; `null` (no file) and garbage both give the defaults. */
export function parseSessionFile(text: string | null): SessionFileData {
  if (text === null) return defaultSessionFile();
  let raw: Raw;
  try {
    raw = obj(JSON.parse(text));
  } catch {
    return defaultSessionFile();
  }
  if (raw.version !== SESSION_FILE_VERSION) return defaultSessionFile();
  return {
    state: sanitizeState(raw.state),
    selection: sanitizeSelection(raw.selection),
    layout: raw.layout === null || raw.layout === undefined ? null : sanitizeRatios(raw.layout),
  };
}
