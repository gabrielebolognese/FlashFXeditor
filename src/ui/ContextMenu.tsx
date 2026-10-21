import { Minus, Plus } from "lucide-react";
import { useLayoutEffect, useRef, type MouseEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { cx } from "./cx.js";
import styles from "./ContextMenu.module.css";
import { shortcutLabel } from "./shortcutLabel.js";
import { Swatches, type Swatch } from "./Swatches.js";
import { useDismiss } from "./useDismiss.js";

// Shell: floating menu with rows, shortcuts, separators, section headings, inline swatch rows (§6.16
// label colors) and steppers (a number with - / +); closes on outside press and Escape. Rows with
// `keepOpen` (toggles) and steppers leave it open. Dropdowns (`MenuButton`) pass their button as
// `anchorRef`, so pressing it again closes instead of reopening.
// TODO(batch 40): keyboard navigation and the command-id driven item lists of §6.16.

/** One swatch of a swatch row (see `ui/Swatches`). */
export type ContextMenuSwatch = Swatch;

export type ContextMenuEntry =
  | { kind: "item"; id: string; label: string; commandId?: string; disabled?: boolean; active?: boolean; keepOpen?: boolean }
  | { kind: "swatches"; id: string; label: string; swatches: readonly ContextMenuSwatch[] }
  /** `onSelect` gets `<id>:dec` / `<id>:inc`; the ends of the range disable their button. */
  | { kind: "stepper"; id: string; label: string; value: number; min: number; max: number; disabled?: boolean }
  | { kind: "heading"; label: string }
  | { kind: "separator" };

export interface ContextMenuProps {
  x: number;
  y: number;
  entries: readonly ContextMenuEntry[];
  onSelect: (id: string) => void;
  onClose: () => void;
  /** The control that opened the menu (a press on it is not an outside press). */
  anchorRef?: RefObject<HTMLElement | null>;
}

const keepFocus = (event: MouseEvent) => event.preventDefault();

export function ContextMenu({ x, y, entries, onSelect, onClose, anchorRef }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Keep the menu inside the viewport (one measurement when it opens).
  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const { width, height } = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(0, Math.min(x, window.innerWidth - width))}px`;
    menu.style.top = `${Math.max(0, Math.min(y, window.innerHeight - height))}px`;
  }, [x, y]);

  useDismiss(anchorRef ? [ref, anchorRef] : [ref], onClose);

  return createPortal(
    <div ref={ref} className={styles.menu} role="menu" data-scope="dialog" onContextMenu={keepFocus}>
      {entries.map((entry, index) =>
        entry.kind === "separator" ? (
          <div key={`separator-${index}`} className={styles.separator} role="separator" />
        ) : entry.kind === "heading" ? (
          <div key={`heading-${index}`} className={styles.heading} role="presentation">
            {entry.label}
          </div>
        ) : entry.kind === "stepper" ? (
          <div key={entry.id} className={cx(styles.stepper, entry.disabled && styles.dim)} role="group" aria-label={entry.label}>
            <span className={styles.label}>{entry.label}</span>
            <button type="button" className={styles.step} aria-label={`${entry.label}: fewer`} aria-disabled={entry.disabled || entry.value <= entry.min || undefined} onMouseDown={keepFocus} onClick={entry.disabled || entry.value <= entry.min ? undefined : () => onSelect(`${entry.id}:dec`)}>
              <Minus className={styles.stepIcon} aria-hidden="true" />
            </button>
            <span className={styles.value}>{entry.value}</span>
            <button type="button" className={styles.step} aria-label={`${entry.label}: more`} aria-disabled={entry.disabled || entry.value >= entry.max || undefined} onMouseDown={keepFocus} onClick={entry.disabled || entry.value >= entry.max ? undefined : () => onSelect(`${entry.id}:inc`)}>
              <Plus className={styles.stepIcon} aria-hidden="true" />
            </button>
          </div>
        ) : entry.kind === "swatches" ? (
          <div key={entry.id} className={styles.swatchRow} role="group" aria-label={entry.label}>
            <span className={styles.label}>{entry.label}</span>
            <Swatches
              swatches={entry.swatches}
              role="menuitemradio"
              onPick={(id) => {
                onSelect(id);
                onClose();
              }}
            />
          </div>
        ) : (
          <button
            key={entry.id}
            type="button"
            role={entry.keepOpen ? "menuitemcheckbox" : "menuitem"}
            aria-checked={entry.keepOpen ? Boolean(entry.active) : undefined}
            className={cx(styles.item, entry.active && styles.active)}
            aria-disabled={entry.disabled || undefined}
            onMouseDown={keepFocus}
            onClick={
              entry.disabled
                ? undefined
                : () => {
                    onSelect(entry.id);
                    if (!entry.keepOpen) onClose();
                  }
            }
          >
            <span className={styles.label}>{entry.label}</span>
            {entry.commandId && <span className={styles.shortcut}>{shortcutLabel(entry.commandId)}</span>}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}
