// decode.worker's audio side (spec §14): the parsed audio tracks of MP4/MOV media (sample table,
// decoder configuration, edit lists) and their decoder output format, kept for the last few media,
// and range decodes to planar float PCM transferred to the main thread. WebM (Batch 49): Opus audio is
// read from the clusters (webm.ts) and decoded the same way; other WebM audio reads as unsupported,
// with the lead that places the output of decodeAudioData (it starts at the first audio block) on
// media time.
import { ByteSource } from "../bytes/ByteSource.js";
import { isEbml } from "../demux/container.js";
import { blobReader } from "../demux/ebml.js";
import { readWebm, webmAudioLeadUs, webmAudioPlan } from "../demux/webm.js";
import { readMp4 } from "../probe/mp4Probe.js";
import type { AudioInfo, PcmResult } from "../workers/protocol.js";
import { audioPlan, decodeAudioRange, decoderConfig, probeAudioOutput, type AudioDecodeDeps, type AudioTrackPlan } from "./audioTrack.js";

/** Parsed tracks kept (the sample tables are small; the bytes go through the shared chunk cache). */
const KEEP = 8;

interface OpenTrack {
  file: File;
  plan: AudioTrackPlan | null;
  source: ByteSource;
  info: AudioInfo;
}

export interface AudioTracksDeps {
  decodeDeps(source: ByteSource): AudioDecodeDeps;
  isConfigSupported(config: AudioDecoderConfig): Promise<boolean>;
}

const UNSUPPORTED = (codec: string): AudioInfo => ({ supported: false, codec, sampleRate: 0, channels: 0, frames: 0 });

export class AudioTracks {
  /** By media id; Map order is the recency order. */
  private readonly tracks = new Map<string, Promise<OpenTrack>>();

  constructor(private readonly deps: AudioTracksDeps) {}

  async open(params: { mediaId: string; file: File }, signal?: AbortSignal): Promise<AudioInfo> {
    return (await this.track(params, signal)).info;
  }

  async decode(params: { mediaId: string; file: File; from: number; to: number }, signal?: AbortSignal): Promise<PcmResult> {
    const track = await this.track(params, signal);
    if (!track.plan || !track.info.supported) throw new Error(`No audio decoder for ${track.info.codec || "this file"}`);
    const from = Math.max(0, Math.floor(params.from));
    const to = Math.min(track.info.frames, Math.max(from, Math.floor(params.to)));
    const result = await decodeAudioRange(track.plan, { from, to, rate: track.info.sampleRate }, this.deps.decodeDeps(track.source), signal);
    return { sampleRate: result.sampleRate, channels: result.channels.map((channel) => channel.buffer as ArrayBuffer) };
  }

  close(mediaId: string): void {
    this.tracks.delete(mediaId);
  }

  private track(params: { mediaId: string; file: File }, signal?: AbortSignal): Promise<OpenTrack> {
    const { mediaId, file } = params;
    let entry = this.tracks.get(mediaId);
    if (entry) {
      this.tracks.delete(mediaId);
      this.tracks.set(mediaId, entry);
      return entry.then((track) => (track.file.size === file.size && track.file.lastModified === file.lastModified ? track : this.reopen(params, signal)));
    }
    entry = this.parse(file, signal);
    this.tracks.set(mediaId, entry);
    entry.catch(() => {
      if (this.tracks.get(mediaId) === entry) this.tracks.delete(mediaId);
    });
    for (const id of this.tracks.keys()) {
      if (this.tracks.size <= KEEP) break;
      this.tracks.delete(id);
    }
    return entry;
  }

  private reopen(params: { mediaId: string; file: File }, signal?: AbortSignal): Promise<OpenTrack> {
    this.tracks.delete(params.mediaId);
    return this.track(params, signal);
  }

  private async parse(file: File, signal?: AbortSignal): Promise<OpenTrack> {
    const source = new ByteSource(file);
    let plan: AudioTrackPlan | null;
    let leadUs: number | undefined;
    if (await isEbml(file)) {
      const webm = await readWebm(blobReader(file), signal);
      plan = webmAudioPlan(webm);
      leadUs = webmAudioLeadUs(webm);
    } else {
      plan = audioPlan(await readMp4(source, signal));
    }
    const unsupported = (codec: string): AudioInfo => ({ ...UNSUPPORTED(codec), ...(leadUs !== undefined && { leadUs }) });
    if (!plan) return { file, plan, source, info: unsupported("") };
    if (!(await this.deps.isConfigSupported(decoderConfig(plan)))) return { file, plan, source, info: unsupported(plan.codec) };
    const output = await probeAudioOutput(plan, this.deps.decodeDeps(source));
    const info: AudioInfo = {
      supported: true,
      codec: plan.codec,
      sampleRate: output.sampleRate,
      channels: Math.min(2, output.channels),
      frames: Math.floor(plan.duration * output.sampleRate),
    };
    return { file, plan, source, info };
  }
}
