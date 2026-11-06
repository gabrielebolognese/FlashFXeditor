import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applyColorOverrides,
  collectColors,
  describeLottie,
  frameRateRatio,
  isZip,
  looksLikeLottie,
  lottieFrameAt,
  lottieTimeUs,
  lottieVariantId,
  parseLottieVariant,
  readLottie,
  sameOverrides,
  type LottieJson,
} from "./lottieFile.js";

const DIR = "fixtures/interop/lottie/animations";
const bytes = (name: string) => new Uint8Array(readFileSync(`${DIR}/${name}`));
const red = { r: 1, g: 0, b: 0, a: 1 };
const blue = { r: 0, g: 0, b: 1, a: 1 };

describe("Lottie files (Batch 79)", () => {
  it("sniffs animations by their keys and archives by their magic", async () => {
    expect(isZip(bytes("pulse.lottie"))).toBe(true);
    expect(isZip(bytes("spinner.json"))).toBe(false);
    expect(looksLikeLottie(JSON.parse(readFileSync(`${DIR}/bounce.json`, "utf8")))).toBe(true);
    expect(looksLikeLottie({ name: "package.json", version: "1" })).toBe(false);
    expect(looksLikeLottie([])).toBe(false);
    expect(looksLikeLottie(null)).toBe(false);
    await expect(readLottie(new TextEncoder().encode('{"hello":1}'))).rejects.toThrow(/not a Lottie/);
    await expect(readLottie(new TextEncoder().encode("not json"))).rejects.toThrow();
  });

  it("reads json files and .lottie archives alike, with their size, rate and length", async () => {
    const spinner = await readLottie(bytes("spinner.json"));
    expect(spinner.format).toBe("json");
    expect(describeLottie(spinner.json, spinner.format)).toMatchObject({ width: 240, height: 240, frameRate: 60, frames: 120, durationUs: 2_000_000, fps: { num: 60, den: 1 } });
    const pulse = await readLottie(bytes("pulse.lottie"));
    expect(pulse.format).toBe("dotlottie");
    expect(describeLottie(pulse.json, pulse.format)).toMatchObject({ width: 200, height: 200, frameRate: 30, frames: 60, durationUs: 2_000_000 });
  });

  it("refuses a damaged archive, an empty one and unusable animations with a message", async () => {
    const zip = bytes("pulse.lottie");
    await expect(readLottie(zip.subarray(0, 40))).rejects.toThrow(/archive/);
    const base: LottieJson = { v: "5", fr: 30, ip: 0, op: 30, w: 10, h: 10, layers: [{}] } as never;
    expect(() => describeLottie({ ...base, op: 0 }, "json")).toThrow(/no frames/);
    expect(() => describeLottie({ ...base, w: 0 }, "json")).toThrow(/no size/);
    expect(() => describeLottie({ ...base, layers: [] }, "json")).toThrow(/no layers/);
    expect(() => describeLottie({ ...base, fr: 0 }, "json")).toThrow(/frame rate/);
  });

  it("writes fractional frame rates as small ratios", () => {
    expect(frameRateRatio(60)).toEqual({ num: 60, den: 1 });
    expect(frameRateRatio(29.97)).toEqual({ num: 2997, den: 100 });
    expect(frameRateRatio(23.976)).toEqual({ num: 2997, den: 125 });
  });

  it("replaces static and keyed colors, and only the ones that match", async () => {
    const { json } = await readLottie(bytes("bounce.json"));
    expect(collectColors(json).map((c) => [c.r, c.g, c.b])).toEqual([
      [0.2, 0.2, 0.25],
      [0.95, 0.2, 0.3],
      [0.2, 0.8, 0.4],
    ]);
    const replaced = applyColorOverrides(json, [{ from: { r: 0.95, g: 0.2, b: 0.3, a: 1 }, to: blue }]);
    // Keys at frame 0 and frame 90 hold the red.
    expect(replaced).toBe(2);
    expect(collectColors(json).some((c) => c.r === 0.95)).toBe(false);
    expect(collectColors(json).some((c) => c.b === 1 && c.r === 0)).toBe(true);
    expect(applyColorOverrides(json, [{ from: { r: 0.5, g: 0.5, b: 0.5, a: 1 }, to: red }])).toBe(0);
    expect(applyColorOverrides(json, [])).toBe(0);
  });

  it("matches colors within one 8-bit step", () => {
    const json = { layers: [{ shapes: [{ ty: "fl", c: { a: 0, k: [0.2, 0.4, 0.6, 1] } }] }] };
    expect(applyColorOverrides(json, [{ from: { r: 51 / 255, g: 102 / 255, b: 153 / 255, a: 1 }, to: red }])).toBe(1);
    expect(json.layers[0]?.shapes[0]?.c.k).toEqual([1, 0, 0, 1]);
  });

  it("round-trips variant ids and compares override lists", () => {
    expect(lottieVariantId("m1", undefined)).toBe("m1");
    expect(lottieVariantId("m1", [])).toBe("m1");
    const id = lottieVariantId("m1", [{ from: red, to: blue }]);
    expect(id).toBe("m1~lc:ff0000ff>0000ffff");
    expect(parseLottieVariant(id)).toEqual({ mediaId: "m1", overrides: [{ from: red, to: blue }] });
    expect(parseLottieVariant("m1")).toEqual({ mediaId: "m1", overrides: [] });
    expect(sameOverrides(undefined, [])).toBe(true);
    expect(sameOverrides([{ from: red, to: blue }], [{ from: red, to: blue }])).toBe(true);
    expect(sameOverrides([{ from: red, to: blue }], [{ from: blue, to: red }])).toBe(false);
  });

  it("maps media time to animation time: loop wraps, otherwise the last frame holds", () => {
    expect(lottieTimeUs(2_500_000, 2_000_000, true)).toBe(500_000);
    expect(lottieTimeUs(-500_000, 2_000_000, true)).toBe(1_500_000);
    expect(lottieTimeUs(5_000_000, 2_000_000, false)).toBe(1_999_999);
    expect(lottieTimeUs(-1, 2_000_000, false)).toBe(0);
    expect(lottieTimeUs(10, 0, true)).toBe(0);
    expect(lottieFrameAt(1_000_000, 60, 120)).toBe(60);
    expect(lottieFrameAt(9_000_000, 60, 120)).toBeLessThan(120);
  });
});
