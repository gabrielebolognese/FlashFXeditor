// The font browser's list (spec §20.1 "the list is virtualized. A row's font file loads only when the
// row becomes visible (at most 6 loads in flight, cancelled when the row scrolls away) ... A row whose
// file is still loading shows the name in the UI font with a loading state and never shifts the
// layout"). Framework-free: the rows are a pool of DOM elements placed by the scroll position, so
// scrolling, hovering and moving through rows render nothing in React (P1). Each row shows the family
// in its own font at the row's weight, its number of weights, a favorite star and (My fonts) an edit
// button; section headings, notes and action rows sit between them, each one row tall.
import type { LoadTicket } from "../../render/text/FontLoadQueue.js";
import { quoteFamily } from "../../text/fonts.js";

export type FontListItem =
  | { kind: "heading"; key: string; label: string }
  | { kind: "note"; key: string; label: string }
  | { kind: "action"; key: string; label: string; action: string }
  | {
      kind: "font";
      key: string;
      family: string;
      /** The weight the row draws (and a pick sets with a weight filter). */
      weight: number;
      /** "9 weights". */
      meta: string;
      favorite: boolean;
      /** A My fonts family: the row has an edit button. */
      editable: boolean;
      /** The family of the edited text. */
      current: boolean;
    };

export type FontRowItem = Extract<FontListItem, { kind: "font" }>;

export interface FontListDeps {
  /** CSS module class names: list, sizer, row, family, meta, star, edit, heading, note, action. */
  classes: Readonly<Record<string, string>>;
  /** Icons to clone into rows (`data-icon="star" | "edit" | <action>"`). */
  icons: HTMLElement;
  /** Whether a row can draw `family` at `weight` now. */
  previewReady(family: string, weight: number): boolean;
  /** Loads what a row needs to draw `family` at `weight` (null: nothing to load). */
  preview(family: string, weight: number): LoadTicket | null;
  /** The pointer is over a font row (null: over none). */
  onHover(item: FontRowItem | null): void;
  onPick(item: FontRowItem): void;
  onStar(item: FontRowItem): void;
  onEdit(item: FontRowItem): void;
  onAction(action: string): void;
  /** The option element ids (for the search field's aria-activedescendant). */
  optionId(index: number): string;
}

interface Row {
  element: HTMLElement;
  index: number;
  item: FontListItem | null;
  ticket: LoadTicket | null;
}

/** Rows drawn above and below the visible ones. */
const OVERSCAN = 3;

export class FontList {
  private items: readonly FontListItem[] = [];
  private byKey = new Map<string, FontListItem>();
  private readonly sizer: HTMLElement;
  private readonly rows: Row[] = [];
  private rowHeight = 0;
  private active: string | null = null;
  private hovered: FontRowItem | null = null;
  private frame = 0;
  private readonly stops: (() => void)[] = [];

  constructor(
    private readonly host: HTMLElement,
    private readonly deps: FontListDeps,
  ) {
    this.sizer = document.createElement("div");
    this.sizer.className = deps.classes.sizer ?? "";
    host.append(this.sizer);
    const listen = <K extends keyof HTMLElementEventMap>(type: K, handler: (event: HTMLElementEventMap[K]) => void) => {
      host.addEventListener(type, handler);
      this.stops.push(() => host.removeEventListener(type, handler));
    };
    listen("scroll", () => this.render());
    listen("pointermove", (event) => this.hover(this.rowItem(event.target)));
    listen("pointerleave", () => this.hover(null));
    listen("mousedown", (event) => event.preventDefault());
    listen("click", (event) => this.click(event));
    const resize = new ResizeObserver(() => this.measure());
    resize.observe(host);
    this.stops.push(() => resize.disconnect());
    this.measure();
  }

  /** Replaces the rows (a search, a filter, a source changed); the scroll position stays where it can. */
  setItems(items: readonly FontListItem[]): void {
    this.items = items;
    this.byKey = new Map(items.map((item) => [item.key, item]));
    if (this.active !== null && !this.byKey.has(this.active)) this.active = null;
    this.sizer.style.height = `${items.length * this.rowHeight}px`;
    // Rows keep their place: the same content stays as it is (`bind`), other content is drawn again.
    for (const row of this.rows) this.bind(row, row.index);
    this.render();
  }

  /** The highlighted row (the arrow keys), kept in view. */
  setActive(key: string | null): void {
    this.active = key;
    const index = key === null ? -1 : this.items.findIndex((item) => item.key === key);
    if (index >= 0) {
      const top = index * this.rowHeight;
      const bottom = top + this.rowHeight;
      if (top < this.host.scrollTop) this.host.scrollTop = top;
      else if (bottom > this.host.scrollTop + this.host.clientHeight) this.host.scrollTop = bottom - this.host.clientHeight;
    }
    for (const row of this.rows) this.decorate(row);
    this.render();
  }

  get activeKey(): string | null {
    return this.active;
  }

  /** The font row `delta` font rows from the highlighted one (the first or last when none is). */
  step(delta: number): FontRowItem | null {
    const fonts = this.items.filter((item): item is FontRowItem => item.kind === "font");
    if (fonts.length === 0) return null;
    const at = fonts.findIndex((item) => item.key === this.active);
    const next = at < 0 ? (delta > 0 ? 0 : fonts.length - 1) : Math.max(0, Math.min(fonts.length - 1, at + delta));
    return fonts[next] ?? null;
  }

  /** The index of a row by key (aria-activedescendant), or -1. */
  indexOf(key: string | null): number {
    return key === null ? -1 : this.items.findIndex((item) => item.key === key);
  }

  destroy(): void {
    cancelAnimationFrame(this.frame);
    for (const stop of this.stops.splice(0)) stop();
    for (const row of this.rows) row.ticket?.cancel();
    this.host.replaceChildren();
  }

  /** The row height is the `--control-default` token (unreadable: 0, and nothing is drawn). */
  private measure(): void {
    const height = Number.parseFloat(getComputedStyle(this.host).getPropertyValue("--control-default")) || 0;
    if (height !== this.rowHeight) {
      this.rowHeight = height;
      this.sizer.style.height = `${this.items.length * height}px`;
    }
    this.render();
  }

  /**
   * Places the rows the scroll position shows (DOM writes only; the scroll position is read once). A
   * list with no height (hidden while My fonts are edited) shows no rows and loads nothing; the
   * ResizeObserver draws them again when it shows.
   */
  private render(): void {
    const height = this.rowHeight;
    if (height <= 0) return;
    const view = this.host.clientHeight;
    if (view <= 0) {
      for (const row of this.rows) this.bind(row, -1);
      return;
    }
    const first = Math.max(0, Math.floor(this.host.scrollTop / height) - OVERSCAN);
    const last = Math.min(this.items.length - 1, Math.ceil((this.host.scrollTop + view) / height) + OVERSCAN);
    const wanted = Math.max(0, last - first + 1);
    while (this.rows.length < wanted) {
      const element = document.createElement("div");
      this.sizer.append(element);
      this.rows.push({ element, index: -1, item: null, ticket: null });
    }
    // Rows keep their index while it stays in view (no rebinding, no reload); free rows take the new ones.
    const shown = new Set<number>();
    for (const row of this.rows) if (row.index >= first && row.index <= last) shown.add(row.index);
    const free = this.rows.filter((row) => !(row.index >= first && row.index <= last));
    for (let index = first; index <= last; index += 1) {
      if (shown.has(index)) continue;
      const row = free.pop();
      if (row) this.bind(row, index);
    }
    for (const row of free) this.bind(row, -1);
  }

  /** Shows item `index` in `row` (-1: hidden). A load the row no longer needs is cancelled. */
  private bind(row: Row, index: number): void {
    const item = index >= 0 ? (this.items[index] ?? null) : null;
    if (row.index === index && row.item === item) return;
    // The same row content at the same place (new items, e.g. the catalog arrived): kept, with its load.
    if (row.index === index && item && row.item && sameRow(row.item, item)) {
      row.item = item;
      return;
    }
    row.ticket?.cancel();
    row.ticket = null;
    row.index = item ? index : -1;
    row.item = item;
    const element = row.element;
    if (!item) {
      element.hidden = true;
      element.replaceChildren();
      return;
    }
    const classes = this.deps.classes;
    element.hidden = false;
    element.style.transform = `translateY(${index * this.rowHeight}px)`;
    element.removeAttribute("role");
    element.removeAttribute("id");
    element.removeAttribute("aria-selected");
    delete element.dataset.key;
    if (item.kind === "heading") {
      element.className = classes.heading ?? "";
      element.setAttribute("role", "presentation");
      element.textContent = item.label;
      return;
    }
    if (item.kind === "note") {
      element.className = classes.note ?? "";
      element.textContent = item.label;
      return;
    }
    if (item.kind === "action") {
      element.className = classes.action ?? "";
      element.replaceChildren(this.icon(item.action), document.createTextNode(item.label));
      element.dataset.key = item.key;
      element.setAttribute("role", "button");
      return;
    }
    element.className = classes.row ?? "";
    element.setAttribute("role", "option");
    element.id = this.deps.optionId(index);
    element.setAttribute("aria-selected", String(item.current));
    element.dataset.key = item.key;
    const family = document.createElement("span");
    family.className = classes.family ?? "";
    family.textContent = item.family;
    // The row's own font at its weight; while it loads, the UI font at the UI weight (Batch 53: the
    // design system's UI type stops at 600).
    const show = () => {
      family.style.fontFamily = `${quoteFamily(item.family)}, var(--font-ui)`;
      family.style.fontWeight = String(item.weight);
    };
    const meta = document.createElement("span");
    meta.className = classes.meta ?? "";
    meta.textContent = item.meta;
    const parts: HTMLElement[] = [family, meta];
    if (item.editable) parts.push(this.button("edit", classes.edit, `Edit ${item.family}`, null));
    parts.push(this.button("star", classes.star, item.favorite ? `Remove ${item.family} from favorites` : `Add ${item.family} to favorites`, item.favorite));
    element.replaceChildren(...parts);
    this.decorate(row);
    if (this.deps.previewReady(item.family, item.weight)) {
      show();
      return;
    }
    // Loading: the UI font, dimmed, until the row's file is in.
    family.dataset.loading = "";
    family.setAttribute("aria-busy", "true");
    const ticket = this.deps.preview(item.family, item.weight);
    row.ticket = ticket;
    if (!ticket) {
      delete family.dataset.loading;
      family.removeAttribute("aria-busy");
      show();
      return;
    }
    void ticket.done.then((loaded) => {
      // Still this row's load (bound to other content, the row has another ticket or none).
      if (row.ticket !== ticket) return;
      row.ticket = null;
      delete family.dataset.loading;
      family.removeAttribute("aria-busy");
      if (loaded) show();
    });
  }

  private decorate(row: Row): void {
    if (row.item?.kind !== "font") return;
    if (row.item.key === this.active) row.element.dataset.active = "";
    else delete row.element.dataset.active;
  }

  private icon(name: string): Node {
    const template = this.deps.icons.querySelector(`[data-icon="${name}"]`);
    return template ? template.cloneNode(true) : document.createTextNode("");
  }

  private button(icon: string, className: string | undefined, label: string, pressed: boolean | null): HTMLElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className ?? "";
    button.tabIndex = -1;
    button.dataset.part = icon;
    button.setAttribute("aria-label", label);
    button.dataset.tooltip = label;
    if (pressed !== null) button.setAttribute("aria-pressed", String(pressed));
    button.append(this.icon(icon));
    return button;
  }

  private rowItem(target: EventTarget | null): FontListItem | null {
    const element = target instanceof Element ? target.closest<HTMLElement>("[data-key]") : null;
    const key = element?.dataset.key;
    return key === undefined ? null : (this.byKey.get(key) ?? null);
  }

  private hover(item: FontListItem | null): void {
    const font = item?.kind === "font" ? item : null;
    if (font?.key === this.hovered?.key) return;
    this.hovered = font;
    this.deps.onHover(font);
  }

  private click(event: MouseEvent): void {
    const item = this.rowItem(event.target);
    if (!item) return;
    if (item.kind === "action") {
      this.deps.onAction(item.action);
      return;
    }
    if (item.kind !== "font") return;
    const part = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-part]")?.dataset.part : undefined;
    if (part === "star") this.deps.onStar(item);
    else if (part === "edit") this.deps.onEdit(item);
    else this.deps.onPick(item);
  }
}

/** Whether two items draw the same row (nothing to redo). */
function sameRow(a: FontListItem, b: FontListItem): boolean {
  if (a.kind !== b.kind || a.key !== b.key) return false;
  if (a.kind === "font" && b.kind === "font") return a.family === b.family && a.weight === b.weight && a.meta === b.meta && a.favorite === b.favorite && a.editable === b.editable && a.current === b.current;
  return "label" in a && "label" in b && a.label === b.label;
}
