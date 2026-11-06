// The time remap graph of the Speed section (spec §21.22, Batch 78): the clip's source time against its frames,
// drawn on the single FrameScheduler, with draggable keys. Framework-free: the component hands over the canvas.
// A drag writes ephemeral keys (drawn here) and commits one command on release (P2); a double click on the curve
// adds a key, on a key removes it. The first and last key keep their frames (0 and the duration) and move only
// vertically. Never React state (P1).
import { remapUs, type RemapKey } from "../../core/document/timeRemap.js";
import type { Frame, MediaClip, Us } from "../../core/document/types.js";
import type { FrameScheduler, RenderView } from "../../core/scheduler/FrameScheduler.js";

export interface RemapGraphColors {
  background: string;
  grid: string;
  curve: string;
  key: string;
  keyActive: string;
  playhead: string;
}

export interface RemapGraphDeps {
  clip(): MediaClip | null;
  mediaDurationUs(): Us;
  /** The playhead as a frame relative to the clip, or null when it is outside. */
  playhead(): Frame | null;
  commit(keys: RemapKey[], label: string): void;
  colors(): RemapGraphColors;
  /** Key square size and hit radius, CSS px (tokens). */
  size: { key: number; pad: number };
}

/** The graph's mapping between (frame, source us) and CSS px, inside `pad` on every side. */
export interface GraphBox {
  width: number;
  height: number;
  pad: number;
  duration: Frame;
  minUs: Us;
  maxUs: Us;
}

export const frameToX = (box: GraphBox, frame: number) => box.pad + (frame / box.duration) * (box.width - 2 * box.pad);
export const xToFrame = (box: GraphBox, x: number) => ((x - box.pad) / (box.width - 2 * box.pad)) * box.duration;
export const usToY = (box: GraphBox, us: number) => box.height - box.pad - ((us - box.minUs) / Math.max(1, box.maxUs - box.minUs)) * (box.height - 2 * box.pad);
export const yToUs = (box: GraphBox, y: number) => box.minUs + ((box.height - box.pad - y) / (box.height - 2 * box.pad)) * Math.max(1, box.maxUs - box.minUs);

/** The vertical range of a curve (its keys, and the curve between them), with a margin so a flat curve still has height. */
export function graphRange(keys: readonly RemapKey[], mediaUs: Us): { minUs: Us; maxUs: Us } {
  let lo = Infinity;
  let hi = -Infinity;
  for (const key of keys) {
    lo = Math.min(lo, key.sourceUs);
    hi = Math.max(hi, key.sourceUs);
  }
  const margin = Math.max(100_000, (hi - lo) * 0.1);
  return { minUs: Math.max(0, lo - margin), maxUs: Math.min(Math.max(mediaUs, hi + 1), hi + margin) };
}

/** `keys` with key `index` moved to (`frame`, `sourceUs`): an inner key stays strictly between its neighbors, the ends keep their frames. */
export function movedKey(keys: readonly RemapKey[], index: number, frame: number, sourceUs: number, maxUs: Us): RemapKey[] {
  const last = keys.length - 1;
  const key = keys[index] as RemapKey;
  const at = index === 0 || index === last ? key.frame : Math.min((keys[index + 1] as RemapKey).frame - 1, Math.max((keys[index - 1] as RemapKey).frame + 1, Math.round(frame)));
  const us = Math.min(Math.max(0, maxUs - 1), Math.max(0, Math.round(sourceUs)));
  return keys.map((k, i) => (i === index ? { ...k, frame: at, sourceUs: us } : { ...k }));
}

/** `keys` with a key added on the curve at `frame` (null: a key is already there, or it is an end). */
export function addedKey(keys: readonly RemapKey[], frame: number): RemapKey[] | null {
  const f = Math.round(frame);
  if (f <= 0 || f >= (keys[keys.length - 1] as RemapKey).frame || keys.some((key) => key.frame === f)) return null;
  const next = keys.map((key) => ({ ...key }));
  next.push({ frame: f, sourceUs: remapUs(keys, f), ease: "linear" });
  return next.sort((a, b) => a.frame - b.frame);
}

/** `keys` without the inner key `index` (null: an end key, or only two keys). */
export function removedKey(keys: readonly RemapKey[], index: number): RemapKey[] | null {
  if (keys.length <= 2 || index <= 0 || index >= keys.length - 1) return null;
  return keys.filter((_, i) => i !== index).map((key) => ({ ...key }));
}

export class RemapGraphPainter implements RenderView {
  private readonly unregister: () => void;
  private drag: { index: number; keys: RemapKey[]; pointerId: number } | null = null;
  private hover = -1;

  constructor(
    private readonly scheduler: Pick<FrameScheduler, "register" | "invalidate">,
    private readonly canvas: HTMLCanvasElement,
    private readonly deps: RemapGraphDeps,
    private readonly dpr: () => number = () => window.devicePixelRatio || 1,
  ) {
    this.unregister = scheduler.register("mediaThumbs", this);
    canvas.addEventListener("pointerdown", this.down);
    canvas.addEventListener("pointermove", this.move);
    canvas.addEventListener("pointerup", this.up);
    canvas.addEventListener("pointercancel", this.cancel);
    canvas.addEventListener("dblclick", this.double);
    scheduler.invalidate("mediaThumbs");
  }

  /** The clip or the playhead changed: draw again. */
  invalidate(): void {
    this.scheduler.invalidate("mediaThumbs");
  }

  private keys(): RemapKey[] | null {
    return this.drag?.keys ?? this.deps.clip()?.timeRemap ?? null;
  }

  private box(keys: readonly RemapKey[], clip: MediaClip): GraphBox {
    const rect = this.canvas.getBoundingClientRect();
    const { minUs, maxUs } = graphRange(keys, this.deps.mediaDurationUs());
    return { width: rect.width, height: rect.height, pad: this.deps.size.pad, duration: Math.max(1, clip.duration), minUs, maxUs };
  }

  private local(event: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  private keyAt(keys: readonly RemapKey[], box: GraphBox, x: number, y: number): number {
    const radius = this.deps.size.key;
    let best = -1;
    let bestDistance = radius * radius;
    keys.forEach((key, i) => {
      const dx = frameToX(box, key.frame) - x;
      const dy = usToY(box, key.sourceUs) - y;
      const d = dx * dx + dy * dy;
      if (d <= bestDistance) {
        best = i;
        bestDistance = d;
      }
    });
    return best;
  }

  private readonly down = (event: PointerEvent): void => {
    const clip = this.deps.clip();
    const keys = clip?.timeRemap;
    if (!clip || !keys || event.button !== 0) return;
    const at = this.local(event);
    const index = this.keyAt(keys, this.box(keys, clip), at.x, at.y);
    if (index < 0) return;
    this.drag = { index, keys: keys.map((key) => ({ ...key })), pointerId: event.pointerId };
    this.canvas.setPointerCapture(event.pointerId);
    this.invalidate();
  };

  private readonly move = (event: PointerEvent): void => {
    const clip = this.deps.clip();
    const keys = this.keys();
    if (!clip || !keys) return;
    const at = this.local(event);
    const box = this.box(clip.timeRemap ?? keys, clip);
    if (this.drag) {
      const base = clip.timeRemap ?? this.drag.keys;
      this.drag.keys = movedKey(base, this.drag.index, xToFrame(box, at.x), yToUs(box, at.y), this.deps.mediaDurationUs());
      this.invalidate();
      return;
    }
    const hover = this.keyAt(keys, box, at.x, at.y);
    if (hover !== this.hover) {
      this.hover = hover;
      this.canvas.style.cursor = hover >= 0 ? "grab" : "";
      this.invalidate();
    }
  };

  private readonly up = (event: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    this.drag = null;
    this.canvas.releasePointerCapture(event.pointerId);
    const clip = this.deps.clip();
    const changed = clip?.timeRemap && drag.keys.some((key, i) => key.frame !== clip.timeRemap?.[i]?.frame || key.sourceUs !== clip.timeRemap?.[i]?.sourceUs);
    if (changed) this.deps.commit(drag.keys, "Move time remap key");
    this.invalidate();
  };

  private readonly cancel = (event: PointerEvent): void => {
    if (this.drag?.pointerId !== event.pointerId) return;
    this.drag = null;
    this.invalidate();
  };

  private readonly double = (event: MouseEvent): void => {
    const clip = this.deps.clip();
    const keys = clip?.timeRemap;
    if (!clip || !keys) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const box = this.box(keys, clip);
    const index = this.keyAt(keys, box, x, y);
    const next = index >= 0 ? removedKey(keys, index) : addedKey(keys, xToFrame(box, x));
    if (next) this.deps.commit(next, index >= 0 ? "Remove time remap key" : "Add time remap key");
  };

  render(): void {
    const clip = this.deps.clip();
    const keys = this.keys();
    const ctx = this.canvas.getContext("2d");
    const rect = this.canvas.getBoundingClientRect();
    if (!ctx || rect.width <= 0 || rect.height <= 0) return;
    const dpr = this.dpr();
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    const colors = this.deps.colors();
    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, rect.width, rect.height);
    if (!clip || !keys) return;
    const box = this.box(clip.timeRemap ?? keys, clip);
    // The straight line of the clip's first and last source times (what a constant speed would draw).
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(frameToX(box, 0), usToY(box, (keys[0] as RemapKey).sourceUs));
    ctx.lineTo(frameToX(box, box.duration), usToY(box, (keys[keys.length - 1] as RemapKey).sourceUs));
    ctx.stroke();
    const playhead = this.deps.playhead();
    if (playhead !== null) {
      ctx.strokeStyle = colors.playhead;
      ctx.beginPath();
      ctx.moveTo(frameToX(box, playhead), 0);
      ctx.lineTo(frameToX(box, playhead), rect.height);
      ctx.stroke();
    }
    // The curve, a segment per 2 px.
    ctx.strokeStyle = colors.curve;
    ctx.lineWidth = 2;
    ctx.beginPath();
    const x0 = frameToX(box, 0);
    const x1 = frameToX(box, box.duration);
    for (let x = x0; x <= x1; x += 2) {
      const y = usToY(box, remapUs(keys, xToFrame(box, x)));
      if (x === x0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineTo(x1, usToY(box, remapUs(keys, box.duration)));
    ctx.stroke();
    const half = this.deps.size.key / 2;
    keys.forEach((key, i) => {
      ctx.fillStyle = i === this.drag?.index || i === this.hover ? colors.keyActive : colors.key;
      ctx.fillRect(frameToX(box, key.frame) - half, usToY(box, key.sourceUs) - half, this.deps.size.key, this.deps.size.key);
    });
  }

  dispose(): void {
    this.unregister();
    this.canvas.removeEventListener("pointerdown", this.down);
    this.canvas.removeEventListener("pointermove", this.move);
    this.canvas.removeEventListener("pointerup", this.up);
    this.canvas.removeEventListener("pointercancel", this.cancel);
    this.canvas.removeEventListener("dblclick", this.double);
    this.drag = null;
  }
}
