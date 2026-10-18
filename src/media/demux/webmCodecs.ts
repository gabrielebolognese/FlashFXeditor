// WebCodecs codec strings of WebM/Matroska tracks (Batch 49, spec §9.1-9.2). Matroska names codecs by
// CodecID ("V_VP9") and WebCodecs wants the full string ("vp09.00.40.08"):
// - VP9: WebM carries no configuration record, so the profile and bit depth come from the first key
//   frame's uncompressed header, and the level is the smallest of the VP9 level table that holds the
//   picture size and luma rate.
// - AV1: from the AV1CodecConfigurationRecord in CodecPrivate (required by the Matroska mapping), also
//   passed as the decoder description, as for MP4.
// - VP8 has one string. H.264 (Chrome's MediaRecorder writes it into .webm on request) comes from the
//   avcC in CodecPrivate, which is also the description.
import { ProbeError } from "../probe/types.js";

export interface VideoCodec {
  codec: string;
  /** Decoder description (AV1, H.264); undefined when the codec needs none. */
  description: Uint8Array | undefined;
}

/** Codec IDs this demuxer can decode, for the refusal message. */
export const SUPPORTED_VIDEO = "VP8, VP9, AV1 or H.264";

/** Reads bits most significant first. */
class BitReader {
  private bit = 0;
  constructor(private readonly bytes: Uint8Array) {}

  read(count: number): number {
    let value = 0;
    for (let i = 0; i < count; i++, this.bit++) {
      const byte = this.bytes[this.bit >> 3];
      if (byte === undefined) throw new RangeError("Header ended");
      value = (value << 1) | ((byte >> (7 - (this.bit & 7))) & 1);
    }
    return value;
  }
}

/** Profile and bit depth of a VP9 key frame (the start of its first frame); null when the bytes are not one. */
export function vp9KeyFrameInfo(frame: Uint8Array): { profile: number; bitDepth: number } | null {
  try {
    const bits = new BitReader(frame);
    if (bits.read(2) !== 2) return null; // frame_marker
    const low = bits.read(1);
    const profile = (bits.read(1) << 1) | low;
    if (profile === 3) bits.read(1); // reserved_zero
    if (bits.read(1) === 1) return null; // show_existing_frame
    if (bits.read(1) !== 0) return null; // frame_type: not a key frame
    bits.read(2); // show_frame, error_resilient_mode
    if (bits.read(8) !== 0x49 || bits.read(8) !== 0x83 || bits.read(8) !== 0x42) return null; // frame_sync_code
    const bitDepth = profile >= 2 ? (bits.read(1) === 1 ? 12 : 10) : 8;
    return { profile, bitDepth };
  } catch {
    return null;
  }
}

/** The VP9 levels: [level, max luma samples per second, max luma picture size]. */
const VP9_LEVELS: readonly [string, number, number][] = [
  ["10", 829_440, 36_864],
  ["11", 2_764_800, 73_728],
  ["20", 4_608_000, 122_880],
  ["21", 9_216_000, 245_760],
  ["30", 20_736_000, 552_960],
  ["31", 36_864_000, 983_040],
  ["40", 83_558_400, 2_228_224],
  ["41", 160_432_128, 2_228_224],
  ["50", 311_951_360, 8_912_896],
  ["51", 588_251_136, 8_912_896],
  ["52", 1_176_502_272, 8_912_896],
  ["60", 1_176_502_272, 35_651_584],
  ["61", 2_353_004_544, 35_651_584],
  ["62", 4_706_009_088, 35_651_584],
];

/** The smallest VP9 level for the size and rate (each side at most sqrt(8 x the picture size)); "62" past the table. */
export function vp9Level(width: number, height: number, fps: number): string {
  const picture = width * height;
  const level = VP9_LEVELS.find(([, rate, size]) => picture <= size && picture * fps <= rate && Math.max(width, height) <= Math.sqrt(8 * size));
  return level ? level[0] : "62";
}

const two = (n: number) => String(n).padStart(2, "0");
const hex = (n: number) => n.toString(16).padStart(2, "0");

/** "av01.P.LLT.DD" from an AV1CodecConfigurationRecord; null when it is not one. */
export function av1CodecString(av1C: Uint8Array): string | null {
  if (av1C.length < 4 || ((av1C[0] as number) & 0x80) === 0) return null;
  const profile = (av1C[1] as number) >> 5;
  const level = (av1C[1] as number) & 0x1f;
  const flags = av1C[2] as number;
  const tier = flags & 0x80 ? "H" : "M";
  const bitDepth = flags & 0x40 ? (flags & 0x20 ? 12 : 10) : 8;
  return `av01.${profile}.${two(level)}${tier}.${two(bitDepth)}`;
}

/** "avc1.PPCCLL" from an AVCDecoderConfigurationRecord; null when it is not one. */
export function avcCodecString(avcC: Uint8Array): string | null {
  if (avcC.length < 7 || avcC[0] !== 1) return null;
  return `avc1.${hex(avcC[1] as number)}${hex(avcC[2] as number)}${hex(avcC[3] as number)}`;
}

/**
 * The WebCodecs configuration of a video track. `keyFrame` is the start of its first key frame (VP9),
 * `fps` its rate (VP9 level; 30 when unknown). Throws ProbeError for codecs this app cannot decode.
 */
export function videoCodec(track: { codecId: string; codecPrivate: Uint8Array | undefined; width: number; height: number }, keyFrame: Uint8Array | null, fps: number | null): VideoCodec {
  const { codecId, codecPrivate } = track;
  switch (codecId) {
    case "V_VP8":
      return { codec: "vp8", description: undefined };
    case "V_VP9": {
      const info = (keyFrame && vp9KeyFrameInfo(keyFrame)) ?? { profile: 0, bitDepth: 8 };
      return { codec: `vp09.${two(info.profile)}.${vp9Level(track.width, track.height, fps ?? 30)}.${two(info.bitDepth)}`, description: undefined };
    }
    case "V_AV1": {
      const codec = codecPrivate && av1CodecString(codecPrivate);
      // Without a record (it is required): Main profile, 8 bits, the level from the size (AV1 levels follow VP9's sizes).
      return codec ? { codec, description: codecPrivate } : { codec: `av01.0.${av1LevelIndex(vp9Level(track.width, track.height, fps ?? 30))}M.08`, description: undefined };
    }
    case "V_MPEG4/ISO/AVC": {
      const codec = codecPrivate && avcCodecString(codecPrivate);
      if (!codec) throw new ProbeError("The H.264 track of this WebM file has no decoder configuration");
      return { codec, description: codecPrivate };
    }
    default:
      throw new ProbeError(`The video codec of this WebM file (${codecId || "none"}) is not supported: use ${SUPPORTED_VIDEO}`);
  }
}

/** AV1 seq_level_idx of a VP9-style level ("41" -> 4.1 -> index 9: X.Y is (X - 2) * 4 + Y). */
function av1LevelIndex(level: string): string {
  const major = Number(level[0]);
  const minor = Number(level[1]);
  return two(Math.min(23, Math.max(0, (major - 2) * 4 + minor)));
}

/** The audio codec name of a track ("opus", "vorbis"; others lower case without the "A_"). */
export function audioCodec(codecId: string): string {
  switch (codecId) {
    case "A_OPUS":
      return "opus";
    case "A_VORBIS":
      return "vorbis";
    default:
      return codecId.replace(/^A_/, "").toLowerCase();
  }
}
