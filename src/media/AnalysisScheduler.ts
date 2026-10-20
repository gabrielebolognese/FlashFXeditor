// The IdleQueue consumer for media analysis (spec §3.4, §9.1). Media are created with their analysis
// "pending"; this picks them up and queues one idle task per media, cancelled if the media goes away.
// Peaks (Batch 10) run as PeaksJobs: every audio-bearing media with peaks pending is analysed, and
// those marked ready are checked once per session (the cache is disposable, spec §9.7).
// TODO(batch 17): thumbnail sprite sheets (cache/thumbs/). TODO(batch 24): proxy jobs. Each marks its
// part of `analysis` ready.
import type { MediaId, MediaItem } from "../core/document/types.js";
import type { DocumentStore } from "../core/store/DocumentStore.js";
import type { IdleQueue } from "../core/scheduler/IdleQueue.js";
import { hasAudio, type PeaksJobs } from "./PeaksJobs.js";

const isPending = (item: MediaItem) => item.analysis.thumbs === "pending" || item.analysis.peaks === "pending";

export class AnalysisScheduler {
  private readonly queued = new Map<MediaId, () => void>();
  /** Media whose idle task ran this session (not queued again). */
  readonly reached = new Set<MediaId>();

  constructor(
    private readonly idle: Pick<IdleQueue, "enqueue">,
    private readonly peaks: PeaksJobs | null = null,
  ) {}

  attach(documentStore: Pick<DocumentStore, "getState" | "subscribe">): () => void {
    this.sync(documentStore.getState().media);
    return documentStore.subscribe((state) => this.sync(state.media), { affects: ["media"] });
  }

  sync(media: Record<MediaId, MediaItem>): void {
    for (const [id, cancel] of this.queued) {
      const item = media[id];
      if (item && isPending(item)) continue;
      cancel();
      this.queued.delete(id);
    }
    for (const item of Object.values(media)) {
      if (this.peaks && hasAudio(item) && item.analysis.peaks !== "none") this.peaks.request(item.id);
      if (!isPending(item) || this.queued.has(item.id) || this.reached.has(item.id)) continue;
      const { id } = item;
      this.queued.set(
        id,
        this.idle.enqueue(() => {
          this.queued.delete(id);
          this.reached.add(id);
        }),
      );
    }
  }

  /** Media waiting for their idle task (tests, diagnostics). */
  get waiting(): MediaId[] {
    return [...this.queued.keys()];
  }

  dispose(): void {
    for (const cancel of this.queued.values()) cancel();
    this.queued.clear();
    this.peaks?.dispose();
  }
}
