import { describe, expect, it, vi } from "vitest";
import { RemapGraphPainter, type RemapGraphDeps } from "./RemapGraphPainter.js";

function setup() {
  const canvas = document.createElement("canvas");
  const rectSpy = vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({ width: 200, height: 100, left: 0, top: 0, right: 200, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
  let playhead: number | null = 3;
  const ctx = new Proxy({}, { get: () => () => undefined, set: () => true });
  canvas.getContext = (() => ctx) as unknown as typeof canvas.getContext;
  const invalidate = vi.fn();
  const clip = { kind: "video", duration: 30, timeRemap: [{ frame: 0, sourceUs: 0, ease: "linear" }, { frame: 30, sourceUs: 1_000_000, ease: "linear" }] };
  const deps = {
    clip: () => clip,
    mediaDurationUs: () => 2_000_000,
    playhead: () => playhead,
    commit: vi.fn(),
    colors: () => ({ background: "", grid: "", curve: "", key: "", keyActive: "", playhead: "" }),
    size: { key: 6, pad: 6 },
  } as unknown as RemapGraphDeps;
  const painter = new RemapGraphPainter({ register: () => () => undefined, invalidate }, canvas, deps, () => 1);
  return { painter, invalidate, rectSpy, setPlayhead: (value: number | null) => (playhead = value) };
}

describe("RemapGraphPainter", () => {
  it("measures the canvas once, not on every draw (§4 P9)", () => {
    const { painter, rectSpy } = setup();
    const before = rectSpy.mock.calls.length;
    for (let i = 0; i < 10; i++) painter.render();
    expect(rectSpy.mock.calls.length).toBe(before);
  });

  it("redraws on a playhead change only when its position changed", () => {
    const { painter, invalidate, setPlayhead } = setup();
    painter.render();
    invalidate.mockClear();
    painter.invalidatePlayhead();
    expect(invalidate).not.toHaveBeenCalled();
    setPlayhead(4);
    painter.invalidatePlayhead();
    expect(invalidate).toHaveBeenCalledTimes(1);
  });
});
