// Draws the Transition section's Preview row inside the single render loop (spec §3.4, P3, Batch 71
// review): the selected kind at its midpoint, or the hovered chip's kind looping while the pointer
// rests on it. Hover writes a store (never React state, P1); this class follows it and keeps asking the
// scheduler for the next frame only while a hovered kind animates. Framework-free: the component hands
// over its canvas, the selected kind and the colors.
import type { TransitionKind } from "../../core/document/types.js";
import type { FrameScheduler, RenderView } from "../../core/scheduler/FrameScheduler.js";
import type { SampleColors } from "./transitionSample.js";

/** One loop of the hover animation. */
export const SAMPLE_LOOP_MS = 1200;

export type DrawSample = (ctx: CanvasRenderingContext2D, kind: TransitionKind, t: number, width: number, height: number, colors: SampleColors) => void;

export class TransitionSamplePainter implements RenderView {
  private base: TransitionKind;
  private hovered: TransitionKind | null = null;
  private hoverStart = 0;
  private startPending = false;
  private readonly unregister: () => void;

  constructor(
    private readonly scheduler: Pick<FrameScheduler, "register" | "invalidate">,
    private readonly canvas: HTMLCanvasElement,
    base: TransitionKind,
    private readonly colors: () => SampleColors,
    private readonly draw: DrawSample,
    private readonly dpr: () => number = () => window.devicePixelRatio || 1,
  ) {
    this.base = base;
    this.unregister = scheduler.register("mediaThumbs", this);
    scheduler.invalidate("mediaThumbs");
  }

  /** The kind of the selected transition (shown while nothing is hovered). */
  setBase(kind: TransitionKind): void {
    if (this.base === kind) return;
    this.base = kind;
    this.scheduler.invalidate("mediaThumbs");
  }

  /** The chip kind under the pointer, or null. */
  setHovered(kind: TransitionKind | null): void {
    if (this.hovered === kind) return;
    this.hovered = kind;
    this.startPending = kind !== null;
    this.scheduler.invalidate("mediaThumbs");
  }

  /** True while a hovered kind animates. */
  get animating(): boolean {
    return this.hovered !== null;
  }

  render(time: number): void {
    const box = this.canvas.getBoundingClientRect();
    const ctx = this.canvas.getContext("2d");
    if (!ctx || box.width <= 0 || box.height <= 0) return;
    const dpr = this.dpr();
    const width = Math.max(1, Math.round(box.width * dpr));
    const height = Math.max(1, Math.round(box.height * dpr));
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    if (this.startPending) {
      this.hoverStart = time;
      this.startPending = false;
    }
    const hovered = this.hovered;
    const t = hovered === null ? 0.5 : ((time - this.hoverStart) % SAMPLE_LOOP_MS) / SAMPLE_LOOP_MS;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, box.width, box.height);
    this.draw(ctx, hovered ?? this.base, t, box.width, box.height, this.colors());
    if (hovered !== null) this.scheduler.invalidate("mediaThumbs");
  }

  dispose(): void {
    this.unregister();
    this.hovered = null;
  }
}
