// Encoder configurations of an export (spec §16), best first; the export takes the first one
// `isConfigSupported` accepts.
// - H.264: High, then Main, then Constrained Baseline, at the lowest level that holds the frame size,
//   the rate and the bitrate (ITU-T H.264 Table A-1; High allows 1.25x the bitrate).
// - HEVC Main and AV1 Main (8-bit) at their lowest fitting level; an export asking for one of them
//   falls back to H.264 when this browser cannot encode it.
// - Audio: AAC-LC (spec §14), else Opus (both muxed into MP4).
// Quality latency mode (spec §16), variable bitrate around the target, the browser's choice of
// hardware or software.
import { fpsToNumber } from "../core/document/time.js";
import { avcLevel } from "../media/proxy/proxyFormat.js";
import type { ExportFormat, VideoCodecId } from "./presets.js";

/** H.264 level ids and their Main/Baseline max bitrates (kbps). */
const AVC_BITRATES: readonly [id: number, kbps: number][] = [
  [0x1e, 10_000],
  [0x1f, 14_000],
  [0x20, 20_000],
  [0x28, 20_000],
  [0x29, 50_000],
  [0x2a, 50_000],
  [0x32, 135_000],
  [0x33, 240_000],
  [0x34, 240_000],
];

/** HEVC Main tier levels: level x 30, max luma picture size, max luma samples per second, max bitrate (kbps). */
const HEVC_LEVELS: readonly [id: number, picture: number, perSecond: number, kbps: number][] = [
  [93, 983_040, 33_177_600, 10_000],
  [120, 2_228_224, 66_846_720, 12_000],
  [123, 2_228_224, 133_693_440, 20_000],
  [150, 8_912_896, 267_386_880, 25_000],
  [153, 8_912_896, 534_773_760, 40_000],
  [156, 8_912_896, 1_069_547_520, 60_000],
  [183, 35_651_584, 1_069_547_520, 60_000],
];

/** AV1 Main tier seq_level_idx: max picture size, max display rate (samples/s), max bitrate (kbps). */
const AV1_LEVELS: readonly [idx: number, picture: number, perSecond: number, kbps: number][] = [
  [5, 1_065_024, 31_950_720, 6_000],
  [8, 2_228_224, 66_846_720, 12_000],
  [9, 2_228_224, 133_693_440, 20_000],
  [12, 8_912_896, 267_386_880, 30_000],
  [13, 8_912_896, 534_773_760, 40_000],
  [14, 8_912_896, 1_069_547_520, 60_000],
  [16, 35_651_584, 1_069_547_520, 60_000],
];

const hex = (value: number) => value.toString(16).padStart(2, "0");

/** The lowest H.264 level holding the size, rate and bitrate (`factor`: High's 1.25). */
export function avcLevelFor(width: number, height: number, fps: number, bitrate: number, factor: number): number {
  const sized = avcLevel(width, height, fps);
  for (const [id, kbps] of AVC_BITRATES) if (id >= sized && bitrate <= kbps * 1000 * factor) return id;
  return 0x34;
}

function tableLevel(table: readonly (readonly [number, number, number, number])[], width: number, height: number, fps: number, bitrate: number): number {
  const picture = width * height;
  for (const [id, maxPicture, perSecond, kbps] of table) if (picture <= maxPicture && picture * fps <= perSecond && bitrate <= kbps * 1000) return id;
  return (table[table.length - 1] as readonly [number, number, number, number])[0];
}

/** The codec strings to try for `codec`, best first. */
export function codecStrings(codec: VideoCodecId, width: number, height: number, fps: number, bitrate: number): string[] {
  switch (codec) {
    case "avc": {
      const high = hex(avcLevelFor(width, height, fps, bitrate, 1.25));
      const main = hex(avcLevelFor(width, height, fps, bitrate, 1));
      return [`avc1.6400${high}`, `avc1.4d40${main}`, `avc1.42e0${main}`];
    }
    case "hevc":
      return [`hvc1.1.6.L${tableLevel(HEVC_LEVELS, width, height, fps, bitrate)}.B0`];
    case "av1":
      return [`av01.0.${String(tableLevel(AV1_LEVELS, width, height, fps, bitrate)).padStart(2, "0")}M.08`];
  }
}

/** The muxer's name of a codec string's family. */
export function muxerVideoCodec(codec: string): VideoCodecId {
  if (codec.startsWith("hvc1") || codec.startsWith("hev1")) return "hevc";
  if (codec.startsWith("av01")) return "av1";
  return "avc";
}

/** The video encoder configurations to try, best first (H.264 last for the other codecs). */
export function videoEncoderConfigs(format: Pick<ExportFormat, "codec" | "width" | "height" | "fps" | "videoBitrate">): VideoEncoderConfig[] {
  const fps = fpsToNumber(format.fps);
  const codecs = codecStrings(format.codec, format.width, format.height, fps, format.videoBitrate);
  if (format.codec !== "avc") codecs.push(...codecStrings("avc", format.width, format.height, fps, format.videoBitrate));
  return codecs.map((codec) => {
    const family = muxerVideoCodec(codec);
    return {
      codec,
      width: format.width,
      height: format.height,
      bitrate: format.videoBitrate,
      framerate: fps,
      bitrateMode: "variable",
      latencyMode: "quality",
      hardwareAcceleration: "no-preference",
      ...(family === "avc" && { avc: { format: "avc" } }),
      ...(family === "hevc" && { hevc: { format: "hevc" } }),
    } as VideoEncoderConfig;
  });
}

/** The audio encoder configurations to try: AAC-LC, then Opus. */
export function audioEncoderConfigs(format: Pick<ExportFormat, "sampleRate" | "channels" | "audioBitrate">): AudioEncoderConfig[] {
  const base = { sampleRate: format.sampleRate, numberOfChannels: format.channels, bitrate: format.audioBitrate };
  return [
    { codec: "mp4a.40.2", ...base },
    { codec: "opus", ...base },
  ];
}

export function muxerAudioCodec(codec: string): "aac" | "opus" {
  return codec === "opus" ? "opus" : "aac";
}

/** The first configuration `isSupported` accepts, or null. */
export async function chooseConfig<T>(candidates: readonly T[], isSupported: (config: T) => Promise<boolean>): Promise<T | null> {
  for (const config of candidates) {
    try {
      if (await isSupported(config)) return config;
    } catch {
      // A configuration the browser refuses to even check: try the next.
    }
  }
  return null;
}
