// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildWebm, videoBlocks } from "../demux/testWebm.js";
import { gifHeader, jpegHeader, mp3Header, oggHeader, pngHeader, readMediaHeader, svgHeader, wavHeader, webpHeader } from "./nodeHeaders.js";
import { buildMp4, videoSamples } from "./testMp4.js";
import { ProbeError } from "./types.js";

const text = (value: string): number[] => [...value].map((char) => char.charCodeAt(0));
const u16le = (value: number): number[] => [value & 255, value >> 8];
const u32le = (value: number): number[] => [value & 255, (value >> 8) & 255, (value >> 16) & 255, (value >>> 24) & 255];
const u32be = (value: number): number[] => [...u32le(value)].reverse();
const blob = (bytes: ArrayLike<number>): Blob => new Blob([Uint8Array.from(bytes as number[])]);

function wav(frames: number, rate = 48000, channels = 2): Uint8Array {
  const blockAlign = channels * 2;
  const data = new Array<number>(frames * blockAlign).fill(0);
  return Uint8Array.from([...text("RIFF"), ...u32le(36 + data.length), ...text("WAVE"), ...text("fmt "), ...u32le(16), ...u16le(1), ...u16le(channels), ...u32le(rate), ...u32le(rate * blockAlign), ...u16le(blockAlign), ...u16le(16), ...text("data"), ...u32le(data.length), ...data]);
}

/** MPEG-1 Layer III, 128 kbit/s, 44.1 kHz, stereo: 417-byte frames of 1152 samples. */
const mp3Frame = (): number[] => [0xff, 0xfb, 0x90, 0x00, ...new Array<number>(413).fill(0)];

describe("WAV", () => {
  it("reads length, rate and channels from the data chunk", () => {
    expect(wavHeader(wav(24000))).toEqual({ kind: "audio", durationUs: 500000, hasAudio: true, audioCodec: "pcm", audio: { channels: 2, sampleRate: 48000 } });
  });
  it("takes a streamed data size (0) as running to the end of the file", () => {
    const bytes = wav(44100, 44100, 1);
    bytes.set(u32le(0), 40);
    expect(wavHeader(bytes).durationUs).toBe(1_000_000);
  });
  it("refuses a file that is not RIFF/WAVE", () => {
    expect(() => wavHeader(Uint8Array.of(1, 2, 3))).toThrow(ProbeError);
  });
});

describe("MP3", () => {
  it("counts frames: 100 frames of 1152 samples at 44.1 kHz", () => {
    const bytes = Uint8Array.from(Array.from({ length: 100 }, () => mp3Frame()).flat());
    const result = mp3Header(bytes);
    expect(result.durationUs).toBe(Math.round((100 * 1152 * 1e6) / 44100));
    expect(result.audio).toEqual({ channels: 2, sampleRate: 44100 });
  });
  it("skips an ID3v2 tag and does not count the Xing frame or its LAME delay and padding", () => {
    const id3 = [...text("ID3"), 4, 0, 0, 0, 0, 0, 20, ...new Array<number>(20).fill(0)];
    const xing = mp3Frame();
    xing.splice(4 + 32, 4, ...text("Xing"));
    // Flags 0, then the LAME string 8 bytes after the tag; delay and padding (12 bits each) sit 21 bytes into it.
    const lame = 4 + 32 + 8;
    xing.splice(lame, 9, ...text("LAME3.100"));
    xing.splice(lame + 21, 3, 0x04, 0x60, 0x00);
    const bytes = Uint8Array.from([...id3, ...xing, ...Array.from({ length: 10 }, () => mp3Frame()).flat()]);
    const delay = (0x04 << 4) | (0x60 >> 4);
    const padding = ((0x60 & 0xf) << 8) | 0x00;
    expect(mp3Header(bytes).durationUs).toBe(Math.round(((10 * 1152 - delay - padding) * 1e6) / 44100));
  });
  it("refuses a file without frames", () => {
    expect(() => mp3Header(new Uint8Array(1000))).toThrow(ProbeError);
  });
});

describe("Ogg", () => {
  const page = (granule: number, payload: number[]): number[] => [...text("OggS"), 0, 0, ...u32le(granule), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, payload.length, ...payload];
  it("Vorbis: the last granule position over the sample rate", () => {
    const ident = [1, ...text("vorbis"), ...u32le(0), 2, ...u32le(44100)];
    const bytes = Uint8Array.from([...page(0, ident), ...page(88200, [0]), ...page(132300, [0])]);
    expect(oggHeader(bytes, bytes)).toMatchObject({ durationUs: 3_000_000, audio: { channels: 2, sampleRate: 44100 } });
  });
  it("Opus: granule positions run at 48 kHz less the pre-skip", () => {
    const head = [...text("OpusHead"), 1, 2, ...u16le(312), ...u32le(44100), 0, 0, 0];
    const bytes = Uint8Array.from([...page(0, head), ...page(48000 * 2 + 312, [0])]);
    expect(oggHeader(bytes, bytes).durationUs).toBe(2_000_000);
  });
});

describe("images", () => {
  it("PNG: IHDR size", () => {
    const bytes = Uint8Array.from([0x89, ...text("PNG"), 13, 10, 26, 10, ...u32be(13), ...text("IHDR"), ...u32be(640), ...u32be(360)]);
    expect(pngHeader(bytes)).toEqual({ kind: "image", durationUs: 0, width: 640, height: 360, hasAudio: false, codec: "png" });
  });
  it("JPEG: the frame header, and the EXIF orientation turns the picture", () => {
    const sof = [0xff, 0xc0, 0, 11, 8, 0x01, 0x68, 0x02, 0x80, 1, 1, 0x11, 0];
    const plain = Uint8Array.from([0xff, 0xd8, ...sof]);
    expect(jpegHeader(plain)).toMatchObject({ width: 640, height: 360, codec: "jpeg" });
    const exif = [...text("Exif"), 0, 0, ...text("MM"), 0, 42, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0, 0, 0, 0, 0];
    const turned = Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, 0, exif.length + 2, ...exif, ...sof]);
    expect(jpegHeader(turned)).toMatchObject({ width: 360, height: 640 });
  });
  it("GIF: a single frame is a still, several make an animation with the browsers' frame timing", () => {
    const frame = (centis: number): number[] => [0x21, 0xf9, 4, 0, ...u16le(centis), 0, 0, 0x2c, 0, 0, 0, 0, 2, 0, 2, 0, 0, 2, 2, 0x44, 0x01, 0];
    const head = [...text("GIF89a"), ...u16le(2), ...u16le(2), 0, 0, 0];
    expect(gifHeader(Uint8Array.from([...head, ...frame(10), 0x3b]))).toMatchObject({ width: 2, height: 2, durationUs: 0 });
    // 10 cs = 100 ms; 1 cs = 10 ms is under the 20 ms minimum and shows for the 100 ms default.
    expect(gifHeader(Uint8Array.from([...head, ...frame(10), ...frame(1), 0x3b]))).toMatchObject({ durationUs: 200_000 });
  });
  it("WebP: VP8, VP8L and an animated VP8X", () => {
    const riff = (body: number[]): Uint8Array => Uint8Array.from([...text("RIFF"), ...u32le(body.length + 4), ...text("WEBP"), ...body]);
    const vp8 = riff([...text("VP8 "), ...u32le(10), 0, 0, 0, 0x9d, 0x01, 0x2a, ...u16le(320), ...u16le(200)]);
    expect(webpHeader(vp8)).toMatchObject({ width: 320, height: 200, durationUs: 0 });
    const bits = (99 | (49 << 14)) >>> 0;
    const vp8l = riff([...text("VP8L"), ...u32le(5), 0x2f, ...u32le(bits)]);
    expect(webpHeader(vp8l)).toMatchObject({ width: 100, height: 50 });
    const anmf = (ms: number): number[] => [...text("ANMF"), ...u32le(16), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ms & 255, ms >> 8, 0, 0];
    const vp8x = riff([...text("VP8X"), ...u32le(10), 0x02, 0, 0, 0, 63, 1, 0, 31, 1, 0, ...anmf(40), ...anmf(60)]);
    expect(webpHeader(vp8x)).toMatchObject({ width: 320, height: 288, durationUs: 100_000 });
  });
  it("SVG: width and height, else the viewBox, by the app's rule", () => {
    expect(svgHeader('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60px"></svg>')).toMatchObject({ width: 120, height: 60, codec: "svg" });
    expect(svgHeader("<?xml version='1.0'?><svg viewBox='0 0 300 150'/>")).toMatchObject({ width: 300, height: 150 });
    expect(svgHeader('<svg width="50%" viewBox="0 0 10 20"/>')).toMatchObject({ width: 10, height: 20 });
    expect(() => svgHeader("<svg/>")).toThrow(ProbeError);
    expect(() => svgHeader("not svg")).toThrow(ProbeError);
  });
});

describe("readMediaHeader", () => {
  it("reads MP4 and WebM through the app's own probes", async () => {
    const mp4 = buildMp4({ tracks: [{ kind: "video", codec: "avc1", timescale: 30000, width: 640, height: 360, samples: videoSamples(60, 1000) }] });
    expect(await readMediaHeader(blob(mp4), "a.mp4")).toMatchObject({ kind: "video", durationUs: 2_000_000, width: 640, height: 360, fps: { num: 30, den: 1 }, hasAudio: false });
    const webm = buildWebm({ tracks: [{ number: 1, type: "video", codecId: "V_VP9", width: 320, height: 240 }], blocks: videoBlocks(30, 33) });
    expect(await readMediaHeader(blob(webm), "a.webm")).toMatchObject({ kind: "video", width: 320, height: 240 });
  });
  it("dispatches by extension and names the problem for an unknown type or an unreadable file", async () => {
    expect(await readMediaHeader(blob(wav(480)), "tone.wav")).toMatchObject({ durationUs: 10_000 });
    await expect(readMediaHeader(blob([1, 2, 3]), "a.xyz")).rejects.toThrow("not a media type");
    await expect(readMediaHeader(blob([1, 2, 3]), "a.png")).rejects.toThrow("not a readable PNG");
    await expect(readMediaHeader(blob([1, 2, 3]), "a.mp4")).rejects.toBeInstanceOf(ProbeError);
    await expect(readMediaHeader(blob([1, 2, 3]), "a.aac")).rejects.toThrow("no header reader");
  });
});
