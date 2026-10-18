import { Minus, Plus } from "lucide-react";
import { useLayoutEffect, useRef, type KeyboardEvent, type MouseEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { commandBridge } from "./commands.js";
import { cx } from "./cx.js";
import styles from "./ContextMenu.module.css";
import { shortcutLabel } from "./shortcutLabel.js";
import { Swatches, type Swatch } from "./Swatches.js";
import { useDismiss } from "./useDismiss.js";

// Shell: floating menu with rows, shortcuts, separators, section headings, inline swatch rows (§6.16
// label colors), steppers (a number with - / +) and inline choice rows (a label, then a few text
// chips: §6.16 fade presets and the 3 transition kinds, Batch 36); closes on outside press and
// Escape. Rows with `keepOpen` (toggles) and steppers leave it open. Dropdowns (`MenuButton`) pass their
// button as `anchorRef`, so pressing it again closes instead of reopening.
// Every row's id is a command id (spec §6.16 "dispatch command ids"; each row carries `data-command`
// for the dev audit), its shortcut shown from the live keymap; a value picker (`values`: the Ease
// dropdown of a field) lists values instead. Keyboard (Batch 40): the menu takes the focus when it
// opens; Up / Down move between rows, Left / Right between the chips of a row, Home / End, Enter or
// Space run the focused row; on close the focus goes back where it was (and the focus scope with it).

/** One swatch of a swatch row (see `ui/Swatches`). */
export type ContextMenuSwatch = Swatch;

export type ContextMenuEntry =
  /** `commandId`: where the row's shortcut comes from when it is not the row's own command. */
  | { kind: "item"; id: string; label: string; commandId?: string; disabled?: boolean; active?: boolean; keepOpen?: boolean }
  | { kind: "swatches"; id: string; label: string; swatches: readonly ContextMenuSwatch[] }
  /** `dec` / `inc` are the commands of the - / + buttons; the ends of the range disable them. */
  | { kind: "stepper"; id: string; label: string; value: number; min: number; max: number; dec: string; inc: string; disabled?: boolean }
  | { kind: "heading"; label: string }
  /**
   * A label, then text chips side by side; a pick sends the chip's id and closes the menu. A chip's
   * `command` is the command it runs when its id is not one (a value of it: Move to bin's bins).
   */
  | { kind: "choices"; id: string; label: string; choices: readonly { id: string; label: string; tooltip?: string; disabled?: boolean; command?: string }[] }
  | { kind: "separator" };

export interface ContextMenuProps {
  x: number;
  y: number;
  entries: readonly ContextMenuEntry[];
  onSelect: (id: string) => void;
  onClose: () => void;
  /** The control that opened the menu (a press on it is not an outside press). */
  anchorRef?: RefObject<HTMLElement | null>;
  /** The rows are values of a field, not commands (the Ease dropdown). */
  values?: boolean;
}

const keepFocus = (event: MouseEvent) => event.preventDefault();

const enabledButtons = (menu: HTMLElement) => [...menu.querySelectorAll<HTMLButtonElement>("button[data-row]:not([aria-disabled])")];
const rowOf = (button: Element | null | undefined) => Number((button as HTMLElement | null | undefined)?.dataset.row ?? -1);

/** Arrow-key navigation over the rows (Up / Down) and the chips of a row (Left / Right). */
function moveFocus(menu: HTMLElement, key: string): boolean {
  const buttons = enabledButtons(menu);
  if (buttons.length === 0) return false;
  const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
  const row = rowOf(buttons[current]);
  const firstOfRow = (r: number) => buttons.find((button) => rowOf(button) === r);
  const rows = [...new Set(buttons.map(rowOf))];
  let target: HTMLButtonElement | undefined;
  switch (key) {
    case "ArrowDown":
      target = current < 0 ? buttons[0] : firstOfRow(rows.find((r) => r > row) ?? rows[0] ?? 0);
      break;
    case "ArrowUp":
      target = current < 0 ? firstOfRow(rows[rows.length - 1] ?? 0) : firstOfRow([...rows].reverse().find((r) => r < row) ?? rows[rows.length - 1] ?? 0);
      break;
    case "ArrowRight":
      target = current < 0 ? undefined : buttons.slice(current + 1).find((button) => rowOf(button) === row);
      break;
    case "ArrowLeft":
      target = current < 0 ? undefined : [...buttons.slice(0, current)].reverse().find((button) => rowOf(button) === row);
      break;
    case "Home":
      target = buttons[0];
      break;
    case "End":
      target = firstOfRow(rows[rows.length - 1] ?? 0);
      break;
    default:
      return false;
  }
  target?.focus();
  return true;
}

export function ContextMenu({ x, y, entries, onSelect, onClose, anchorRef, values = false }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Keep the menu inside the viewport (one measurement when it opens).
  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const { width, height } = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(0, Math.min(x, window.innerWidth - width))}px`;
    menu.style.top = `${Math.max(0, Math.min(y, window.innerHeight - height))}px`;
  }, [x, y]);

  // The keyboard comes to the menu while it is open, and goes back where it was.
  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const bridge = commandBridge();
    const active = document.activeElement;
    // (A dev StrictMode remount finds the menu itself focused: nothing to go back to but the scope.)
    const previous = active instanceof HTMLElement && active !== document.body && !menu.contains(active) ? active : null;
    const scope = bridge.scope();
    menu.focus({ preventScroll: true });
    // Set, not left to the focusin: a dev StrictMode remount focuses an element that already has the focus.
    bridge.setScope("dialog");
    return () => {
      const active = document.activeElement;
      // Unless the menu handed the keyboard on (a row opened a popover or a field).
      if (active !== null && active !== document.body && !menu.contains(active)) return;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
      else if (bridge.scope() === "dialog") bridge.setScope(scope);
    };
  }, []);

  useDismiss(anchorRef ? [ref, anchorRef] : [ref], onClose);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const menu = ref.current;
    if (!menu) return;
    if (event.key === "Enter" || event.key === " ") {
      // One activation on the key press (the button's own would come again on Space's key-up).
      const focused = document.activeElement;
      if (focused instanceof HTMLButtonElement && menu.contains(focused)) {
        event.preventDefault();
        focused.click();
      }
      return;
    }
    if (moveFocus(menu, event.key)) event.preventDefault();
  };

  const command = values ? undefined : (id: string) => id;
  const control = values ? "" : undefined;
  const shortcut = (id: string) => (values ? undefined : shortcutLabel(id));

  return createPortal(
    <div ref={ref} className={styles.menu} role="menu" data-scope="dialog" tabIndex={-1} onContextMenu={keepFocus} onKeyDown={onKeyDown}>
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
            <button
              type="button"
              className={styles.step}
              data-row={index}
              data-command={command?.(entry.dec)}
              data-control={control}
              aria-label={`${entry.label}: fewer`}
              aria-disabled={entry.disabled || entry.value <= entry.min || undefined}
              onMouseDown={keepFocus}
              onClick={entry.disabled || entry.value <= entry.min ? undefined : () => onSelect(entry.dec)}
            >
              <Minus className={styles.stepIcon} aria-hidden="true" />
            </button>
            <span className={styles.value}>{entry.value}</span>
            <button
              type="button"
              className={styles.step}
              data-row={index}
              data-command={command?.(entry.inc)}
              data-control={control}
              aria-label={`${entry.label}: more`}
              aria-disabled={entry.disabled || entry.value >= entry.max || undefined}
              onMouseDown={keepFocus}
              onClick={entry.disabled || entry.value >= entry.max ? undefined : () => onSelect(entry.inc)}
            >
              <Plus className={styles.stepIcon} aria-hidden="true" />
            </button>
          </div>
        ) : entry.kind === "choices" ? (
          <div key={entry.id} className={styles.choices} role="group" aria-label={entry.label}>
            <span className={styles.label}>{entry.label}</span>
            {entry.choices.map((choice) => (
              <button
                key={choice.id}
                type="button"
                role="menuitem"
                className={styles.choice}
                data-row={index}
                data-command={command?.(choice.command ?? choice.id)}
                data-control={control}
                data-tooltip={choice.tooltip}
                aria-label={choice.tooltip ?? `${entry.label} ${choice.label}`}
                aria-disabled={choice.disabled || undefined}
                onMouseDown={keepFocus}
                onClick={
                  choice.disabled
                    ? undefined
                    : () => {
                        onSelect(choice.id);
                        onClose();
                      }
                }
              >
                {choice.label}
              </button>
            ))}
          </div>
        ) : entry.kind === "swatches" ? (
          <div key={entry.id} className={styles.swatchRow} role="group" aria-label={entry.label}>
            <span className={styles.label}>{entry.label}</span>
            <Swatches
              swatches={entry.swatches}
              role="menuitemradio"
              row={index}
              commands={!values}
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
            data-row={index}
            data-command={command?.(entry.id)}
            data-control={control}
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
            {shortcut(entry.commandId ?? entry.id) !== undefined && <span className={styles.shortcut}>{shortcut(entry.commandId ?? entry.id)}</span>}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}
