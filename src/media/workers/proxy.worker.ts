// proxy.worker entry (spec §3.5, §9.5): makes one proxy at a time (decode -> scale -> encode -> mux,
// media/proxy/ProxyMaker.ts). The bytes and the progress go to the main thread as progress values;
// pausing (playback, drags, export) skips the queue.
import { ByteSource, createMp4Writer, createVideoEncoder, halvingScaler, loadSampleIndex } from "../proxy/browserProxy.js";
import { ProxyMaker } from "../proxy/ProxyMaker.js";
import { createVideoDecoder } from "../decode/VideoDecodeSession.js";
import type { Method } from "./protocol.js";
import { WorkerHost, type HostScope } from "./WorkerHost.js";

const maker = new ProxyMaker<VideoFrame, EncodedVideoChunk, ByteSource>({
  openSource: (file) => new ByteSource(file),
  loadIndex: loadSampleIndex,
  createDecoder: createVideoDecoder,
  createEncoder: createVideoEncoder,
  isEncoderSupported: async (config) => (await VideoEncoder.isConfigSupported(config)).supported === true,
  scale: halvingScaler(),
  createMuxer: createMp4Writer,
});

const IMMEDIATE: ReadonlySet<Method> = new Set<Method>(["pauseProxy"]);

new WorkerHost(
  self as unknown as HostScope,
  {
    makeProxy: (params, signal, emit) => maker.make(params, signal, emit),
    pauseProxy: async ({ paused }) => {
      maker.setPaused(paused);
      return null;
    },
  },
  1,
  IMMEDIATE,
);
