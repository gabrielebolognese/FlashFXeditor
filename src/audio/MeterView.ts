// The stereo peak meter along the preview's right edge (spec §7.8, §14): a framework-free canvas drawn
// through the FrameScheduler's `meters` flag. While audio plays (and until the bars and holds have
// fallen back) every frame reads the mix analysers and redraws; then it stops. Bars in the success
// color up to 0 dBFS and danger above, a hold line, and a clip LED per channel that latches until
// clicked (the strip's reset button). Colors and sizes come from the Theme (no literals).
import { watchDevicePixelRatio } from "../core/scheduler/devicePixelRatio.js";
import type { FrameScheduler, RenderView } from "../core/scheduler/FrameScheduler.js";
import type { ThemeBridge } from "../core/theme/theme.js";
import { METER_FFT_SIZE } from "./AudioMixer.js";
import { FLOOR_DB, meterFraction, PeakMeter } from "./PeakMeter.js";

export interface MeterViewDeps {
  scheduler: Pick<FrameScheduler, "register" | "invalidate">;
  theme: Pick<ThemeBridge, "theme" | "subscribe">;
  /** The mix analysers (left, right); null before the audio graph exists. */
  meters(): readonly [AnalyserNode, AnalyserNode] | null;
  /** True while audio may be playing: the meter reads every frame. */
  active(): boolean;
  /** Seconds (hold timing). */
  now(): number;
}

export class MeterView implements RenderView {
  readonly meter = new PeakMeter();
  /** Frames drawn (dev stats, tests). */
  draws = 0;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private readonly samples = new Float32Array(METER_FFT_SIZE);
  private readonly peaks: [number, number] = [0, 0];

  constructor(private readonly deps: MeterViewDeps) {}

  mount(host: HTMLElement): () => void {
    const canvas = host.ownerDocument.createElement("canvas");
    canvas.style.position = "absolute";
    canvas.style.inset = "0";
    canvas.style.display = "block";
    host.append(canvas);
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    const invalidate = () => this.deps.scheduler.invalidate("meters");
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      this.width = entry.contentRect.width;
      this.height = entry.contentRect.height;
      invalidate();
    });
    observer.observe(host);
    const stops = [this.deps.scheduler.register("meters", this), this.deps.theme.subscribe(invalidate), watchDevicePixelRatio(host.ownerDocument.defaultView, invalidate)];
    invalidate();
    return () => {
      observer.disconnect();
      for (const stop of stops) stop();
      canvas.remove();
      this.canvas = null;
      this.ctx = null;
    };
  }

  /** Playback started: read the analysers from the next frame on. */
  wake(): void {
    this.deps.scheduler.invalidate("meters");
  }

  resetClip(): void {
    this.meter.resetClip();
    this.deps.scheduler.invalidate("meters");
  }

  render(): void {
    const meters = this.deps.meters();
    this.peaks[0] = meters ? this.peakOf(meters[0]) : 0;
    this.peaks[1] = meters ? this.peakOf(meters[1]) : 0;
    const moving = this.meter.update(this.peaks, this.deps.now());
    this.draw();
    if (this.deps.active() || moving) this.deps.scheduler.invalidate("meters");
  }

  private peakOf(analyser: AnalyserNode): number {
    analyser.getFloatTimeDomainData(this.samples);
    let peak = 0;
    for (let i = 0; i < this.samples.length; i++) {
      const value = Math.abs(this.samples[i] as number);
      if (value > peak) peak = value;
    }
    return peak;
  }

  private draw(): void {
    const { canvas, ctx } = this;
    if (!canvas || !ctx) return;
    const dpr = canvas.ownerDocument.defaultView?.devicePixelRatio ?? 1;
    const width = Math.round(this.width * dpr);
    const height = Math.round(this.height * dpr);
    if (width === 0 || height === 0) return;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      canvas.style.width = `${this.width}px`;
      canvas.style.height = `${this.height}px`;
    }
    const theme = this.deps.theme.theme;
    const { color, meter, space } = theme;
    const snap = (value: number) => Math.round(value * dpr) / dpr;
    const line = 1 / dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const total = meter.barWidth * 2 + meter.barGap;
    const left = snap((this.width - total) / 2);
    const ledTop = space[2];
    const top = ledTop + meter.ledHeight + space[1];
    const bottom = this.height - space[2];
    const span = Math.max(0, bottom - top);
    const zero = bottom - meterFraction(0) * span;
    this.meter.channels.forEach((channel, i) => {
      const x = left + i * (meter.barWidth + meter.barGap);
      ctx.fillStyle = channel.clipped ? color.danger : color.surface4;
      ctx.fillRect(x, ledTop, meter.barWidth, meter.ledHeight);
      ctx.fillStyle = color.surface3;
      ctx.fillRect(x, top, meter.barWidth, span);
      if (channel.level > FLOOR_DB) {
        const levelY = snap(bottom - meterFraction(channel.level) * span);
        ctx.fillStyle = color.success;
        ctx.fillRect(x, Math.max(levelY, zero), meter.barWidth, bottom - Math.max(levelY, zero));
        if (levelY < zero) {
          ctx.fillStyle = color.danger;
          ctx.fillRect(x, levelY, meter.barWidth, zero - levelY);
        }
      }
      if (channel.hold > FLOOR_DB) {
        ctx.fillStyle = channel.hold > 0 ? color.danger : color.textPrimary;
        ctx.fillRect(x, snap(bottom - meterFraction(channel.hold) * span), meter.barWidth, line * Math.max(1, Math.round(dpr)));
      }
    });
    // The 0 dBFS mark across both bars.
    ctx.fillStyle = color.border;
    ctx.fillRect(left, snap(zero), total, line);
    this.draws += 1;
  }
}
