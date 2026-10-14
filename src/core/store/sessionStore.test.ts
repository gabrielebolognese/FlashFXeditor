import { describe, expect, it, vi } from "vitest";
import { EMPTY_SELECTION, filterSelection, fromSnapshot, selectionEquals, toSnapshot } from "./selection.js";
import { createSessionStore, DEFAULT_SESSION, setPlayhead, setSelection } from "./sessionStore.js";

describe("SessionStore", () => {
  it("starts from the defaults, with overrides", () => {
    const session = createSessionStore({ snap: false });
    expect(session.state.getState()).toEqual({ ...DEFAULT_SESSION, snap: false });
    expect(session.selection.getState()).toBe(EMPTY_SELECTION);
  });

  it("keeps selection and session state on separate channels", () => {
    const session = createSessionStore();
    const onState = vi.fn();
    const onSelection = vi.fn();
    session.state.subscribe(onState);
    session.selection.subscribe(onSelection);
    setPlayhead(session, 10);
    expect(onState).toHaveBeenCalledTimes(1);
    expect(onSelection).not.toHaveBeenCalled();
    setSelection(session, fromSnapshot({ clipIds: ["a"], primary: "a", kind: "clips" }));
    expect(onSelection).toHaveBeenCalledTimes(1);
    expect(onState).toHaveBeenCalledTimes(1);
  });

  it("setPlayhead rounds, clamps at 0 and skips no-op moves", () => {
    const session = createSessionStore();
    const onState = vi.fn();
    session.state.subscribe(onState);
    setPlayhead(session, 12.4);
    expect(session.state.getState().playhead).toBe(12);
    setPlayhead(session, -5);
    expect(session.state.getState().playhead).toBe(0);
    setPlayhead(session, 0);
    expect(onState).toHaveBeenCalledTimes(2);
  });

  it("setSelection skips equal selections", () => {
    const session = createSessionStore();
    const onSelection = vi.fn();
    session.selection.subscribe(onSelection);
    setSelection(session, fromSnapshot({ clipIds: ["a", "b"], primary: "a", kind: "clips" }));
    setSelection(session, fromSnapshot({ clipIds: ["b", "a"], primary: "a", kind: "clips" }));
    expect(onSelection).toHaveBeenCalledTimes(1);
    setSelection(session, fromSnapshot({ clipIds: ["b", "a"], primary: "b", kind: "clips" }));
    expect(onSelection).toHaveBeenCalledTimes(2);
  });
});

describe("selection helpers", () => {
  it("serializes the Set to arrays and back", () => {
    const selection = fromSnapshot({ clipIds: ["a", "b"], primary: "b", kind: "clips" });
    expect(selection.clipIds).toBeInstanceOf(Set);
    const snapshot = toSnapshot(selection);
    expect(snapshot).toEqual({ clipIds: ["a", "b"], primary: "b", kind: "clips" });
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
    expect(selectionEquals(fromSnapshot(snapshot), selection)).toBe(true);
  });

  it("filters missing ids, falling back to another primary or none", () => {
    const snapshot = { clipIds: ["a", "b", "c"], primary: "a", kind: "clips" } as const;
    const exists = (keep: string[]) => (id: string) => keep.includes(id);
    expect(filterSelection(snapshot, exists(["a", "b", "c"]))).toBe(snapshot);
    expect(filterSelection(snapshot, exists(["c", "b"]))).toEqual({ clipIds: ["b", "c"], primary: "b", kind: "clips" });
    expect(filterSelection(snapshot, exists([]))).toEqual({ clipIds: [], primary: null, kind: "none" });
  });
});
