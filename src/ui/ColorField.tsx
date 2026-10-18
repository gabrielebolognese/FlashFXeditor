import { Pipette } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { formatHexColor, parseHexColor } from "../core/document/color.js";
import type { RGBA } from "../core/document/types.js";
import { createStore, type Store } from "../core/store/createStore.js";
import styles from "./ColorField.module.css";
import { hsvToRgb, rgbToHsv, type Hsv } from "./colorMath.js";
import { IconButton } from "./IconButton.js";
import { NumberField, type NumberBinding } from "./NumberField.js";
import { Swatches } from "./Swatches.js";
import { TextField } from "./TextField.js";
import { useDismiss } from "./useDismiss.js";

// Color fields (spec §11): a swatch and the hex text; the swatch opens a popover picker with a
// saturation/value square, hue and alpha strips, hex and R G B A fields, the recent colors and, where
// the browser has the EyeDropper API, an eyedropper. Every finished pick (a drag released, a value
// typed, a recent color, the eyedropper) is one `onChange` (one command); while the square, a strip or
// a channel label is dragged the picker paints itself by direct DOM writes (P1) and reports `onPreview`
// (ephemeral, P2). A drag that ends without a release (Esc, the picker closed) only ends the preview.
// Keyboard (Batch 46): the picker takes the focus (its hex field) when it opens and Tab cycles inside it;
// the square and the strips are sliders (the arrows step 1%, or 1 degree of hue, Shift 10x; on the
// square Left / Right move the saturation, Up / Down the brightness; each step is one pick); Esc, or a
// pick that closes it, gives the focus back to the swatch.

export interface ColorFieldProps {
  value: RGBA;
  /** A finished pick: one command. */
  onChange: (color: RGBA) => void;
  /** While the picker is dragged: the color to show live, then null when the drag ends. */
  onPreview?: ((color: RGBA | null) => void) | undefined;
  /** The picker's recent colors (`#rrggbb[aa]`), newest first. */
  recent: readonly string[];
  ariaLabel: string;
  disabled?: boolean | undefined;
}

/** The browser's eyedropper (Chromium; not in the TypeScript DOM types yet). */
interface EyeDropperApi {
  open(): Promise<{ sRGBHex: string }>;
}
type EyeDropperConstructor = new () => EyeDropperApi;

function eyeDropper(): EyeDropperConstructor | null {
  return (globalThis as { EyeDropper?: EyeDropperConstructor }).EyeDropper ?? null;
}

const swatchStyle = (color: RGBA) => ({ "--swatch-color": formatHexColor(color) }) as CSSProperties;

export function ColorField({ value, onChange, onPreview, recent, ariaLabel, disabled }: ColorFieldProps) {
  // The open picker's anchor (the swatch), or null.
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const commitHex = (text: string) => {
    const color = parseHexColor(text);
    if (color) onChange(color);
  };
  return (
    <div className={styles.field} data-disabled={disabled || undefined}>
      <button
        type="button"
        className={styles.swatch}
        style={swatchStyle(value)}
        aria-label={`${ariaLabel}: color picker`}
        aria-haspopup="dialog"
        aria-expanded={anchor !== null}
        aria-disabled={disabled || undefined}
        data-tooltip="Pick a color"
        onClick={disabled ? undefined : (event) => setAnchor(anchor ? null : event.currentTarget)}
      />
      <TextField value={formatHexColor(value)} onCommit={commitHex} ariaLabel={`${ariaLabel} (hex)`} mono maxLength={9} disabled={disabled} />
      {anchor && <ColorPicker anchor={anchor} initial={value} recent={recent} onChange={onChange} onPreview={onPreview} onClose={() => setAnchor(null)} />}
    </div>
  );
}

export interface PickerColor extends Hsv {
  a: number;
}

const rgbaOf = (color: PickerColor): RGBA => ({ ...hsvToRgb(color), a: color.a });
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

type PickPhase = "preview" | "commit" | "cancel";

/** The picker's color with the callbacks of its owner (kept current by an effect: no refs read in render). */
interface PickerState {
  color: PickerColor;
  /** A drag (the square, a strip, a channel label) is showing a preview: the picker renders nothing until it ends. */
  dragging: boolean;
  onChange: (color: RGBA) => void;
  onPreview: ((color: RGBA | null) => void) | undefined;
}

/** One pick: shown at once; committed (one command), shown live (a drag) or reverted (the preview ends). */
function pick(store: Store<PickerState>, color: PickerColor, phase: PickPhase): void {
  store.set((state) => ({ ...state, color, dragging: phase === "preview" }));
  const { onChange, onPreview } = store.getState();
  if (phase === "preview") onPreview?.(rgbaOf(color));
  else {
    onPreview?.(null);
    if (phase === "commit") onChange(rgbaOf(color));
  }
}

/** A 0..255 channel (alpha in %) of the picker's color as a number field binding: typed values and scrubs pick. */
function channelBinding(store: Store<PickerState>, channel: "r" | "g" | "b" | "a"): NumberBinding {
  const read = () => {
    const rgba = rgbaOf(store.getState().color);
    return channel === "a" ? Math.round(rgba.a * 100) : Math.round(rgba[channel] * 255);
  };
  const withValue = (value: number): PickerColor => {
    const color = store.getState().color;
    if (channel === "a") return { ...color, a: clamp01(value / 100) };
    const hsv = rgbToHsv({ ...rgbaOf(color), [channel]: clamp01(value / 255) });
    // A grey or black keeps the hue it had, so the square does not jump to red.
    return { ...hsv, h: hsv.s === 0 ? color.h : hsv.h, a: color.a };
  };
  let start: { color: PickerColor; value: number } | null = null;
  return {
    read,
    subscribe: (listener) => store.subscribe(() => listener()),
    set: (value) => pick(store, withValue(value), "commit"),
    change(delta, phase) {
      if (phase === "step") pick(store, withValue(read() + delta), "commit");
      else if (phase === "scrub") {
        start ??= { color: store.getState().color, value: read() };
        pick(store, withValue(start.value + delta), "preview");
      } else {
        const from = start;
        start = null;
        if (phase === "commit") pick(store, store.getState().color, "commit");
        else if (from) pick(store, from.color, "cancel");
      }
    },
  };
}

interface PickerProps {
  anchor: HTMLElement;
  initial: RGBA;
  recent: readonly string[];
  onChange: (color: RGBA) => void;
  onPreview?: ((color: RGBA | null) => void) | undefined;
  onClose: () => void;
}

export type Area = "square" | "hue" | "alpha";

/** The picker color under a pointer on one of the areas. */
function colorAt(color: PickerColor, area: Area, element: HTMLElement, clientX: number, clientY: number): PickerColor {
  const rect = element.getBoundingClientRect();
  const x = clamp01((clientX - rect.left) / (rect.width || 1));
  const y = clamp01((clientY - rect.top) / (rect.height || 1));
  if (area === "square") return { ...color, s: x, v: 1 - y };
  if (area === "hue") return { ...color, h: Math.min(359.999, x * 360) };
  return { ...color, a: Math.round(x * 100) / 100 };
}

/**
 * The picker color after a key on one of the areas, or null when the key does nothing there: the arrows
 * step 1% (hue: 1 degree), 10x with Shift, from the whole step nearest the current value; on the square
 * Left / Right move the saturation and Up / Down the brightness; Home / End go to a strip's ends.
 */
export function stepColor(color: PickerColor, area: Area, key: string, shift: boolean): PickerColor | null {
  const step = shift ? 10 : 1;
  const percent = (value: number, delta: number) => Math.min(100, Math.max(0, Math.round(value * 100) + delta)) / 100;
  if (area === "square") {
    if (key === "ArrowLeft" || key === "ArrowRight") return { ...color, s: percent(color.s, key === "ArrowLeft" ? -step : step) };
    if (key === "ArrowDown" || key === "ArrowUp") return { ...color, v: percent(color.v, key === "ArrowDown" ? -step : step) };
    return null;
  }
  const max = area === "hue" ? 360 : 100;
  const current = Math.round(area === "hue" ? color.h : color.a * 100);
  let next: number;
  if (key === "ArrowLeft" || key === "ArrowDown") next = current - step;
  else if (key === "ArrowRight" || key === "ArrowUp") next = current + step;
  else if (key === "Home") next = 0;
  else if (key === "End") next = max;
  else return null;
  next = Math.min(max, Math.max(0, next));
  // The hue strip's right end is red again: kept just under 360, as a drag there does.
  return area === "hue" ? { ...color, h: Math.min(359.999, next) } : { ...color, a: next / 100 };
}

/** The slider attributes of an area for its color (written into the DOM by the picker's paint, P1). */
export function sliderValue(color: PickerColor, area: Area): { now: number; text: string } {
  if (area === "square") {
    const s = Math.round(color.s * 100);
    return { now: s, text: `Saturation ${s}%, brightness ${Math.round(color.v * 100)}%` };
  }
  if (area === "hue") {
    const h = Math.round(color.h);
    return { now: h, text: `${h} degrees` };
  }
  const a = Math.round(color.a * 100);
  return { now: a, text: `${a}%` };
}

/** What Tab can reach in the picker (it cycles there while the picker is open). */
const TABBABLE = 'input:not([disabled]), button:not([disabled]), [tabindex="0"]';

function ColorPicker({ anchor, initial, recent, onChange, onPreview, onClose }: PickerProps) {
  const panel = useRef<HTMLDivElement>(null);
  const [store] = useState(() => createStore<PickerState>({ color: { ...rgbToHsv(initial), a: initial.a }, dragging: false, onChange, onPreview }));
  useLayoutEffect(() => {
    store.set((state) => (state.onChange === onChange && state.onPreview === onPreview ? state : { ...state, onChange, onPreview }));
  }, [store, onChange, onPreview]);
  const bindings = useMemo(() => (["r", "g", "b", "a"] as const).map((channel) => channelBinding(store, channel)), [store]);
  const [hex, setHex] = useState(() => formatHexColor(initial));

  // Placed under the swatch (fixed, kept in the window), then painted by direct DOM writes on every change.
  useLayoutEffect(() => {
    const element = panel.current;
    if (!element) return;
    const rect = anchor.getBoundingClientRect();
    const gap = Number.parseFloat(getComputedStyle(element).getPropertyValue("--space-1")) || 0;
    const left = Math.max(gap, Math.min(rect.left, window.innerWidth - element.offsetWidth - gap));
    const below = rect.bottom + gap + element.offsetHeight <= window.innerHeight;
    element.style.left = `${left}px`;
    element.style.top = `${below ? rect.bottom + gap : Math.max(gap, rect.top - gap - element.offsetHeight)}px`;
    element.style.visibility = "visible";
    const part = (name: string) => element.querySelector<HTMLElement>(`[data-part="${name}"]`);
    const sliders = (["square", "hue", "alpha"] as const).map((area) => [area, part(area)] as const);
    const square = part("square");
    const squareThumb = part("squareThumb");
    const hueThumb = part("hueThumb");
    const alphaFill = part("alphaFill");
    const alphaThumb = part("alphaThumb");
    const preview = part("preview");
    const paint = () => {
      const { color, dragging } = store.getState();
      const rgba = rgbaOf(color);
      const solid = formatHexColor({ ...rgba, a: 1 });
      square?.style.setProperty("background-color", formatHexColor({ ...hsvToRgb({ h: color.h, s: 1, v: 1 }), a: 1 }));
      squareThumb?.style.setProperty("left", `${color.s * 100}%`);
      squareThumb?.style.setProperty("top", `${(1 - color.v) * 100}%`);
      hueThumb?.style.setProperty("left", `${(color.h / 360) * 100}%`);
      alphaFill?.style.setProperty("background-image", `linear-gradient(to right, transparent, ${solid})`);
      alphaThumb?.style.setProperty("left", `${color.a * 100}%`);
      preview?.style.setProperty("--swatch-color", formatHexColor(rgba));
      for (const [area, slider] of sliders) {
        const { now, text } = sliderValue(color, area);
        slider?.setAttribute("aria-valuenow", String(now));
        slider?.setAttribute("aria-valuetext", text);
      }
      // The hex field is a commit-mode text field: it renders when a pick ends, never during a drag (P1).
      if (!dragging) setHex(formatHexColor(rgba));
    };
    paint();
    return store.subscribe(paint);
  }, [anchor, store]);

  useDismiss([panel], onClose);
  // The keyboard comes in on open (the hex field), and goes back to the swatch when the picker closes
  // with it inside (Esc, a pick that closes it); a press elsewhere keeps the focus it moved. Checked once
  // the picker has left the page: a dev StrictMode remount keeps it there, and nothing moves.
  useLayoutEffect(() => {
    const element = panel.current;
    element?.querySelector<HTMLInputElement>('input[aria-label="Hex"]')?.focus({ preventScroll: true });
    return () => {
      if (!element?.contains(document.activeElement)) return;
      queueMicrotask(() => {
        if (!element.isConnected && anchor.isConnected) anchor.focus({ preventScroll: true });
      });
    };
  }, [anchor]);
  // Closed or unmounted mid-drag (Esc, the selection changed): the preview ends, nothing is committed (P2).
  useLayoutEffect(
    () => () => {
      const { dragging, onPreview } = store.getState();
      if (dragging) onPreview?.(null);
    },
    [store],
  );

  const onAreaDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const element = event.currentTarget;
    element.setPointerCapture?.(event.pointerId);
    pick(store, colorAt(store.getState().color, element.dataset.part as Area, element, event.clientX, event.clientY), "preview");
  };
  const onAreaMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    if (!store.getState().dragging || !element.hasPointerCapture?.(event.pointerId)) return;
    pick(store, colorAt(store.getState().color, element.dataset.part as Area, element, event.clientX, event.clientY), "preview");
  };
  const onAreaUp = () => {
    if (store.getState().dragging) pick(store, store.getState().color, "commit");
  };
  // A key on a focused area: one pick (one command), as a typed channel value is.
  const onAreaKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || store.getState().dragging) return;
    const next = stepColor(store.getState().color, event.currentTarget.dataset.part as Area, event.key, event.shiftKey);
    if (!next) return;
    event.preventDefault();
    pick(store, next, "commit");
  };
  const area = { tabIndex: 0, role: "slider", onPointerDown: onAreaDown, onPointerMove: onAreaMove, onPointerUp: onAreaUp, onPointerCancel: onAreaUp, onKeyDown: onAreaKey };
  // Tab and Shift+Tab cycle inside the picker: it is portalled to the end of the page, where Tab would leave it.
  const onPanelKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const element = panel.current;
    if (event.key !== "Tab" || !element) return;
    const items = [...element.querySelectorAll<HTMLElement>(TABBABLE)];
    const first = items[0];
    const last = items.at(-1);
    if (!first || !last) return;
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (event.shiftKey ? at <= 0 : at === items.length - 1 || at < 0) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    }
  };

  const Dropper = eyeDropper();
  const sample = () => {
    if (!Dropper) return;
    new Dropper()
      .open()
      .then(({ sRGBHex }) => {
        const color = parseHexColor(sRGBHex);
        if (color) pick(store, { ...rgbToHsv(color), a: store.getState().color.a }, "commit");
      })
      // Esc closes the eyedropper with an AbortError: nothing picked.
      .catch(() => undefined);
  };
  const pickHex = (text: string) => {
    const color = parseHexColor(text);
    if (color) pick(store, { ...rgbToHsv(color), a: color.a }, "commit");
  };

  return createPortal(
    <div ref={panel} className={styles.picker} role="dialog" aria-label="Color picker" data-control="" onKeyDown={onPanelKey}>
      <div className={styles.square} data-part="square" aria-label="Saturation and brightness" aria-valuemin={0} aria-valuemax={100} {...area}>
        <div className={styles.thumb} data-part="squareThumb" />
      </div>
      <div className={styles.strip} data-part="hue" data-kind="hue" aria-label="Hue" aria-valuemin={0} aria-valuemax={360} {...area}>
        <div className={styles.stripThumb} data-part="hueThumb" />
      </div>
      <div className={styles.strip} data-part="alpha" data-kind="alpha" aria-label="Opacity" aria-valuemin={0} aria-valuemax={100} {...area}>
        <div className={styles.alphaFill} data-part="alphaFill" />
        <div className={styles.stripThumb} data-part="alphaThumb" />
      </div>
      <div className={styles.row}>
        <div className={styles.preview} data-part="preview" aria-hidden="true" />
        <TextField value={hex} onCommit={pickHex} ariaLabel="Hex" mono maxLength={9} />
        {Dropper && <IconButton control icon={Pipette} label="Pick a color from the screen" onClick={sample} />}
      </div>
      <div className={styles.channels}>
        {(["R", "G", "B", "A"] as const).map((name, index) => (
          <NumberField key={name} label={name} binding={bindings[index] as NumberBinding} min={0} max={name === "A" ? 100 : 255} ariaLabel={name === "A" ? "Alpha (%)" : name} />
        ))}
      </div>
      {recent.length > 0 && (
        <div className={styles.recent} role="radiogroup" aria-label="Recent colors">
          <Swatches swatches={recent.map((color) => ({ id: color, label: color, color }))} onPick={pickHex} />
        </div>
      )}
    </div>,
    document.body,
  );
}
