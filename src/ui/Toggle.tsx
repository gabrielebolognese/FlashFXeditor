import styles from "./Toggle.module.css";

export interface ToggleProps {
  checked: boolean;
  /** Several items with different states (spec §11 mixed values): the thumb sits in the middle; a click turns them all on. */
  mixed?: boolean | undefined;
  onChange: (checked: boolean) => void;
  /** Accessible name; the tooltip text unless `tooltip` is given. */
  label: string;
  /** Tooltip text when it says more than the name (why the switch is disabled). */
  tooltip?: string | undefined;
  /** The command a click runs (`onChange` runs it): the tooltip shows its live shortcut. */
  commandId?: string | undefined;
  disabled?: boolean | undefined;
}

export function Toggle({ checked, mixed, onChange, label, tooltip, commandId, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      className={styles.toggle}
      aria-checked={mixed ? "mixed" : checked}
      aria-label={label}
      aria-disabled={disabled || undefined}
      data-tooltip={tooltip ?? label}
      data-command={commandId}
      onClick={disabled ? undefined : () => onChange(mixed ? true : !checked)}
    >
      <span className={styles.thumb} />
    </button>
  );
}
