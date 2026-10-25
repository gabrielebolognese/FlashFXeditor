// The media analysis of the open project (spec §3.4, §9.1, §9.6). Media are created with their
// analysis "pending"; this follows the document's media and hands each to its jobs, which run from
// the IdleQueue (never during playback or drags) and mark their part of `analysis` ready with no undo
// step: waveform peaks (PeaksJobs, Batch 10) for every audio-bearing media, thumbnail sprite sheets
// (ThumbnailStore, Batch 17) for every video. Media already marked ready are checked once per session
// (the cache is disposable, spec §9.7); media that leave the project are forgotten. Proxies have their
// own queue (ProxyJobs, Batch 24), which follows the document's proxy status.
import type { MediaId, MediaItem } from "../core/document/types.js";
import type { DocumentStore } from "../core/store/DocumentStore.js";
import { hasAudio, type PeaksJobs } from "./PeaksJobs.js";
import type { ThumbnailStore } from "./ThumbnailStore.js";

export interface AnalysisJobs {
  peaks?: Pick<PeaksJobs, "request" | "forget" | "dispose"> | null;
  thumbs?: Pick<ThumbnailStore, "sync" | "dispose"> | null;
}

export class AnalysisScheduler {
  private media: Record<MediaId, MediaItem> = {};

  constructor(private readonly jobs: AnalysisJobs) {}

  attach(documentStore: Pick<DocumentStore, "getState" | "subscribe">): () => void {
    this.sync(documentStore.getState().media);
    return documentStore.subscribe((state) => this.sync(state.media), { affects: ["media"] });
  }

  sync(media: Record<MediaId, MediaItem>): void {
    const { peaks, thumbs } = this.jobs;
    for (const id of Object.keys(this.media)) if (!Object.hasOwn(media, id)) peaks?.forget(id);
    this.media = media;
    thumbs?.sync(media);
    if (!peaks) return;
    for (const item of Object.values(media)) if (hasAudio(item) && item.analysis.peaks !== "none") peaks.request(item.id);
  }

  dispose(): void {
    this.jobs.peaks?.dispose();
    this.jobs.thumbs?.dispose();
  }
}
