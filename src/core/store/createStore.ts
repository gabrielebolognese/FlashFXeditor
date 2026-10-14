// Minimal subscribable store. Views subscribe to narrow selectors so a change only reaches the code
// that depends on it (React chrome via hooks later, canvases and DOM writers directly).

export type Equality<T> = (a: T, b: T) => boolean;

export interface Store<T> {
  get(): T;
  set(next: T | ((prev: T) => T)): void;
  subscribe(listener: (state: T, prev: T) => void): () => void;
  /** Calls `onChange` when the selected value changes (by `equals`, default Object.is). */
  select<S>(
    selector: (state: T) => S,
    onChange: (value: S, prev: S) => void,
    options?: { equals?: Equality<S>; fireImmediately?: boolean },
  ): () => void;
}

export function shallowEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  const keysA = Object.keys(a);
  if (keysA.length !== Object.keys(b).length) return false;
  return keysA.every((key) => Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}

export function createStore<T>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<(state: T, prev: T) => void>();

  const subscribe: Store<T>["subscribe"] = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  return {
    get: () => state,
    set(next) {
      const prev = state;
      state = typeof next === "function" ? (next as (prev: T) => T)(prev) : next;
      if (Object.is(prev, state)) return;
      for (const listener of listeners) listener(state, prev);
    },
    subscribe,
    select(selector, onChange, options = {}) {
      const equals = options.equals ?? Object.is;
      let current = selector(state);
      if (options.fireImmediately) onChange(current, current);
      return subscribe((next) => {
        const value = selector(next);
        if (equals(value, current)) return;
        const prev = current;
        current = value;
        onChange(value, prev);
      });
    },
  };
}
