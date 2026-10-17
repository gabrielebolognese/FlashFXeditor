import type { LucideIcon } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";
import styles from "./Button.module.css";
import { runCommand } from "./commands.js";
import type { ButtonDispatch } from "./IconButton.js";

export type ButtonProps = ButtonDispatch & {
  children: ReactNode;
  /** primary: gold; hero: the brand gradient (one per screen); secondary: raised surface + hairline. */
  variant?: "primary" | "secondary" | "hero" | undefined;
  size?: "compact" | "default" | "comfortable" | undefined;
  icon?: LucideIcon | undefined;
  disabled?: boolean | undefined;
  tooltip?: string | undefined;
  autoFocus?: boolean | undefined;
  /** Replaces running the command (with `control`: the button's own action). */
  onClick?: ((event: MouseEvent<HTMLButtonElement>) => void) | undefined;
};

/**
 * Text button with the design-system variants and the 24/28/32 heights. With a command id a click runs
 * it and the tooltip shows its live shortcut; a `control` is a dialog's or a field's own button.
 */
export function Button({ children, variant = "secondary", size = "default", icon: Icon, disabled, commandId, control, tooltip, autoFocus, onClick }: ButtonProps) {
  const click = onClick ?? (commandId !== undefined ? () => runCommand(commandId) : undefined);
  return (
    <button
      type="button"
      className={styles.button}
      data-variant={variant}
      data-size={size}
      aria-disabled={disabled || undefined}
      data-tooltip={tooltip ?? (commandId !== undefined && typeof children === "string" ? children : undefined)}
      data-command={commandId}
      data-control={control ? "" : undefined}
      autoFocus={autoFocus}
      onClick={disabled ? undefined : click}
    >
      {Icon && <Icon className={styles.icon} strokeWidth={variant === "hero" ? 2.5 : undefined} aria-hidden="true" />}
      {children}
    </button>
  );
}
