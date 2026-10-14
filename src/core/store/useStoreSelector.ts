// React reads stores through narrow selectors (spec §3.3): a component re-renders only when its
// selected value changes by Object.is.
import { useRef, useSyncExternalStore } from "react";

/** `subscribe` must not rely on `this` (it is passed unbound). */
export interface ReadableStore<T> {
  getState(): T;
  subscribe(listener: () => void): () => void;
}

export function useStoreSelector<T, S>(store: ReadableStore<T>, selector: (state: T) => S): S {
  const cache = useRef<{ state: T; selector: (state: T) => S; selected: S } | null>(null);
  const getSnapshot = (): S => {
    const state = store.getState();
    const cached = cache.current;
    if (cached && Object.is(cached.state, state) && cached.selector === selector) return cached.selected;
    const selected = selector(state);
    // Keep the previous value when equal, so selectors returning fresh objects of equal identity bail out too.
    const result = cached && Object.is(cached.selected, selected) ? cached.selected : selected;
    cache.current = { state, selector, selected: result };
    return result;
  };
  return useSyncExternalStore(store.subscribe, getSnapshot);
}
