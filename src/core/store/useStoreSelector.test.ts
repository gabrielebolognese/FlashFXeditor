import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { createStore } from "./createStore.js";
import { useStoreSelector, type ReadableStore } from "./useStoreSelector.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function mount<T, S>(store: ReadableStore<T>, selector: (state: T) => S) {
  const seen: S[] = [];
  function Probe() {
    seen.push(useStoreSelector(store, selector));
    return null;
  }
  const root = createRoot(document.createElement("div"));
  act(() => root.render(createElement(Probe)));
  cleanups.push(() => act(() => root.unmount()));
  return seen;
}

describe("useStoreSelector", () => {
  it("re-renders only when the selected value changes", () => {
    const store = createStore({ a: 1, b: 1 });
    const renders = mount(store, (s) => s.a);
    expect(renders).toEqual([1]);
    act(() => store.set((s) => ({ ...s, b: 2 })));
    expect(renders).toEqual([1]);
    act(() => store.set((s) => ({ ...s, a: 5 })));
    expect(renders).toEqual([1, 5]);
  });

  it("bails out by Object.is on the selected value", () => {
    const shared = { x: 1 };
    const store = createStore({ obj: shared, n: 0 });
    const renders = mount(store, (s) => s.obj);
    act(() => store.set((s) => ({ ...s, n: 1 })));
    act(() => store.set((s) => ({ ...s, n: 2 })));
    expect(renders).toHaveLength(1);
    act(() => store.set((s) => ({ ...s, obj: { x: 1 } })));
    expect(renders).toHaveLength(2);
  });

  it("works with any store exposing getState and an unbound subscribe", () => {
    let state = 0;
    const listeners = new Set<() => void>();
    const store: ReadableStore<number> = {
      getState: () => state,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    const renders = mount(store, (s) => s * 10);
    act(() => {
      state = 3;
      for (const listener of listeners) listener();
    });
    expect(renders).toEqual([0, 30]);
  });
});
