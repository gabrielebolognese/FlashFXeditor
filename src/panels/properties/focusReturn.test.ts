import { act, createElement, StrictMode, useRef, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { useFocusReturn, type FocusSurroundings } from "./focusReturn.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

/** A row that hands the focus on when it goes (`target`, else the panel's focus home). */
function Row({ id, target, autoFocus }: { id: string; target?: (around: FocusSurroundings) => Element | null | undefined; autoFocus?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusReturn(ref, target);
  // createElement is how a .ts test writes `<div ref={ref}>`: the ref is attached, never read in render.
  // eslint-disable-next-line react-hooks/refs
  return createElement("div", { ref, "data-row": id }, createElement("button", { type: "button", "data-button": id, autoFocus }, id));
}

/** A panel with a focus home around `children`. */
const panel = (children: ReactNode) => createElement("section", { "data-panel": "properties" }, createElement("div", { tabIndex: -1, "data-focus-home": "" }, children));

function mount(node: ReactNode): Root {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(node));
  cleanups.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  return root;
}

const button = (id: string) => document.querySelector<HTMLButtonElement>(`[data-button="${id}"]`)!;
const home = () => document.querySelector<HTMLElement>("[data-focus-home]")!;

describe("useFocusReturn (Batch 46, keyboard-only use)", () => {
  it("a row that goes with the focus inside leaves it on the panel's focus home", async () => {
    const root = mount(panel([createElement(Row, { key: "a", id: "a" })]));
    act(() => button("a").focus());
    act(() => root.render(panel([])));
    await Promise.resolve();
    expect(document.activeElement).toBe(home());
  });

  it("goes to the target it finds once the row has left the page (a neighbor that stays)", async () => {
    const next = ({ next }: FocusSurroundings) => next?.querySelector("button");
    const root = mount(panel([createElement(Row, { key: "a", id: "a", target: next }), createElement(Row, { key: "b", id: "b" })]));
    act(() => button("a").focus());
    act(() => root.render(panel([createElement(Row, { key: "b", id: "b" })])));
    await Promise.resolve();
    expect(document.activeElement).toBe(button("b"));
  });

  it("moves nothing when the focus was elsewhere, or on a dev StrictMode remount", async () => {
    const outside = document.createElement("button");
    document.body.append(outside);
    cleanups.push(() => outside.remove());
    // The row takes the focus as it mounts (a name field's autoFocus); the dev remount must not move it.
    const root = mount(createElement(StrictMode, null, panel([createElement(Row, { key: "a", id: "a", autoFocus: true })])));
    await Promise.resolve();
    expect(document.activeElement).toBe(button("a"));
    act(() => outside.focus());
    act(() => root.render(createElement(StrictMode, null, panel([]))));
    await Promise.resolve();
    expect(document.activeElement).toBe(outside);
  });
});
