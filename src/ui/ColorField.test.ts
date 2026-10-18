import { act, createElement, Profiler } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { formatHexColor } from "../core/document/color.js";
import type { RGBA } from "../core/document/types.js";
import { ColorField, sliderValue, stepColor, type PickerColor } from "./ColorField.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

const BLACK: RGBA = { r: 0, g: 0, b: 0, a: 1 };
/** R 100 of 255: where the channel scrub below ends. */
const SCRUBBED = formatHexColor({ r: 100 / 255, g: 0, b: 0, a: 1 });

interface Mounted {
  /** Unmounts the field (and its open picker). */
  unmount: () => void;
  changes: RGBA[];
  previews: (RGBA | null)[];
  renders: () => number;
  /** The picker's popover, or null while closed. */
  picker: () => HTMLElement | null;
}

/** A ColorField under a Profiler (commits counted), with its picker opened by a click on the swatch. */
function mountOpen(): Mounted {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const changes: RGBA[] = [];
  const previews: (RGBA | null)[] = [];
  let renders = 0;
  act(() =>
    root.render(
      createElement(
        Profiler,
        {
          id: "color",
          onRender: () => {
            renders += 1;
          },
        },
        createElement(ColorField, {
          value: BLACK,
          onChange: (color) => changes.push(color),
          onPreview: (color) => previews.push(color),
          recent: [],
          ariaLabel: "Background color",
        }),
      ),
    ),
  );
  let mounted = true;
  const unmount = () => {
    if (mounted) act(() => root.unmount());
    mounted = false;
  };
  cleanups.push(() => {
    unmount();
    host.remove();
  });
  act(() => host.querySelector<HTMLButtonElement>("button")!.click());
  const picker = () => document.querySelector<HTMLElement>('[role="dialog"][aria-label="Color picker"]');
  expect(picker()).not.toBeNull();
  return { unmount, changes, previews, renders: () => renders, picker };
}

function pointer(target: HTMLElement, type: string, clientX: number, clientY = 0): void {
  act(() => {
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, button: 0, clientX, clientY }));
  });
}

function escape(): void {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  });
}

/** The scrub label of the picker's R, G, B or A field. */
function channelLabel(picker: HTMLElement, name: "R" | "G" | "B" | "Alpha (%)"): HTMLElement {
  return picker.querySelector(`input[aria-label="${name}"]`)!.parentElement!.querySelector("span")!;
}

describe("ColorField picker: drags (spec §11, P1/P2)", () => {
  it("scrubbing a channel label previews live with 0 React commits, then one onChange on release", () => {
    const { changes, previews, renders, picker } = mountOpen();
    const panel = picker()!;
    const label = channelLabel(panel, "R");
    const swatch = panel.querySelector<HTMLElement>('[data-part="preview"]')!;
    const before = renders();
    pointer(label, "pointerdown", 100);
    // Past the dead zone, then 10 moves of 10 px: R 0 → 100.
    pointer(label, "pointermove", 106);
    for (let x = 116; x <= 206; x += 10) pointer(label, "pointermove", x);
    expect(renders()).toBe(before);
    expect(previews).toHaveLength(10);
    expect(previews.at(-1)?.r).toBeCloseTo(100 / 255, 6);
    // The picker paints itself by DOM writes while scrubbed.
    expect(swatch.style.getPropertyValue("--swatch-color")).toBe(SCRUBBED);
    expect(panel.querySelector<HTMLInputElement>('input[aria-label="R"]')!.value).toBe("100");
    expect(changes).toEqual([]);
    pointer(label, "pointerup", 206);
    expect(changes).toHaveLength(1);
    expect(changes[0]!.r).toBeCloseTo(100 / 255, 6);
    expect(changes[0]!.g).toBe(0);
    expect(previews.at(-1)).toBeNull();
    // The release renders the hex field once.
    expect(panel.querySelector<HTMLInputElement>('input[aria-label="Hex"]')!.value).toBe(SCRUBBED);
  });

  it("Esc during a channel scrub ends the preview with no change", () => {
    const { changes, previews, picker } = mountOpen();
    const label = channelLabel(picker()!, "G");
    pointer(label, "pointerdown", 0);
    pointer(label, "pointermove", 10);
    pointer(label, "pointermove", 40);
    expect(previews.at(-1)?.g).toBeCloseTo(30 / 255, 6);
    escape();
    expect(picker()).toBeNull();
    expect(previews.at(-1)).toBeNull();
    expect(changes).toEqual([]);
  });

  it("Esc during a drag on the square closes the picker and ends the preview with no change", () => {
    const { changes, previews, picker } = mountOpen();
    pointer(picker()!.querySelector<HTMLElement>('[data-part="square"]')!, "pointerdown", 1, 0);
    expect(previews).toEqual([{ r: 1, g: 0, b: 0, a: 1 }]);
    escape();
    expect(picker()).toBeNull();
    expect(previews.at(-1)).toBeNull();
    expect(changes).toEqual([]);
  });

  it("unmounted mid-drag (the selection changed): the preview ends with no change", () => {
    const { unmount, changes, previews, picker } = mountOpen();
    pointer(picker()!.querySelector<HTMLElement>('[data-part="hue"]')!, "pointerdown", 0);
    expect(previews).toHaveLength(1);
    unmount();
    expect(picker()).toBeNull();
    expect(previews.at(-1)).toBeNull();
    expect(changes).toEqual([]);
  });
});

function key(target: HTMLElement, name: string, init: KeyboardEventInit = {}): void {
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true, ...init }));
  });
}

describe("ColorField picker: keyboard (Batch 46)", () => {
  const RED: PickerColor = { h: 0, s: 1, v: 1, a: 1 };

  it("steps the square (Left / Right saturation, Up / Down brightness) by 1%, Shift 10%, within 0..100%", () => {
    const grey: PickerColor = { h: 200, s: 0.437, v: 0.5, a: 1 };
    expect(stepColor(grey, "square", "ArrowRight", false)).toEqual({ ...grey, s: 0.45 });
    expect(stepColor(grey, "square", "ArrowLeft", true)).toEqual({ ...grey, s: 0.34 });
    expect(stepColor(grey, "square", "ArrowUp", false)).toEqual({ ...grey, v: 0.51 });
    expect(stepColor(grey, "square", "ArrowDown", true)).toEqual({ ...grey, v: 0.4 });
    expect(stepColor(RED, "square", "ArrowRight", true)).toEqual(RED);
    expect(stepColor(grey, "square", "Home", false)).toBeNull();
    expect(stepColor(grey, "square", "a", false)).toBeNull();
  });

  it("steps the hue by 1 degree (Shift 10) and the alpha by 1% (Shift 10%); Home / End go to the ends", () => {
    expect(stepColor(RED, "hue", "ArrowRight", false)?.h).toBe(1);
    expect(stepColor(RED, "hue", "ArrowLeft", true)?.h).toBe(0);
    expect(stepColor({ ...RED, h: 355 }, "hue", "ArrowUp", true)?.h).toBe(359.999);
    expect(stepColor(RED, "hue", "End", false)?.h).toBe(359.999);
    expect(stepColor(RED, "alpha", "ArrowDown", true)?.a).toBeCloseTo(0.9, 9);
    expect(stepColor({ ...RED, a: 0.5 }, "alpha", "Home", false)?.a).toBe(0);
    expect(stepColor({ ...RED, a: 0.5 }, "alpha", "End", false)?.a).toBe(1);
    expect(stepColor(RED, "alpha", "Enter", false)).toBeNull();
  });

  it("describes each area as a slider value", () => {
    const color: PickerColor = { h: 120.4, s: 0.25, v: 0.8, a: 0.5 };
    expect(sliderValue(color, "square")).toEqual({ now: 25, text: "Saturation 25%, brightness 80%" });
    expect(sliderValue(color, "hue")).toEqual({ now: 120, text: "120 degrees" });
    expect(sliderValue(color, "alpha")).toEqual({ now: 50, text: "50%" });
  });

  it("takes the focus on open (the hex field), keeps Tab inside, and gives it back to the swatch on Esc", async () => {
    const { picker } = mountOpen();
    const panel = picker()!;
    const hex = panel.querySelector<HTMLInputElement>('input[aria-label="Hex"]')!;
    expect(document.activeElement).toBe(hex);
    const square = panel.querySelector<HTMLElement>('[data-part="square"]')!;
    expect(square.getAttribute("role")).toBe("slider");
    expect(square.tabIndex).toBe(0);
    // Shift+Tab from the first stop goes round to the last, Tab from the last to the first.
    act(() => square.focus());
    key(square, "Tab", { shiftKey: true });
    const stops = panel.querySelectorAll<HTMLElement>('input:not([disabled]), button:not([disabled]), [tabindex="0"]');
    const last = stops[stops.length - 1]!;
    expect(document.activeElement).toBe(last);
    key(last, "Tab");
    expect(document.activeElement).toBe(square);
    const swatch = document.querySelector<HTMLButtonElement>('button[aria-label="Background color: color picker"]')!;
    escape();
    expect(picker()).toBeNull();
    // Once the picker has left the page (a microtask after the commit).
    await Promise.resolve();
    expect(document.activeElement).toBe(swatch);
  });

  it("an arrow on a focused strip is one pick, written into the slider's value", () => {
    const { changes, picker } = mountOpen();
    const hue = picker()!.querySelector<HTMLElement>('[data-part="hue"]')!;
    expect(hue.getAttribute("aria-valuenow")).toBe("0");
    const alpha = picker()!.querySelector<HTMLElement>('[data-part="alpha"]')!;
    act(() => alpha.focus());
    key(alpha, "ArrowLeft", { shiftKey: true });
    expect(changes).toHaveLength(1);
    expect(changes[0]!.a).toBeCloseTo(0.9, 9);
    expect(alpha.getAttribute("aria-valuenow")).toBe("90");
    expect(alpha.getAttribute("aria-valuetext")).toBe("90%");
  });
});
