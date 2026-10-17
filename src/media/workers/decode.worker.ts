// decode.worker entry (spec §3.5): probes and image posters, animated image frames and strips
// (Batch 34), the video decode sessions (sample index, requestFrame, prefetch) and MP4/MOV audio
// (decode/AudioTracks.ts). Frame methods start at once (each session orders its own jobs); probes,
// posters, image decodes and audio decodes share the two queued slots, in priority order.
import { ByteSource } from "../bytes/ByteSource.js";
import { browserAudioDecodeDeps } from "../decode/audioTrack.js";
import { AudioTracks } from "../decode/AudioTracks.js";
import { DecodeSessions } from "../decode/DecodeSessions.js";
import { animationStrip, decodeAnimation } from "../decode/animatedImage.js";
import { decodeImage, imagePoster } from "../decode/poster.js";
import { createVideoDecoder } from "../decode/VideoDecodeSession.js";
import { probeImage } from "../probe/imageProbe.js";
import { probeMp4 } from "../probe/mp4Probe.js";
import type { Method } from "./protocol.js";
import { WorkerHost, type HostScope } from "./WorkerHost.js";

const videos = new DecodeSessions<VideoFrame>({
  createDecoder: createVideoDecoder,
  isConfigSupported: async (config) => (await VideoDecoder.isConfigSupported(config)).supported === true,
});

const audio = new AudioTracks({
  decodeDeps: (source) => browserAudioDecodeDeps((offset, size) => source.read(offset, size)),
  isConfigSupported: async (config) => (await AudioDecoder.isConfigSupported(config)).supported === true,
});

const IMMEDIATE: ReadonlySet<Method> = new Set<Method>(["openVideo", "requestFrame", "prefetch", "closeVideo", "decodeStats", "closeAudio"]);

new WorkerHost(
  self as unknown as HostScope,
  {
    probe: ({ file, container, type }, signal) => (container === "mp4" ? probeMp4(new ByteSource(file), signal) : probeImage(file, type, signal)),
    poster: ({ file, maxSize }) => imagePoster(file, maxSize),
    decodeImage: ({ blob, maxSize }) => decodeImage(blob, maxSize),
    decodeAnimation: (params, signal, emit) => decodeAnimation(params, signal, emit),
    animationStrip: (params, signal) => animationStrip(params, signal),
    openVideo: (params, signal) => videos.open(params, signal),
    requestFrame: (params, signal, emit) => videos.requestFrame(params, signal, emit),
    prefetch: (params, signal, emit) => videos.prefetch(params, signal, emit),
    closeVideo: async ({ mediaId, lod }) => {
      videos.close(mediaId, lod);
      return null;
    },
    decodeStats: async () => videos.stats(),
    openAudio: (params, signal) => audio.open(params, signal),
    decodeAudio: (params, signal) => audio.decode(params, signal),
    closeAudio: async ({ mediaId }) => {
      audio.close(mediaId);
      return null;
    },
  },
  2,
  IMMEDIATE,
);
