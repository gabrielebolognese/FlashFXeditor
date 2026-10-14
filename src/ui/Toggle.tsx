import styles from "./Toggle.module.css";

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean | undefined;
}

export function Toggle({ checked, onChange, label, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      className={styles.toggle}
      aria-checked={checked}
      aria-label={label}
      aria-disabled={disabled || undefined}
      data-tooltip={label}
      onClick={disabled ? undefined : () => onChange(!checked)}
    >
      <span className={styles.thumb} />
    </button>
  );
}
