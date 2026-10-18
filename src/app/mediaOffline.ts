// The open project's media files and offline media (spec §12 missing media, §6.19 offline clips,
// Batch 41), shared by the media panel, the preview, the audio and the timeline: `sourceFile` resolves
// a media's file through the project's `MediaSources` (a copy in media/, or a linked file's handle),
// `mediaStatus` lists the media that are offline. A clip whose media record is gone (removed with
// "Remove from project") is offline too. Framework-free.
import type { MediaId } from "../core/document/types.js";
import { createStore } from "../core/store/createStore.js";
import type { MediaSources, MediaStatus } from "../project/mediaSources.js";
import { documentStore } from "./services.js";

/** Offline media of the open project (absent: online or not checked yet). */
export const mediaStatus = createStore<ReadonlyMap<MediaId, MediaStatus>>(new Map());

let sources: MediaSources | null = null;

/** The open project's sources (set by the media controller on open, null on close). */
export function setMediaSources(next: MediaSources | null): void {
  sources?.dispose();
  sources = next;
  mediaStatus.set(new Map());
}

export function mediaSources(): MediaSources | null {
  return sources;
}

/** A media's source file, or null when it is offline (or no project is open). */
export function sourceFile(mediaId: MediaId): Promise<File | null> {
  return sources ? sources.file(mediaId) : Promise.resolve(null);
}

const refreshListeners = new Set<(ids: readonly MediaId[]) => void>();

/**
 * The files of these media changed or came back (a relink, read access granted): every service that
 * holds something of them (decoders, frames, audio, posters, sheets, peaks) lets it go and loads again.
 */
export function refreshMedia(ids: readonly MediaId[]): void {
  if (ids.length === 0) return;
  for (const listener of refreshListeners) listener(ids);
}

/** Registers a service's part of `refreshMedia`. Returns a stop function. */
export function onRefreshMedia(listener: (ids: readonly MediaId[]) => void): () => void {
  refreshListeners.add(listener);
  return () => refreshListeners.delete(listener);
}

// Media that come back online (access granted, a file that reappears) are loaded again.
mediaStatus.subscribe((next, prev) => refreshMedia([...prev.keys()].filter((id) => !next.has(id) && Object.hasOwn(documentStore.getState().media, id))));

/** What an offline clip of this media shows: why it is offline, or null when it is online. */
export type OfflineReason = MediaStatus | "removed";

export function offlineReason(mediaId: MediaId): OfflineReason | null {
  if (!Object.hasOwn(documentStore.getState().media, mediaId)) return "removed";
  return mediaStatus.getState().get(mediaId) ?? null;
}

/** The slate's second line (the composite and the timeline). */
export const OFFLINE_LABEL: Record<OfflineReason, string> = {
  missing: "Media offline",
  permission: "Media offline: no access",
  failed: "Media can't be played",
  removed: "Media removed",
};
