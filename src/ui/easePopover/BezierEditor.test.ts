// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { BezierEditor } from "./BezierEditor.js";
import type { Bezier } from "./curveMath.js";

function pointer(type: string, clientX: number, clientY: number): Event {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY, button: 0 });
  Object.defineProperty(event, "pointerId", { value: 1 });
  return event;
}

describe("BezierEditor", () => {
  let editor: BezierEditor | null = null;
  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  function mount(points: Bezier, onCommit: (points: Bezier) => void) {
    const host = document.createElement("div");
    document.body.append(host);
    editor = new BezierEditor(host, { points, onCommit });
    const plot = host.querySelector("svg") as SVGSVGElement;
    // jsdom has no layout: a 100 x 100 plot makes client pixels equal viewBox units.
    plot.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
    return { host, handles: [...host.querySelectorAll("circle[role=slider]")] as SVGCircleElement[] };
  }

  it("commits once on release, with clamped points", () => {
    const onCommit = vi.fn();
    const { handles } = mount([0.25, 0.1, 0.25, 1], onCommit);
    const handle = handles[0] as SVGCircleElement;
    handle.dispatchEvent(pointer("pointerdown", 30, 80));
    handle.dispatchEvent(pointer("pointermove", 50, 50));
    handle.dispatchEvent(pointer("pointermove", 400, -300)); // far outside: clamped
    expect(onCommit).not.toHaveBeenCalled();
    handle.dispatchEvent(pointer("pointerup", 400, -300));
    expect(onCommit).toHaveBeenCalledTimes(1);
    const points = onCommit.mock.calls[0]?.[0] as Bezier;
    expect(points[0]).toBe(1);
    expect(points[1]).toBeLessThanOrEqual(3);
    expect(points[1]).toBeGreaterThan(1);
    expect(points.slice(2)).toEqual([0.25, 1]);
  });

  it("ignores setPoints while dragging and takes it afterwards", () => {
    const { handles } = mount([0.25, 0.1, 0.25, 1], vi.fn());
    const handle = handles[0] as SVGCircleElement;
    handle.dispatchEvent(pointer("pointerdown", 30, 80));
    editor?.setPoints([0, 0, 1, 1]);
    expect(editor?.getPoints()).toEqual([0.25, 0.1, 0.25, 1]);
    handle.dispatchEvent(pointer("pointercancel", 30, 80));
    editor?.setPoints([0, 0, 1, 1]);
    expect(editor?.getPoints()).toEqual([0, 0, 1, 1]);
  });

  it("nudges with arrows and commits a typed field", () => {
    const onCommit = vi.fn();
    const { host, handles } = mount([0.5, 0.5, 0.5, 0.5], onCommit);
    (handles[1] as SVGCircleElement).dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
    expect(onCommit).toHaveBeenLastCalledWith([0.5, 0.5, 0.51, 0.5]);
    const input = host.querySelector("input[aria-label='Bezier y1']") as HTMLInputElement;
    input.value = "9";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    expect(onCommit).toHaveBeenLastCalledWith([0.5, 3, 0.51, 0.5]);
  });
});
