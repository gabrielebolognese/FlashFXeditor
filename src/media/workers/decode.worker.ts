// decode.worker entry (spec §3.5): probes and poster frames, and the video decode sessions (sample
// index, requestFrame, prefetch). Frame methods start at once (each session orders its own jobs);
// probes, posters and image decodes share the two queued slots.
import { ByteSource } from "../bytes/ByteSource.js";
import { DecodeSessions } from "../decode/DecodeSessions.js";
import { decodeImage, imagePoster, videoPoster } from "../decode/poster.js";
import { createVideoDecoder } from "../decode/VideoDecodeSession.js";
import { probeImage } from "../probe/imageProbe.js";
import { probeMp4 } from "../probe/mp4Probe.js";
import type { Method } from "./protocol.js";
import { WorkerHost, type HostScope } from "./WorkerHost.js";

const videos = new DecodeSessions<VideoFrame>({
  createDecoder: createVideoDecoder,
  isConfigSupported: async (config) => (await VideoDecoder.isConfigSupported(config)).supported === true,
});

const IMMEDIATE: ReadonlySet<Method> = new Set<Method>(["openVideo", "requestFrame", "prefetch", "closeVideo", "decodeStats"]);

new WorkerHost(
  self as unknown as HostScope,
  {
    probe: ({ file, container, type }, signal) => (container === "mp4" ? probeMp4(new ByteSource(file), signal) : probeImage(file, type, signal)),
    poster: ({ file, kind, maxSize }, signal) => (kind === "video" ? videoPoster(file, maxSize, signal) : imagePoster(file, maxSize)),
    decodeImage: ({ blob, maxSize }) => decodeImage(blob, maxSize),
    openVideo: (params, signal) => videos.open(params, signal),
    requestFrame: (params, signal, emit) => videos.requestFrame(params, signal, emit),
    prefetch: (params, signal, emit) => videos.prefetch(params, signal, emit),
    closeVideo: async ({ mediaId }) => {
      videos.close(mediaId);
      return null;
    },
    decodeStats: async () => videos.stats(),
  },
  2,
  IMMEDIATE,
);
