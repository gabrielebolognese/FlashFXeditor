// Pure logic of the media panel: ordering, multi-selection and display labels (spec §12).
import type { MediaId, MediaItem } from "../../core/document/types.js";
import { formatDurationUs } from "../../core/document/time.js";
import type { MediaSort } from "../../core/store/sessionStore.js";
import { displaySize } from "../../media/probe/rotation.js";
import { formatFps } from "../../project/projectPresets.js";

const KIND_ORDER: Record<MediaItem["kind"], number> = { video: 0, audio: 1, image: 2 };
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function pixels(item: MediaItem): number {
  return item.width && item.height ? item.width * item.height : -1;
}

const fpsValue = (item: MediaItem) => (item.fps ? item.fps.num / item.fps.den : -1);

type Compare = (a: MediaItem, b: MediaItem, uses: ReadonlyMap<MediaId, number>) => number;

const COMPARE: Record<MediaSort, Compare> = {
  name: () => 0,
  date: (a, b) => (a.addedAt < b.addedAt ? -1 : a.addedAt > b.addedAt ? 1 : 0),
  duration: (a, b) => a.durationUs - b.durationUs,
  kind: (a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind],
  resolution: (a, b) => pixels(a) - pixels(b),
  fps: (a, b) => fpsValue(a) - fpsValue(b),
  codec: (a, b) => collator.compare(codecLabel(a.codec), codecLabel(b.codec)),
  audio: (a, b) => collator.compare(audioLabel(a), audioLabel(b)),
  used: (a, b, uses) => (uses.get(a.id) ?? 0) - (uses.get(b.id) ?? 0),
};

/** Sorted by `sort` (reversed when `descending`), ties by name then id, always ascending. */
export function sortMedia(items: readonly MediaItem[], sort: MediaSort, descending: boolean, uses: ReadonlyMap<MediaId, number> = new Map()): MediaItem[] {
  const direction = descending ? -1 : 1;
  return [...items].sort((a, b) => {
    const primary = sort === "name" ? collator.compare(a.name, b.name) : COMPARE[sort](a, b, uses);
    return direction * primary || collator.compare(a.name, b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
}

export interface MediaSelection {
  ids: ReadonlySet<MediaId>;
  /** Where a Shift range starts. */
  anchor: MediaId | null;
}

export const EMPTY_MEDIA_SELECTION: MediaSelection = { ids: new Set(), anchor: null };

/**
 * A click on `id` in the displayed `order`: plain click selects it alone, `toggle` (Mod) adds or
 * removes it, `range` (Shift) selects from the anchor to it (added to the selection with Mod too).
 */
export function clickSelection(selection: MediaSelection, id: MediaId, mods: { toggle: boolean; range: boolean }, order: readonly MediaId[]): MediaSelection {
  if (mods.range && selection.anchor !== null && order.includes(selection.anchor)) {
    const from = order.indexOf(selection.anchor);
    const to = order.indexOf(id);
    const span = order.slice(Math.min(from, to), Math.max(from, to) + 1);
    return { ids: new Set(mods.toggle ? [...selection.ids, ...span] : span), anchor: selection.anchor };
  }
  if (mods.toggle) {
    const ids = new Set(selection.ids);
    if (ids.has(id)) ids.delete(id);
    else ids.add(id);
    return { ids, anchor: id };
  }
  return { ids: new Set([id]), anchor: id };
}

/** Drops ids that no longer exist; the same object when nothing changed. */
export function pruneSelection(selection: MediaSelection, exists: (id: MediaId) => boolean): MediaSelection {
  if ([...selection.ids].every(exists) && (selection.anchor === null || exists(selection.anchor))) return selection;
  return { ids: new Set([...selection.ids].filter(exists)), anchor: selection.anchor !== null && exists(selection.anchor) ? selection.anchor : null };
}

const CODEC_NAMES: [prefix: string, label: string][] = [
  ["avc1", "H.264"],
  ["avc3", "H.264"],
  ["hvc1", "HEVC"],
  ["hev1", "HEVC"],
  ["av01", "AV1"],
  ["vp09", "VP9"],
  ["vp08", "VP8"],
  ["mp4a.40", "AAC"],
  ["mp4a.6b", "MP3"],
  ["mp4a.69", "MP3"],
  ["mp4a", "AAC"],
  ["opus", "Opus"],
  ["alac", "ALAC"],
  ["ac-3", "AC-3"],
  ["ec-3", "E-AC-3"],
  ["sowt", "PCM"],
  ["twos", "PCM"],
  ["lpcm", "PCM"],
];

/** A readable codec name: "hvc1.1.6.L153.90" -> "HEVC"; unknown codecs in capitals; "" for none. */
export function codecLabel(codec: string | undefined): string {
  if (!codec) return "";
  const lower = codec.toLowerCase();
  return CODEC_NAMES.find(([prefix]) => lower.startsWith(prefix))?.[1] ?? codec.toUpperCase();
}

export function audioLabel(item: MediaItem): string {
  return item.hasAudio ? codecLabel(item.audioCodec) || "Yes" : "";
}

/** As shown (rotation applied): "1080×1920"; "" without a size. */
export function resolutionLabel(item: MediaItem): string {
  if (!item.width || !item.height) return "";
  const { width, height } = displaySize(item.width, item.height, item.rotation);
  return `${width}×${height}`;
}

export function fpsLabel(item: MediaItem): string {
  return item.fps ? `${formatFps(item.fps)} fps` : "";
}

/** The card's duration badge: none for stills. */
export function durationBadge(item: MediaItem): string {
  return item.kind === "image" && item.durationUs === 0 ? "" : formatDurationUs(item.durationUs);
}

/** The card's tertiary meta row. */
export function metaLabel(item: MediaItem): string {
  switch (item.kind) {
    case "video":
      return [resolutionLabel(item), fpsLabel(item)].filter(Boolean).join(" · ");
    case "audio":
      return audioLabel(item);
    case "image":
      return [codecLabel(item.codec), resolutionLabel(item)].filter(Boolean).join(" · ");
  }
}
