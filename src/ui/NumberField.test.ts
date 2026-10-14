import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NumberField, type NumberFieldProps } from "./NumberField.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function mount(props: NumberFieldProps): HTMLInputElement {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(createElement(NumberField, props)));
  cleanups.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  return host.querySelector("input")!;
}

/** Focuses the input and types `text` the way React sees it (native setter + input event). */
function type(input: HTMLInputElement, text: string): void {
  act(() => {
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function press(input: HTMLInputElement, key: string): void {
  act(() => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

describe("NumberField", () => {
  it("commits once on Enter and leaves the field", () => {
    const onChange = vi.fn();
    const input = mount({ value: 1080, onChange, ariaLabel: "Width" });
    type(input, "720");
    press(input, "Enter");
    expect(onChange.mock.calls).toEqual([[720]]);
    expect(document.activeElement).not.toBe(input);
  });

  it("reverts on Escape without committing", () => {
    const onChange = vi.fn();
    const input = mount({ value: 1080, onChange, ariaLabel: "Width" });
    type(input, "720");
    press(input, "Escape");
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe("1080");
    expect(document.activeElement).not.toBe(input);
  });

  it("commits once on blur, clamped and rounded", () => {
    const onChange = vi.fn();
    const input = mount({ value: 1, onChange, min: 0, max: 10, precision: 1, ariaLabel: "Scale" });
    type(input, "3,14");
    act(() => input.blur());
    type(input, "99");
    act(() => input.blur());
    expect(onChange.mock.calls).toEqual([[3.1], [10]]);
  });

  it("reverts text that is not a number", () => {
    const onChange = vi.fn();
    const input = mount({ value: 1080, onChange, ariaLabel: "Width" });
    type(input, "abc");
    press(input, "Enter");
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe("1080");
  });
});
