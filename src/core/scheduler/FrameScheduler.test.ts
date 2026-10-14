import { describe, expect, it, vi } from "vitest";
import { FrameScheduler } from "./FrameScheduler.js";

function fakeFrames() {
  const queue: ((time: number) => void)[] = [];
  return {
    request: (cb: (time: number) => void) => queue.push(cb),
    cancel: vi.fn(),
    pending: () => queue.length,
    tick(time = 16) {
      const callbacks = queue.splice(0);
      for (const cb of callbacks) cb(time);
    },
  };
}

describe("FrameScheduler", () => {
  it("requests at most one frame per batch of invalidations", () => {
    const frames = fakeFrames();
    const scheduler = new FrameScheduler(frames.request, frames.cancel);
    scheduler.invalidate("timelineContent");
    scheduler.invalidate("timelineOverlay");
    scheduler.invalidate("timelineContent");
    expect(frames.pending()).toBe(1);
  });

  it("renders each dirty view once and leaves clean views alone", () => {
    const frames = fakeFrames();
    const scheduler = new FrameScheduler(frames.request, frames.cancel);
    const content = { render: vi.fn() };
    const overlay = { render: vi.fn() };
    scheduler.register("timelineContent", content);
    scheduler.register("timelineOverlay", overlay);

    scheduler.invalidate("timelineOverlay");
    scheduler.invalidate("timelineOverlay");
    frames.tick(42);

    expect(overlay.render).toHaveBeenCalledTimes(1);
    expect(overlay.render).toHaveBeenCalledWith(42);
    expect(content.render).not.toHaveBeenCalled();
    expect(scheduler.isScheduled()).toBe(false);
  });

  it("renders a view registered under two dirty flags only once", () => {
    const frames = fakeFrames();
    const scheduler = new FrameScheduler(frames.request, frames.cancel);
    const view = { render: vi.fn() };
    scheduler.register("preview", view);
    scheduler.register("previewOverlay", view);
    scheduler.invalidate("preview");
    scheduler.invalidate("previewOverlay");
    frames.tick();
    expect(view.render).toHaveBeenCalledTimes(1);
  });

  it("defers invalidations raised during render to the next frame", () => {
    const frames = fakeFrames();
    const scheduler = new FrameScheduler(frames.request, frames.cancel);
    let renders = 0;
    const view = {
      render: () => {
        renders++;
        if (renders === 1) scheduler.invalidate("meters");
      },
    };
    scheduler.register("meters", view);
    scheduler.invalidate("meters");
    frames.tick();
    expect(renders).toBe(1);
    expect(frames.pending()).toBe(1);
    frames.tick();
    expect(renders).toBe(2);
  });

  it("keeps rendering other views when one throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const frames = fakeFrames();
    const scheduler = new FrameScheduler(frames.request, frames.cancel);
    const ok = { render: vi.fn() };
    scheduler.register("preview", { render: () => { throw new Error("boom"); } });
    scheduler.register("preview", ok);
    scheduler.invalidate("preview");
    frames.tick();
    expect(ok.render).toHaveBeenCalledTimes(1);
  });

  it("stops rendering a view after it unregisters", () => {
    const frames = fakeFrames();
    const scheduler = new FrameScheduler(frames.request, frames.cancel);
    const view = { render: vi.fn() };
    const unregister = scheduler.register("preview", view);
    unregister();
    scheduler.invalidate("preview");
    frames.tick();
    expect(view.render).not.toHaveBeenCalled();
  });

  it("renders a base layer before its overlay whatever order they were invalidated in", () => {
    const frames = fakeFrames();
    const scheduler = new FrameScheduler(frames.request, frames.cancel);
    const order: string[] = [];
    const preview = { render: () => order.push("preview") };
    const stats = { render: () => order.push("stats") };
    scheduler.register("preview", preview);
    scheduler.register("preview", stats);
    scheduler.register("previewOverlay", stats);
    scheduler.register("timelineContent", { render: () => order.push("content") });
    scheduler.register("timelineOverlay", { render: () => order.push("overlay") });
    scheduler.invalidate("previewOverlay");
    scheduler.invalidate("timelineOverlay");
    scheduler.invalidate("preview");
    scheduler.invalidate("timelineContent");
    frames.tick();
    expect(order).toEqual(["content", "overlay", "preview", "stats"]);
  });
});
