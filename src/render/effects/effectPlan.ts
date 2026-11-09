// The passes of one effect stage (spec §21.19, Batch 74), planned once for both backends: the clip's picture
// in its content box (buffer 0), kept where its masks cover it, then each effect's passes in order. Passes
// ping-pong between three scratch buffers (0..2, pooled textures of the stage's size); the last pass writes
// FX_BUFFER.out (the stage's own texture, kept for the cache). A pass reads `src`, and `orig` (the effect's
// input, or the mask coverage, or a LUT texture: FX_BUFFER.lut with the pass's `lut` handle) when it composites.
// An adjustment's stage (spec §21.20, Batch 76) starts from FX_BUFFER.backdrop (the target drawn so far, the
// frame its box): when an effect reads neighbors, a first crop pass makes it transparent past the frame, so
// the effects see what an export of the frame sees. No allocation once warm. Pure.
import { EFFECT_BLOCK, effectTypeOf } from "../../core/effects/effectEval.js";
import { EFFECT_REGISTRY, FX_FLOATS, FX_PROGRAM, FX_SLOT, type FxProgram, type PassWriter } from "./registry.js";

/** Buffers besides the scratch ones (0..2): the stage's output texture, the clip's mask coverage and a LUT (Batch 75). */
export const FX_BUFFER = { out: 3, coverage: 4, lut: 5, backdrop: 6 } as const;

/** What a stage's plan needs: its size (stage px), the content box in it, stage px per content px, the packed stack. */
export interface StagePlanInput {
  width: number;
  height: number;
  /** The content box in stage px: x0, y0, x1, y1. */
  rect: readonly [number, number, number, number];
  scale: number;
  data: Float32Array;
  length: number;
  masked: boolean;
  /** An adjustment's stage: the passes read FX_BUFFER.backdrop first (cropped to `rect` when an effect reads neighbors). */
  adjust?: boolean;
}

export class EffectPlan implements PassWriter {
  /** Passes of the last `build`. */
  count = 0;
  /** Each pass's uniform floats (FX_FLOATS per pass). */
  data = new Float32Array(FX_FLOATS * 8);
  readonly src: number[] = [];
  readonly orig: number[] = [];
  readonly dst: number[] = [];
  /** Each pass's LUT handle (0 for every pass but a LUT pass). */
  readonly lut: number[] = [];
  private views: Float32Array[] = [];
  /** The effect's input buffer and the buffer the last pass wrote. */
  private input = 0;
  private last = 0;
  private stage: StagePlanInput | null = null;

  /** Plans the passes of `stage` and returns how many. */
  build(stage: StagePlanInput): number {
    this.count = 0;
    this.input = stage.adjust ? FX_BUFFER.backdrop : 0;
    this.last = this.input;
    this.stage = stage;
    if (stage.adjust && readsNeighbors(stage.data, stage.length)) {
      // Transparent past the frame (fs: size.w set), the frame's pixels copied.
      this.pass(FX_PROGRAM.crop, false)[FX_SLOT.size + 3] = 1;
      this.input = this.last;
    }
    if (stage.masked) {
      this.pass(FX_PROGRAM.mask, true, FX_BUFFER.coverage);
      this.input = this.last;
    }
    for (let o = 0; o + EFFECT_BLOCK <= stage.length; o += EFFECT_BLOCK) {
      const type = effectTypeOf(stage.data[o] as number);
      if (!type) continue;
      EFFECT_REGISTRY[type].passes(this, stage.data, o, stage.scale);
      this.input = this.last;
    }
    if (this.count > 0) this.dst[this.count - 1] = FX_BUFFER.out;
    this.stage = null;
    return this.count;
  }

  /** The uniform floats of pass `index` (a view kept across builds). */
  uniform(index: number): Float32Array {
    return this.views[index] as Float32Array;
  }

  lutPass(handle: number): Float32Array {
    const u = this.pass(FX_PROGRAM.lut, false, FX_BUFFER.lut);
    this.lut[this.count - 1] = handle;
    return u;
  }

  /** Adds a pass of `program` reading the last pass's output (and `orig`: the effect's input, or `origBuffer`) and returns its uniform floats. */
  pass(program: FxProgram, withInput: boolean, origBuffer?: number): Float32Array {
    const index = this.count;
    this.count += 1;
    if (this.data.length < this.count * FX_FLOATS) {
      const grown = new Float32Array(this.data.length * 2);
      grown.set(this.data);
      this.data = grown;
      this.views = [];
    }
    for (let i = this.views.length; i < this.data.length / FX_FLOATS; i++) this.views.push(this.data.subarray(i * FX_FLOATS, (i + 1) * FX_FLOATS));
    const src = this.last;
    const orig = origBuffer ?? (withInput ? this.input : src);
    let dst = 0;
    while (dst === src || dst === orig) dst += 1;
    this.src[index] = src;
    this.orig[index] = orig;
    this.dst[index] = dst;
    this.lut[index] = 0;
    this.last = dst;
    const u = this.views[index] as Float32Array;
    u.fill(0);
    const stage = this.stage as StagePlanInput;
    u[FX_SLOT.size] = stage.width;
    u[FX_SLOT.size + 1] = stage.height;
    u[FX_SLOT.size + 2] = program;
    for (let i = 0; i < 4; i++) u[FX_SLOT.rect + i] = stage.rect[i] as number;
    u[FX_SLOT.c + 1] = 1;
    return u;
  }
}

/** Whether an enabled effect of the packed stack reads pixels other than its own (EFFECT_REGISTRY `neighbors`). */
export function readsNeighbors(data: Float32Array, length: number): boolean {
  for (let o = 0; o + EFFECT_BLOCK <= length; o += EFFECT_BLOCK) {
    const type = effectTypeOf(data[o] as number);
    if (type && EFFECT_REGISTRY[type].neighbors) return true;
  }
  return false;
}
