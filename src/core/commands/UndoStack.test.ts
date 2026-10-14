import type { Patch } from "immer";
import { describe, expect, it } from "vitest";
import { EMPTY_SELECTION, toSnapshot } from "../store/selection.js";
import { COALESCE_WINDOW_MS, UndoStack, type UndoEntry } from "./UndoStack.js";

const none = toSnapshot(EMPTY_SELECTION);

function entry(label: string, time: number, coalesceKey: string | null = null, n = 0): UndoEntry {
  const patch: Patch = { op: "replace", path: ["name"], value: `${label}${n}` };
  const inverse: Patch = { op: "replace", path: ["name"], value: `${label}${n - 1}` };
  return {
    label,
    patches: [patch],
    inversePatches: [inverse],
    affects: new Set(["settings"]),
    selectionBefore: none,
    selectionAfter: none,
    coalesceKey,
    time,
  };
}

describe("UndoStack", () => {
  it("tracks canUndo/canRedo and labels", () => {
    const stack = new UndoStack();
    expect(stack.canUndo).toBe(false);
    stack.push(entry("A", 0));
    stack.push(entry("B", 1000));
    expect(stack.undoLabel).toBe("B");
    expect(stack.undo()?.label).toBe("B");
    expect(stack.canRedo).toBe(true);
    expect(stack.redoLabel).toBe("B");
    expect(stack.undoLabel).toBe("A");
    expect(stack.redo()?.label).toBe("B");
    expect(stack.canRedo).toBe(false);
  });

  it("clears redo on push", () => {
    const stack = new UndoStack();
    stack.push(entry("A", 0));
    stack.undo();
    stack.push(entry("B", 10));
    expect(stack.canRedo).toBe(false);
    expect(stack.undo()?.label).toBe("B");
    expect(stack.canUndo).toBe(false);
  });

  it("merges same-key entries within the window, ordering patches and inverses", () => {
    const stack = new UndoStack();
    stack.push(entry("Nudge", 0, "nudge", 1));
    stack.push(entry("Nudge", 200, "nudge", 2));
    stack.push(entry("Nudge", 200 + COALESCE_WINDOW_MS, "nudge", 3));
    const merged = stack.undo();
    expect(merged?.patches.map((p) => p.value)).toEqual(["Nudge1", "Nudge2", "Nudge3"]);
    expect(merged?.inversePatches.map((p) => p.value)).toEqual(["Nudge2", "Nudge1", "Nudge0"]);
    expect(stack.canUndo).toBe(false);
  });

  it("does not merge across the window, different keys, missing keys, or an undo", () => {
    const stack = new UndoStack();
    stack.push(entry("A", 0, "k"));
    stack.push(entry("A", COALESCE_WINDOW_MS + 1, "k"));
    stack.push(entry("B", COALESCE_WINDOW_MS + 2, "other"));
    stack.push(entry("C", COALESCE_WINDOW_MS + 3));
    stack.push(entry("C", COALESCE_WINDOW_MS + 4));
    let count = 0;
    while (stack.undo()) count++;
    expect(count).toBe(5);

    const sealed = new UndoStack();
    sealed.push(entry("A", 0, "k"));
    sealed.push(entry("X", 10));
    sealed.undo();
    sealed.push(entry("A", 20, "k"));
    expect(sealed.undo()?.patches).toHaveLength(1);
  });

  it("drops the oldest entries beyond the limit", () => {
    const stack = new UndoStack(3);
    for (let i = 0; i < 5; i++) stack.push(entry(`E${i}`, i * 1000));
    const labels: string[] = [];
    for (let e = stack.undo(); e; e = stack.undo()) labels.push(e.label);
    expect(labels).toEqual(["E4", "E3", "E2"]);
  });
});
