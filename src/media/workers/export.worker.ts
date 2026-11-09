// export.worker entry (spec §3.5, §16, P5): one export at a time. ExportRenderer draws each frame
// with the worker's own GPU device and decoders; runExport encodes it (VideoEncoder, AudioEncoder for
// the main thread's mixdown) and muxes the MP4. Export audio (Batch 44): runAudioExport writes the
// mixdown as a WAV or an M4A. The chosen codecs, the file's bytes with their positions and the frames
// (samples) done go to the main thread as progress values; the job starts in its `paused` state and
// `pauseExport` pauses or resumes it between frames. Everything the export held is freed when it
// ends, however it ends (P13).
import { runAudioExport } from "../../export/audioExport.js";
import { applyExportLoudness } from "../../export/loudness.js";
import { createAudioEncoder, createAudioMp4Muxer, createMp4Muxer, createVideoEncoder, createWebmMuxer, createWebmVideoEncoder, opaqueWebmFrame, planarAudioData, transparentWebmFrame } from "../../export/browserCodecs.js";
import { ExportRenderer } from "../../export/ExportRenderer.js";
import { runFrames } from "../../export/frames.js";
import { encodePng } from "../../export/png.js";
import { PauseGate, runExport } from "../../export/pipeline.js";
import { exportPlan } from "../../export/plan.js";
import type { Method } from "./protocol.js";
import { WorkerHost, type HostScope } from "./WorkerHost.js";

const gate = new PauseGate();
/** The running video export (dev: `__exportDev.loseDevice()` from the worker's console loses its GPU device, Batch 47). */
let running: ExportRenderer | null = null;
if (import.meta.env.DEV) (self as unknown as { __exportDev: unknown }).__exportDev = { loseDevice: () => running?.loseDeviceForTest() };

new WorkerHost(
  self as unknown as HostScope,
  {
    exportVideo: async (params, signal, emit) => {
      const started = performance.now();
      // The job's own pause state: `pauseExport` only comes after the job (messages are handled in order).
      gate.set(params.paused);
      const renderer = new ExportRenderer(params);
      running = renderer;
      try {
        await renderer.start(signal);
        const { format, range, project } = params;
        const plan = exportPlan(range, project.settings.fps, format.fps, format.keyframeSeconds, format.sampleRate);
        const mix = params.audio ? applyExportLoudness(params.audio.channels.map((buffer) => new Float32Array(buffer)), params.audio.sampleRate, format.loudness ?? project.settings.loudness) : null;
        const audio = mix?.planes ?? null;
        const done = (extra: { frames: number; videoCodec: string; audioCodec: string | null; files?: number }) => ({ ...extra, width: format.width, height: format.height, ms: performance.now() - started, ...(mix?.report && { loudness: mix.report }) });
        if (format.container === "png" || format.container === "gif") {
          const result = await runFrames(
            { plan, container: format.container, width: format.width, height: format.height, dither: format.gifDither !== false, name: params.outputName ?? "frame" },
            {
              render: async (frame, _k, frameSignal) => renderer.renderPixels(frame, frameSignal),
              encodePng: (image) => encodePng(image, format.transparent === true),
              now: () => performance.now(),
            },
            signal,
            emit,
            gate,
          );
          return done({ frames: result.frames, videoCodec: format.container, audioCodec: null, files: result.files });
        }
        const shared = {
          createAudioEncoder,
          audioSupported: async (config: AudioEncoderConfig) => (await AudioEncoder.isConfigSupported(config)).supported === true,
          audioData: planarAudioData,
          videoSupported: async (config: VideoEncoderConfig) => (await VideoEncoder.isConfigSupported(config)).supported === true,
          now: () => performance.now(),
        };
        if (format.container === "webm") {
          const alpha = format.transparent === true;
          const result = await runExport(
            { plan, format, audio },
            {
              ...shared,
              render: async (frame, timestampUs, durationUs, frameSignal) => {
                if (!alpha) return opaqueWebmFrame(await renderer.render(frame, timestampUs, durationUs, frameSignal));
                const pixels = await renderer.renderPixels(frame, frameSignal);
                return transparentWebmFrame(pixels.data, pixels.width, pixels.height, timestampUs, durationUs);
              },
              createVideoEncoder: (callbacks) => createWebmVideoEncoder(callbacks, alpha),
              createMuxer: (options, onData) => createWebmMuxer(options, onData),
            },
            signal,
            emit,
            gate,
          );
          return done({ frames: result.frames, videoCodec: result.videoCodec, audioCodec: result.audioCodec });
        }
        const result = await runExport(
          { plan, format, audio },
          {
            ...shared,
            render: (frame, timestampUs, durationUs, frameSignal) => renderer.render(frame, timestampUs, durationUs, frameSignal),
            createVideoEncoder,
            createMuxer: (options, onData) => createMp4Muxer(options, onData, params.fixedCreationTime === true),
          },
          signal,
          emit,
          gate,
        );
        return done({ frames: result.frames, videoCodec: result.videoCodec, audioCodec: result.audioCodec });
      } finally {
        if (running === renderer) running = null;
        renderer.dispose();
      }
    },
    exportAudio: async (params, signal, emit) => {
      gate.set(params.paused);
      const mix = params.audio ? applyExportLoudness(params.audio.channels.map((buffer) => new Float32Array(buffer)), params.audio.sampleRate, params.loudness) : null;
      const planes = mix?.planes ?? null;
      const done = await runAudioExport(
        { format: params.format, planes, sampleRate: params.sampleRate, channels: params.channels, samples: params.samples, audioBitrate: params.audioBitrate },
        {
          createAudioEncoder,
          audioSupported: async (config) => (await AudioEncoder.isConfigSupported(config)).supported === true,
          audioData: planarAudioData,
          createAudioMuxer: createAudioMp4Muxer,
          now: () => performance.now(),
        },
        signal,
        emit,
        gate,
      );
      return mix?.report ? { ...done, loudness: mix.report } : done;
    },
    pauseExport: async ({ paused }) => {
      gate.set(paused);
      return null;
    },
  },
  1,
  new Set<Method>(["pauseExport"]),
);
