// Keyboard reach of the Media and Presets tabs' card lists (Batch 46, spec §17 keyboard use): each list
// is one Tab stop (a roving tabindex written to the DOM, so selecting or focusing re-renders no card),
// the arrows move between the shown cards (Up / Down by a row of the grid), Home / End go to the ends.
// A press on a card does not focus it: Space keeps playing after a click, as everywhere in the panels.

/** Makes `target` the one Tab stop among the list's `selector` items (null: the first shown one). */
export function setTabStop(list: ParentNode, selector: string, target: Element | null): void {
  const items = list.querySelectorAll<HTMLElement>(selector);
  const stop = target ?? [...items].find((item) => !item.hidden) ?? null;
  for (const item of items) {
    const index = item === stop ? 0 : -1;
    if (item.tabIndex !== index) item.tabIndex = index;
  }
}

/** The columns of a laid-out CSS grid (1 when `element` is no grid). */
export function gridColumns(element: Element): number {
  const template = getComputedStyle(element).gridTemplateColumns;
  return template && template !== "none" ? template.trim().split(/\s+/).length : 1;
}

/**
 * Where a navigation key moves from `index` in `count` items laid out in `columns` columns: Left /
 * Right one item, Up / Down one row, Home / End the ends; null for other keys or an empty list.
 */
export function stepIndex(key: string, index: number, count: number, columns: number): number | null {
  if (count === 0) return null;
  const last = count - 1;
  const from = Math.min(Math.max(index, 0), last);
  switch (key) {
    case "ArrowLeft":
      return Math.max(0, from - 1);
    case "ArrowRight":
      return Math.min(last, from + 1);
    case "ArrowUp":
      return Math.max(0, from - columns);
    case "ArrowDown":
      return Math.min(last, from + columns);
    case "Home":
      return 0;
    case "End":
      return last;
    default:
      return null;
  }
}

/**
 * A mouse press on `card` of `list` (call it on mousedown, after skipping fields and buttons): the card
 * does not take the focus. A card focused from the keyboard hands it to the pressed one; any other
 * focused element (the search field) loses it, as a press on a panel's background does.
 */
export function pressWithoutFocus(event: { preventDefault(): void }, list: Element, card: HTMLElement, selector: string): void {
  event.preventDefault();
  const active = card.ownerDocument.activeElement;
  if (!(active instanceof HTMLElement) || active === card || active === card.ownerDocument.body) return;
  if (list.contains(active) && active.matches(selector)) card.focus();
  else active.blur();
}
