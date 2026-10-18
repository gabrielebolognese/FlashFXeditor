import { ChevronDown, type LucideIcon } from "lucide-react";
import { useCallback, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { ContextMenu, type ContextMenuEntry } from "./ContextMenu.js";
import styles from "./MenuButton.module.css";

export interface MenuButtonProps {
  /** Accessible name and tooltip text. */
  label: string;
  /** Command id whose shortcut the tooltip shows. */
  commandId?: string | undefined;
  icon?: LucideIcon | undefined;
  /** The visible value (a zoom, a mode); written by its own subscription when it changes often (P1). */
  children?: ReactNode;
  /** The rows, read when the menu opens and on each render while it is open. */
  entries: () => readonly ContextMenuEntry[];
  onSelect: (id: string) => void;
  /** The menu closed (the keyboard goes back to the panel). */
  onClose?: () => void;
  /** Some overlay of the menu is on: the icon in its active (gold) state. */
  pressed?: boolean | undefined;
  /** The rows are a field's values (the Ease dropdown), not command ids. */
  values?: boolean | undefined;
  /** Not applicable now: dimmed, does not open, keeps its focus and tooltip (aria-disabled, spec §17). */
  disabled?: boolean | undefined;
}

// Never takes focus on mouse down, so Space and other shortcuts keep working after a choice.
const keepFocus = (event: MouseEvent) => event.preventDefault();

/** A dropdown (spec §7.8 "single click opens, single click selects"): a compact button opening a menu under it. */
export function MenuButton({ label, commandId, icon: Icon, children, entries, onSelect, onClose, pressed, values = false, disabled }: MenuButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const close = useCallback(() => {
    setAnchor(null);
    onClose?.();
  }, [onClose]);
  const toggle = () => {
    if (anchor) {
      close();
      return;
    }
    if (disabled) return;
    const button = ref.current;
    if (!button) return;
    // One rect read per open.
    const rect = button.getBoundingClientRect();
    setAnchor({ x: rect.left, y: rect.bottom });
  };
  return (
    <>
      <button
        ref={ref}
        type="button"
        className={styles.button}
        data-kind={children === undefined ? "icon" : "value"}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={anchor !== null}
        aria-pressed={pressed}
        // aria-disabled, not disabled: the button keeps its focus and its tooltip.
        aria-disabled={disabled || undefined}
        data-tooltip={label}
        data-command={commandId}
        onMouseDown={keepFocus}
        onClick={toggle}
      >
        {Icon && <Icon className={styles.icon} aria-hidden="true" />}
        {children !== undefined && <span className={styles.text}>{children}</span>}
        <ChevronDown className={styles.chevron} aria-hidden="true" />
      </button>
      {anchor && <ContextMenu x={anchor.x} y={anchor.y} entries={entries()} onSelect={onSelect} onClose={close} anchorRef={ref} values={values} />}
    </>
  );
}
