import { describe, expect, it, vi } from "vitest";
import { createStore, shallowEqual } from "./createStore.js";

describe("createStore", () => {
  it("notifies subscribers with the new and previous state", () => {
    const store = createStore({ a: 1 });
    const listener = vi.fn();
    store.subscribe(listener);
    store.set((s) => ({ a: s.a + 1 }));
    expect(listener).toHaveBeenCalledWith({ a: 2 }, { a: 1 });
  });

  it("skips notifications when the state object is unchanged", () => {
    const store = createStore({ a: 1 });
    const listener = vi.fn();
    store.subscribe(listener);
    store.set((s) => s);
    expect(listener).not.toHaveBeenCalled();
  });

  it("select fires only when the selected value changes", () => {
    const store = createStore({ a: 1, b: 1 });
    const onA = vi.fn();
    store.select((s) => s.a, onA);
    store.set((s) => ({ ...s, b: 2 }));
    expect(onA).not.toHaveBeenCalled();
    store.set((s) => ({ ...s, a: 5 }));
    expect(onA).toHaveBeenCalledWith(5, 1);
  });

  it("select supports custom equality and immediate fire", () => {
    const store = createStore({ pos: { x: 1 } });
    const onPos = vi.fn();
    store.select((s) => s.pos, onPos, { equals: shallowEqual, fireImmediately: true });
    expect(onPos).toHaveBeenCalledTimes(1);
    store.set({ pos: { x: 1 } });
    expect(onPos).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes", () => {
    const store = createStore(0);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    store.set(1);
    expect(listener).not.toHaveBeenCalled();
  });
});
