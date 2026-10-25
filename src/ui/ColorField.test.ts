import { act, createElement, Profiler } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { formatHexColor } from "../core/document/color.js";
import type { RGBA } from "../core/document/types.js";
import { ColorField } from "./ColorField.js";

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
