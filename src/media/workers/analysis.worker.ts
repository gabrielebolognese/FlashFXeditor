// analysis.worker entry (spec §3.5, §9.6): waveform peaks from PCM the main thread transfers (the
// worker never decodes audio). Low priority work, one request at a time.
// TODO(batch 17): thumbnail sprite sheets. TODO(batch 38): silence detection from the peaks.
import { buildPeaks, peaksLevel0, writePeaksFile } from "../cache/peaks.js";
import { WorkerHost, type HostScope } from "./WorkerHost.js";

new WorkerHost(
  self as unknown as HostScope,
  {
    peaksLevel0: async ({ channels }) => peaksLevel0(channels.map((buffer) => new Float32Array(buffer))).buffer as ArrayBuffer,
    peaksFile: async ({ level0, sampleRate, frames, channels, stamp }) => writePeaksFile(buildPeaks(new Int8Array(level0), { sampleRate, frames, channels }), stamp),
  },
  1,
);
