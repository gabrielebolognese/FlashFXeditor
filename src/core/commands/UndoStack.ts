// Undo history (spec §3.3): one entry per command or transaction, holding Immer patches, their
// inverses and the selection before and after, so undo/redo also restore the selection.
import type { Patch } from "immer";
import type { SelectionSnapshot } from "../store/selection.js";
import type { Affect } from "./command.js";

export const COALESCE_WINDOW_MS = 300;
export const DEFAULT_HISTORY_LIMIT = 1000;

export interface UndoEntry {
  label: string;
  patches: Patch[];
  inversePatches: Patch[];
  affects: ReadonlySet<Affect>;
  selectionBefore: SelectionSnapshot;
  selectionAfter: SelectionSnapshot;
  coalesceKey: string | null;
  /** When the (last merged) command ran, in ms. */
  time: number;
}

export class UndoStack {
  private done: UndoEntry[] = [];
  private undone: UndoEntry[] = [];
  /** Set by undo/redo: the next push never merges into an older entry. */
  private sealed = false;

  constructor(private readonly limit = DEFAULT_HISTORY_LIMIT) {}

  get canUndo(): boolean {
    return this.done.length > 0;
  }

  get canRedo(): boolean {
    return this.undone.length > 0;
  }

  get undoLabel(): string | null {
    return this.done.at(-1)?.label ?? null;
  }

  get redoLabel(): string | null {
    return this.undone.at(-1)?.label ?? null;
  }

  /** Records a step and clears redo. Merges into the previous step when the coalesce key matches within the window. */
  push(entry: UndoEntry): void {
    this.undone = [];
    const last = this.done.at(-1);
    const merge =
      !this.sealed &&
      last !== undefined &&
      entry.coalesceKey !== null &&
      last.coalesceKey === entry.coalesceKey &&
      entry.time - last.time <= COALESCE_WINDOW_MS;
    this.sealed = false;
    if (merge) {
      this.done[this.done.length - 1] = {
        ...last,
        patches: last.patches.concat(entry.patches),
        inversePatches: entry.inversePatches.concat(last.inversePatches),
        affects: new Set([...last.affects, ...entry.affects]),
        selectionAfter: entry.selectionAfter,
        time: entry.time,
      };
      return;
    }
    this.done.push(entry);
    if (this.done.length > this.limit) this.done.shift();
  }

  /** Moves the newest step to the redo list and returns it. */
  undo(): UndoEntry | null {
    const entry = this.done.pop();
    if (!entry) return null;
    this.undone.push(entry);
    this.sealed = true;
    return entry;
  }

  /** Moves the newest undone step back and returns it. */
  redo(): UndoEntry | null {
    const entry = this.undone.pop();
    if (!entry) return null;
    this.done.push(entry);
    this.sealed = true;
    return entry;
  }

  clear(): void {
    this.done = [];
    this.undone = [];
    this.sealed = false;
  }
}
