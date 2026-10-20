import { useLayoutEffect, useRef, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { cx } from "./cx.js";
import styles from "./ContextMenu.module.css";
import { shortcutLabel } from "./shortcutLabel.js";
import { useDismiss } from "./useDismiss.js";

// Shell: floating menu with rows, shortcuts, separators and inline swatch rows (§6.16 label colors);
// closes on outside press and Escape.
// TODO(batch 40): keyboard navigation and the command-id driven item lists of §6.16.

/** One swatch of a swatch row: `color` is a CSS color (a custom property such as `var(--label-red)`). */
export interface ContextMenuSwatch {
  id: string;
  label: string;
  color: string;
  active?: boolean;
}

export type ContextMenuEntry =
  | { kind: "item"; id: string; label: string; commandId?: string; disabled?: boolean; active?: boolean }
  | { kind: "swatches"; id: string; label: string; swatches: readonly ContextMenuSwatch[] }
  | { kind: "separator" };

export interface ContextMenuProps {
  x: number;
  y: number;
  entries: readonly ContextMenuEntry[];
  onSelect: (id: string) => void;
  onClose: () => void;
}

const keepFocus = (event: MouseEvent) => event.preventDefault();

export function ContextMenu({ x, y, entries, onSelect, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Keep the menu inside the viewport (one measurement when it opens).
  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const { width, height } = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(0, Math.min(x, window.innerWidth - width))}px`;
    menu.style.top = `${Math.max(0, Math.min(y, window.innerHeight - height))}px`;
  }, [x, y]);

  useDismiss([ref], onClose);

  return createPortal(
    <div ref={ref} className={styles.menu} role="menu" data-scope="dialog" onContextMenu={keepFocus}>
      {entries.map((entry, index) =>
        entry.kind === "separator" ? (
          <div key={`separator-${index}`} className={styles.separator} role="separator" />
        ) : entry.kind === "swatches" ? (
          <div key={entry.id} className={styles.swatchRow} role="group" aria-label={entry.label}>
            <span className={styles.label}>{entry.label}</span>
            {entry.swatches.map((swatch) => (
              <button
                key={swatch.id}
                type="button"
                role="menuitemradio"
                aria-checked={swatch.active ?? false}
                aria-label={swatch.label}
                data-tooltip={swatch.label}
                className={cx(styles.swatch, swatch.active && styles.swatchActive)}
                style={{ background: swatch.color }}
                onMouseDown={keepFocus}
                onClick={() => {
                  onSelect(swatch.id);
                  onClose();
                }}
              />
            ))}
          </div>
        ) : (
          <button
            key={entry.id}
            type="button"
            role="menuitem"
            className={cx(styles.item, entry.active && styles.active)}
            aria-disabled={entry.disabled || undefined}
            onMouseDown={keepFocus}
            onClick={
              entry.disabled
                ? undefined
                : () => {
                    onSelect(entry.id);
                    onClose();
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
