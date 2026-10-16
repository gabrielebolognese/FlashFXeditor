import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createStore } from "../core/store/createStore.js";
import styles from "./NumberField.module.css";

// The scrubbable number field (spec §11): drag the label horizontally to scrub (Shift 10x, Alt 0.1x),
// type a value (Enter or blur commits, Esc reverts), Up/Down step by `step` (Shift 10x), units shown,
// min/max clamps, `--` for mixed values. The field is bound outside React (spec §3.3, P1): it reads its
// `NumberBinding` and writes the input's text straight into the DOM when the bound value changes, so
// neither a scrub nor a document change re-renders it. A scrub reports ephemeral changes (the binding
// shows them live, P2) and one commit on release; Esc during a scrub cancels it.

/** What a change is: an arrow step (consecutive steps coalesce), a live scrub value, a scrub's release, a cancelled scrub. */
export type ChangePhase = "step" | "scrub" | "commit" | "cancel";

/** How a number field reads and writes one property of its targets. Values are in the field's units. */
export interface NumberBinding {
  /** The value shown, or null when the targets differ (mixed). */
  read(): number | null;
  /** Calls `listener` whenever `read()` may have changed. Returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /** A typed value: every target set to it, one command. */
  set(value: number): void;
  /**
   * `delta` added to every target's own value (so a mixed field keeps its differences): an arrow
   * step, a live scrub value (ephemeral, from the scrub's start), its release (one command) or
   * a cancel (back to the document).
   */
  change(delta: number, phase: ChangePhase): void;
}

/**
 * A binding to one plain value with no live preview: steps and scrub releases set it through `set`.
 * The field clamps what it passes, so `read() + delta` stays in range.
 */
export function valueBinding(source: { read(): number | null; subscribe(listener: () => void): () => void }, set: (value: number) => void): NumberBinding {
  return {
    read: () => source.read(),
    subscribe: (listener) => source.subscribe(listener),
    set,
    change(delta, phase) {
      const current = source.read();
      if ((phase === "step" || phase === "commit") && current !== null && delta !== 0) set(current + delta);
    },
  };
}

/** A binding to a value held in React state (a dialog's): the field shows `value` and reports edits through `onChange`. */
export function useValueBinding(value: number, onChange: (value: number) => void): NumberBinding {
  const [latest] = useState(() => createStore({ value, onChange }));
  useLayoutEffect(() => {
    latest.set({ value, onChange });
  }, [latest, value, onChange]);
  return useMemo(() => valueBinding({ read: () => latest.getState().value, subscribe: (listener) => latest.subscribe(() => listener()) }, (next) => latest.getState().onChange(next)), [latest]);
}

export interface NumberFieldProps {
  binding: NumberBinding;
  /** Inside the field before the value (text such as "X", or an icon); dragging it scrubs. */
  label?: ReactNode;
  /** Suffix shown inside the field, e.g. "px" or "%". */
  unit?: string | undefined;
  min?: number | undefined;
  max?: number | undefined;
  /** Decimal places shown and committed. */
  precision?: number | undefined;
  /** Change per arrow press and per px of scrub. */
  step?: number | undefined;
  disabled?: boolean | undefined;
  ariaLabel: string;
}

/** `value` rounded to `precision` decimals (no negative zero). */
export function roundTo(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor || 0;
}

/** Typed text as a number ("3,5" reads 3.5), or null. */
export function parseNumber(text: string): number | null {
  const value = Number.parseFloat(text.trim().replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

function show(input: HTMLInputElement, value: number | null, precision: number): void {
  const text = value === null ? "" : roundTo(value, precision).toFixed(precision);
  if (input.value !== text) input.value = text;
  input.placeholder = value === null ? "--" : "";
}

interface Scrub {
  pointerId: number;
  handle: HTMLElement;
  startX: number;
  lastX: number;
  /** The value at the press, or null when mixed. */
  start: number | null;
  delta: number;
  /** The delta last reported (rounded and clamped). */
  applied: number;
  /** Past the dead zone. */
  active: boolean;
  threshold: number;
  stop: () => void;
}

const SCRUB_ATTRIBUTE = "data-number-scrub";

export function NumberField({ binding, label, unit, min = -Infinity, max = Infinity, precision = 0, step = 1, disabled, ariaLabel }: NumberFieldProps) {
  const fieldRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /** Text typed and not committed yet: the bound value does not overwrite it. */
  const dirty = useRef(false);
  const scrub = useRef<Scrub | null>(null);
  const clampRound = (value: number) => roundTo(Math.min(max, Math.max(min, value)), precision);

  /** Writes the bound value into the input unless the user is typing or scrubbing. */
  const refresh = () => {
    const input = inputRef.current;
    if (!input || dirty.current || scrub.current?.active) return;
    show(input, binding.read(), precision);
    if (document.activeElement === input) input.select();
  };
  const refreshRef = useRef(refresh);
  useLayoutEffect(() => {
    refreshRef.current = refresh;
  });

  // The narrow store binding: DOM writes only, never a React render (P1).
  useLayoutEffect(() => {
    refreshRef.current();
    return binding.subscribe(() => refreshRef.current());
  }, [binding, precision]);

  /** Ends a scrub: its last value committed as one change, or cancelled. */
  const endScrub = (commit: boolean) => {
    const current = scrub.current;
    if (!current) return;
    scrub.current = null;
    current.stop();
    if (current.handle.hasPointerCapture?.(current.pointerId)) current.handle.releasePointerCapture(current.pointerId);
    delete fieldRef.current?.dataset.scrubbing;
    document.documentElement.removeAttribute(SCRUB_ATTRIBUTE);
    if (current.active) binding.change(commit ? current.applied : 0, commit && current.applied !== 0 ? "commit" : "cancel");
    refresh();
  };
  const endScrubRef = useRef(endScrub);
  useLayoutEffect(() => {
    endScrubRef.current = endScrub;
  });
  // Unmounted mid-scrub (the selection changed): nothing is committed.
  useLayoutEffect(() => () => endScrubRef.current(false), []);

  const commitDraft = () => {
    const input = inputRef.current;
    if (!input || !dirty.current) return;
    dirty.current = false;
    const parsed = parseNumber(input.value);
    if (parsed !== null) {
      const value = clampRound(parsed);
      if (value !== binding.read()) binding.set(value);
    }
    refresh();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    if (event.key === "Enter") {
      event.preventDefault();
      commitDraft();
      input.blur();
    } else if (event.key === "Escape") {
      event.preventDefault();
      dirty.current = false;
      refresh();
      input.blur();
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const amount = (event.key === "ArrowUp" ? 1 : -1) * (event.shiftKey ? 10 : 1) * step;
      if (dirty.current) {
        dirty.current = false;
        const parsed = parseNumber(input.value);
        if (parsed !== null) binding.set(clampRound(parsed + amount));
        refresh();
        return;
      }
      const current = binding.read();
      if (current === null) binding.change(amount, "step");
      else {
        const next = clampRound(current + amount);
        if (next !== current) binding.change(next - current, "step");
      }
    }
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (disabled || event.button !== 0 || scrub.current) return;
    event.preventDefault();
    inputRef.current?.blur();
    const handle = event.currentTarget;
    handle.setPointerCapture?.(event.pointerId);
    const onKey = (key: globalThis.KeyboardEvent) => {
      if (key.key !== "Escape") return;
      key.preventDefault();
      key.stopPropagation();
      endScrubRef.current(false);
    };
    window.addEventListener("keydown", onKey, true);
    scrub.current = {
      pointerId: event.pointerId,
      handle,
      startX: event.clientX,
      lastX: event.clientX,
      start: binding.read(),
      delta: 0,
      applied: 0,
      active: false,
      threshold: Number.parseFloat(getComputedStyle(handle).getPropertyValue("--field-scrub-threshold")) || 0,
      stop: () => window.removeEventListener("keydown", onKey, true),
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const current = scrub.current;
    if (!current || event.pointerId !== current.pointerId) return;
    if (!current.active) {
      if (Math.abs(event.clientX - current.startX) < current.threshold) return;
      // Past the dead zone: the scrub counts from here (no jump).
      current.active = true;
      current.lastX = event.clientX;
      if (fieldRef.current) fieldRef.current.dataset.scrubbing = "";
      document.documentElement.setAttribute(SCRUB_ATTRIBUTE, "");
      return;
    }
    const factor = event.shiftKey ? 10 : event.altKey ? 0.1 : 1;
    current.delta += (event.clientX - current.lastX) * step * factor;
    current.lastX = event.clientX;
    let applied: number;
    if (current.start !== null) {
      // Clamped as it goes, so dragging back from a limit moves at once.
      current.delta = Math.min(max, Math.max(min, current.start + current.delta)) - current.start;
      applied = clampRound(current.start + current.delta) - current.start;
    } else applied = roundTo(current.delta, precision);
    if (applied === current.applied) return;
    current.applied = applied;
    if (current.start !== null && inputRef.current) show(inputRef.current, current.start + applied, precision);
    binding.change(applied, "scrub");
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const current = scrub.current;
    if (!current || event.pointerId !== current.pointerId) return;
    const wasScrub = current.active;
    endScrub(true);
    // A click on the label (no drag) edits the value, as a label would.
    if (!wasScrub && !disabled) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  };

  return (
    <div ref={fieldRef} className={styles.field} data-disabled={disabled || undefined}>
      {label !== undefined && (
        <span
          className={styles.scrub}
          aria-hidden="true"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => endScrub(false)}
          onLostPointerCapture={() => endScrub(true)}
        >
          {label}
        </span>
      )}
      <input
        ref={inputRef}
        className={styles.input}
        type="text"
        inputMode="decimal"
        spellCheck={false}
        disabled={disabled}
        aria-label={ariaLabel}
        onInput={() => {
          dirty.current = true;
        }}
        onFocus={(event) => event.currentTarget.select()}
        onBlur={commitDraft}
        onKeyDown={onKeyDown}
      />
      {unit && <span className={styles.unit}>{unit}</span>}
    </div>
  );
}
