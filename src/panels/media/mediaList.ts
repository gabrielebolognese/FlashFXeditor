// Pure logic of the media panel: ordering, multi-selection, what the bins, filter chips and search
// show (Batch 41) and display labels (spec §12).
import type { Bin, MediaId, MediaItem } from "../../core/document/types.js";
import { formatDurationUs } from "../../core/document/time.js";
import { VIRTUAL_BINS, type MediaFilters, type MediaSort, type VirtualBin } from "../../core/store/sessionStore.js";
import { codecLabel } from "../../media/mediaKinds.js";
import { displaySize } from "../../media/probe/rotation.js";
import { formatFps } from "../../project/projectPresets.js";

export { codecLabel };

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

/** Lower case without accents: "Café" matches "cafe". */
export function searchText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** Where a media item's file is: its path in the project folder, or the hint of a linked file. */
export function mediaPath(item: MediaItem): string {
  return "relPath" in item.file ? item.file.relPath : item.file.pathHint;
}

/** The part of a media's path the search reads: a copy's file name (not the project's media/ folder), a linked file's folders and name. */
export function searchPath(item: MediaItem): string {
  return "relPath" in item.file ? baseName(item.file.relPath) : item.file.pathHint;
}

/** The file name of a path (after the last slash). */
export function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

const isVirtualBin = (bin: string): bin is VirtualBin => (VIRTUAL_BINS as readonly string[]).includes(bin);

/** The bin the panel shows: a bin id that is no longer in the project shows All. */
export function shownBin(bin: string, bins: readonly Bin[]): string {
  return isVirtualBin(bin) || bins.some((other) => other.id === bin) ? bin : "all";
}

/** What the Media tab shows (spec §12): a bin, the filter chips and the search words. */
export interface MediaQuery {
  bin: string;
  filters: MediaFilters;
  search: string;
}

/**
 * Whether `item` shows: in the bin (All; a kind's virtual bin; a bin's own media), of a checked kind
 * (none checked: any), unused when `unused` is on, and every word of the search in its name or its
 * file's name (a linked file's folders too: `searchPath`).
 */
export function mediaMatcher(query: MediaQuery, uses: ReadonlyMap<MediaId, number>): (item: MediaItem) => boolean {
  const words = searchText(query.search).split(/\s+/).filter(Boolean);
  const kinds = new Set(query.filters.kinds);
  const { bin } = query;
  return (item) => {
    if (bin !== "all" && (isVirtualBin(bin) ? item.kind !== bin : item.binId !== bin)) return false;
    if (kinds.size > 0 && !kinds.has(item.kind)) return false;
    if (query.filters.unused && (uses.get(item.id) ?? 0) > 0) return false;
    if (words.length === 0) return true;
    const text = `${searchText(item.name)}\n${searchText(searchPath(item))}`;
    return words.every((word) => text.includes(word));
  };
}

/** How many media each bin chip holds: the virtual bins by kind, the bins by `binId`. */
export function binCounts(items: readonly MediaItem[]): Map<string, number> {
  const counts = new Map<string, number>([["all", items.length]]);
  for (const item of items) {
    counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
    if (item.binId !== undefined) counts.set(item.binId, (counts.get(item.binId) ?? 0) + 1);
  }
  return counts;
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

/**
 * The selection without the media the tab does not show (spec §12: what the bin, the chips or the
 * search hide is never deleted, moved or dragged); the same object when nothing changed.
 */
export function shownSelection(selection: MediaSelection, media: Readonly<Record<MediaId, MediaItem>>, shows: (item: MediaItem) => boolean): MediaSelection {
  return pruneSelection(selection, (id) => {
    const item = media[id];
    return item !== undefined && shows(item);
  });
}

/**
 * What the tab must show to reveal `item` (Reveal in media panel): `query` when it shows it, else with
 * the search and the chips cleared, and in the item's bin (All when it is in none) when the bin hides
 * it too. `query.bin` is the shown bin (`shownBin`).
 */
export function revealQuery(item: MediaItem, query: MediaQuery, uses: ReadonlyMap<MediaId, number>): MediaQuery {
  if (mediaMatcher(query, uses)(item)) return query;
  const cleared: MediaQuery = { ...query, filters: { kinds: [], unused: false }, search: "" };
  return mediaMatcher(cleared, uses)(item) ? cleared : { ...cleared, bin: item.binId ?? "all" };
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
