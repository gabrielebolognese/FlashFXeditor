import { describe, expect, it, vi } from "vitest";
import { addClip, removeClips, updateClip } from "../commands/basicCommands.js";
import type { Command, CommandContext } from "../commands/command.js";
import { makeMedia, makeMediaClip, makeProject, makeTrack, withClips } from "../document/fixtures.js";
import { DocumentInvariantError } from "../document/validate.js";
import { DocumentStore } from "./DocumentStore.js";
import { fromSnapshot, toSnapshot } from "./selection.js";
import { createSessionStore, setPlayhead, setSelection } from "./sessionStore.js";

function setup() {
  let project = makeProject();
  project.media.m1 = makeMedia("m1");
  project.tracks.push(makeTrack("v1"), makeTrack("v2"), makeTrack("a1", "audio"));
  project = withClips(project, [
    makeMediaClip(project, { id: "c1", trackId: "v1", start: 0, duration: 30, mediaId: "m1" }),
    makeMediaClip(project, { id: "c2", trackId: "v1", start: 30, duration: 30, mediaId: "m1" }),
  ]);
  const original = structuredClone(project);
  const session = createSessionStore();
  let time = 0;
  let ids = 0;
  const clock = { advance: (ms: number) => (time += ms) };
  const store = new DocumentStore(project, { session, now: () => time, newId: () => `id${++ids}`, validate: true });
  return { store, session, clock, original };
}

const rename = (name: string, coalesceKey?: string): Command => ({
  id: "test.rename",
  label: "Rename project",
  ...(coalesceKey ? { coalesceKey } : {}),
  affects: ["settings"],
  run: (draft) => {
    draft.name = name;
  },
});

const select = (...clipIds: string[]) => fromSnapshot({ clipIds, primary: clipIds[0] ?? null, kind: clipIds.length ? "clips" : "none" });

describe("DocumentStore", () => {
  it("dispatches a command and notifies with state, prev and affects", () => {
    const { store } = setup();
    const listener = vi.fn();
    store.subscribe(listener);
    const prev = store.getState();
    store.dispatch(updateClip("c1", { name: "Intro" }));
    expect(store.getState().clips.c1?.name).toBe("Intro");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(store.getState(), prev, new Set(["clips"]));
    expect(Object.isFrozen(store.getState().clips.c1)).toBe(true);
  });

  it("does not notify a subscriber with affects ['markers'] for a clip update", () => {
    const { store } = setup();
    const markers = vi.fn();
    const clips = vi.fn();
    store.subscribe(markers, { affects: ["markers"] });
    store.subscribe(clips, { affects: ["markers", "clips"] });
    store.dispatch(updateClip("c1", { name: "x" }));
    expect(markers).not.toHaveBeenCalled();
    expect(clips).toHaveBeenCalledTimes(1);
  });

  it("stops notifying after unsubscribe", () => {
    const { store } = setup();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    store.dispatch(rename("x"));
    expect(listener).not.toHaveBeenCalled();
  });

  it("ignores no-op commands: no notification, no undo step", () => {
    const { store } = setup();
    const listener = vi.fn();
    store.subscribe(listener);
    const before = store.getState();
    store.dispatch(updateClip("c1", { start: 0 }));
    expect(store.getState()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
    expect(store.history.getState().canUndo).toBe(false);
  });

  it("undoes and redoes to deep-equal documents", () => {
    const { store, original } = setup();
    store.dispatch(updateClip("c2", { start: 100 }));
    const after = structuredClone(store.getState());
    expect(store.undo()).toBe(true);
    expect(store.getState()).toStrictEqual(original);
    expect(store.redo()).toBe(true);
    expect(store.getState()).toStrictEqual(after);
    expect(store.redo()).toBe(false);
  });

  it("notifies undo and redo with the command's affects", () => {
    const { store } = setup();
    store.dispatch(updateClip("c1", { name: "x" }));
    const listener = vi.fn();
    store.subscribe(listener);
    store.undo();
    store.redo();
    expect(listener.mock.calls.map((call) => [...call[2]])).toEqual([["clips"], ["clips"]]);
  });

  it("exposes history state and labels, replaced only when they change", () => {
    const { store } = setup();
    const onHistory = vi.fn();
    store.history.subscribe(onHistory);
    store.dispatch(rename("a"));
    store.dispatch(rename("b"));
    expect(onHistory).toHaveBeenCalledTimes(1);
    expect(store.history.getState()).toEqual({ canUndo: true, canRedo: false, undoLabel: "Rename project", redoLabel: null });
    store.undo();
    expect(store.history.getState()).toEqual({ canUndo: true, canRedo: true, undoLabel: "Rename project", redoLabel: "Rename project" });
  });

  it("coalesces commands with the same key within 300 ms into one undo step", () => {
    const { store, clock, original } = setup();
    for (let i = 1; i <= 5; i++) {
      store.dispatch(rename(`n${i}`, "name"));
      clock.advance(250);
    }
    expect(store.getState().name).toBe("n5");
    store.undo();
    expect(store.getState()).toStrictEqual(original);
    expect(store.history.getState().canUndo).toBe(false);
    store.redo();
    expect(store.getState().name).toBe("n5");
  });

  it("starts a new step after the window or with another key", () => {
    const { store, clock } = setup();
    store.dispatch(rename("a", "name"));
    clock.advance(301);
    store.dispatch(rename("b", "name"));
    store.dispatch(rename("c", "other"));
    store.undo();
    expect(store.getState().name).toBe("b");
    store.undo();
    expect(store.getState().name).toBe("a");
  });

  it("commits a transaction as one undo step with one notification", () => {
    const { store, original } = setup();
    const listener = vi.fn();
    store.subscribe(listener);
    store.transaction("Ripple delete", () => {
      store.dispatch(removeClips(["c1"]));
      expect(store.getState().clips.c1).toBeUndefined();
      store.dispatch(updateClip("c2", { start: 0 }));
      store.dispatch(rename("after"));
    });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]?.[2]).toEqual(new Set(["clips", "timeline", "settings"]));
    expect(store.history.getState().undoLabel).toBe("Ripple delete");
    store.undo();
    expect(store.getState()).toStrictEqual(original);
  });

  it("validates a transaction only at the end", () => {
    const { store } = setup();
    // Moving c2 onto c1 first and c1 away second is invalid in between, valid at the end.
    store.transaction("Swap", () => {
      store.dispatch(updateClip("c2", { start: 0 }));
      store.dispatch(updateClip("c1", { start: 30 }));
    });
    expect(store.getState().tracks[0]?.clipIds).toEqual(["c2", "c1"]);
  });

  it("rolls a failing transaction back completely", () => {
    const { store, original } = setup();
    const listener = vi.fn();
    store.subscribe(listener);
    expect(() =>
      store.transaction("Broken", () => {
        store.dispatch(removeClips(["c1"]));
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(store.getState()).toStrictEqual(original);
    expect(listener).not.toHaveBeenCalled();
    expect(store.history.getState().canUndo).toBe(false);

    expect(() => store.transaction("Invalid", () => store.dispatch(updateClip("c2", { start: 10 })))).toThrow(DocumentInvariantError);
    expect(store.getState()).toStrictEqual(original);
    expect(store.history.getState().canUndo).toBe(false);
  });

  it("rolls back only a failed nested transaction", () => {
    const { store } = setup();
    store.transaction("Outer", () => {
      store.dispatch(rename("outer"));
      try {
        store.transaction("Inner", () => {
          store.dispatch(removeClips(["c1"]));
          throw new Error("inner");
        });
      } catch {
        // swallowed on purpose
      }
    });
    expect(store.getState().name).toBe("outer");
    expect(store.getState().clips.c1).toBeDefined();
    store.undo();
    expect(store.getState().name).toBe("Test");
  });

  it("refuses undo inside a transaction", () => {
    const { store } = setup();
    expect(() => store.transaction("T", () => store.undo())).toThrow(/inside a transaction/);
  });

  it("rejects an invalid command in dev, leaving the document untouched", () => {
    const { store, original } = setup();
    const project = store.getState();
    const overlap = makeMediaClip(project, { id: "c3", trackId: "v1", start: 10, duration: 5, mediaId: "m1" });
    expect(() => store.dispatch(addClip(overlap))).toThrow(/clip "c3" \(c3\) overlaps clip "c1"/);
    expect(store.getState()).toStrictEqual(original);
    expect(store.history.getState().canUndo).toBe(false);
  });

  it("passes playhead, selection and newId to commands through ctx", () => {
    const { store, session } = setup();
    setPlayhead(session, 42);
    setSelection(session, select("c2"));
    let seen: CommandContext | null = null;
    store.dispatch({
      id: "test.ctx",
      label: "Ctx",
      affects: [],
      run: (draft, ctx) => {
        seen = ctx;
        draft.name = ctx.newId();
      },
    });
    expect(seen).toMatchObject({ playhead: 42, selection: { clipIds: ["c2"], primary: "c2", kind: "clips" } });
    expect(store.getState().name).toBe("id1");
  });

  it("restores the selection from before the command on undo, and from after it on redo", () => {
    const { store, session } = setup();
    setSelection(session, select("c1"));
    store.dispatch(removeClips(["c1"]), { selection: toSnapshot(select()) });
    expect(session.selection.getState().kind).toBe("none");
    // Undo across a selection change: the selection made after the command is replaced.
    setSelection(session, select("c2"));
    store.undo();
    expect([...session.selection.getState().clipIds]).toEqual(["c1"]);
    store.redo();
    expect(session.selection.getState().kind).toBe("none");
  });

  it("drops restored ids that no longer exist", () => {
    const { store, session } = setup();
    setSelection(session, select("c1", "c2"));
    store.dispatch(removeClips(["c1"]));
    store.undo();
    expect(toSnapshot(session.selection.getState())).toEqual({ clipIds: ["c1", "c2"], primary: "c1", kind: "clips" });
    store.redo();
    expect(toSnapshot(session.selection.getState())).toEqual({ clipIds: ["c2"], primary: "c2", kind: "clips" });
    store.dispatch(removeClips(["c2"]));
    store.undo();
    store.redo();
    expect(toSnapshot(session.selection.getState())).toEqual({ clipIds: [], primary: null, kind: "none" });
  });

  it("load() replaces the document, clears history and selection, and notifies every subscriber", () => {
    const { store, session, original } = setup();
    store.dispatch(rename("Changed"));
    setSelection(session, select("c1"));
    const markers = vi.fn();
    store.subscribe(markers, { affects: ["markers"] });
    const next = { ...structuredClone(original), name: "Loaded" };
    store.load(next);
    expect(store.getState().name).toBe("Loaded");
    expect(Object.isFrozen(store.getState())).toBe(true);
    expect(store.history.getState()).toEqual({ canUndo: false, canRedo: false, undoLabel: null, redoLabel: null });
    expect(session.selection.getState().kind).toBe("none");
    expect(markers).toHaveBeenCalledTimes(1);
    expect(store.undo()).toBe(false);
  });

  it("load() rejects an invalid document and keeps the current one", () => {
    const { store, original } = setup();
    const broken = structuredClone(original);
    broken.tracks[0]?.clipIds.push("missing");
    expect(() => store.load(broken)).toThrow(DocumentInvariantError);
    expect(store.getState().tracks[0]?.clipIds).toEqual(["c1", "c2"]);
  });

  it("dispatches 10,000 trivial commands in under 300 ms", () => {
    const command = (i: number): Command => ({
      id: "test.trivial",
      label: "Trivial",
      affects: ["settings"],
      run: (draft) => {
        draft.settings.width = 1000 + (i % 2);
      },
    });
    const run = (count: number) => {
      const { store } = setup(); // dev validation on
      const start = performance.now();
      for (let i = 0; i < count; i++) store.dispatch(command(i));
      return performance.now() - start;
    };
    run(1_000); // JIT warm-up
    // Best of three: the other test files run in parallel workers and add scheduler noise.
    const times = [run(10_000), run(10_000), run(10_000)];
    console.info(`[perf] 10,000 dispatches: ${times.map((t) => t.toFixed(1)).join(" / ")} ms`);
    expect(Math.min(...times)).toBeLessThan(300);
  });
});

