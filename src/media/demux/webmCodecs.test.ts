import { describe, expect, it } from "vitest";
import { ProbeError } from "../probe/types.js";
import { vp9KeyFrame } from "./testWebm.js";
import { audioCodec, av1CodecString, avcCodecString, videoCodec, vp9KeyFrameInfo, vp9Level } from "./webmCodecs.js";

const track = (codecId: string, codecPrivate?: Uint8Array, width = 1920, height = 1080) => ({ codecId, codecPrivate, width, height });

describe("VP9", () => {
  it("reads the profile and bit depth of a key frame", () => {
    expect(vp9KeyFrameInfo(vp9KeyFrame(0))).toEqual({ profile: 0, bitDepth: 8 });
    expect(vp9KeyFrameInfo(vp9KeyFrame(1))).toEqual({ profile: 1, bitDepth: 8 });
    expect(vp9KeyFrameInfo(vp9KeyFrame(2, 10))).toEqual({ profile: 2, bitDepth: 10 });
    expect(vp9KeyFrameInfo(vp9KeyFrame(3, 12))).toEqual({ profile: 3, bitDepth: 12 });
  });

  it("returns null for inter frames, other bitstreams and short bytes", () => {
    const inter = vp9KeyFrame(0);
    inter[0] = (inter[0] as number) | 0x04; // frame_type 1
    expect(vp9KeyFrameInfo(inter)).toBeNull();
    expect(vp9KeyFrameInfo(Uint8Array.of(0x12, 0x00, 0x0a))).toBeNull();
    expect(vp9KeyFrameInfo(vp9KeyFrame(0).subarray(0, 2))).toBeNull();
  });

  it("picks the smallest level that holds the picture and its rate", () => {
    expect(vp9Level(640, 360, 30)).toBe("21");
    expect(vp9Level(1280, 720, 30)).toBe("31");
    expect(vp9Level(1080, 1920, 30)).toBe("40");
    expect(vp9Level(1920, 1080, 60)).toBe("41");
    expect(vp9Level(2560, 1440, 30)).toBe("50");
    expect(vp9Level(3840, 2160, 60)).toBe("51");
    expect(vp9Level(7680, 4320, 120)).toBe("62");
    expect(vp9Level(16_000, 16_000, 30)).toBe("62");
  });

  it("makes the full codec string from the key frame and the level", () => {
    expect(videoCodec(track("V_VP9"), vp9KeyFrame(0), 30)).toEqual({ codec: "vp09.00.40.08", description: undefined });
    expect(videoCodec(track("V_VP9", undefined, 3840, 2160), vp9KeyFrame(2, 10), 60).codec).toBe("vp09.02.51.10");
    // No key frame header: profile 0, 8 bits; no rate: 30 fps.
    expect(videoCodec(track("V_VP9", undefined, 1280, 720), null, null).codec).toBe("vp09.00.31.08");
  });
});

describe("AV1, H.264, VP8", () => {
  it("reads av1C records", () => {
    expect(av1CodecString(Uint8Array.of(0x81, 0x08, 0x0c, 0x00))).toBe("av01.0.08M.08");
    expect(av1CodecString(Uint8Array.of(0x81, 0x2d, 0xc0, 0x00))).toBe("av01.1.13H.10");
    expect(av1CodecString(Uint8Array.of(0x81, 0x53, 0x60, 0x00))).toBe("av01.2.19M.12");
    expect(av1CodecString(Uint8Array.of(0x01, 0x08, 0x0c, 0x00))).toBeNull();
    expect(av1CodecString(Uint8Array.of(0x81))).toBeNull();
  });

  it("passes the av1C as the description, and guesses Main 8-bit without one", () => {
    const av1C = Uint8Array.of(0x81, 0x09, 0x0c, 0x00, 0x0a, 0x0b);
    expect(videoCodec(track("V_AV1", av1C), null, 30)).toEqual({ codec: "av01.0.09M.08", description: av1C });
    expect(videoCodec(track("V_AV1"), null, 30)).toEqual({ codec: "av01.0.08M.08", description: undefined });
    expect(videoCodec(track("V_AV1", undefined, 3840, 2160), null, 60).codec).toBe("av01.0.13M.08");
  });

  it("reads avcC records", () => {
    const avcC = Uint8Array.of(1, 0x64, 0x00, 0x28, 0xff, 0xe1, 0x00);
    expect(avcCodecString(avcC)).toBe("avc1.640028");
    expect(videoCodec(track("V_MPEG4/ISO/AVC", avcC), null, 30)).toEqual({ codec: "avc1.640028", description: avcC });
    expect(() => videoCodec(track("V_MPEG4/ISO/AVC"), null, 30)).toThrow(ProbeError);
  });

  it("knows VP8 and refuses other codecs by name", () => {
    expect(videoCodec(track("V_VP8"), null, 30)).toEqual({ codec: "vp8", description: undefined });
    expect(() => videoCodec(track("V_THEORA"), null, 30)).toThrow(/V_THEORA.*VP8, VP9, AV1 or H\.264/);
    expect(() => videoCodec(track(""), null, 30)).toThrow(/\(none\)/);
  });

  it("names audio codecs", () => {
    expect(audioCodec("A_OPUS")).toBe("opus");
    expect(audioCodec("A_VORBIS")).toBe("vorbis");
    expect(audioCodec("A_AAC")).toBe("aac");
  });
});
