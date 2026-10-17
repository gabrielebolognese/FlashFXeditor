import { Pipette } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
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

interface PickerColor extends Hsv {
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

type Area = "square" | "hue" | "alpha";

/** The picker color under a pointer on one of the areas. */
function colorAt(color: PickerColor, area: Area, element: HTMLElement, clientX: number, clientY: number): PickerColor {
  const rect = element.getBoundingClientRect();
  const x = clamp01((clientX - rect.left) / (rect.width || 1));
  const y = clamp01((clientY - rect.top) / (rect.height || 1));
  if (area === "square") return { ...color, s: x, v: 1 - y };
  if (area === "hue") return { ...color, h: Math.min(359.999, x * 360) };
  return { ...color, a: Math.round(x * 100) / 100 };
}

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
      // The hex field is a commit-mode text field: it renders when a pick ends, never during a drag (P1).
      if (!dragging) setHex(formatHexColor(rgba));
    };
    paint();
    return store.subscribe(paint);
  }, [anchor, store]);

  useDismiss([panel], onClose);
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
  const area = { onPointerDown: onAreaDown, onPointerMove: onAreaMove, onPointerUp: onAreaUp, onPointerCancel: onAreaUp };

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
    <div ref={panel} className={styles.picker} role="dialog" aria-label="Color picker" data-control="">
      <div className={styles.square} data-part="square" {...area}>
        <div className={styles.thumb} data-part="squareThumb" />
      </div>
      <div className={styles.strip} data-part="hue" data-kind="hue" {...area}>
        <div className={styles.stripThumb} data-part="hueThumb" />
      </div>
      <div className={styles.strip} data-part="alpha" data-kind="alpha" {...area}>
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
