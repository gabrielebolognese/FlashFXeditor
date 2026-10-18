// The container of a video file (Batch 49): MP4/MOV through mp4box and the moov's sample tables, WebM
// and Matroska through the EBML demuxer. Told by the file's first bytes (the EBML magic), not its name:
// the decode, analysis, proxy and export workers get the File alone, and a file named after the wrong
// container still opens.
import { ByteSource } from "../bytes/ByteSource.js";
import { probeMp4, readMp4 } from "../probe/mp4Probe.js";
import { ProbeError, type ProbeResult } from "../probe/types.js";
import { blobReader } from "./ebml.js";
import { sampleIndexFromMp4, type SampleIndex } from "./sampleIndex.js";
import { probeWebm, readWebm, sampleIndexFromWebm, WEBM_UNREADABLE } from "./webm.js";

const EBML_MAGIC = [0x1a, 0x45, 0xdf, 0xa3];

/** True when the file starts with an EBML header (WebM, Matroska). */
export async function isEbml(file: Blob): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, EBML_MAGIC.length).arrayBuffer());
  return EBML_MAGIC.every((byte, i) => head[i] === byte);
}

/**
 * Probes a video (or audio-only) file of either container (spec §9.1). `named` is the container its
 * name says: a .webm that is neither gets the WebM reason.
 */
export async function probeVideoFile(file: Blob, signal?: AbortSignal, named: "mp4" | "webm" = "mp4"): Promise<ProbeResult> {
  if (await isEbml(file)) return probeWebm(blobReader(file), signal);
  try {
    return await probeMp4(new ByteSource(file), signal);
  } catch (error) {
    if (named === "webm" && error instanceof ProbeError) throw new ProbeError(WEBM_UNREADABLE);
    throw error;
  }
}

/**
 * The sample index of a video file's video track (spec §9.2). `source` serves the MP4 parse (its moov
 * reads stay in the shared chunk cache for the decoder); a WebM scan reads every cluster, so it reads
 * the file directly.
 */
export async function parseSampleIndex(file: Blob, source: ByteSource, signal?: AbortSignal): Promise<SampleIndex> {
  if (await isEbml(file)) return sampleIndexFromWebm(await readWebm(blobReader(file), signal));
  const { video } = await readMp4(source, signal);
  if (!video || video.samples.length === 0) throw new ProbeError("The file has no video track");
  return sampleIndexFromMp4(video);
}
