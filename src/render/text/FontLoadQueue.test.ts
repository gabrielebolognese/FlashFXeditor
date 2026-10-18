import { describe, expect, it } from "vitest";
import { random } from "../../timeline/edit/fuzzKit.js";
import { FontLoadQueue } from "./FontLoadQueue.js";

/** A load the test finishes by hand; aborting it rejects like fetch does. */
function controllable() {
  const pending = new Map<string, { resolve: () => void; reject: (error: unknown) => void; signal: AbortSignal }>();
  const starts: string[] = [];
  const loader = (key: string) => (signal: AbortSignal) =>
    new Promise<void>((resolve, reject) => {
      starts.push(key);
      pending.set(key, { resolve, reject, signal });
      signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    });
  return { pending, starts, loader };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("FontLoadQueue", () => {
  it("runs at most 6 loads at once, the rest queued in order", async () => {
    const queue = new FontLoadQueue();
    const { pending, starts, loader } = controllable();
    const tickets = Array.from({ length: 10 }, (_, i) => queue.request(`f${i}`, loader(`f${i}`)));
    expect(starts).toEqual(["f0", "f1", "f2", "f3", "f4", "f5"]);
    expect(queue.stats()).toMatchObject({ requested: 10, started: 6, inFlight: 6, queued: 4 });
    pending.get("f0")?.resolve();
    expect(await tickets[0]?.done).toBe(true);
    await flush();
    expect(starts).toEqual(["f0", "f1", "f2", "f3", "f4", "f5", "f6"]);
    expect(queue.isLoaded("f0")).toBe(true);
    expect(queue.stats()).toMatchObject({ loaded: 1, inFlight: 6, queued: 3 });
  });

  it("loads a key once: later requests share it or answer at once", async () => {
    const queue = new FontLoadQueue();
    const { pending, starts, loader } = controllable();
    const a = queue.request("x", loader("x"));
    const b = queue.request("x", loader("x"));
    pending.get("x")?.resolve();
    expect(await Promise.all([a.done, b.done])).toEqual([true, true]);
    expect(await queue.request("x", loader("x")).done).toBe(true);
    expect(starts).toEqual(["x"]);
  });

  it("drops a queued load nobody wants any more, and aborts a running one", async () => {
    const queue = new FontLoadQueue(1);
    const { pending, starts, loader } = controllable();
    const running = queue.request("a", loader("a"));
    const queued = queue.request("b", loader("b"));
    queued.cancel();
    expect(await queued.done).toBe(false);
    expect(queue.stats()).toMatchObject({ cancelled: 1, queued: 0 });
    running.cancel();
    expect(pending.get("a")?.signal.aborted).toBe(true);
    expect(await running.done).toBe(false);
    await flush();
    expect(queue.stats()).toMatchObject({ cancelled: 2, inFlight: 0, loaded: 0, failed: 0 });
    // Asked for again later: it loads.
    const again = queue.request("a", loader("a"));
    pending.get("a")?.resolve();
    expect(await again.done).toBe(true);
    expect(starts).toEqual(["a", "a"]);
  });

  it("keeps a load another request still wants, and never cancels pinned requests", async () => {
    const queue = new FontLoadQueue(1);
    const { pending, loader } = controllable();
    const row = queue.request("a", loader("a"));
    const text = queue.request("a", loader("a"), { pinned: true });
    row.cancel();
    text.cancel();
    expect(pending.get("a")?.signal.aborted).toBe(false);
    pending.get("a")?.resolve();
    expect(await row.done).toBe(false);
    expect(await text.done).toBe(true);
  });

  it("loads again a key asked for while its abort was on the way", async () => {
    const queue = new FontLoadQueue(1);
    const { pending, starts, loader } = controllable();
    queue.request("a", loader("a")).cancel();
    const again = queue.request("a", loader("a"));
    await flush();
    pending.get("a")?.resolve();
    expect(await again.done).toBe(true);
    expect(starts).toEqual(["a", "a"]);
  });

  it("remembers failures for the session", async () => {
    const queue = new FontLoadQueue();
    const { pending, starts, loader } = controllable();
    const ticket = queue.request("bad", loader("bad"));
    pending.get("bad")?.reject(new Error("404"));
    expect(await ticket.done).toBe(false);
    expect(await queue.request("bad", loader("bad")).done).toBe(false);
    expect(starts).toEqual(["bad"]);
    expect(queue.stats().failed).toBe(1);
  });

  it("never exceeds the limit and settles every request under random scrolling (seeded)", async () => {
    const rng = random(651);
    const queue = new FontLoadQueue();
    const { pending, loader } = controllable();
    let maxRunning = 0;
    const open: { key: string; ticket: ReturnType<FontLoadQueue["request"]> }[] = [];
    const settled: Promise<boolean>[] = [];
    for (let step = 0; step < 600; step += 1) {
      const roll = rng.next();
      if (roll < 0.45) {
        const key = `k${rng.int(0, 40)}`;
        const ticket = queue.request(key, loader(key), { pinned: rng.chance(0.1) });
        open.push({ key, ticket });
        settled.push(ticket.done);
      } else if (roll < 0.7 && open.length > 0) {
        open.splice(rng.int(0, open.length - 1), 1)[0]?.ticket.cancel();
      } else {
        const keys = [...pending.keys()];
        const key = keys.length > 0 ? rng.pick(keys) : null;
        const load = key ? pending.get(key) : undefined;
        if (key && load && !load.signal.aborted) {
          pending.delete(key);
          if (rng.chance(0.9)) load.resolve();
          else load.reject(new Error("fail"));
        }
        await flush();
      }
      maxRunning = Math.max(maxRunning, queue.stats().inFlight);
    }
    for (let round = 0; round < 100 && queue.stats().inFlight + queue.stats().queued > 0; round += 1) {
      for (const [key, load] of pending) {
        pending.delete(key);
        if (!load.signal.aborted) load.resolve();
      }
      await flush();
    }
    expect(maxRunning).toBeLessThanOrEqual(6);
    expect(queue.stats()).toMatchObject({ inFlight: 0, queued: 0 });
    await Promise.all(settled);
  });
});
