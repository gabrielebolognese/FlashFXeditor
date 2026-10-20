import { useEffect, useRef, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import styles from "./Knob.module.css";

// A rotary control (the master volume, spec §7.8). Drag up/down (Shift: fine), arrow keys when focused,
// double-click for the default. While dragging, the dial, the ARIA value and the tooltip are written
// to the DOM directly and `onInput` gets every value; React renders again only on `onCommit` (P1: no
// commit during a field scrub).

export interface KnobProps {
  /** Accessible name; the tooltip shows it with the formatted value. */
  label: string;
  value: number;
  min: number;
  max: number;
  /** Arrow-key step. */
  step: number;
  /** Double-click value. */
  defaultValue: number;
  format: (value: number) => string;
  /** Every value while dragging. */
  onInput: (value: number) => void;
  /** The value at release (and after keys and double-click). */
  onCommit: (value: number) => void;
}

/** Degrees of the dial from the minimum to the maximum. */
const SWEEP = 270;
/** Pixels of vertical drag across the whole range (Shift: five times finer). */
const DRAG_RANGE_PX = 150;
const FINE = 5;

const keepFocus = (event: MouseEvent) => event.preventDefault();

export function Knob({ label, value, min, max, step, defaultValue, format, onInput, onCommit }: KnobProps) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; startY: number; startValue: number; value: number } | null>(null);
  const clamp = (v: number) => Math.min(max, Math.max(min, v));

  const show = (v: number) => {
    const element = ref.current;
    if (!element) return;
    element.style.setProperty("--knob-turn", `${((v - min) / (max - min)) * SWEEP - SWEEP / 2}deg`);
    element.setAttribute("aria-valuenow", String(v));
    element.setAttribute("aria-valuetext", format(v));
    element.dataset.tooltip = `${label}: ${format(v)}`;
  };

  useEffect(() => {
    if (!drag.current) show(value);
  });

  const set = (v: number, commit: boolean) => {
    const next = clamp(v);
    show(next);
    onInput(next);
    if (commit) onCommit(next);
    return next;
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, startY: event.clientY, startValue: value, value };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const scale = ((max - min) / DRAG_RANGE_PX) * (event.shiftKey ? 1 / FINE : 1);
    current.value = set(current.startValue + (current.startY - event.clientY) * scale, false);
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    drag.current = null;
    if (current.value !== current.startValue) onCommit(current.value);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, number> = { ArrowUp: step, ArrowRight: step, ArrowDown: -step, ArrowLeft: -step, PageUp: step * 10, PageDown: -step * 10 };
    let next: number | null = event.key in keys ? value + (keys[event.key] as number) : event.key === "Home" ? min : event.key === "End" ? max : null;
    if (next === null) return;
    // The knob owns these keys while focused (arrows otherwise step frames).
    event.preventDefault();
    event.stopPropagation();
    next = clamp(next);
    if (next !== value) set(next, true);
  };

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      className={styles.knob}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      onMouseDown={keepFocus}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      onDoubleClick={() => set(defaultValue, true)}
    >
      <span className={styles.dial}>
        <span className={styles.indicator} />
      </span>
    </div>
  );
}
