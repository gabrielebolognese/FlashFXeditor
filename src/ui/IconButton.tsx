import type { LucideIcon } from "lucide-react";
import { createElement, type MouseEvent, type PointerEvent } from "react";
import { commandBridge, runCommand } from "./commands.js";
import { cx } from "./cx.js";
import styles from "./IconButton.module.css";

/**
 * Every button either dispatches a registered command (`commandId`: a click runs it, the tooltip shows
 * its live shortcut, the label and icon default to the catalog's) or is a `control` of a field or a
 * dialog (a value toggle, Cancel). The dev audit (app/commandAudit.ts) checks the rest of the DOM.
 */
export type ButtonDispatch = { commandId: string; control?: undefined } | { commandId?: undefined; control: true };

export type IconButtonProps = ButtonDispatch & {
  /** Defaults to the command's catalog icon; a text chip (`text` alone, e.g. the speed chips) has none. */
  icon?: LucideIcon | undefined;
  /** Accessible name and tooltip text; with a command, defaults to its catalog label. */
  label?: string | undefined;
  /** What a command acts on when it is not the selection (a preset id). */
  arg?: string | undefined;
  /** Optional visible label next to the icon. */
  text?: string | undefined;
  /** Toggle state; omit for plain buttons. */
  pressed?: boolean | undefined;
  disabled?: boolean | undefined;
  size?: "compact" | "default" | undefined;
  /** Replaces running the command (a guard first, e.g. a chip that may have been dragged). */
  onClick?: ((event: MouseEvent<HTMLButtonElement>) => void) | undefined;
  /** A press that may become a drag (the transition chips, Batch 36). */
  onPointerDown?: ((event: PointerEvent<HTMLButtonElement>) => void) | undefined;
};

// Buttons never take focus on mouse down, so Space and other shortcuts keep working after a click.
const keepFocus = (event: MouseEvent) => event.preventDefault();

export function IconButton({ icon, label, commandId, control, arg, text, pressed, disabled, size = "compact", onClick, onPointerDown }: IconButtonProps) {
  const bridge = commandBridge();
  const name = label ?? (commandId !== undefined ? bridge.label(commandId) : undefined) ?? "";
  const Icon = icon ?? (commandId !== undefined ? bridge.icon(commandId) : undefined);
  const click = onClick ?? (commandId !== undefined ? () => runCommand(commandId, arg) : undefined);
  return (
    <button
      type="button"
      className={cx(styles.button, text && (Icon ? styles.withText : styles.textOnly))}
      data-size={size}
      aria-label={name}
      aria-pressed={pressed}
      // aria-disabled instead of disabled: disabled buttons get no pointer events, so no tooltip.
      aria-disabled={disabled || undefined}
      data-tooltip={name}
      data-command={commandId}
      data-control={control ? "" : undefined}
      onMouseDown={keepFocus}
      onClick={disabled ? undefined : click}
      onPointerDown={disabled ? undefined : onPointerDown}
    >
      {/* createElement: the icon component may come from the catalog (a stable module-level component). */}
      {Icon && createElement(Icon, { className: styles.icon, "aria-hidden": "true" })}
      {text && <span className={styles.text}>{text}</span>}
    </button>
  );
}
