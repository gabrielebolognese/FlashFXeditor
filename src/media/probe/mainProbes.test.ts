import { describe, expect, it } from "vitest";
import { probeAudioFile } from "./audioProbe.js";
import { probeSvg, svgSize } from "./svgProbe.js";
import { ProbeError } from "./types.js";

describe("probeAudioFile", () => {
  it("takes the duration from the decoded length", async () => {
    const decode = async () => ({ length: 48_000 * 61 + 24, sampleRate: 48_000, numberOfChannels: 2 });
    await expect(probeAudioFile(new Blob(["mp3"]), "mp3", decode)).resolves.toEqual({
      kind: "audio",
      durationUs: 61_000_500,
      hasAudio: true,
      audioCodec: "mp3",
      audio: { channels: 2, sampleRate: 0 },
    });
  });

  it("turns decode failures and empty audio into ProbeErrors", async () => {
    const failing = async () => {
      throw new DOMException("Unable to decode audio data", "EncodingError");
    };
    await expect(probeAudioFile(new Blob(["x"]), "mp3", failing)).rejects.toThrow(ProbeError);
    await expect(probeAudioFile(new Blob(["x"]), "wav", async () => ({ length: 0, sampleRate: 48_000, numberOfChannels: 1 }))).rejects.toThrow(/empty/);
  });
});

describe("svgSize", () => {
  const svg = (attrs: string) => `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}><rect width="1" height="1"/></svg>`;

  it("uses width and height, in px or unitless", () => {
    expect(svgSize(svg('width="120" height="40.4px"'))).toEqual({ width: 120, height: 40 });
  });

  it("falls back to the viewBox, keeping its aspect when one side is given", () => {
    expect(svgSize(svg('viewBox="0 0 512 256"'))).toEqual({ width: 512, height: 256 });
    expect(svgSize(svg('width="100" viewBox="0,0,512,256"'))).toEqual({ width: 100, height: 50 });
    expect(svgSize(svg('width="100%" height="100%" viewBox="0 0 24 24"'))).toEqual({ width: 24, height: 24 });
  });

  it("returns null without a size or for non-SVG text", () => {
    expect(svgSize(svg(""))).toBeNull();
    expect(svgSize("<html></html>")).toBeNull();
    expect(svgSize("not xml at all")).toBeNull();
  });

  it("probes an SVG file as a still image", async () => {
    await expect(probeSvg(new Blob([svg('viewBox="0 0 64 32"')], { type: "image/svg+xml" }))).resolves.toEqual({ kind: "image", durationUs: 0, width: 64, height: 32, hasAudio: false, codec: "svg" });
    await expect(probeSvg(new Blob(["nope"]))).rejects.toThrow(ProbeError);
  });
});
