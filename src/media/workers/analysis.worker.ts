// analysis.worker entry (spec §3.5, §9.6): waveform peaks from PCM the main thread transfers (the
// worker never decodes audio) and thumbnail sprite sheets from its own video sessions. Low priority
// work, one request at a time; closing a media's sessions skips the queue.
// TODO(batch 38): silence detection from the peaks.
import { buildPeaks, peaksLevel0, writePeaksFile } from "../cache/peaks.js";
import { decodeImage } from "../decode/poster.js";
import { ThumbSheetMaker } from "../decode/thumbSheet.js";
import { createVideoDecoder } from "../decode/VideoDecodeSession.js";
import type { Method } from "./protocol.js";
import { WorkerHost, type HostScope } from "./WorkerHost.js";

const thumbs = new ThumbSheetMaker({
  createDecoder: createVideoDecoder,
  isConfigSupported: async (config) => (await VideoDecoder.isConfigSupported(config)).supported === true,
});

const IMMEDIATE: ReadonlySet<Method> = new Set<Method>(["closeThumbs"]);

new WorkerHost(
  self as unknown as HostScope,
  {
    peaksLevel0: async ({ channels }) => peaksLevel0(channels.map((buffer) => new Float32Array(buffer))).buffer as ArrayBuffer,
    peaksFile: async ({ level0, sampleRate, frames, channels, stamp }) => writePeaksFile(buildPeaks(new Int8Array(level0), { sampleRate, frames, channels }), stamp),
    thumbSheet: (params, signal) => thumbs.sheet(params, signal),
    decodeSheet: ({ blob }) => decodeImage(blob, Infinity),
    closeThumbs: async ({ mediaId }) => {
      thumbs.close(mediaId);
      return null;
    },
  },
  1,
  IMMEDIATE,
);
