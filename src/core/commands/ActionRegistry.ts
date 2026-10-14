// Action ids (keymap, toolbar buttons, menus) mapped to handlers. Keys and clicks both go through
// `run`, so a shortcut and its button always do the same thing.
import type { ActionContext } from "../keyboard/KeyDispatcher.js";

/** Returns false to decline (the key's browser default then runs). */
export type ActionRun = (context: ActionContext | null) => boolean | void;

export class ActionRegistry {
  private readonly handlers = new Map<string, ActionRun>();

  /** Registers the handler for `id`; returns an unregister function. */
  register(id: string, run: ActionRun): () => void {
    if (this.handlers.has(id)) throw new Error(`Action ${id} is already registered`);
    this.handlers.set(id, run);
    return () => {
      if (this.handlers.get(id) === run) this.handlers.delete(id);
    };
  }

  has(id: string): boolean {
    return this.handlers.has(id);
  }

  /** Runs the action; false when it is not registered or declined. `context` is null for clicks. */
  run(id: string, context: ActionContext | null = null): boolean {
    const handler = this.handlers.get(id);
    return handler !== undefined && handler(context) !== false;
  }
}
