import type { KeyboardEvent } from "react";
import { cx } from "./cx.js";
import styles from "./NumberField.module.css";
import { useDraft } from "./useDraft.js";

// Two modes. Commit mode (no `onChange`): like NumberField, Enter or blur commits, Escape reverts.
// Live mode (`onChange` given): controlled, every keystroke reported, Enter calls `onCommit`.

export interface TextFieldProps {
  value: string;
  onCommit?: ((value: string) => void) | undefined;
  onChange?: ((value: string) => void) | undefined;
  ariaLabel: string;
  /** Monospace (hex codes, ids). */
  mono?: boolean | undefined;
  maxLength?: number | undefined;
  placeholder?: string | undefined;
  disabled?: boolean | undefined;
  autoFocus?: boolean | undefined;
}

export function TextField({ value, onCommit, onChange, ariaLabel, mono, maxLength, placeholder, disabled, autoFocus }: TextFieldProps) {
  const { draft, set: setDraft, take } = useDraft();
  const live = onChange !== undefined;

  const commit = () => {
    if (live) return;
    const text = take();
    if (text !== null && text !== value) onCommit?.(text);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      if (live) {
        onCommit?.(value);
        return;
      }
      commit();
      event.currentTarget.blur();
    } else if (event.key === "Escape" && !live) {
      setDraft(null);
      event.currentTarget.blur();
    }
  };

  return (
    <label className={styles.field} data-disabled={disabled || undefined}>
      <input
        className={cx(styles.input, !mono && styles.text)}
        type="text"
        value={live ? value : (draft ?? value)}
        maxLength={maxLength}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        spellCheck={false}
        aria-label={ariaLabel}
        onChange={(event) => (live ? onChange(event.target.value) : setDraft(event.target.value))}
        onFocus={(event) => event.currentTarget.select()}
        onBlur={commit}
        onKeyDown={onKeyDown}
      />
    </label>
  );
}
