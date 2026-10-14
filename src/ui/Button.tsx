import type { LucideIcon } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";
import styles from "./Button.module.css";
import { shortcutLabel } from "./shortcutLabel.js";

export interface ButtonProps {
  children: ReactNode;
  /** primary: gold; hero: the brand gradient (one per screen); secondary: raised surface + hairline. */
  variant?: "primary" | "secondary" | "hero" | undefined;
  size?: "compact" | "default" | "comfortable" | undefined;
  icon?: LucideIcon | undefined;
  disabled?: boolean | undefined;
  /** Command id: its shortcut is shown in the tooltip. */
  commandId?: string | undefined;
  tooltip?: string | undefined;
  autoFocus?: boolean | undefined;
  onClick?: ((event: MouseEvent<HTMLButtonElement>) => void) | undefined;
}

/** Text button with the design-system variants and the 24/28/32 heights. */
export function Button({ children, variant = "secondary", size = "default", icon: Icon, disabled, commandId, tooltip, autoFocus, onClick }: ButtonProps) {
  const shortcut = commandId ? shortcutLabel(commandId) : undefined;
  return (
    <button
      type="button"
      className={styles.button}
      data-variant={variant}
      data-size={size}
      aria-disabled={disabled || undefined}
      data-tooltip={tooltip ?? (shortcut && typeof children === "string" ? children : undefined)}
      data-shortcut={shortcut}
      autoFocus={autoFocus}
      onClick={disabled ? undefined : onClick}
    >
      {Icon && <Icon className={styles.icon} strokeWidth={variant === "hero" ? 2.5 : undefined} aria-hidden="true" />}
      {children}
    </button>
  );
}
