import { describe, expect, it } from "vitest";
import { audioEncoderConfigs, avcLevelFor, chooseConfig, codecStrings, muxerAudioCodec, muxerVideoCodec, videoEncoderConfigs } from "./codecs.js";

const FORMAT = { codec: "avc" as const, width: 1080, height: 1920, fps: { num: 30, den: 1 }, videoBitrate: 12_000_000 };

describe("codecStrings", () => {
  it("picks H.264 High, Main and Baseline at the lowest level holding the size and rate", () => {
    expect(codecStrings("avc", 1080, 1920, 30, 12_000_000)).toEqual(["avc1.640028", "avc1.4d4028", "avc1.42e028"]);
    expect(codecStrings("avc", 1080, 1920, 60, 12_000_000)).toEqual(["avc1.64002a", "avc1.4d402a", "avc1.42e02a"]);
    expect(codecStrings("avc", 2160, 3840, 30, 40_000_000)[0]).toBe("avc1.640033");
  });

  it("raises the level when the bitrate needs it (High allows 1.25x)", () => {
    expect(avcLevelFor(1080, 1920, 30, 24_000_000, 1.25)).toBe(0x28);
    expect(avcLevelFor(1080, 1920, 30, 24_000_000, 1)).toBe(0x29);
    expect(avcLevelFor(720, 1280, 30, 12_000_000, 1)).toBe(0x1f);
    expect(avcLevelFor(720, 1280, 30, 16_000_000, 1)).toBe(0x20);
  });

  it("picks HEVC Main and AV1 Main levels by picture size, sample rate and bitrate", () => {
    expect(codecStrings("hevc", 1080, 1920, 30, 12_000_000)).toEqual(["hvc1.1.6.L120.B0"]);
    expect(codecStrings("hevc", 1080, 1920, 60, 12_000_000)).toEqual(["hvc1.1.6.L123.B0"]);
    expect(codecStrings("hevc", 2160, 3840, 30, 20_000_000)).toEqual(["hvc1.1.6.L150.B0"]);
    expect(codecStrings("av1", 1080, 1920, 30, 12_000_000)).toEqual(["av01.0.08M.08"]);
    expect(codecStrings("av1", 1080, 1920, 60, 12_000_000)).toEqual(["av01.0.09M.08"]);
    expect(codecStrings("av1", 2160, 3840, 30, 20_000_000)).toEqual(["av01.0.12M.08"]);
  });
});

describe("videoEncoderConfigs", () => {
  it("configures quality latency, variable bitrate, the frame rate and the MP4 bitstream format", () => {
    const [first] = videoEncoderConfigs(FORMAT);
    expect(first).toEqual({
      codec: "avc1.640028",
      width: 1080,
      height: 1920,
      bitrate: 12_000_000,
      framerate: 30,
      bitrateMode: "variable",
      latencyMode: "quality",
      hardwareAcceleration: "no-preference",
      avc: { format: "avc" },
    });
  });

  it("falls back to H.264 after HEVC or AV1", () => {
    const hevc = videoEncoderConfigs({ ...FORMAT, codec: "hevc" });
    expect(hevc.map((config) => config.codec)).toEqual(["hvc1.1.6.L120.B0", "avc1.640028", "avc1.4d4028", "avc1.42e028"]);
    expect(hevc[0]).toMatchObject({ hevc: { format: "hevc" } });
    expect(hevc[0]).not.toHaveProperty("avc");
    const av1 = videoEncoderConfigs({ ...FORMAT, codec: "av1" });
    expect(av1[0]?.codec).toBe("av01.0.08M.08");
    expect(av1[0]).not.toHaveProperty("avc");
  });

  it("names the muxer's codec of each string", () => {
    expect(muxerVideoCodec("avc1.640028")).toBe("avc");
    expect(muxerVideoCodec("hvc1.1.6.L120.B0")).toBe("hevc");
    expect(muxerVideoCodec("hev1.1.6.L120.B0")).toBe("hevc");
    expect(muxerVideoCodec("av01.0.08M.08")).toBe("av1");
  });
});

describe("audioEncoderConfigs", () => {
  it("tries AAC-LC, then Opus, at the mix's rate and channels", () => {
    expect(audioEncoderConfigs({ sampleRate: 48000, channels: 2, audioBitrate: 192_000 })).toEqual([
      { codec: "mp4a.40.2", sampleRate: 48000, numberOfChannels: 2, bitrate: 192_000 },
      { codec: "opus", sampleRate: 48000, numberOfChannels: 2, bitrate: 192_000 },
    ]);
    expect(muxerAudioCodec("mp4a.40.2")).toBe("aac");
    expect(muxerAudioCodec("opus")).toBe("opus");
  });
});

describe("chooseConfig", () => {
  it("returns the first supported configuration, skipping ones whose check throws", async () => {
    const checked: string[] = [];
    const chosen = await chooseConfig(["a", "b", "c"], async (config) => {
      checked.push(config);
      if (config === "a") throw new TypeError("bad config");
      return config === "c";
    });
    expect(chosen).toBe("c");
    expect(checked).toEqual(["a", "b", "c"]);
  });

  it("returns null when none is supported", async () => {
    expect(await chooseConfig(["a"], async () => false)).toBeNull();
  });
});
