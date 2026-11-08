import { describe, expect, it, vi } from "vitest";
import type { RenderView } from "../../core/scheduler/FrameScheduler.js";
import { SAMPLE_LOOP_MS, TransitionSamplePainter } from "./TransitionSamplePainter.js";

function setup() {
  const views: RenderView[] = [];
  const invalidate = vi.fn();
  const scheduler = { register: (_flag: string, view: RenderView) => (views.push(view), () => views.splice(views.indexOf(view), 1)), invalidate };
  const canvas = document.createElement("canvas");
  canvas.getBoundingClientRect = () => ({ width: 100, height: 40 }) as DOMRect;
  const ctx = { setTransform: vi.fn(), clearRect: vi.fn() } as unknown as CanvasRenderingContext2D;
  canvas.getContext = (() => ctx) as unknown as HTMLCanvasElement["getContext"];
  const draw = vi.fn();
  const painter = new TransitionSamplePainter(scheduler as never, canvas, "push", () => ({ from: "a", to: "b", dark: "c", light: "d" }), draw, () => 2);
  return { painter, views, invalidate, draw, canvas };
}

describe("TransitionSamplePainter (Batch 71 review: P1, P3)", () => {
  it("registers on the scheduler and draws the selected kind at its midpoint, once", () => {
    const { painter, views, invalidate, draw, canvas } = setup();
    expect(views).toEqual([painter]);
    invalidate.mockClear();
    painter.render(0);
    expect(draw).toHaveBeenCalledTimes(1);
    expect(draw.mock.calls[0]?.slice(1, 3)).toEqual(["push", 0.5]);
    expect(canvas.width).toBe(200);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("animates a hovered kind by asking for the next frame, and stops when the hover ends", () => {
    const { painter, invalidate, draw } = setup();
    painter.setHovered("whip");
    expect(painter.animating).toBe(true);
    invalidate.mockClear();
    painter.render(1000);
    painter.render(1000 + SAMPLE_LOOP_MS / 4);
    expect(draw.mock.calls.map((call) => [call[1], call[2]])).toEqual([["whip", 0], ["whip", 0.25]]);
    expect(invalidate).toHaveBeenCalledTimes(2);
    painter.setHovered(null);
    invalidate.mockClear();
    painter.render(5000);
    expect(draw.mock.calls.at(-1)?.slice(1, 3)).toEqual(["push", 0.5]);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("a base kind change redraws through the scheduler", () => {
    const { painter, invalidate } = setup();
    invalidate.mockClear();
    painter.setBase("iris");
    expect(invalidate).toHaveBeenCalledWith("mediaThumbs");
  });
});
