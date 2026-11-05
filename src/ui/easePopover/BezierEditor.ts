import { cubicBezier } from "../../core/document/easings.js";
import { showToast } from "../toasts.js";
import styles from "./BezierEditor.module.css";
import { BEZIER_PRESETS, clampBezier, cssBezier, presetOf, type Bezier } from "./curveMath.js";

// The custom bezier curve editor (spec §21.9, Batch 61), a framework-free class: an SVG plot with the
// diagonal, the curve, two handles on their stems, four number fields, the presets, a Play button and
// `Copy as CSS`. A handle drag is a gesture (P2): the points live in this object while it lasts, the
// SVG attributes and the fields are written directly (no React state), and `onCommit` runs once on
// release (one undo step). An arrow key on a focused handle nudges it and commits at once (the owner
// coalesces the steps). `setPoints` takes outside changes and is ignored while a drag is on.

const SIZE = 100; // viewBox units
const PAD = 8;
const NS = "http://www.w3.org/2000/svg";
const PLAY_MS = 900;

export interface BezierEditorOptions {
  points: Bezier;
  onCommit(points: Bezier): void;
}

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, className?: string): SVGElementTagNameMap[K] {
  const element = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, String(value));
  if (className) element.setAttribute("class", className);
  return element;
}

function html<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

const fieldText = (value: number) => String(Math.round(value * 1000) / 1000 + 0);

export class BezierEditor {
  private points: Bezier;
  private drag: { handle: 0 | 1; pointerId: number; start: Bezier } | null = null;
  private playFrame = 0;
  private yMin = -0.25;
  private yMax = 1.25;
  private readonly root = html("div", styles.root);
  private readonly plot = svg("svg", { viewBox: `0 0 ${SIZE} ${SIZE}`, role: "group", "aria-label": "Bezier curve" }, styles.plot);
  private readonly frame = svg("rect", { x: PAD, width: SIZE - 2 * PAD }, styles.frame);
  private readonly diagonal = svg("line", {}, styles.diagonal);
  private readonly curve = svg("path", {}, styles.curve);
  private readonly stems = [svg("line", {}, styles.stem), svg("line", {}, styles.stem)] as const;
  private readonly handles = [svg("circle", { r: 4, tabindex: 0, role: "slider" }, styles.handle), svg("circle", { r: 4, tabindex: 0, role: "slider" }, styles.handle)] as const;
  private readonly dot = svg("circle", { r: 2.5, visibility: "hidden" }, styles.dot);
  private readonly inputs: HTMLInputElement[] = [];
  private readonly presetButtons: HTMLButtonElement[] = [];
  private readonly cleanups: (() => void)[] = [];

  constructor(
    host: HTMLElement,
    private readonly options: BezierEditorOptions,
  ) {
    this.points = clampBezier(options.points);
    this.build();
    this.render();
    host.append(this.root);
  }

  /** An outside change of the points (ignored while a handle is dragged). */
  setPoints(points: Bezier): void {
    if (this.drag) return;
    const next = clampBezier(points);
    if (next.every((value, index) => value === this.points[index])) return;
    this.points = next;
    this.render();
  }

  getPoints(): Bezier {
    return [...this.points];
  }

  destroy(): void {
    cancelAnimationFrame(this.playFrame);
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups.length = 0;
    this.root.remove();
  }

  // --- Construction ----------------------------------------------------------------------------

  private listen<T extends EventTarget, E extends Event>(target: T, type: string, handler: (event: E) => void): void {
    target.addEventListener(type, handler as EventListener);
    this.cleanups.push(() => target.removeEventListener(type, handler as EventListener));
  }

  private build(): void {
    this.plot.append(this.frame, this.diagonal, this.stems[0], this.stems[1], this.curve, this.dot, this.handles[0], this.handles[1]);
    this.handles.forEach((handle, index) => {
      const which = index as 0 | 1;
      handle.setAttribute("aria-label", `Control point ${index + 1}`);
      handle.setAttribute("aria-valuemin", "0");
      handle.setAttribute("aria-valuemax", "1");
      this.listen(handle, "pointerdown", (event: PointerEvent) => this.startDrag(event, which));
      this.listen(handle, "pointermove", (event: PointerEvent) => this.moveDrag(event));
      this.listen(handle, "pointerup", (event: PointerEvent) => this.endDrag(event, true));
      this.listen(handle, "pointercancel", (event: PointerEvent) => this.endDrag(event, false));
      this.listen(handle, "keydown", (event: KeyboardEvent) => this.nudge(event, which));
    });
    this.root.append(this.plot);

    const fields = html("div", styles.fields);
    (["x1", "y1", "x2", "y2"] as const).forEach((name, index) => {
      const label = html("label", styles.field);
      label.append(html("span", styles.fieldName, name));
      const input = html("input", styles.input);
      input.type = "text";
      input.inputMode = "decimal";
      input.setAttribute("aria-label", `Bezier ${name}`);
      input.spellcheck = false;
      this.listen(input, "keydown", (event: KeyboardEvent) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          this.commitField(index, input);
        } else if (event.key === "Escape" && input.value !== fieldText(this.points[index] ?? 0)) {
          event.stopPropagation();
          input.value = fieldText(this.points[index] ?? 0);
        }
      });
      this.listen(input, "blur", () => this.commitField(index, input));
      this.inputs.push(input);
      label.append(input);
      fields.append(label);
    });
    this.root.append(fields);

    const presets = html("div", styles.presets);
    for (const preset of BEZIER_PRESETS) {
      const button = html("button", styles.chip, preset.name);
      button.type = "button";
      button.dataset.preset = preset.id;
      button.setAttribute("aria-label", `${preset.name} (${cssBezier(preset.points)})`);
      this.listen(button, "mousedown", (event: MouseEvent) => event.preventDefault());
      this.listen(button, "click", () => this.apply([...preset.points] as Bezier));
      this.presetButtons.push(button);
      presets.append(button);
    }
    this.root.append(presets);

    const actions = html("div", styles.actions);
    const play = html("button", styles.chip, "Play");
    play.type = "button";
    play.setAttribute("aria-label", "Preview the curve");
    this.listen(play, "mousedown", (event: MouseEvent) => event.preventDefault());
    this.listen(play, "click", () => this.play());
    const copy = html("button", styles.chip, "Copy as CSS");
    copy.type = "button";
    this.listen(copy, "mousedown", (event: MouseEvent) => event.preventDefault());
    this.listen(copy, "click", () => void this.copyCss());
    actions.append(play, copy);
    this.root.append(actions);
  }

  // --- Drawing (direct writes) -------------------------------------------------------------------

  private px(value: number): number {
    return PAD + value * (SIZE - 2 * PAD);
  }

  private py(value: number): number {
    return PAD + (1 - (value - this.yMin) / (this.yMax - this.yMin)) * (SIZE - 2 * PAD);
  }

  /** The vertical range shown: at least -0.25..1.25, wider when a handle reaches out (fixed during a drag). */
  private fitRange(): void {
    this.yMin = Math.min(-0.25, this.points[1] - 0.25, this.points[3] - 0.25);
    this.yMax = Math.max(1.25, this.points[1] + 0.25, this.points[3] + 0.25);
  }

  private render(): void {
    if (!this.drag) this.fitRange();
    const [x1, y1, x2, y2] = this.points;
    this.frame.setAttribute("y", String(this.py(this.yMax)));
    this.frame.setAttribute("height", String(this.py(this.yMin) - this.py(this.yMax)));
    this.diagonal.setAttribute("x1", String(this.px(0)));
    this.diagonal.setAttribute("y1", String(this.py(0)));
    this.diagonal.setAttribute("x2", String(this.px(1)));
    this.diagonal.setAttribute("y2", String(this.py(1)));
    const ends: readonly [number, number][] = [
      [this.px(0), this.py(0)],
      [this.px(1), this.py(1)],
    ];
    const controls: readonly [number, number][] = [
      [x1, y1],
      [x2, y2],
    ];
    this.curve.setAttribute("d", `M${ends[0]?.[0]} ${ends[0]?.[1]}C${this.px(x1)} ${this.py(y1)} ${this.px(x2)} ${this.py(y2)} ${ends[1]?.[0]} ${ends[1]?.[1]}`);
    for (let i = 0; i < 2; i += 1) {
      const [cx, cy] = controls[i] as [number, number];
      const [ex, ey] = ends[i] as [number, number];
      const handle = this.handles[i] as SVGCircleElement;
      const stem = this.stems[i] as SVGLineElement;
      handle.setAttribute("cx", String(this.px(cx)));
      handle.setAttribute("cy", String(this.py(cy)));
      handle.setAttribute("aria-valuenow", fieldText(cx));
      handle.setAttribute("aria-valuetext", `x ${fieldText(cx)}, y ${fieldText(cy)}`);
      stem.setAttribute("x1", String(ex));
      stem.setAttribute("y1", String(ey));
      stem.setAttribute("x2", String(this.px(cx)));
      stem.setAttribute("y2", String(this.py(cy)));
    }
    this.inputs.forEach((input, index) => {
      if (document.activeElement !== input) input.value = fieldText(this.points[index] ?? 0);
    });
    const preset = presetOf(this.points);
    this.presetButtons.forEach((button) => button.setAttribute("aria-pressed", String(preset?.id === button.dataset.preset)));
  }

  // --- Gestures ----------------------------------------------------------------------------------

  private startDrag(event: PointerEvent, handle: 0 | 1): void {
    if (event.button !== 0) return;
    event.preventDefault();
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    (event.currentTarget as SVGElement).focus?.();
    this.drag = { handle, pointerId: event.pointerId, start: [...this.points] };
  }

  private moveDrag(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const rect = this.plot.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const ux = ((event.clientX - rect.left) / rect.width) * SIZE;
    const uy = ((event.clientY - rect.top) / rect.height) * SIZE;
    const x = (ux - PAD) / (SIZE - 2 * PAD);
    const y = this.yMin + (1 - (uy - PAD) / (SIZE - 2 * PAD)) * (this.yMax - this.yMin);
    const next: Bezier = [...this.points];
    next[drag.handle * 2] = x;
    next[drag.handle * 2 + 1] = y;
    this.points = clampBezier(next);
    this.render();
  }

  private endDrag(event: PointerEvent, commit: boolean): void {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    this.drag = null;
    (event.currentTarget as Element).releasePointerCapture?.(event.pointerId);
    if (!commit) this.points = drag.start;
    this.render();
    if (commit && this.points.some((value, index) => value !== drag.start[index])) this.options.onCommit([...this.points] as Bezier);
  }

  private nudge(event: KeyboardEvent, handle: 0 | 1): void {
    const delta = event.shiftKey ? 0.1 : 0.01;
    const step: Partial<Record<string, [number, number]>> = { ArrowLeft: [-delta, 0], ArrowRight: [delta, 0], ArrowUp: [0, delta], ArrowDown: [0, -delta] };
    const move = step[event.key];
    if (!move) return;
    event.preventDefault();
    event.stopPropagation();
    const next: Bezier = [...this.points];
    next[handle * 2] = (next[handle * 2] ?? 0) + move[0];
    next[handle * 2 + 1] = (next[handle * 2 + 1] ?? 0) + move[1];
    this.apply(next);
  }

  private commitField(index: number, input: HTMLInputElement): void {
    const text = input.value.trim().replace(",", ".");
    const value = Number(text);
    if (text === "" || !Number.isFinite(value)) {
      input.value = fieldText(this.points[index] ?? 0);
      return;
    }
    const next: Bezier = [...this.points];
    next[index] = value;
    this.apply(next);
    input.value = fieldText(this.points[index] ?? 0);
  }

  /** Takes `next` (clamped) as the points and reports it when it changed. */
  private apply(next: Bezier): void {
    const clamped = clampBezier(next);
    if (clamped.every((value, index) => value === this.points[index])) return;
    this.points = clamped;
    this.render();
    this.options.onCommit([...clamped] as Bezier);
  }

  private async copyCss(): Promise<void> {
    const text = cssBezier(this.points);
    try {
      await navigator.clipboard.writeText(text);
      showToast({ tone: "success", message: `Copied ${text}` });
    } catch {
      showToast({ tone: "error", message: "Could not copy to the clipboard" });
    }
  }

  /** One run of the dot along the curve (a rAF loop of PLAY_MS; none with reduced motion). */
  private play(): void {
    cancelAnimationFrame(this.playFrame);
    if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const [x1, y1, x2, y2] = this.points;
    const startedAt = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - startedAt) / PLAY_MS);
      const progress = t >= 1 ? 1 : cubicBezier(t, x1, y1, x2, y2);
      this.dot.setAttribute("visibility", t >= 1 ? "hidden" : "visible");
      this.dot.setAttribute("cx", String(this.px(t)));
      this.dot.setAttribute("cy", String(this.py(progress)));
      if (t < 1) this.playFrame = requestAnimationFrame(step);
    };
    this.playFrame = requestAnimationFrame(step);
  }
}
