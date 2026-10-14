import { useState, type KeyboardEvent } from "react";
import styles from "./NumberField.module.css";

// Static version: type a value, Enter or blur commits, Escape reverts.
// TODO(batch 25): drag-to-scrub on the label, arrow-key stepping.

export interface NumberFieldProps {
  value: number;
  onChange: (value: number) => void;
  /** Short prefix shown inside the field, e.g. "X". */
  label?: string | undefined;
  /** Suffix shown inside the field, e.g. "px" or "%". */
  unit?: string | undefined;
  min?: number | undefined;
  max?: number | undefined;
  /** Decimal places shown and committed. */
  precision?: number | undefined;
  disabled?: boolean | undefined;
  ariaLabel?: string | undefined;
}

export function NumberField({ value, onChange, label, unit, min, max, precision = 0, disabled, ariaLabel }: NumberFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value.toFixed(precision);

  const commit = () => {
    if (draft === null) return;
    const parsed = Number.parseFloat(draft.replace(",", "."));
    setDraft(null);
    if (!Number.isFinite(parsed)) return;
    const factor = 10 ** precision;
    const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, Math.round(parsed * factor) / factor));
    if (clamped !== value) onChange(clamped);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      commit();
      event.currentTarget.blur();
    } else if (event.key === "Escape") {
      setDraft(null);
      event.currentTarget.blur();
    }
  };

  return (
    <label className={styles.field} data-disabled={disabled || undefined}>
      {label && <span className={styles.label}>{label}</span>}
      <input
        className={styles.input}
        type="text"
        inputMode="decimal"
        value={shown}
        disabled={disabled}
        aria-label={ariaLabel ?? label}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={(event) => event.currentTarget.select()}
        onBlur={commit}
        onKeyDown={onKeyDown}
      />
      {unit && <span className={styles.unit}>{unit}</span>}
    </label>
  );
}
