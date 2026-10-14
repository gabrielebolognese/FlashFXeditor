// decode.worker entry (spec §3.5): probes and poster frames for now.
// TODO(batch 06): VideoDecodeSessions, the sample index, requestFrame and prefetch.
import { ByteSource } from "../bytes/ByteSource.js";
import { decodeImage, imagePoster, videoPoster } from "../decode/poster.js";
import { probeImage } from "../probe/imageProbe.js";
import { probeMp4 } from "../probe/mp4Probe.js";
import { WorkerHost, type HostScope } from "./WorkerHost.js";

new WorkerHost(
  self as unknown as HostScope,
  {
    probe: ({ file, container, type }, signal) => (container === "mp4" ? probeMp4(new ByteSource(file), signal) : probeImage(file, type, signal)),
    poster: ({ file, kind, maxSize }, signal) => (kind === "video" ? videoPoster(file, maxSize, signal) : imagePoster(file, maxSize)),
    decodeImage: ({ blob, maxSize }) => decodeImage(blob, maxSize),
  },
  2,
);
