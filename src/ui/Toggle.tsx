import styles from "./Toggle.module.css";

export interface ToggleProps {
  checked: boolean;
  /** Several items with different states (spec §11 mixed values): the thumb sits in the middle; a click turns them all on. */
  mixed?: boolean | undefined;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean | undefined;
}

export function Toggle({ checked, mixed, onChange, label, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      className={styles.toggle}
      aria-checked={mixed ? "mixed" : checked}
      aria-label={label}
      aria-disabled={disabled || undefined}
      data-tooltip={label}
      onClick={disabled ? undefined : () => onChange(mixed ? true : !checked)}
    >
      <span className={styles.thumb} />
    </button>
  );
}
