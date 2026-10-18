// export.worker entry (spec §3.5, §16, P5): one export at a time. ExportRenderer draws each frame
// with the worker's own GPU device and decoders; runExport encodes it (VideoEncoder, AudioEncoder for
// the main thread's mixdown) and muxes the MP4. The chosen codecs, the file's bytes with their
// positions and the frames done go to the main thread as progress values; `pauseExport` pauses
// between frames. Everything the export held is freed when it ends, however it ends (P13).
import { createAudioEncoder, createMp4Muxer, createVideoEncoder, planarAudioData } from "../../export/browserCodecs.js";
import { ExportRenderer } from "../../export/ExportRenderer.js";
import { PauseGate, runExport } from "../../export/pipeline.js";
import { exportPlan } from "../../export/plan.js";
import type { Method } from "./protocol.js";
import { WorkerHost, type HostScope } from "./WorkerHost.js";

const gate = new PauseGate();

new WorkerHost(
  self as unknown as HostScope,
  {
    exportVideo: async (params, signal, emit) => {
      const started = performance.now();
      gate.set(false);
      const renderer = new ExportRenderer(params);
      try {
        await renderer.start(signal);
        const { format, range, project } = params;
        const plan = exportPlan(range, project.settings.fps, format.fps, format.keyframeSeconds, format.sampleRate);
        const audio = params.audio ? params.audio.channels.map((buffer) => new Float32Array(buffer)) : null;
        const result = await runExport(
          { plan, format, audio },
          {
            render: (frame, timestampUs, durationUs, frameSignal) => renderer.render(frame, timestampUs, durationUs, frameSignal),
            createVideoEncoder,
            createAudioEncoder,
            videoSupported: async (config) => (await VideoEncoder.isConfigSupported(config)).supported === true,
            audioSupported: async (config) => (await AudioEncoder.isConfigSupported(config)).supported === true,
            audioData: planarAudioData,
            createMuxer: createMp4Muxer,
            now: () => performance.now(),
          },
          signal,
          emit,
          gate,
        );
        return { frames: result.frames, videoCodec: result.videoCodec, audioCodec: result.audioCodec, width: format.width, height: format.height, ms: performance.now() - started };
      } finally {
        renderer.dispose();
      }
    },
    pauseExport: async ({ paused }) => {
      gate.set(paused);
      return null;
    },
  },
  1,
  new Set<Method>(["pauseExport"]),
);
