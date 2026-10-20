// session.json (spec §5.3): session state, the selection and the panel layout of one project. Harmless
// to lose, so parsing never throws: every invalid or missing field falls back to its default.
import type { LayoutRatios } from "../core/store/layoutStore.js";
import { sanitizeRatios } from "../core/store/layoutStore.js";
import type { SelectionKind, SelectionSnapshot } from "../core/store/selection.js";
import { DEFAULT_SESSION, type MediaSort, type MediaTab, type MediaView, type PreviewQuality, type SafeZone, type SessionState, type Tool } from "../core/store/sessionStore.js";

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
const MEDIA_TABS: Record<MediaTab, true> = { media: true, presets: true, captions: true };
const MEDIA_SORTS: Record<MediaSort, true> = { name: true, date: true, duration: true, kind: true, resolution: true, fps: true, codec: true, audio: true, used: true };
const MEDIA_VIEWS: Record<MediaView, true> = { grid: true, list: true };
const SELECTION_KINDS: Record<SelectionKind, true> = { clips: true, track: true, cue: true, none: true };

type Raw = Record<string, unknown>;
const obj = (value: unknown): Raw => (typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Raw) : {});
const oneOf = <T extends string>(set: Record<T, true>, value: unknown, fallback: T): T =>
  typeof value === "string" && Object.hasOwn(set, value) ? (value as T) : fallback;
const bool = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);
const finite = (value: unknown, fallback: number) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
const frame = (value: unknown, fallback: number) => (typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : fallback);
const frameOrNull = (value: unknown) => (value === null ? null : frame(value, -1) === -1 ? null : (value as number));

function sanitizeState(value: unknown): SessionState {
  const raw = obj(value);
  const d = DEFAULT_SESSION;
  const timeline = obj(raw.timeline);
  const preview = obj(raw.preview);
  const mediaPanel = obj(raw.mediaPanel);
  const pxPerFrame = finite(timeline.pxPerFrame, d.timeline.pxPerFrame);
  const zoom = preview.zoom === "fit" ? "fit" : finite(preview.zoom, 0) > 0 ? (preview.zoom as number) : d.preview.zoom;
  const collapsedSections: Record<string, boolean> = {};
  for (const [key, collapsed] of Object.entries(obj(raw.collapsedSections))) {
    if (typeof collapsed === "boolean") collapsedSections[key] = collapsed;
  }
  return {
    playhead: frame(raw.playhead, d.playhead),
    inPoint: frameOrNull(raw.inPoint),
    outPoint: frameOrNull(raw.outPoint),
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
    },
    activeTool: oneOf(TOOLS, raw.activeTool, d.activeTool),
    snap: bool(raw.snap, d.snap),
    linkedSelection: bool(raw.linkedSelection, d.linkedSelection),
    ripple: bool(raw.ripple, d.ripple),
    loop: bool(raw.loop, d.loop),
    audioScrub: bool(raw.audioScrub, d.audioScrub),
    mediaPanel: {
      tab: oneOf(MEDIA_TABS, mediaPanel.tab, d.mediaPanel.tab),
      view: oneOf(MEDIA_VIEWS, mediaPanel.view, d.mediaPanel.view),
      sort: oneOf(MEDIA_SORTS, mediaPanel.sort, d.mediaPanel.sort),
      descending: bool(mediaPanel.descending, d.mediaPanel.descending),
    },
    collapsedSections,
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
