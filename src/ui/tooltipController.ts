// Tooltips without React state (P1: no React renders on hover). Any element with `data-tooltip`
// gets one; a single fixed bubble is positioned by direct DOM writes. The shortcut comes from the
// element's `data-command` (the live keymap) when it shows, so a rebinding shows at once. Keyboard focus
// shows the focused control's tooltip too, and canvas views point the bubble at the controls they draw
// (`pointTooltip`: the timeline's track header toggles).
import styles from "./Tooltip.module.css";

/** A control drawn on a canvas: its box in viewport px, its tooltip and command. */
export interface VirtualTooltip {
  rect: { left: number; top: number; width: number; height: number };
  text: string;
  command?: string | undefined;
}

interface Anchor {
  rect(): { left: number; top: number; bottom: number; width: number };
  text: string;
  command: string | undefined;
}

let pointer: ((tip: VirtualTooltip | null) => void) | null = null;

/**
 * Shows `tip` after the tooltip delay (the same tip again keeps the bubble as it is), or hides a tip
 * shown this way (null). A canvas view calls it as the hover hit changes.
 */
export function pointTooltip(tip: VirtualTooltip | null): void {
  pointer?.(tip);
}

const elementAnchor = (element: HTMLElement): Anchor => ({
  rect: () => element.getBoundingClientRect(),
  text: element.dataset.tooltip ?? "",
  command: element.dataset.command,
});

const tipKey = (tip: VirtualTooltip) => `${tip.text}|${tip.command ?? ""}|${tip.rect.left}|${tip.rect.top}`;

function focusVisible(element: Element): boolean {
  try {
    return element.matches(":focus-visible");
  } catch {
    return false;
  }
}

export function installTooltips(doc: Document, delayMs: number, shortcutOf: (commandId: string) => string | undefined = () => undefined): () => void {
  const win = doc.defaultView ?? window;
  const bubble = doc.createElement("div");
  bubble.className = styles.bubble ?? "";
  bubble.setAttribute("role", "tooltip");
  const text = doc.createElement("span");
  const keys = doc.createElement("kbd");
  keys.className = styles.shortcut ?? "";
  bubble.append(text, keys);
  doc.body.append(bubble);

  /** What the bubble is for: an element, or a virtual tip's key. */
  let anchor: HTMLElement | string | null = null;
  /** A virtual tip hidden by a press: it shows again only once the pointer has left it. */
  let pressed: string | null = null;
  let timer: number | undefined;

  const hide = () => {
    win.clearTimeout(timer);
    if (typeof anchor === "string") pressed = anchor;
    anchor = null;
    delete bubble.dataset.open;
  };

  const show = (target: Anchor) => {
    text.textContent = target.text;
    const shortcut = (target.command !== undefined ? shortcutOf(target.command) : undefined) ?? "";
    keys.textContent = shortcut;
    keys.hidden = shortcut === "";
    const rect = target.rect();
    const width = bubble.offsetWidth;
    const height = bubble.offsetHeight;
    const below = rect.bottom + height < win.innerHeight;
    const left = Math.min(Math.max(0, rect.left + rect.width / 2 - width / 2), win.innerWidth - width);
    bubble.dataset.placement = below ? "bottom" : "top";
    bubble.style.left = `${left}px`;
    bubble.style.top = `${below ? rect.bottom : rect.top - height}px`;
    bubble.dataset.open = "";
  };

  const schedule = (key: HTMLElement | string, target: Anchor) => {
    anchor = key;
    timer = win.setTimeout(() => show(target), delayMs);
  };

  const over = (event: Event) => {
    const target = (event.target as Element | null)?.closest?.<HTMLElement>("[data-tooltip]") ?? null;
    if (target === anchor) return;
    // Over a canvas, the view points the bubble at what it draws.
    if (target === null && typeof anchor === "string") return;
    hide();
    if (target) schedule(target, elementAnchor(target));
  };

  // A control reached with the keyboard shows its tooltip (and shortcut) as a hovered one does.
  const focusIn = (event: FocusEvent) => {
    const element = event.target instanceof HTMLElement ? event.target : null;
    const target = element && focusVisible(element) ? element.closest<HTMLElement>("[data-tooltip]") : null;
    if (!target || target === anchor) return;
    hide();
    schedule(target, elementAnchor(target));
  };

  const focusOut = (event: FocusEvent) => {
    if (anchor !== null && anchor === event.target) hide();
  };

  pointer = (tip) => {
    const key = tip ? tipKey(tip) : null;
    if (key !== pressed) pressed = null;
    if (key === null) {
      if (typeof anchor === "string") hide();
      pressed = null;
      return;
    }
    if (key === anchor || key === pressed || !tip) return;
    hide();
    const { left, top, width, height } = tip.rect;
    schedule(key, { rect: () => ({ left, top, width, bottom: top + height }), text: tip.text, command: tip.command });
  };

  doc.addEventListener("pointerover", over);
  doc.addEventListener("focusin", focusIn);
  doc.addEventListener("focusout", focusOut);
  doc.addEventListener("pointerdown", hide, true);
  doc.addEventListener("keydown", hide, true);
  doc.addEventListener("wheel", hide, { capture: true, passive: true });
  win.addEventListener("blur", hide);
  return () => {
    hide();
    pointer = null;
    doc.removeEventListener("pointerover", over);
    doc.removeEventListener("focusin", focusIn);
    doc.removeEventListener("focusout", focusOut);
    doc.removeEventListener("pointerdown", hide, true);
    doc.removeEventListener("keydown", hide, true);
    doc.removeEventListener("wheel", hide, { capture: true });
    win.removeEventListener("blur", hide);
    bubble.remove();
  };
}
