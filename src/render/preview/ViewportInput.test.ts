import { afterEach, describe, expect, it, vi } from "vitest";
import { createLayoutStore } from "../../core/store/layoutStore.js";
import { createSessionStore } from "../../core/store/sessionStore.js";
import { frameTransformInto } from "./viewport.js";
import { mutableIdentity } from "../mat3.js";
import { ViewportInput } from "./ViewportInput.js";

const FRAME = { width: 1080, height: 1920 };
const TARGET = { width: 800, height: 1000, margin: 16, dpr: 1 };
const detaches: (() => void)[] = [];

function setup() {
  const session = createSessionStore();
  const layout = createLayoutStore(null);
  let playing = false;
  const onSpaceTap = vi.fn();
  const input = new ViewportInput({ session: session.state, layout, frame: () => FRAME, target: () => TARGET, playing: () => playing, onSpaceTap });
  const element = document.createElement("canvas");
  element.getBoundingClientRect = () => ({ left: 100, top: 50, right: 900, bottom: 1050, width: 800, height: 1000, x: 100, y: 50, toJSON: () => null });
  element.setPointerCapture = () => undefined;
  document.body.append(element);
  detaches.push(input.attach(element));
  element.dispatchEvent(new PointerEvent("pointerenter"));
  const view = () => session.state.getState().preview;
  const wheel = (init: WheelEventInit) => {
    const event = new WheelEvent("wheel", { clientX: 100 + 523, clientY: 50 + 311, cancelable: true, ...init });
    element.dispatchEvent(event);
    return event;
  };
  const pointer = (type: string, x: number, y: number, init: PointerEventInit = {}) => element.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, button: 0, bubbles: true, ...init }));
  const key = (type: "keydown" | "keyup") => {
    const event = new KeyboardEvent(type, { code: "Space", key: " ", cancelable: true, bubbles: true });
    window.dispatchEvent(event);
    return event;
  };
  return { session, input, element, view, wheel, pointer, key, onSpaceTap, setPlaying: (value: boolean) => (playing = value) };
}

/** The project point under canvas point (`x`, `y`) at the session view. */
function projectAt(view: { zoom: number | "fit"; panX: number; panY: number }, x: number, y: number) {
  const m = frameTransformInto(mutableIdentity(), view.zoom, FRAME, TARGET, TARGET.margin, view.panX, view.panY);
  return { x: (x - m[4]) / m[0], y: (y - m[5]) / m[3] };
}

describe("ViewportInput", () => {
  afterEach(() => {
    for (const detach of detaches.splice(0)) detach();
    document.body.replaceChildren();
  });

  it("zooms around the cursor with Ctrl+wheel and keeps that point under it", () => {
    const { view, wheel } = setup();
    const before = projectAt(view(), 523, 311);
    const event = wheel({ deltaY: -100, ctrlKey: true });
    expect(event.defaultPrevented).toBe(true);
    expect(typeof view().zoom).toBe("number");
    const after = projectAt(view(), 523, 311);
    expect(Math.abs(after.x - before.x) * (view().zoom as number)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(after.y - before.y) * (view().zoom as number)).toBeLessThanOrEqual(0.5);
    wheel({ deltaY: -100, altKey: true });
    const again = projectAt(view(), 523, 311);
    expect(Math.abs(again.x - before.x) * (view().zoom as number)).toBeLessThanOrEqual(0.5);
  });

  it("pans with a plain wheel only when zoomed", () => {
    const { session, view, wheel } = setup();
    expect(wheel({ deltaY: 120 }).defaultPrevented).toBe(false);
    expect(view().zoom).toBe("fit");
    session.state.set((state) => ({ ...state, preview: { ...state.preview, zoom: 2 } }));
    wheel({ deltaY: 120 });
    expect(view()).toMatchObject({ panX: 0, panY: 60 });
    wheel({ deltaY: 40, shiftKey: true });
    expect(view()).toMatchObject({ panX: 20, panY: 60 });
  });

  it("pans with a middle drag, a Hand tool drag, and Space+drag; a Space tap plays", () => {
    const { session, view, pointer, key, onSpaceTap, setPlaying } = setup();
    session.state.set((state) => ({ ...state, preview: { ...state.preview, zoom: 2 } }));
    pointer("pointerdown", 300, 300, { button: 1 });
    pointer("pointermove", 340, 280, { button: 1 });
    pointer("pointerup", 340, 280, { button: 1 });
    expect(view()).toMatchObject({ panX: -20, panY: 10 });
    // A plain left drag does nothing without the Hand tool or Space.
    pointer("pointerdown", 300, 300);
    pointer("pointermove", 400, 300);
    pointer("pointerup", 400, 300);
    expect(view()).toMatchObject({ panX: -20, panY: 10 });
    session.state.set((state) => ({ ...state, activeTool: "hand" }));
    pointer("pointerdown", 300, 300);
    pointer("pointermove", 260, 300);
    pointer("pointerup", 260, 300);
    expect(view()).toMatchObject({ panX: 0, panY: 10 });
    session.state.set((state) => ({ ...state, activeTool: "select" }));
    // Space: armed over the canvas (the shortcut does not see it), a drag pans, the release plays nothing.
    expect(key("keydown").defaultPrevented).toBe(true);
    pointer("pointerdown", 300, 300);
    pointer("pointermove", 300, 340);
    pointer("pointerup", 300, 340);
    key("keyup");
    expect(view()).toMatchObject({ panX: 0, panY: -10 });
    expect(onSpaceTap).not.toHaveBeenCalled();
    // A tap with no drag plays; while playing, Space goes straight to the shortcuts.
    key("keydown");
    key("keyup");
    expect(onSpaceTap).toHaveBeenCalledTimes(1);
    setPlaying(true);
    expect(key("keydown").defaultPrevented).toBe(false);
  });
});
