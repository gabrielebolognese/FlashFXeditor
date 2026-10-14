// Commands (spec §3.3): the only way to change the document. `run` mutates an Immer draft; the
// store turns the mutation into patches for undo.
import type { Draft } from "immer";
import type { Frame, Project } from "../document/types.js";
import type { SelectionSnapshot } from "../store/selection.js";

/** Invalidation flags (spec §3.4). Views map them to their own dirty state. */
export type Affect = "timeline" | "clips" | "tracks" | "media" | "text" | "captions" | "markers" | "settings" | "audio";

/** What a command may know about the session. Commands never read the session store in `run`. */
export interface CommandContext {
  playhead: Frame;
  selection: SelectionSnapshot;
  /** A new unique id for objects the command creates. */
  newId(): string;
}

export interface Command {
  /** Stable id, e.g. "clip.add". */
  id: string;
  /** Undo history label, e.g. "Add clip". */
  label: string;
  /** Consecutive commands with the same key within 300 ms merge into one undo step. */
  coalesceKey?: string;
  affects: readonly Affect[];
  run(draft: Draft<Project>, ctx: CommandContext): void;
}
