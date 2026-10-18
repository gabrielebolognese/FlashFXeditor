// On-demand font file loads (spec §20.1 "a row's font file loads only when the row becomes visible
// (at most 6 loads in flight, cancelled when the row scrolls away) and stays cached for the session").
// Each key (a library file, a My fonts face) loads once; requests for a key share its load. A request
// can be cancelled: when no request wants a key any more, a queued load is dropped and a running one
// aborted (its signal), so it can be asked for again later. Pinned requests (text that draws with the
// font) are never cancelled. The counters are the batch's load counter.

export interface LoadStats {
  /** Requests made (a key asked for again counts again). */
  requested: number;
  /** Loads started (each key at most once per session, unless cancelled before it finished). */
  started: number;
  loaded: number;
  failed: number;
  /** Loads dropped from the queue or aborted because no request wanted them any more. */
  cancelled: number;
  inFlight: number;
  queued: number;
}

export interface LoadTicket {
  /** True when the key is loaded, false when it failed or the request was cancelled. */
  readonly done: Promise<boolean>;
  cancel(): void;
}

type Loader = (signal: AbortSignal) => Promise<void>;

interface Entry {
  key: string;
  load: Loader;
  state: "queued" | "running" | "loaded" | "failed";
  /** Requests still waiting (cancelled ones removed). */
  waiters: Set<Waiter>;
  pinned: boolean;
  controller: AbortController | null;
}

interface Waiter {
  resolve: (loaded: boolean) => void;
  pinned: boolean;
}

export const MAX_FONT_LOADS = 6;

export class FontLoadQueue {
  private readonly entries = new Map<string, Entry>();
  private readonly queue: Entry[] = [];
  private running = 0;
  private readonly counts = { requested: 0, started: 0, loaded: 0, failed: 0, cancelled: 0 };

  constructor(private readonly maxInFlight = MAX_FONT_LOADS) {}

  /**
   * Loads `key` with `load` (once per session). The ticket resolves when it is loaded or failed;
   * `cancel` withdraws this request. A loaded or failed key answers at once.
   */
  request(key: string, load: Loader, options: { pinned?: boolean } = {}): LoadTicket {
    this.counts.requested += 1;
    let entry = this.entries.get(key);
    if (entry?.state === "loaded") return { done: Promise.resolve(true), cancel: () => undefined };
    if (entry?.state === "failed") return { done: Promise.resolve(false), cancel: () => undefined };
    if (!entry) {
      entry = { key, load, state: "queued", waiters: new Set(), pinned: false, controller: null };
      this.entries.set(key, entry);
      this.queue.push(entry);
    }
    const pinned = options.pinned === true;
    if (pinned) entry.pinned = true;
    let waiter: Waiter | null = null;
    const done = new Promise<boolean>((resolve) => {
      waiter = { resolve, pinned };
    });
    const own = waiter as unknown as Waiter;
    entry.waiters.add(own);
    const target = entry;
    this.pump();
    return {
      done,
      cancel: () => {
        if (own.pinned || !target.waiters.delete(own)) return;
        own.resolve(false);
        this.release(target);
      },
    };
  }

  /** Whether `key` is loaded. */
  isLoaded(key: string): boolean {
    return this.entries.get(key)?.state === "loaded";
  }

  /** Forgets a loaded or failed key (its face left the font set): the next request loads it again. */
  forget(key: string): void {
    const entry = this.entries.get(key);
    if (entry && (entry.state === "loaded" || entry.state === "failed")) this.entries.delete(key);
  }

  stats(): LoadStats {
    return { ...this.counts, inFlight: this.running, queued: this.queue.length };
  }

  /** A key nobody waits for any more: dropped from the queue, or its load aborted. */
  private release(entry: Entry): void {
    if (entry.waiters.size > 0 || entry.pinned) return;
    if (entry.state === "queued") {
      const at = this.queue.indexOf(entry);
      if (at >= 0) this.queue.splice(at, 1);
      this.entries.delete(entry.key);
      this.counts.cancelled += 1;
    } else if (entry.state === "running") {
      entry.controller?.abort();
    }
  }

  private pump(): void {
    while (this.running < this.maxInFlight && this.queue.length > 0) {
      const entry = this.queue.shift() as Entry;
      this.start(entry);
    }
  }

  private start(entry: Entry): void {
    entry.state = "running";
    entry.controller = new AbortController();
    const signal = entry.controller.signal;
    this.running += 1;
    this.counts.started += 1;
    void entry.load(signal).then(
      () => this.finish(entry, signal.aborted && entry.waiters.size === 0 ? "aborted" : "loaded"),
      () => this.finish(entry, signal.aborted ? "aborted" : "failed"),
    );
  }

  private finish(entry: Entry, outcome: "loaded" | "failed" | "aborted"): void {
    this.running -= 1;
    entry.controller = null;
    if (outcome === "aborted") {
      this.counts.cancelled += 1;
      if (entry.waiters.size > 0) {
        // Asked for again while its abort was on the way: it loads again.
        entry.state = "queued";
        this.queue.push(entry);
        this.pump();
        return;
      }
      // Nobody wanted it: forgotten, so a later request loads it again.
      this.entries.delete(entry.key);
    } else {
      entry.state = outcome;
      this.counts[outcome] += 1;
    }
    for (const waiter of entry.waiters) waiter.resolve(outcome === "loaded");
    entry.waiters.clear();
    this.pump();
  }
}
