// Focus scopes (spec §3.6). The panel that last received a pointer down or focus owns the keyboard.
// Panels declare their scope with a `data-scope` attribute; anything outside a panel is `global`.

export type FocusScope = "global" | "timeline" | "preview" | "media" | "properties" | "textEditing" | "dialog";

const SCOPES = new Set<string>(["global", "timeline", "preview", "media", "properties", "textEditing", "dialog"]);

export function scopeOf(target: EventTarget | null): FocusScope {
  if (!(target instanceof Element)) return "global";
  const value = target.closest("[data-scope]")?.getAttribute("data-scope");
  return value && SCOPES.has(value) ? (value as FocusScope) : "global";
}

export class FocusScopeTracker {
  private current: FocusScope = "global";

  get scope(): FocusScope {
    return this.current;
  }

  /** Explicit override, e.g. the inline text editor entering `textEditing`. */
  set(scope: FocusScope): void {
    this.current = scope;
  }

  attach(root: Document): () => void {
    const update = (event: Event) => {
      this.current = scopeOf(event.target);
    };
    root.addEventListener("pointerdown", update, true);
    root.addEventListener("focusin", update, true);
    return () => {
      root.removeEventListener("pointerdown", update, true);
      root.removeEventListener("focusin", update, true);
    };
  }
}
