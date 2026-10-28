import { describe, expect, it } from "vitest";
import { compareSources, type FrameSource } from "./compareFrames.js";

function source(kind: "video" | "png", keys: number[]): FrameSource {
  return {
    kind,
    keys,
    async get() {
      return { width: 8, height: 8, data: new Uint8ClampedArray(8 * 8 * 4).fill(128) };
    },
    close: async () => undefined,
  } as FrameSource;
}

const options = { region: null, diffBase: null, worst: 3 };
const video = () => source("video", Array.from({ length: 90 }, (_, index) => index));

describe("compareSources", () => {
  it("compares two videos of the same length with nothing unmatched", async () => {
    const report = await compareSources(video(), video(), options);
    expect(report.compared).toBe(90);
    expect(report.unmatched).toEqual([]);
  });

  it("reports frames one video has and the other lacks", async () => {
    const report = await compareSources(video(), source("video", [0, 1, 2]), options);
    expect(report.compared).toBe(3);
    expect(report.unmatched).toHaveLength(87);
  });

  it("compares two PNG sets by number and reports names missing on either side", async () => {
    const report = await compareSources(source("png", [0, 45]), source("png", [45, 89]), options);
    expect(report.compared).toBe(1);
    expect(report.unmatched.sort((x, y) => x - y)).toEqual([0, 89]);
  });

  it("compares a video against a PNG folder on the frames the folder names, in both orders", async () => {
    const pngs = () => source("png", [0, 45, 89]);
    for (const [a, b] of [
      [video(), pngs()],
      [pngs(), video()],
    ] as const) {
      const report = await compareSources(a, b, options);
      expect(report.compared).toBe(3);
      expect(report.unmatched).toEqual([]);
    }
  });

  it("flags PNG frames the video does not have", async () => {
    const short = source("video", [0, 1, 2]);
    expect((await compareSources(short, source("png", [0, 45]), options)).unmatched).toEqual([45]);
    expect((await compareSources(source("png", [0, 45]), short, options)).unmatched).toEqual([45]);
  });
});
