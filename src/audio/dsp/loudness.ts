// Loudness after ITU-R BS.1770-4 (spec §21.21, Batch 77): K-weighting (a high shelf and a high-pass),
// 400 ms blocks with 75% overlap, the absolute gate at -70 LUFS and the relative gate 10 LU under the
// mean of what passed it (integrated); the momentary (400 ms) and short-term (3 s) windows of EBU
// R128; and the true peak, from 4x oversampling with a windowed-sinc interpolator (BS.1770 Annex 2).
// Pure and streaming: the live meter feeds it the audio the worklet sees, the export measures the
// whole mixdown with it. Channels: left and right weigh 1 (mono is one channel).

/** A biquad as normalized coefficients (a0 = 1). */
interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/** The two stages of the K-weighting for `sampleRate` (other rates: RBJ forms with BS.1770's f0, gain and Q). */
export function kWeighting(sampleRate: number): [Biquad, Biquad] {
  // At 48 kHz (the project's rate) the exact coefficients of BS.1770-4 table 1.
  if (sampleRate === 48000) {
    return [
      { b0: 1.53512485958697, b1: -2.69169618940638, b2: 1.19839281085285, a1: -1.69065929318241, a2: 0.73248077421585 },
      { b0: 1, b1: -2, b2: 1, a1: -1.99004745483398, a2: 0.99007225036621 },
    ];
  }
  const shelf = (() => {
    const gain = 3.999843853973347;
    const f0 = 1681.9744509555319;
    const q = 0.7071752369554196;
    const A = 10 ** (gain / 40);
    const w0 = (2 * Math.PI * f0) / sampleRate;
    const alpha = Math.sin(w0) / (2 * q);
    const cos = Math.cos(w0);
    const root = 2 * Math.sqrt(A) * alpha;
    const a0 = A + 1 - (A - 1) * cos + root;
    return {
      b0: (A * (A + 1 + (A - 1) * cos + root)) / a0,
      b1: (-2 * A * (A - 1 + (A + 1) * cos)) / a0,
      b2: (A * (A + 1 + (A - 1) * cos - root)) / a0,
      a1: (2 * (A - 1 - (A + 1) * cos)) / a0,
      a2: (A + 1 - (A - 1) * cos - root) / a0,
    };
  })();
  const high = (() => {
    const f0 = 38.13547087602444;
    const q = 0.5003270373238773;
    const w0 = (2 * Math.PI * f0) / sampleRate;
    const alpha = Math.sin(w0) / (2 * q);
    const cos = Math.cos(w0);
    const a0 = 1 + alpha;
    return { b0: (1 + cos) / 2 / a0, b1: -(1 + cos) / a0, b2: (1 + cos) / 2 / a0, a1: (-2 * cos) / a0, a2: (1 - alpha) / a0 };
  })();
  return [shelf, high];
}

/** One channel's K-weighting filter (direct form II transposed, two stages). */
class KFilter {
  private readonly stages: [Biquad, Biquad];
  private z = new Float64Array(4);

  constructor(sampleRate: number) {
    this.stages = kWeighting(sampleRate);
  }

  process(x: number): number {
    let v = x;
    for (let s = 0; s < 2; s++) {
      const c = this.stages[s] as Biquad;
      const i = s * 2;
      const y = c.b0 * v + (this.z[i] as number);
      this.z[i] = c.b1 * v - c.a1 * y + (this.z[i + 1] as number);
      this.z[i + 1] = c.b2 * v - c.a2 * y;
      v = y;
    }
    return v;
  }

  reset(): void {
    this.z = new Float64Array(4);
  }
}

// --- True peak ----------------------------------------------------------------------------------

export const OVERSAMPLE = 4;
/** Input samples each side of an interpolated point (12 taps per phase). */
export const PEAK_SIDE = 6;
const TAIL = 2 * PEAK_SIDE - 1;

/** The interpolator's taps: PHASES[p][j] weighs the input sample j - SIDE + 1 after n for the point n + p/4. */
export const PHASES: readonly Float64Array[] = (() => {
  const phases: Float64Array[] = [];
  for (let p = 0; p < OVERSAMPLE; p++) {
    const taps = new Float64Array(2 * PEAK_SIDE);
    for (let j = 0; j < 2 * PEAK_SIDE; j++) {
      // Distance (input samples) from the point n + p/4 to the input sample n - SIDE + 1 + j.
      const d = j - PEAK_SIDE + 1 - p / OVERSAMPLE;
      const x = Math.PI * d;
      const sinc = d === 0 ? 1 : Math.sin(x) / x;
      const w = 0.5 * (1 + Math.cos((Math.PI * d) / (PEAK_SIDE + 0.5)));
      taps[j] = sinc * w;
    }
    phases.push(taps);
  }
  return phases;
})();

/** The largest sum of |taps| of a phase: no interpolated point is larger than this times the largest sample around it. */
const LEBESGUE = Math.max(...PHASES.map((taps) => taps.reduce((sum, tap) => sum + Math.abs(tap), 0)));

/** An upper bound of the interpolated points after index `n`: the largest |sample| of the taps' span times the taps' absolute sum. */
export function windowBound(x: Float32Array, n: number): number {
  let max = 0;
  for (let j = n - PEAK_SIDE + 1; j <= n + PEAK_SIDE; j++) {
    const a = Math.abs(x[j] as number);
    if (a > max) max = a;
  }
  return max * LEBESGUE;
}

/** The interpolated magnitude at the four points after index `n` of `x` (needs n - SIDE + 1 .. n + SIDE inside it). */
export function pointPeak(x: Float32Array, n: number): number {
  let peak = 0;
  for (let p = 0; p < OVERSAMPLE; p++) {
    const taps = PHASES[p] as Float64Array;
    let y = 0;
    for (let j = 0; j < 2 * PEAK_SIDE; j++) y += (x[n - PEAK_SIDE + 1 + j] as number) * (taps[j] as number);
    const a = Math.abs(y);
    if (a > peak) peak = a;
  }
  return peak;
}

/** Streaming true-peak detector: the largest |interpolated sample| over 4 phases, over every channel. */
export class TruePeak {
  private tails: Float32Array[];
  peak = 0;

  constructor(channels: number) {
    this.tails = Array.from({ length: channels }, () => new Float32Array(TAIL));
  }

  /** Feeds a block (one array per channel); returns the block's true-peak amplitude (linear). */
  push(channels: readonly Float32Array[]): number {
    let blockPeak = 0;
    for (let c = 0; c < channels.length; c++) {
      const data = channels[c] as Float32Array;
      const tail = this.tails[c] as Float32Array;
      const all = new Float32Array(tail.length + data.length);
      all.set(tail);
      all.set(data, tail.length);
      for (let n = PEAK_SIDE - 1; n + PEAK_SIDE < all.length; n++) {
        if (windowBound(all, n) <= blockPeak) continue;
        const a = pointPeak(all, n);
        if (a > blockPeak) blockPeak = a;
      }
      this.tails[c] = all.slice(Math.max(0, all.length - TAIL));
    }
    if (blockPeak > this.peak) this.peak = blockPeak;
    return blockPeak;
  }

  reset(): void {
    this.tails = this.tails.map(() => new Float32Array(TAIL));
    this.peak = 0;
  }
}

export const linearToDb = (x: number) => (x > 0 ? 20 * Math.log10(x) : -Infinity);

// --- Loudness ----------------------------------------------------------------------------------

const ABSOLUTE_GATE = -70;
const RELATIVE_GATE = -10;
const OFFSET = -0.691;
const toLufs = (energy: number) => (energy > 0 ? OFFSET + 10 * Math.log10(energy) : -Infinity);

/** The integrated loudness of block energies (mean squares summed over channels): both gates of BS.1770-4. */
export function gatedLoudness(blocks: readonly number[]): number {
  const loud = blocks.filter((energy) => toLufs(energy) > ABSOLUTE_GATE);
  if (loud.length === 0) return -Infinity;
  const mean = loud.reduce((sum, energy) => sum + energy, 0) / loud.length;
  const gate = toLufs(mean) + RELATIVE_GATE;
  const kept = loud.filter((energy) => toLufs(energy) > gate);
  if (kept.length === 0) return -Infinity;
  return toLufs(kept.reduce((sum, energy) => sum + energy, 0) / kept.length);
}

export interface LoudnessReading {
  /** LUFS over the last 400 ms (-Infinity before 400 ms of audio). */
  momentary: number;
  /** LUFS over the last 3 s (-Infinity before 3 s). */
  shortTerm: number;
  /** LUFS over everything pushed, gated. */
  integrated: number;
  /** dBTP of everything pushed. */
  truePeakDb: number;
}

/** Streaming loudness meter: `push` blocks of any length, read the three windows and the true peak at any time. */
export class LoudnessMeter {
  private readonly filters: KFilter[];
  private readonly peak: TruePeak;
  private readonly hop: number;
  /** Mean squares (summed over channels) of the latest completed 100 ms steps. */
  private steps: number[] = [];
  private blocks: number[] = [];
  private acc = 0;
  private filled = 0;

  constructor(readonly sampleRate: number, readonly channelCount: number) {
    this.filters = Array.from({ length: channelCount }, () => new KFilter(sampleRate));
    this.peak = new TruePeak(channelCount);
    this.hop = Math.round(sampleRate / 10);
  }

  push(channels: readonly Float32Array[]): void {
    this.peak.push(channels);
    const length = (channels[0] as Float32Array).length;
    for (let i = 0; i < length; i++) {
      for (let c = 0; c < this.channelCount; c++) {
        const y = (this.filters[c] as KFilter).process((channels[c] as Float32Array)[i] as number);
        this.acc += y * y;
      }
      if (++this.filled === this.hop) {
        this.steps.push(this.acc / this.hop);
        this.acc = 0;
        this.filled = 0;
        const n = this.steps.length;
        if (n >= 4) this.blocks.push(((this.steps[n - 1] as number) + (this.steps[n - 2] as number) + (this.steps[n - 3] as number) + (this.steps[n - 4] as number)) / 4);
        // Only the last 3 s of steps are read again.
        if (n > 300) this.steps = this.steps.slice(-30);
      }
    }
  }

  reading(): LoudnessReading {
    const n = this.steps.length;
    const mean = (count: number) => {
      let sum = 0;
      for (let i = n - count; i < n; i++) sum += this.steps[i] as number;
      return sum / count;
    };
    return {
      momentary: n >= 4 ? toLufs(mean(4)) : -Infinity,
      shortTerm: n >= 30 ? toLufs(mean(30)) : -Infinity,
      integrated: gatedLoudness(this.blocks),
      truePeakDb: linearToDb(this.peak.peak),
    };
  }

  reset(): void {
    this.steps = [];
    this.blocks = [];
    this.acc = 0;
    this.filled = 0;
    this.peak.reset();
    for (const filter of this.filters) filter.reset();
  }
}

export interface Measurement {
  integrated: number;
  truePeakDb: number;
  /** The highest momentary and short-term values. */
  momentaryMax: number;
  shortTermMax: number;
}

/** Measures whole channels (one array each) in one go. */
export function measureLoudness(channels: readonly Float32Array[], sampleRate: number): Measurement {
  const meter = new LoudnessMeter(sampleRate, channels.length);
  const length = (channels[0] as Float32Array).length;
  const chunk = Math.round(sampleRate / 10);
  let momentaryMax = -Infinity;
  let shortTermMax = -Infinity;
  for (let at = 0; at < length; at += chunk) {
    meter.push(channels.map((channel) => channel.subarray(at, Math.min(length, at + chunk))));
    const reading = meter.reading();
    if (reading.momentary > momentaryMax) momentaryMax = reading.momentary;
    if (reading.shortTerm > shortTermMax) shortTermMax = reading.shortTerm;
  }
  // Flush the interpolator's look-ahead.
  meter.push(channels.map(() => new Float32Array(PEAK_SIDE)));
  const reading = meter.reading();
  return { integrated: reading.integrated, truePeakDb: reading.truePeakDb, momentaryMax, shortTermMax };
}
