// The document store (spec §3.3). Holds the immutable Project, runs commands through Immer
// `produceWithPatches`, records undo steps, and notifies subscribers with the command's `affects`
// flags so each one can bail out cheaply.
import { applyPatches, enablePatches, freeze, produceWithPatches, type Draft, type Patch } from "immer";
import type { Affect, Command, CommandContext } from "../commands/command.js";
import { UndoStack, type UndoEntry } from "../commands/UndoStack.js";
import { carryTrackHeights } from "../document/project.js";
import { findTrack, scopeSequence, sequenceView } from "../document/sequences.js";
import { hasTransitions, reconcileTransitions } from "../document/transitions.js";
import { keyFollow } from "../document/keyProps.js";
import type { Project, SequenceId } from "../document/types.js";
import { assertValid } from "../document/validate.js";
import { createStore, shallowEqual, type Store } from "./createStore.js";
import { EMPTY_SELECTION, filterSelection, fromSnapshot, toSnapshot, type Selection, type SelectionSnapshot } from "./selection.js";
import { NO_SCOPE, setSelection, type SessionStore } from "./sessionStore.js";

enablePatches();

const ALL_AFFECTS: ReadonlySet<Affect> = new Set<Affect>(["timeline", "clips", "tracks", "media", "text", "captions", "markers", "settings", "audio", "composite"]);

export type DocumentListener = (state: Project, prev: Project, affects: ReadonlySet<Affect>) => void;

export interface HistoryState {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
}

export interface DispatchOptions {
  /** Selection to set once the change is committed; redo restores it. Default: unchanged. */
  selection?: SelectionSnapshot;
}

export interface DocumentStoreOptions {
  /** Source of the playhead and selection passed to commands, and target of selection restores. */
  session: SessionStore;
  newId?: () => string;
  /** Check every invariant after each change. Default: dev builds only. */
  validate?: boolean;
  /** Clock for the coalescing window, in ms. */
  now?: () => number;
  historyLimit?: number;
}

interface Transaction {
  label: string;
  base: Project;
  patches: Patch[];
  inversePatches: Patch[];
  affects: Set<Affect>;
  selectionBefore: SelectionSnapshot;
  selectionAfter: SelectionSnapshot | undefined;
}

/**
 * Runs `fn` on a draft whose `tracks` and picture size are those of sequence `scope` (a compound
 * opened for editing, spec 21.10): every command and every piece of code written for the project's
 * own timeline then edits the sequence unchanged. The tracks go back to their places afterwards, and
 * the sequence grows to hold the clips that now end after it (it never shrinks: instances keep their
 * own windows).
 */
export function runInScope(draft: Draft<Project>, scope: SequenceId | null, fn: (target: Draft<Project>) => void): void {
  const sequence = scope === null ? undefined : draft.sequences[scope];
  if (!sequence) {
    fn(draft);
    return;
  }
  const outer = { tracks: draft.tracks, width: draft.settings.width, height: draft.settings.height, background: draft.settings.background };
  draft.tracks = sequence.tracks;
  draft.settings.width = sequence.size.w;
  draft.settings.height = sequence.size.h;
  draft.settings.background = sequence.background ?? { r: 0, g: 0, b: 0, a: 0 };
  try {
    fn(draft);
    // A sequence has no caption track (spec 21.10): refuse the edit instead of saving a document the validator rejects.
    if (draft.tracks.some((track) => track.kind === "caption")) throw new Error("Captions are not available inside a compound: close it first");
    sequence.tracks = draft.tracks;
    let end = sequence.duration;
    for (const track of sequence.tracks) {
      for (const id of track.clipIds) {
        const clip = draft.clips[id];
        if (clip && clip.start + clip.duration > end) end = clip.start + clip.duration;
      }
    }
    sequence.duration = end;
  } finally {
    draft.tracks = outer.tracks;
    draft.settings.width = outer.width;
    draft.settings.height = outer.height;
    draft.settings.background = outer.background;
  }
}

function intersects(a: ReadonlySet<Affect>, b: ReadonlySet<Affect>): boolean {
  for (const flag of b) if (a.has(flag)) return true;
  return false;
}

export class DocumentStore {
  /** canUndo/canRedo and labels; replaced only when one of them changes. */
  readonly history: Store<HistoryState>;

  private state: Project;
  private readonly session: SessionStore;
  private readonly undoStack: UndoStack;
  private readonly listeners = new Set<{ listener: DocumentListener; affects: ReadonlySet<Affect> | null }>();
  private readonly newId: () => string;
  private readonly validate: boolean;
  private readonly now: () => number;
  private transactionState: Transaction | null = null;
  private muteScope = false;
  private snapshotCache: { selection: Selection; snapshot: SelectionSnapshot } | null = null;

  constructor(project: Project, options: DocumentStoreOptions) {
    this.state = freeze(project, true);
    this.session = options.session;
    this.undoStack = new UndoStack(options.historyLimit);
    this.newId = options.newId ?? (() => crypto.randomUUID());
    this.validate = options.validate ?? import.meta.env.DEV;
    this.now = options.now ?? (() => performance.now());
    this.history = createStore<HistoryState>(this.historyState());
    // Opening or closing a compound swaps what every view shows: tell them all, as a load does.
    this.session.state.subscribe((next, prev) => {
      if (next.scope === prev.scope || this.muteScope) return;
      this.notifyWith(this.viewOf(this.state, prev.scope.path), this.viewOf(this.state, next.scope.path), ALL_AFFECTS);
    });
  }

  // Arrow properties: safe to pass around unbound (useSyncExternalStore, destructuring).
  /**
   * The document as the editor shows it: the project, or while a compound is open for editing the
   * sequence seen as a project (its tracks, size and background). Everything that draws, plays or
   * edits reads this; saving and exporting read `getRoot`.
   */
  readonly getState = (): Project => this.viewOf(this.state, this.session.state.getState().scope.path);

  /** The real document (what is saved and exported), whatever compound is open. */
  readonly getRoot = (): Project => this.state;

  /** The id of the sequence the editor is inside (null: the project; also when the open one is gone). */
  readonly scopeId = (): SequenceId | null => this.scopeIdOf(this.state, this.session.state.getState().scope.path);

  private scopeIdOf(root: Project, path: readonly SequenceId[]): SequenceId | null {
    return scopeSequence(root, path)?.id ?? null;
  }

  private viewOf(root: Project, path: readonly SequenceId[]): Project {
    const sequence = scopeSequence(root, path);
    return sequence ? sequenceView(root, sequence) : root;
  }

  /** `affects` limits calls to changes carrying at least one of these flags. */
  readonly subscribe = (listener: DocumentListener, options: { affects?: readonly Affect[] } = {}): (() => void) => {
    const entry = { listener, affects: options.affects ? new Set(options.affects) : null };
    this.listeners.add(entry);
    return () => {
      this.listeners.delete(entry);
    };
  };

  dispatch(command: Command, options: DispatchOptions = {}): void {
    const ctx = this.context();
    const base = this.state;
    const scope = this.scopeIdOf(base, this.session.state.getState().scope.path);
    const baseView = scope === null ? base : this.viewOf(base, [scope]);
    // Transitions stay valid after any edit of the clips, in the command's own undo step (Batch 36).
    const reconcile = hasTransitions(baseView) && (command.affects.includes("clips") || command.affects.includes("timeline"));
    const [next, patches, inversePatches] = produceWithPatches(base, (root) => {
      runInScope(root, scope, (draft) => {
        command.run(draft, ctx);
        // A field edit on a keyed look property becomes a key at the playhead (Batch 61, keyProps.ts).
        if (!command.id.startsWith("keyframe.")) keyFollow(baseView, draft, ctx.playhead, command.keyShown ? new Set(command.keyShown) : undefined);
        if (reconcile) reconcileTransitions(baseView, draft, this.newId);
      });
    });
    const tx = this.transactionState;
    if (tx) {
      if (options.selection) tx.selectionAfter = options.selection;
      if (patches.length === 0) return;
      this.state = next;
      tx.patches.push(...patches);
      tx.inversePatches.unshift(...inversePatches);
      for (const flag of command.affects) tx.affects.add(flag);
      return;
    }
    if (patches.length === 0) {
      // No change, no undo step (e.g. moving a clip onto itself).
      if (options.selection) this.applySelection(options.selection);
      return;
    }
    this.commit(next, `after "${command.label}" (${command.id})`, {
      label: command.label,
      patches,
      inversePatches,
      affects: new Set(command.affects),
      selectionBefore: ctx.selection,
      selectionAfter: options.selection ?? ctx.selection,
      coalesceKey: command.coalesceKey ?? null,
      time: this.now(),
    });
  }

  /**
   * Runs `fn`; every command it dispatches becomes part of one undo step, committed and notified
   * once at the end. If `fn` throws, the document is left exactly as before. Nested transactions
   * join the outer one.
   */
  transaction<T>(label: string, fn: () => T, options: DispatchOptions = {}): T {
    const outer = this.transactionState;
    if (outer) {
      const saved = { state: this.state, patches: outer.patches.length, inverse: outer.inversePatches.length, affects: new Set(outer.affects), selectionAfter: outer.selectionAfter };
      try {
        const result = fn();
        if (options.selection) outer.selectionAfter = options.selection;
        return result;
      } catch (error) {
        this.state = saved.state;
        outer.patches.length = saved.patches;
        outer.inversePatches.splice(0, outer.inversePatches.length - saved.inverse);
        outer.affects = saved.affects;
        outer.selectionAfter = saved.selectionAfter;
        throw error;
      }
    }

    const tx: Transaction = {
      label,
      base: this.state,
      patches: [],
      inversePatches: [],
      affects: new Set(),
      selectionBefore: this.context().selection,
      selectionAfter: undefined,
    };
    this.transactionState = tx;
    let result: T;
    try {
      result = fn();
    } catch (error) {
      this.state = tx.base;
      throw error;
    } finally {
      this.transactionState = null;
    }
    if (options.selection) tx.selectionAfter = options.selection;
    const next = this.state;
    this.state = tx.base;
    if (tx.patches.length === 0) {
      if (tx.selectionAfter) this.applySelection(tx.selectionAfter);
      return result;
    }
    this.commit(next, `after transaction "${label}"`, {
      label,
      patches: tx.patches,
      inversePatches: tx.inversePatches,
      affects: tx.affects,
      selectionBefore: tx.selectionBefore,
      selectionAfter: tx.selectionAfter ?? tx.selectionBefore,
      coalesceKey: null,
      time: this.now(),
    });
    return result;
  }

  /** Reverts the newest step and restores the selection from before it. */
  undo(): boolean {
    this.assertNoTransaction("undo");
    const entry = this.undoStack.undo();
    if (!entry) return false;
    try {
      this.restore(applyPatches(this.state, entry.inversePatches), entry, entry.selectionBefore, `after undo of "${entry.label}"`);
    } catch (error) {
      this.undoStack.redo();
      throw error;
    }
    return true;
  }

  /** Re-applies the newest undone step and restores the selection from after it. */
  redo(): boolean {
    this.assertNoTransaction("redo");
    const entry = this.undoStack.redo();
    if (!entry) return false;
    try {
      this.restore(applyPatches(this.state, entry.patches), entry, entry.selectionAfter, `after redo of "${entry.label}"`);
    } catch (error) {
      this.undoStack.undo();
      throw error;
    }
    return true;
  }

  /**
   * Records derived state in the document with no undo step (the analysis status of a media item,
   * spec §9.1: an import is one undo step, its peaks becoming ready later are not). Validated and
   * notified like any change, so it is saved. Undo keeps working: the inverse patches of earlier
   * steps never touch these fields, except a whole media item put back, which then starts pending
   * again and is amended again.
   */
  amend(command: Command): void {
    this.assertNoTransaction("amend");
    const scope = this.scopeId();
    const [next, patches] = produceWithPatches(this.state, (root) => runInScope(root, scope, (draft) => command.run(draft, this.context())));
    if (patches.length === 0) return;
    if (this.validate) assertValid(next, `after "${command.label}" (${command.id}, no undo step)`);
    const prev = this.state;
    this.state = next;
    this.notify(prev, new Set(command.affects));
  }

  /**
   * Replaces the whole document (opening a project, restoring a recovery file): clears the undo
   * history and the selection, and notifies every subscriber with every flag.
   */
  load(project: Project): void {
    this.assertNoTransaction("load");
    if (this.validate) assertValid(project, "on load");
    const prev = this.state;
    const prevPath = this.session.state.getState().scope.path;
    this.state = freeze(project, true);
    this.undoStack.clear();
    setSelection(this.session, EMPTY_SELECTION);
    this.muteScope = true;
    try {
      this.session.state.set((current) => (current.scope === NO_SCOPE ? current : { ...current, scope: NO_SCOPE }));
    } finally {
      this.muteScope = false;
    }
    this.history.set((current) => this.historyState(current));
    this.notifyWith(this.viewOf(prev, prevPath), this.state, ALL_AFFECTS);
  }

  private context(): CommandContext {
    const selection = this.session.selection.getState();
    if (this.snapshotCache?.selection !== selection) this.snapshotCache = { selection, snapshot: toSnapshot(selection) };
    return { playhead: this.session.state.getState().playhead, selection: this.snapshotCache.snapshot, newId: this.newId };
  }

  private commit(next: Project, context: string, entry: UndoEntry): void {
    if (this.validate) assertValid(next, context);
    const prev = this.state;
    this.state = next;
    this.undoStack.push(entry);
    if (entry.selectionAfter !== entry.selectionBefore) this.applySelection(entry.selectionAfter);
    this.history.set((current) => this.historyState(current));
    this.notify(prev, entry.affects);
  }

  private restore(undone: Project, entry: UndoEntry, selection: SelectionSnapshot, context: string): void {
    // Track heights are session state (spec §5.3, written with `amend`): undo and redo keep them.
    const next = freeze(carryTrackHeights(undone, this.state), true);
    if (this.validate) assertValid(next, context);
    const prev = this.state;
    this.state = next;
    this.applySelection(filterSelection(selection, (id) => Object.hasOwn(next.clips, id), (id) => findTrack(next, id) !== undefined));
    this.history.set((current) => this.historyState(current));
    this.notify(prev, entry.affects);
  }

  private applySelection(snapshot: SelectionSnapshot): void {
    setSelection(this.session, fromSnapshot(snapshot));
  }

  private historyState(current?: HistoryState): HistoryState {
    const next: HistoryState = {
      canUndo: this.undoStack.canUndo,
      canRedo: this.undoStack.canRedo,
      undoLabel: this.undoStack.undoLabel,
      redoLabel: this.undoStack.redoLabel,
    };
    return current && shallowEqual(current, next) ? current : next;
  }

  private notify(prev: Project, affects: ReadonlySet<Affect>): void {
    const path = this.session.state.getState().scope.path;
    this.notifyWith(this.viewOf(prev, path), this.viewOf(this.state, path), affects);
  }

  private notifyWith(prev: Project, state: Project, affects: ReadonlySet<Affect>): void {
    for (const { listener, affects: filter } of this.listeners) {
      if (filter && !intersects(filter, affects)) continue;
      listener(state, prev, affects);
    }
  }

  private assertNoTransaction(action: string): void {
    if (this.transactionState) throw new Error(`Cannot ${action} inside a transaction`);
  }
}
