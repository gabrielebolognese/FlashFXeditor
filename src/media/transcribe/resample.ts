// Sample-rate conversion for transcription (spec §10.6: Whisper takes 16 kHz mono): a windowed-sinc
// low-pass at 90% of the lower Nyquist frequency, Blackman window, ZERO_CROSSINGS lobes on each side,
// evaluated from a table (TABLE_STEPS entries per input sample, linearly interpolated) so a minute of
// 48 kHz audio converts in a fraction of a second. The mix is rendered at 48 kHz instead of 16 kHz
// because the Web Audio resampler of buffer sources interpolates linearly and folds the 8-24 kHz band
// back into the speech band. Pure; runs in transcribe.worker.

const ZERO_CROSSINGS = 16;
const TABLE_STEPS = 128;
/** Cutoff as a fraction of the output's Nyquist frequency. */
const CUTOFF = 0.9;

const tables = new Map<number, Float32Array>();

/** The kernel h(t) for t >= 0 in input samples, every 1 / TABLE_STEPS (fc: the cutoff as a fraction of the input Nyquist frequency). */
function kernelTable(fc: number): Float32Array {
  const known = tables.get(fc);
  if (known) return known;
  const half = ZERO_CROSSINGS / fc;
  const size = Math.ceil(half * TABLE_STEPS) + 2;
  const table = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const t = i / TABLE_STEPS;
    if (t >= half) continue;
    const x = Math.PI * fc * t;
    const sinc = x === 0 ? 1 : Math.sin(x) / x;
    const w = 0.42 + 0.5 * Math.cos((Math.PI * t) / half) + 0.08 * Math.cos((2 * Math.PI * t) / half);
    table[i] = fc * sinc * w;
  }
  tables.set(fc, table);
  return table;
}

/** `input` at `from` Hz as `to` Hz (round(length * to / from) samples). */
export function resample(input: Float32Array, from: number, to: number): Float32Array {
  if (!(from > 0 && to > 0)) throw new Error("resample: sample rates must be positive");
  if (from === to) return input.slice();
  const ratio = from / to;
  const length = Math.round((input.length * to) / from);
  const out = new Float32Array(length);
  const fc = Math.min(1, to / from) * CUTOFF;
  const table = kernelTable(fc);
  const half = ZERO_CROSSINGS / fc;
  const last = input.length - 1;
  for (let k = 0; k < length; k++) {
    const x = k * ratio;
    const first = Math.max(0, Math.ceil(x - half));
    const end = Math.min(last, Math.floor(x + half));
    let sum = 0;
    let weights = 0;
    for (let n = first; n <= end; n++) {
      const at = Math.abs(n - x) * TABLE_STEPS;
      const i = Math.floor(at);
      const f = at - i;
      const w = (table[i] as number) * (1 - f) + (table[i + 1] ?? 0) * f;
      sum += (input[n] as number) * w;
      weights += w;
    }
    // Normalized by the weights: the edges (fewer taps) keep their level.
    out[k] = weights > 0 ? sum / weights : 0;
  }
  return out;
}
