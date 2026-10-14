// The IdleQueue consumer for media analysis (spec §3.4, §9.1). Media are created with their analysis
// "pending"; this picks them up and queues one idle task per media, cancelled if the media goes away.
// No analysis exists yet, so the task only records that the media reached the front of the queue.
import type { MediaId, MediaItem } from "../core/document/types.js";
import type { DocumentStore } from "../core/store/DocumentStore.js";
import type { IdleQueue } from "../core/scheduler/IdleQueue.js";

const isPending = (item: MediaItem) => item.analysis.thumbs === "pending" || item.analysis.peaks === "pending";

export class AnalysisScheduler {
  private readonly queued = new Map<MediaId, () => void>();
  /** Media whose idle task ran this session (not queued again). */
  readonly reached = new Set<MediaId>();

  constructor(private readonly idle: Pick<IdleQueue, "enqueue">) {}

  attach(documentStore: DocumentStore): () => void {
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
      if (!isPending(item) || this.queued.has(item.id) || this.reached.has(item.id)) continue;
      const { id, analysis } = item;
      this.queued.set(
        id,
        this.idle.enqueue(() => {
          this.queued.delete(id);
          this.reached.add(id);
          // TODO(batch 10): peaks in analysis.worker (cache/peaks/). TODO(batch 17): thumbnail sprite
          // sheets (cache/thumbs/). TODO(batch 24): proxy jobs. Each marks its part of `analysis` ready.
          console.debug("[analysis] pending", id, analysis);
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
  }
}
