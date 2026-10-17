// Command ids (keymap, toolbar buttons, menus, the command palette) mapped to handlers (spec §3.6:
// every user-facing action has exactly one command id). Keys, clicks and the palette all go through
// `run`, so a shortcut and its button always do the same thing. Labels, categories and icons are
// data (app/commandCatalog.ts); a handler can add an `enabled` predicate that the palette and the
// menus read (a disabled command is shown dimmed; running it still calls the handler, which decides).
import type { ActionContext } from "../keyboard/KeyDispatcher.js";

/**
 * Returns false to decline (the key's browser default then runs). `context` is null for clicks; `arg`
 * names the thing a row acts on when it is not the selection (a preset card, a favorite chip).
 */
export type CommandRun = (context: ActionContext | null, arg?: string) => boolean | void;

export interface CommandOptions {
  /** Whether the command can do something now (the palette dims it, menus disable its row). */
  enabled?: () => boolean;
}

interface Entry {
  run: CommandRun;
  enabled: (() => boolean) | undefined;
}

export class CommandRegistry {
  private readonly entries = new Map<string, Entry>();

  /** Registers the handler for `id`; returns an unregister function. */
  register(id: string, run: CommandRun, options: CommandOptions = {}): () => void {
    if (this.entries.has(id)) throw new Error(`Command ${id} is already registered`);
    const entry = { run, enabled: options.enabled };
    this.entries.set(id, entry);
    return () => {
      if (this.entries.get(id) === entry) this.entries.delete(id);
    };
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  /** The registered ids, in registration order. */
  ids(): string[] {
    return [...this.entries.keys()];
  }

  /** Registered, and its `enabled` predicate (if any) holds. */
  isEnabled(id: string): boolean {
    const entry = this.entries.get(id);
    if (!entry) return false;
    try {
      return entry.enabled?.() ?? true;
    } catch {
      return false;
    }
  }

  /** Whether the command has an `enabled` predicate (rows without one keep their own disabled state). */
  hasPredicate(id: string): boolean {
    return this.entries.get(id)?.enabled !== undefined;
  }

  /** Runs the command; false when it is not registered or declined. `context` is null for clicks. */
  run(id: string, context: ActionContext | null = null, arg?: string): boolean {
    const entry = this.entries.get(id);
    if (entry === undefined) return false;
    return (arg === undefined ? entry.run(context) : entry.run(context, arg)) !== false;
  }
}
