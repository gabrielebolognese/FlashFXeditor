import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TextField, type TextFieldProps } from "./TextField.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function mount(props: TextFieldProps): HTMLInputElement {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(createElement(TextField, props)));
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

describe("TextField (commit mode)", () => {
  it("commits once on Enter and leaves the field", () => {
    const onCommit = vi.fn();
    const input = mount({ value: "Reel", onCommit, ariaLabel: "Name" });
    type(input, "typed");
    press(input, "Enter");
    expect(onCommit.mock.calls).toEqual([["typed"]]);
    expect(document.activeElement).not.toBe(input);
  });

  it("reverts on Escape without committing", () => {
    const onCommit = vi.fn();
    const input = mount({ value: "Reel", onCommit, ariaLabel: "Name" });
    type(input, "typed");
    press(input, "Escape");
    expect(onCommit).not.toHaveBeenCalled();
    expect(input.value).toBe("Reel");
    expect(document.activeElement).not.toBe(input);
  });

  it("commits once on blur", () => {
    const onCommit = vi.fn();
    const input = mount({ value: "Reel", onCommit, ariaLabel: "Name" });
    type(input, "typed");
    act(() => input.blur());
    expect(onCommit.mock.calls).toEqual([["typed"]]);
  });

  it("does not commit unchanged text", () => {
    const onCommit = vi.fn();
    const input = mount({ value: "Reel", onCommit, ariaLabel: "Name" });
    type(input, "Reel");
    press(input, "Enter");
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("starts a fresh edit after a commit", () => {
    const onCommit = vi.fn();
    const input = mount({ value: "Reel", onCommit, ariaLabel: "Name" });
    type(input, "first");
    press(input, "Enter");
    type(input, "second");
    press(input, "Escape");
    type(input, "third");
    act(() => input.blur());
    expect(onCommit.mock.calls).toEqual([["first"], ["third"]]);
  });
});

describe("TextField (live mode)", () => {
  it("reports every keystroke and calls onCommit once on Enter", () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();
    const input = mount({ value: "Reel", onChange, onCommit, ariaLabel: "Name" });
    type(input, "Reels");
    press(input, "Enter");
    expect(onChange.mock.calls).toEqual([["Reels"]]);
    expect(onCommit.mock.calls).toEqual([["Reel"]]);
  });
});

describe("TextField (size)", () => {
  it("takes the compact height only when asked (beside compact buttons)", () => {
    expect(mount({ value: "", ariaLabel: "Name", compact: true }).parentElement?.dataset.size).toBe("compact");
    expect(mount({ value: "", ariaLabel: "Name" }).parentElement?.hasAttribute("data-size")).toBe(false);
  });
});
