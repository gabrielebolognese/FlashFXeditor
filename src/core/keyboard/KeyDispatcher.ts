// The single keyboard listener (spec §3.6). Resolves a key event against the keymap for the current
// focus scope (scope bindings first, then global) and dispatches the command id.
import type { FocusScope } from "./focusScope.js";
import type { KeyBinding } from "./keymap.js";
import { eventChords, parseChord, type Platform } from "./keys.js";

export interface ActionContext {
  scope: FocusScope;
  phase: "down" | "up";
  repeat: boolean;
}

/** Returns false when the action is not handled; the browser default then runs. */
export type ActionHandler = (id: string, context: ActionContext) => boolean | void;

export interface KeyDispatcherOptions {
  keymap: readonly KeyBinding[];
  platform: Platform;
  getScope: () => FocusScope;
  onAction: ActionHandler;
}

/** Scopes that never fall through to global bindings: typing and dialogs own the keyboard. */
const ISOLATED_SCOPES = new Set<FocusScope>(["textEditing", "dialog"]);

const TEXT_INPUT_TYPES = new Set(["text", "search", "number", "email", "password", "url", "tel", ""]);

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  return target instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(target.type);
}

type KeyEventLike = Pick<
  KeyboardEvent,
  "key" | "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey" | "repeat" | "target" | "isComposing" | "preventDefault"
>;

export class KeyDispatcher {
  private readonly index = new Map<FocusScope, Map<string, KeyBinding>>();
  /** Held bindings by physical key code, so key-up finds them even if modifiers changed. */
  private readonly held = new Map<string, { binding: KeyBinding; scope: FocusScope }>();

  constructor(private readonly options: KeyDispatcherOptions) {
    for (const binding of options.keymap) {
      for (const scope of binding.scopes) {
        let map = this.index.get(scope);
        if (!map) {
          map = new Map();
          this.index.set(scope, map);
        }
        for (const keys of binding.keys) map.set(parseChord(keys, options.platform), binding);
      }
    }
  }

  attach(target: Window): () => void {
    const down = (event: KeyboardEvent) => this.handleKeyDown(event);
    const up = (event: KeyboardEvent) => this.handleKeyUp(event);
    const blur = () => this.releaseAll();
    target.addEventListener("keydown", down);
    target.addEventListener("keyup", up);
    target.addEventListener("blur", blur);
    return () => {
      target.removeEventListener("keydown", down);
      target.removeEventListener("keyup", up);
      target.removeEventListener("blur", blur);
      this.held.clear();
    };
  }

  /** Finds the binding for the event in the given scope, or undefined. */
  resolve(event: KeyEventLike, scope: FocusScope): KeyBinding | undefined {
    const scopes: FocusScope[] = ISOLATED_SCOPES.has(scope) || scope === "global" ? [scope] : [scope, "global"];
    const chords = eventChords(event);
    for (const s of scopes) {
      const map = this.index.get(s);
      if (!map) continue;
      for (const chord of chords) {
        const binding = map.get(chord);
        if (binding) return binding;
      }
    }
    return undefined;
  }

  handleKeyDown(event: KeyEventLike): void {
    if (event.isComposing) return;
    const scope = this.options.getScope();
    // Text inputs own their keys; only the inline text editor scope gets its own bindings.
    if (isEditableTarget(event.target) && scope !== "textEditing") return;

    const binding = this.resolve(event, scope);
    if (!binding) return;

    if (binding.hold) {
      if (event.repeat || this.held.has(event.code)) {
        event.preventDefault();
        return;
      }
      if (this.dispatch(binding, { scope, phase: "down", repeat: false })) {
        this.held.set(event.code, { binding, scope });
        event.preventDefault();
      }
      return;
    }

    if (this.dispatch(binding, { scope, phase: "down", repeat: event.repeat })) event.preventDefault();
  }

  handleKeyUp(event: Pick<KeyboardEvent, "code">): void {
    const entry = this.held.get(event.code);
    if (!entry) return;
    this.held.delete(event.code);
    this.dispatch(entry.binding, { scope: entry.scope, phase: "up", repeat: false });
  }

  /** Releases every held key (window blur: key-up events would be lost). */
  releaseAll(): void {
    for (const [code] of this.held) this.handleKeyUp({ code });
  }

  private dispatch(binding: KeyBinding, context: ActionContext): boolean {
    return this.options.onAction(binding.id, context) !== false;
  }
}
