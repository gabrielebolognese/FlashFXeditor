import { describe, expect, it } from "vitest";
import { abortError } from "../media/workers/protocol.js";
import { ExportQueue, type JobOutcome, type QueueJob } from "./queue.js";

interface Spec {
  preset: string;
}

/** A queue whose jobs run until the test resolves them; it records starts, progress and ends. */
function harness() {
  const log: string[] = [];
  const pending = new Map<string, { resolve: (value: string) => void; reject: (error: unknown) => void; progress: (done: number) => void; signal: AbortSignal; fail: (reason: unknown) => void }>();
  const progress = new Map<string, number>();
  const outcomes = new Map<string, JobOutcome<string>>();
  const queue = new ExportQueue<Spec, string>({
    run: (job, signal, fail) =>
      new Promise<string>((resolve, reject) => {
        log.push(`start ${job.spec.preset}`);
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        pending.set(job.id, { resolve, reject, signal, fail, progress: (done) => progress.set(job.id, done) });
      }),
    ended: (job: QueueJob<Spec>, outcome) => {
      log.push(`${outcome.status} ${job.spec.preset}`);
      outcomes.set(job.id, outcome);
    },
  });
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  return { queue, log, pending, progress, outcomes, flush };
}

const statuses = (queue: ExportQueue<Spec, string>) => queue.jobs.getState().map((job) => `${job.spec.preset}:${job.status}`);

describe("ExportQueue", () => {
  it("runs three jobs in order, one at a time, each with its own progress", async () => {
    const h = harness();
    const ids = ["reels", "tiktok", "shorts"].map((preset) => h.queue.add({ preset }));
    expect(statuses(h.queue)).toEqual(["reels:running", "tiktok:queued", "shorts:queued"]);
    expect(h.log).toEqual(["start reels"]);
    h.pending.get(ids[0] as string)?.progress(10);
    expect(h.progress.get(ids[0] as string)).toBe(10);
    expect(h.progress.has(ids[1] as string)).toBe(false);
    h.pending.get(ids[0] as string)?.resolve("a.mp4");
    await h.flush();
    expect(statuses(h.queue)).toEqual(["tiktok:running", "shorts:queued"]);
    h.pending.get(ids[1] as string)?.progress(3);
    h.pending.get(ids[1] as string)?.resolve("b.mp4");
    await h.flush();
    h.pending.get(ids[2] as string)?.resolve("c.mp4");
    await h.flush();
    expect(h.log).toEqual(["start reels", "done reels", "start tiktok", "done tiktok", "start shorts", "done shorts"]);
    expect(h.outcomes.get(ids[2] as string)).toEqual({ status: "done", result: "c.mp4" });
    expect(h.queue.jobs.getState()).toEqual([]);
    expect(h.queue.running).toBeNull();
  });

  it("cancelling the second (queued) job leaves the third to run after the first", async () => {
    const h = harness();
    const [first, second, third] = ["reels", "tiktok", "shorts"].map((preset) => h.queue.add({ preset })) as [string, string, string];
    h.queue.cancel(second);
    expect(statuses(h.queue)).toEqual(["reels:running", "shorts:queued"]);
    expect(h.outcomes.get(second)).toEqual({ status: "cancelled" });
    h.pending.get(first)?.resolve("a.mp4");
    await h.flush();
    expect(h.queue.running?.id).toBe(third);
    h.pending.get(third)?.resolve("c.mp4");
    await h.flush();
    expect(h.log).toEqual(["start reels", "cancelled tiktok", "done reels", "start shorts", "done shorts"]);
  });

  it("cancelling the running second job aborts it and starts the third", async () => {
    const h = harness();
    const [first, second, third] = ["reels", "tiktok", "shorts"].map((preset) => h.queue.add({ preset })) as [string, string, string];
    h.pending.get(first)?.resolve("a.mp4");
    await h.flush();
    expect(h.queue.running?.id).toBe(second);
    h.queue.cancel(second);
    expect(h.pending.get(second)?.signal.aborted).toBe(true);
    await h.flush();
    expect(h.outcomes.get(second)).toEqual({ status: "cancelled" });
    expect(h.queue.running?.id).toBe(third);
    h.pending.get(third)?.resolve("c.mp4");
    await h.flush();
    expect(h.log).toEqual(["start reels", "done reels", "start tiktok", "cancelled tiktok", "start shorts", "done shorts"]);
  });

  it("ends a job as failed with its error, or with the reason it was failed with, and goes on", async () => {
    const h = harness();
    const [first, second, third] = ["a", "b", "c"].map((preset) => h.queue.add({ preset })) as [string, string, string];
    const encoderError = new Error("encoder broke");
    h.pending.get(first)?.reject(encoderError);
    await h.flush();
    expect(h.outcomes.get(first)).toEqual({ status: "failed", error: encoderError });
    // A failed write aborts with its error: the job's own rejection (an AbortError) is not the cause.
    const writeError = new Error("disk full");
    h.pending.get(second)?.fail(writeError);
    await h.flush();
    expect(h.outcomes.get(second)).toEqual({ status: "failed", error: writeError });
    h.pending.get(third)?.reject(abortError());
    await h.flush();
    expect(h.outcomes.get(third)).toEqual({ status: "cancelled" });
    expect(h.log).toEqual(["start a", "failed a", "start b", "failed b", "start c", "cancelled c"]);
  });

  it("cancelAll ends every job without starting a queued one", async () => {
    const h = harness();
    ["a", "b", "c"].map((preset) => h.queue.add({ preset }));
    h.queue.cancelAll();
    await h.flush();
    expect(h.log).toEqual(["start a", "cancelled c", "cancelled b", "cancelled a"]);
    expect(h.queue.jobs.getState()).toEqual([]);
    // The queue is usable again.
    h.queue.add({ preset: "d" });
    expect(h.log.at(-1)).toBe("start d");
  });

  it("starts a job added after the others ended", async () => {
    const h = harness();
    const id = h.queue.add({ preset: "a" });
    h.pending.get(id)?.resolve("x");
    await h.flush();
    h.queue.add({ preset: "b" });
    expect(statuses(h.queue)).toEqual(["b:running"]);
    h.queue.cancel("job-404");
    expect(statuses(h.queue)).toEqual(["b:running"]);
  });
});
