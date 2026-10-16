import { act, createElement, Profiler } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { NumberField, parseNumber, roundTo, type ChangePhase, type NumberBinding, type NumberFieldProps } from "./NumberField.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

/** A bound value with the calls the field made; `step` and `commit` apply their delta, as a store would. */
function fake(initial: number | null) {
  let value = initial;
  const listeners = new Set<() => void>();
  const calls: [ChangePhase | "set", number][] = [];
  const notify = () => {
    for (const listener of listeners) listener();
  };
  const binding: NumberBinding = {
    read: () => value,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(next) {
      calls.push(["set", next]);
      value = next;
      notify();
    },
    change(delta, phase) {
      calls.push([phase, delta]);
      if ((phase === "step" || phase === "commit") && value !== null) {
        value = roundTo(value + delta, 6);
        notify();
      }
    },
  };
  return {
    binding,
    calls,
    get value() {
      return value;
    },
    /** The document changed elsewhere (undo, another panel). */
    replace(next: number | null) {
      value = next;
      notify();
    },
  };
}

interface Mounted {
  input: HTMLInputElement;
  handle: HTMLElement;
  field: HTMLElement;
  renders: () => number;
}

function mount(props: Omit<NumberFieldProps, "ariaLabel"> & { ariaLabel?: string }): Mounted {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  let renders = 0;
  act(() =>
    root.render(
      createElement(
        Profiler,
        {
          id: "field",
          onRender: () => {
            renders += 1;
          },
        },
        createElement(NumberField, { ariaLabel: "Value", label: "X", ...props }),
      ),
    ),
  );
  cleanups.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  return { input: host.querySelector("input")!, handle: host.querySelector("span")!, field: host.firstElementChild as HTMLElement, renders: () => renders };
}

/** Focuses the input and types `text` the way the browser does (value + input event). */
function type(input: HTMLInputElement, text: string): void {
  act(() => {
    input.focus();
    input.value = text;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function press(target: EventTarget, key: string, init: KeyboardEventInit = {}): void {
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }));
  });
}

function pointer(target: HTMLElement, type: string, clientX: number, init: PointerEventInit = {}): void {
  act(() => {
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, button: 0, clientX, ...init }));
  });
}

describe("NumberField: typing (spec §11)", () => {
  it("shows the bound value with its precision and unit", () => {
    const { input, field } = mount({ binding: fake(540).binding, precision: 1, unit: "px" });
    expect(input.value).toBe("540.0");
    expect(field.textContent).toContain("px");
  });

  it("Enter commits the typed value exactly (rounded, clamped) and leaves the field; Escape reverts", () => {
    const bound = fake(540);
    const { input } = mount({ binding: bound.binding, precision: 1, min: -1000, max: 1000 });
    type(input, "100");
    press(input, "Enter");
    expect(bound.calls).toEqual([["set", 100]]);
    expect(input.value).toBe("100.0");
    expect(document.activeElement).not.toBe(input);
    type(input, "3,14159");
    act(() => input.blur());
    type(input, "99999");
    press(input, "Enter");
    expect(bound.calls.slice(1)).toEqual([
      ["set", 3.1],
      ["set", 1000],
    ]);
    type(input, "12");
    press(input, "Escape");
    expect(bound.calls).toHaveLength(3);
    expect(input.value).toBe("1000.0");
    type(input, "abc");
    press(input, "Enter");
    expect(bound.calls).toHaveLength(3);
    expect(input.value).toBe("1000.0");
  });

  it("shows -- for mixed values; a typed value sets every target", () => {
    const bound = fake(null);
    const { input } = mount({ binding: bound.binding });
    expect(input.value).toBe("");
    expect(input.placeholder).toBe("--");
    type(input, "50");
    press(input, "Enter");
    expect(bound.calls).toEqual([["set", 50]]);
    expect(input.value).toBe("50");
    expect(input.placeholder).toBe("");
  });

  it("Up/Down step by 1 (Shift 10) within the clamps; a mixed field steps each target", () => {
    const bound = fake(95);
    const { input } = mount({ binding: bound.binding, max: 100 });
    act(() => input.focus());
    press(input, "ArrowUp");
    press(input, "ArrowUp", { shiftKey: true });
    // At the max: no step.
    press(input, "ArrowUp");
    expect(input.value).toBe("100");
    press(input, "ArrowDown", { shiftKey: true });
    expect(bound.calls).toEqual([
      ["step", 1],
      ["step", 4],
      ["step", -10],
    ]);
    expect(input.value).toBe("90");
    // Typed text then an arrow: the text plus the step.
    type(input, "20");
    press(input, "ArrowDown");
    expect(bound.calls.at(-1)).toEqual(["set", 19]);
    const mixed = fake(null);
    const other = mount({ binding: mixed.binding });
    act(() => other.input.focus());
    press(other.input, "ArrowDown");
    expect(mixed.calls).toEqual([["step", -1]]);
  });

  it("writes outside changes of the bound value into the DOM without a React render", () => {
    const bound = fake(1);
    const { input, renders } = mount({ binding: bound.binding, precision: 2 });
    const before = renders();
    bound.replace(2.5);
    expect(input.value).toBe("2.50");
    bound.replace(null);
    expect(input.placeholder).toBe("--");
    expect(renders()).toBe(before);
    // Typed text is not overwritten until committed or reverted.
    type(input, "7");
    bound.replace(3);
    expect(input.value).toBe("7");
  });

  it("parses and rounds", () => {
    expect(parseNumber(" 12,5 ")).toBe(12.5);
    expect(parseNumber("x")).toBeNull();
    expect(roundTo(-0.04, 1)).toBe(0);
    expect(roundTo(2.345, 2)).toBe(2.35);
  });
});

describe("NumberField: label scrubbing (spec §11, P1)", () => {
  it("scrubs live (Shift 10x, Alt 0.1x) with DOM writes only, then commits once on release", () => {
    const bound = fake(540);
    const { input, handle, field, renders } = mount({ binding: bound.binding, precision: 1 });
    const before = renders();
    pointer(handle, "pointerdown", 100);
    // Past the dead zone: the scrub starts here (no change yet).
    pointer(handle, "pointermove", 106);
    expect(field.dataset.scrubbing).toBe("");
    pointer(handle, "pointermove", 116);
    expect(input.value).toBe("550.0");
    pointer(handle, "pointermove", 118, { shiftKey: true });
    expect(input.value).toBe("570.0");
    pointer(handle, "pointermove", 123, { altKey: true });
    expect(input.value).toBe("570.5");
    expect(bound.calls).toEqual([
      ["scrub", 10],
      ["scrub", 30],
      ["scrub", 30.5],
    ]);
    expect(bound.value).toBe(540);
    expect(renders()).toBe(before);
    pointer(handle, "pointerup", 123);
    expect(bound.calls.at(-1)).toEqual(["commit", 30.5]);
    expect(bound.value).toBe(570.5);
    expect(input.value).toBe("570.5");
    expect(field.dataset.scrubbing).toBeUndefined();
    expect(renders()).toBe(before);
  });

  it("clamps while scrubbing (dragging back moves at once) and Esc cancels with no change", () => {
    const bound = fake(98);
    const { input, handle } = mount({ binding: bound.binding, min: 0, max: 100 });
    pointer(handle, "pointerdown", 0);
    pointer(handle, "pointermove", 10);
    pointer(handle, "pointermove", 60);
    expect(input.value).toBe("100");
    pointer(handle, "pointermove", 55);
    expect(input.value).toBe("95");
    press(window, "Escape");
    expect(bound.calls.at(-1)).toEqual(["cancel", 0]);
    expect(bound.value).toBe(98);
    expect(input.value).toBe("98");
    // The pointer's release after Esc does nothing more.
    pointer(handle, "pointerup", 55);
    expect(bound.calls.filter(([phase]) => phase === "commit")).toEqual([]);
  });

  it("a click on the label without a drag focuses the input; a mixed field scrubs by deltas", () => {
    const bound = fake(null);
    const { input, handle } = mount({ binding: bound.binding });
    pointer(handle, "pointerdown", 50);
    pointer(handle, "pointerup", 50);
    expect(document.activeElement).toBe(input);
    expect(bound.calls).toEqual([]);
    act(() => input.blur());
    pointer(handle, "pointerdown", 50);
    pointer(handle, "pointermove", 60);
    pointer(handle, "pointermove", 64);
    pointer(handle, "pointerup", 64);
    expect(bound.calls).toEqual([
      ["scrub", 4],
      ["commit", 4],
    ]);
    expect(input.placeholder).toBe("--");
  });

  it("does not scrub when disabled", () => {
    const bound = fake(1);
    const { handle } = mount({ binding: bound.binding, disabled: true });
    pointer(handle, "pointerdown", 0);
    pointer(handle, "pointermove", 20);
    pointer(handle, "pointermove", 40);
    pointer(handle, "pointerup", 40);
    expect(bound.calls).toEqual([]);
  });
});
