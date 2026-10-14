// Tooltips without React state (P1: no React renders on hover). Any element with `data-tooltip`
// (and optionally `data-shortcut`) gets one; a single fixed bubble is positioned by direct DOM writes.
import styles from "./Tooltip.module.css";

export function installTooltips(doc: Document, delayMs: number): () => void {
  const win = doc.defaultView ?? window;
  const bubble = doc.createElement("div");
  bubble.className = styles.bubble ?? "";
  bubble.setAttribute("role", "tooltip");
  const text = doc.createElement("span");
  const keys = doc.createElement("kbd");
  keys.className = styles.shortcut ?? "";
  bubble.append(text, keys);
  doc.body.append(bubble);

  let anchor: HTMLElement | null = null;
  let timer: number | undefined;

  const hide = () => {
    win.clearTimeout(timer);
    anchor = null;
    delete bubble.dataset.open;
  };

  const show = (target: HTMLElement) => {
    text.textContent = target.dataset.tooltip ?? "";
    keys.textContent = target.dataset.shortcut ?? "";
    keys.hidden = !target.dataset.shortcut;
    const rect = target.getBoundingClientRect();
    const width = bubble.offsetWidth;
    const height = bubble.offsetHeight;
    const below = rect.bottom + height < win.innerHeight;
    const left = Math.min(Math.max(0, rect.left + rect.width / 2 - width / 2), win.innerWidth - width);
    bubble.dataset.placement = below ? "bottom" : "top";
    bubble.style.left = `${left}px`;
    bubble.style.top = `${below ? rect.bottom : rect.top - height}px`;
    bubble.dataset.open = "";
  };

  const over = (event: Event) => {
    const target = (event.target as Element | null)?.closest?.<HTMLElement>("[data-tooltip]") ?? null;
    if (target === anchor) return;
    hide();
    if (!target) return;
    anchor = target;
    timer = win.setTimeout(() => show(target), delayMs);
  };

  doc.addEventListener("pointerover", over);
  doc.addEventListener("pointerdown", hide, true);
  doc.addEventListener("keydown", hide, true);
  doc.addEventListener("wheel", hide, { capture: true, passive: true });
  win.addEventListener("blur", hide);
  return () => {
    hide();
    doc.removeEventListener("pointerover", over);
    doc.removeEventListener("pointerdown", hide, true);
    doc.removeEventListener("keydown", hide, true);
    doc.removeEventListener("wheel", hide, { capture: true });
    win.removeEventListener("blur", hide);
    bubble.remove();
  };
}
