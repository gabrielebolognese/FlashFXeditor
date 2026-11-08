// Number counters (spec §21.13, Batch 68): the text a counting clip shows at a frame. Pure.
// - The clip shows `prefix + value + suffix`; the value goes from `from` to `to` over the clip through
//   `ease` (the last frame shows `to` exactly), or follows the keys of `text.counter.value`.
// - `text.value` holds the final text (`counterText(counter, counter.to)`): the layout bounds come from it.
// - Rounding: `toFixed(decimals)` of the value; thousands are grouped with the separator; a `.` separator
//   makes the decimal mark a `,`. A negative number has a `-` and a value that rounds to zero none.
import { ease, sampleValue, scalar } from "../core/document/keyframes.js";
import type { Key } from "../core/document/keyframes.js";
import { COUNTER_SEPARATORS, type CounterSeparator, type Frame, type Keyframes, type TextCounter } from "../core/document/types.js";
import { isEaseId } from "../core/document/keyframes.js";

export const MAX_COUNTER_DECIMALS = 6;
export const COUNTER_VALUE_PROP = "text.counter.value";

export function newCounter(): TextCounter {
  return { from: 0, to: 100, decimals: 0, prefix: "", suffix: "", separator: "", ease: "easeOut" };
}

/** The number `value` as the counter writes it (without prefix and suffix). */
export function formatCounterNumber(value: number, decimals: number, separator: CounterSeparator): string {
  const digits = Math.min(MAX_COUNTER_DECIMALS, Math.max(0, Math.round(decimals)));
  const fixed = (Number.isFinite(value) ? Math.abs(value) : 0).toFixed(digits);
  const [whole = "0", fraction] = fixed.split(".");
  const grouped = separator === "" ? whole : whole.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
  const mark = separator === "." ? "," : ".";
  const negative = value < 0 && /[1-9]/.test(fixed);
  return `${negative ? "-" : ""}${grouped}${fraction !== undefined ? mark + fraction : ""}`;
}

/** What the counter reads when its value is `value`. */
export function counterText(counter: TextCounter, value: number): string {
  return `${counter.prefix}${formatCounterNumber(value, counter.decimals, counter.separator)}${counter.suffix}`;
}

/** The value at `rel` frames into a clip of `duration` frames: the keys of `text.counter.value`, else `from` to `to` through the ease. */
export function counterValueAt(counter: TextCounter, keyframes: Keyframes | undefined, rel: Frame, duration: Frame): number {
  const keys: readonly Key[] | undefined = keyframes?.[COUNTER_VALUE_PROP];
  if (keys && keys.length > 0) return scalar(sampleValue(keys, rel));
  const t = duration <= 1 ? 1 : Math.min(1, Math.max(0, rel / (duration - 1)));
  return counter.from + (counter.to - counter.from) * ease(isEaseId(counter.ease) ? counter.ease : "linear", t);
}

/** The text the counter shows at `rel`. */
export function counterTextAt(counter: TextCounter, keyframes: Keyframes | undefined, rel: Frame, duration: Frame): string {
  return counterText(counter, counterValueAt(counter, keyframes, rel, duration));
}

/** The distinct characters a counter can draw (digits, minus, both marks, the separator, prefix and suffix), in a stable order. */
export function counterGlyphs(counter: TextCounter): string {
  const seen = new Set<string>();
  for (const ch of `0123456789-.,${counter.separator}${counter.prefix}${counter.suffix}`) seen.add(ch);
  return [...seen].join("");
}

/** `value` from a file or an older build, made valid; undefined when it is not a counter. */
export function sanitizeCounter(value: unknown): TextCounter | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const raw = value as Record<string, unknown>;
  const base = newCounter();
  const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
  return {
    from: num(raw.from, base.from),
    to: num(raw.to, base.to),
    decimals: Math.min(MAX_COUNTER_DECIMALS, Math.max(0, Math.round(num(raw.decimals, 0)))),
    prefix: typeof raw.prefix === "string" ? raw.prefix : "",
    suffix: typeof raw.suffix === "string" ? raw.suffix : "",
    separator: (COUNTER_SEPARATORS as readonly unknown[]).includes(raw.separator) ? (raw.separator as CounterSeparator) : "",
    ease: isEaseId(raw.ease) ? raw.ease : base.ease,
  };
}

export function sameCounter(a: TextCounter | undefined, b: TextCounter | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.from === b.from && a.to === b.to && a.decimals === b.decimals && a.prefix === b.prefix && a.suffix === b.suffix && a.separator === b.separator && a.ease === b.ease;
}
