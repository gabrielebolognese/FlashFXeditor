// The effect stages of a draw (spec §21.19, Batch 74), shared by both backends: per stage the kept result of
// its clip (P6: static results are cached), redrawn only when the stage's signature changed, and the passes
// of the stages to redraw (planned by effectPlan.ts, their uniforms packed one 256-byte slot per pass). The
// backends allocate the textures and encode the passes. The passes of every adjustment (spec §21.20, Batch 76)
// are planned each draw, after the stages' (never cached: the picture below changes). No allocation once warm.
import { copySignature, newSignature, sameSignature, showEffect, type AdjustInfo, type DrawRecords, type StageInfo, type StageSignature } from "../gpu/drawRecords.js";
import type { TextureHandle } from "../gpu/renderer.js";
import { EffectPlan, FX_BUFFER, type StagePlanInput } from "./effectPlan.js";
import { FX_FLOATS } from "./registry.js";

/** Bytes between two passes' uniforms (WebGPU's dynamic offset alignment). */
export const FX_PASS_STRIDE = 256;
const STRIDE_FLOATS = FX_PASS_STRIDE / 4;

/** A clip's kept stage result: the signature it was drawn with and its texture (at least the stage's size). */
export interface StageEntry<T> {
  clipId: string;
  signature: StageSignature;
  texture: T | null;
  /** The draw that last used it. */
  used: number;
}

/** A stage to redraw in this draw: its content records (role stage, `stage`) and its passes `first` .. `first + count - 1`. */
export interface StageJob<T> {
  stage: number;
  info: StageInfo;
  entry: StageEntry<T>;
  first: number;
  count: number;
}

/** An adjustment's passes in this draw (`first` .. `first + count - 1`; none when `count` is 0). */
export interface AdjustJob {
  info: AdjustInfo | null;
  first: number;
  count: number;
}

export { FX_BUFFER };

export class StageJobs<T extends TextureHandle> {
  readonly entries: StageEntry<T>[] = [];
  /** This draw's stages to redraw (the first `jobCount`). */
  readonly jobs: StageJob<T>[] = [];
  jobCount = 0;
  /** This draw's adjustments: an "adjust" record's `stage` s is `adjustJobs[s - 1]`. */
  readonly adjustJobs: AdjustJob[] = [];
  /** Passes of this draw's jobs, their uniforms (STRIDE_FLOATS per pass) and buffers (FX_BUFFER: 0..2 scratch, out, coverage). */
  passCount = 0;
  data = new Float32Array(STRIDE_FLOATS * 16);
  readonly src: number[] = [];
  readonly orig: number[] = [];
  readonly dst: number[] = [];
  /** Each pass's LUT handle (read when its `orig` is FX_BUFFER.lut). */
  readonly lut: number[] = [];
  private readonly plan = new EffectPlan();

  /**
   * Picks each "effect" record's kept result (or a new entry), points the record at its texture and plans the
   * passes of the stages whose signature changed. `texture` returns a texture of at least w x h for an entry
   * (its own when it fits, else a new one, the old one destroyed).
   */
  prepare(records: DrawRecords<T>, count: number, draws: number, texture: (current: T | null, width: number, height: number) => T): void {
    this.jobCount = 0;
    this.passCount = 0;
    for (let index = 0; index < count; index++) {
      const record = records.at(index);
      if (record.kind !== "effect") continue;
      const info = records.stages[record.stage - 1];
      if (!info) continue;
      let entry: StageEntry<T> | null = null;
      for (const candidate of this.entries) {
        if (candidate.clipId === info.clipId && candidate.used !== draws) {
          entry = candidate;
          break;
        }
      }
      if (!entry) {
        entry = { clipId: info.clipId, signature: newSignature(), texture: null, used: draws };
        this.entries.push(entry);
      }
      entry.used = draws;
      const kept = entry.texture;
      const out = texture(kept, info.width, info.height);
      entry.texture = out;
      if (out !== kept || !sameSignature(entry.signature, info)) {
        copySignature(entry.signature, info);
        this.addJob(record.stage, info, entry);
      }
      showEffect(record, info, out);
    }
    for (let index = 0; index < count; index++) {
      const record = records.at(index);
      if (record.kind !== "adjust") continue;
      const info = records.adjusts[record.stage - 1];
      const job = (this.adjustJobs[record.stage - 1] ??= { info: null, first: 0, count: 0 });
      job.info = info ?? null;
      job.first = this.passCount;
      job.count = info ? this.addPasses({ width: info.width, height: info.height, rect: info.rect, scale: info.scale, data: info.effects.data, length: info.effects.length, masked: false, adjust: true }) : 0;
    }
  }

  /** Forgets entries no draw used for more than `keep` draws (their textures handed to `destroy`). */
  evict(draws: number, keep: number, destroy: (texture: T) => void): void {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const entry = this.entries[i] as StageEntry<T>;
      if (draws - entry.used <= keep) continue;
      if (entry.texture) destroy(entry.texture);
      this.entries.splice(i, 1);
    }
  }

  /** Forgets every entry (their textures handed to `destroy`). */
  clear(destroy: (texture: T) => void): void {
    for (const entry of this.entries.splice(0)) if (entry.texture) destroy(entry.texture);
    this.jobCount = 0;
    this.passCount = 0;
  }

  /** Pass `index`'s uniform floats (FX_FLOATS of them, at index * STRIDE_FLOATS of `data`). */
  offset(index: number): number {
    return index * STRIDE_FLOATS;
  }

  private addJob(stage: number, info: StageInfo, entry: StageEntry<T>): void {
    const first = this.passCount;
    const count = this.addPasses({ width: info.width, height: info.height, rect: info.rect, scale: info.scale, data: info.effects.data, length: info.effects.length, masked: info.mask !== null });
    const job = (this.jobs[this.jobCount] ??= { stage: 0, info, entry, first: 0, count: 0 });
    job.stage = stage;
    job.info = info;
    job.entry = entry;
    job.first = first;
    job.count = count;
    this.jobCount += 1;
  }

  /** Plans `input`'s passes after this draw's others (their uniforms and buffers) and returns how many. */
  private addPasses(input: StagePlanInput): number {
    const count = this.plan.build(input);
    const first = this.passCount;
    const need = (first + count) * STRIDE_FLOATS;
    if (this.data.length < need) {
      const grown = new Float32Array(Math.max(need, 2 * this.data.length));
      grown.set(this.data);
      this.data = grown;
    }
    for (let i = 0; i < count; i++) {
      this.data.set(this.plan.uniform(i), (first + i) * STRIDE_FLOATS);
      this.src[first + i] = this.plan.src[i] as number;
      this.orig[first + i] = this.plan.orig[i] as number;
      this.dst[first + i] = this.plan.dst[i] as number;
      this.lut[first + i] = this.plan.lut[i] as number;
    }
    this.passCount = first + count;
    return count;
  }
}

/** Floats of one pass's uniforms (for the backends' uniform sizes). */
export const FX_UNIFORM_BYTES = FX_FLOATS * 4;
