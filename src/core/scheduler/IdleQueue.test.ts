import { describe, expect, it, vi } from "vitest";
import { IdleQueue } from "./IdleQueue.js";

function fakeIdle() {
  const queue: ((deadline: { timeRemaining(): number }) => void)[] = [];
  return {
    request: (cb: (deadline: { timeRemaining(): number }) => void) => queue.push(cb),
    cancel: vi.fn((handle: number) => {
      queue.splice(handle - 1, 1);
    }),
    pending: () => queue.length,
    /** Runs one idle slice that has room for `budget` tasks. */
    slice(budget: number) {
      const cb = queue.shift();
      let left = budget;
      cb?.({ timeRemaining: () => (left-- > 0 ? 10 : 0) });
    },
  };
}

describe("IdleQueue", () => {
  it("runs tasks while the deadline allows and continues in the next slice", () => {
    const idle = fakeIdle();
    const queue = new IdleQueue(idle.request, idle.cancel);
    const ran: number[] = [];
    for (let i = 0; i < 5; i++) queue.enqueue(() => ran.push(i));

    idle.slice(2);
    expect(ran).toEqual([0, 1]);
    expect(idle.pending()).toBe(1);

    idle.slice(10);
    expect(ran).toEqual([0, 1, 2, 3, 4]);
    expect(idle.pending()).toBe(0);
  });

  it("does not run while paused and resumes afterwards", () => {
    const idle = fakeIdle();
    const queue = new IdleQueue(idle.request, idle.cancel);
    const task = vi.fn();
    queue.pause();
    queue.enqueue(task);
    expect(idle.pending()).toBe(0);
    queue.resume();
    idle.slice(10);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("stays paused until every pauser has resumed", () => {
    const idle = fakeIdle();
    const queue = new IdleQueue(idle.request, idle.cancel);
    const task = vi.fn();
    queue.pause("playback");
    queue.pause("gesture");
    queue.enqueue(task);
    queue.resume("gesture");
    expect(queue.isPaused).toBe(true);
    expect(idle.pending()).toBe(0);
    queue.resume("playback");
    idle.slice(10);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("cancels a pending task", () => {
    const idle = fakeIdle();
    const queue = new IdleQueue(idle.request, idle.cancel);
    const task = vi.fn();
    const cancel = queue.enqueue(task);
    cancel();
    idle.slice(10);
    expect(task).not.toHaveBeenCalled();
    expect(queue.size).toBe(0);
  });

  it("survives a failing task", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const idle = fakeIdle();
    const queue = new IdleQueue(idle.request, idle.cancel);
    const after = vi.fn();
    queue.enqueue(() => {
      throw new Error("boom");
    });
    queue.enqueue(after);
    idle.slice(10);
    expect(after).toHaveBeenCalledTimes(1);
  });
});
