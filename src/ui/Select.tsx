import { ChevronDown } from "lucide-react";
import { useRef } from "react";
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
  /** compact: 24px, for panel header strips. */
  size?: "compact" | "default" | undefined;
}

/**
 * Native select (keyboard and accessibility for free), styled with tokens. A choice made with the
 * pointer gives the focus back (the select would otherwise keep every shortcut, Space included); one
 * made with the keyboard keeps it.
 */
export function Select<T extends string>({ value, options, onChange, label, disabled, size = "default" }: SelectProps<T>) {
  const pointer = useRef(false);
  return (
    <span className={styles.wrap}>
      <select
        className={styles.select}
        data-size={size}
        value={value}
        aria-label={label}
        disabled={disabled}
        onPointerDown={() => {
          pointer.current = true;
        }}
        onKeyDown={() => {
          pointer.current = false;
        }}
        onChange={(event) => {
          onChange(event.target.value as T);
          if (pointer.current) event.currentTarget.blur();
        }}
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
