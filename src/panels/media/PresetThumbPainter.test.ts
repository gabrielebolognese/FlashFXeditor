import { describe, expect, it, vi } from "vitest";
import type { TextPreset } from "../../core/document/types.js";
import { FrameScheduler } from "../../core/scheduler/FrameScheduler.js";
import { DEFAULT_TEXT_STYLE } from "../../text/style.js";
import { PresetThumbPainter } from "./PresetThumbPainter.js";

function fakeFrames() {
  const queue: ((time: number) => void)[] = [];
  return {
    request: (cb: (time: number) => void) => queue.push(cb),
    cancel: vi.fn(),
    pending: () => queue.length,
    tick(time = 16) {
      for (const cb of queue.splice(0)) cb(time);
    },
  };
}

const NOW = "2026-10-16T10:00:00.000Z";
const preset = (id: string): TextPreset => ({
  id,
  name: id,
  style: structuredClone(DEFAULT_TEXT_STYLE),
  box: { mode: "auto", width: 900 },
  applyPosition: false,
  tags: [],
  favorite: false,
  createdAt: NOW,
  updatedAt: NOW,
});
const canvas = () => ({}) as HTMLCanvasElement;

function setup() {
  const frames = fakeFrames();
  const scheduler = new FrameScheduler(frames.request, frames.cancel);
  const draw = vi.fn();
  const painter = new PresetThumbPainter(scheduler, draw);
  return { frames, scheduler, draw, painter };
}

describe("PresetThumbPainter", () => {
  it("draws nothing outside the frame loop and each card once per frame at its latest size", () => {
    const { frames, draw, painter } = setup();
    const a = canvas();
    const b = canvas();
    const red = preset("red");
    painter.show(a, red);
    painter.show(b, preset("blue"));
    // A splitter drag: a burst of sizes within one frame.
    for (const width of [100, 110, 120, 130]) {
      painter.resize(a, width, 66);
      painter.resize(b, width, 66);
    }
    expect(draw).not.toHaveBeenCalled();
    expect(frames.pending()).toBe(1);

    frames.tick();
    expect(draw).toHaveBeenCalledTimes(2);
    expect(draw).toHaveBeenCalledWith(a, red, 130, 66);

    // Clean frames draw nothing; the same size again is not a change.
    painter.resize(a, 130, 66);
    painter.show(a, red);
    frames.tick();
    expect(frames.pending()).toBe(0);
    expect(draw).toHaveBeenCalledTimes(2);
  });

  it("waits for both the preset and a size, and skips hidden cards", () => {
    const { frames, draw, painter } = setup();
    const a = canvas();
    painter.resize(a, 118, 66);
    frames.tick();
    expect(draw).not.toHaveBeenCalled();
    const look = preset("a");
    painter.show(a, look);
    frames.tick();
    expect(draw).toHaveBeenCalledWith(a, look, 118, 66);

    // The tab hid (0 x 0): nothing drawn until it has a size again.
    painter.resize(a, 0, 0);
    frames.tick();
    expect(draw).toHaveBeenCalledTimes(1);
    painter.resize(a, 118, 66);
    frames.tick();
    expect(draw).toHaveBeenCalledTimes(2);
  });

  it("draws a changed preset and every card after a font change", () => {
    const { frames, draw, painter } = setup();
    const a = canvas();
    const b = canvas();
    painter.show(a, preset("a"));
    painter.show(b, preset("b"));
    painter.resize(a, 118, 66);
    painter.resize(b, 118, 66);
    frames.tick();
    draw.mockClear();

    const updated = preset("a");
    painter.show(a, updated);
    frames.tick();
    expect(draw.mock.calls).toEqual([[a, updated, 118, 66]]);

    draw.mockClear();
    painter.redrawAll();
    painter.redrawAll();
    frames.tick();
    expect(draw).toHaveBeenCalledTimes(2);
  });

  it("no longer draws a detached card, even with a draw pending", () => {
    const { frames, draw, painter } = setup();
    const a = canvas();
    painter.show(a, preset("a"));
    painter.resize(a, 118, 66);
    painter.detach(a);
    frames.tick();
    painter.redrawAll();
    frames.tick();
    expect(draw).not.toHaveBeenCalled();
  });

  it("dispose unregisters the view", () => {
    const { frames, scheduler, draw, painter } = setup();
    const a = canvas();
    painter.show(a, preset("a"));
    painter.resize(a, 118, 66);
    painter.dispose();
    scheduler.invalidate("mediaThumbs");
    frames.tick();
    expect(draw).not.toHaveBeenCalled();
  });
});
