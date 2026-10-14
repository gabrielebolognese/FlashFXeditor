import type { LucideIcon } from "lucide-react";
import type { MouseEvent } from "react";
import { cx } from "./cx.js";
import styles from "./IconButton.module.css";
import { shortcutLabel } from "./shortcutLabel.js";

export interface IconButtonProps {
  icon: LucideIcon;
  /** Accessible name and tooltip text. */
  label: string;
  /** Command id; its shortcut from the keymap is shown in the tooltip. */
  commandId?: string | undefined;
  /** Optional visible label next to the icon. */
  text?: string | undefined;
  /** Toggle state; omit for plain buttons. */
  pressed?: boolean | undefined;
  disabled?: boolean | undefined;
  size?: "compact" | "default" | undefined;
  onClick?: ((event: MouseEvent<HTMLButtonElement>) => void) | undefined;
}

// Buttons never take focus on mouse down, so Space and other shortcuts keep working after a click.
const keepFocus = (event: MouseEvent) => event.preventDefault();

export function IconButton({ icon: Icon, label, commandId, text, pressed, disabled, size = "compact", onClick }: IconButtonProps) {
  return (
    <button
      type="button"
      className={cx(styles.button, text && styles.withText)}
      data-size={size}
      aria-label={label}
      aria-pressed={pressed}
      // aria-disabled instead of disabled: disabled buttons get no pointer events, so no tooltip.
      aria-disabled={disabled || undefined}
      data-tooltip={label}
      data-shortcut={commandId ? shortcutLabel(commandId) : undefined}
      data-command={commandId}
      onMouseDown={keepFocus}
      onClick={disabled ? undefined : onClick}
    >
      <Icon className={styles.icon} aria-hidden="true" />
      {text && <span className={styles.text}>{text}</span>}
    </button>
  );
}
