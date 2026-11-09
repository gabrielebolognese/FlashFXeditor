// Export loudness (spec §21.21, Batch 77), run by export.worker on the mixdown before it is encoded:
// the target of the project (or none), the measurement and the limiter (audio/dsp/normalize.ts), and
// the numbers the export log shows.
import { normalizeLoudness } from "../audio/dsp/normalize.js";
import type { LoudnessTarget } from "../core/document/types.js";

/** What the worker reports about the normalization (LUFS and dBTP; gain in dB). */
export interface LoudnessReport {
  beforeLufs: number;
  afterLufs: number;
  truePeakDb: number;
  gainDb: number;
}

/**
 * The planes brought to `target` (new arrays; the input is kept), with the report; the planes
 * unchanged and no report when there is no target or nothing is heard.
 */
export function applyExportLoudness(planes: readonly Float32Array[], sampleRate: number, target: LoudnessTarget | null | undefined): { planes: Float32Array[]; report: LoudnessReport | null } {
  if (!target || planes.length === 0) return { planes: [...planes], report: null };
  const result = normalizeLoudness(planes, sampleRate, target);
  if (!Number.isFinite(result.before.integrated)) return { planes: [...planes], report: null };
  return {
    planes: result.channels,
    report: { beforeLufs: result.before.integrated, afterLufs: result.after.integrated, truePeakDb: result.after.truePeakDb, gainDb: result.gainDb },
  };
}

/** The log line of a report: "-20.1 → -14.0 LUFS, peak -1.2 dBTP". */
export function loudnessText(report: LoudnessReport): string {
  const f = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : "-inf");
  return `${f(report.beforeLufs)} → ${f(report.afterLufs)} LUFS, peak ${f(report.truePeakDb)} dBTP`;
}
