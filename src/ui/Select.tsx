import { ChevronDown } from "lucide-react";
import styles from "./Select.module.css";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

export interface SelectProps<T extends string> {
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  label: string;
  disabled?: boolean | undefined;
}

/** Native select (keyboard and accessibility for free), styled with tokens. */
export function Select<T extends string>({ value, options, onChange, label, disabled }: SelectProps<T>) {
  return (
    <span className={styles.wrap}>
      <select
        className={styles.select}
        value={value}
        aria-label={label}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className={styles.chevron} aria-hidden="true" />
    </span>
  );
}
