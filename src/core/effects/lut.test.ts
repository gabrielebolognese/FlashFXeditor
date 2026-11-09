import { describe, expect, it } from "vitest";
import { identityLUT, lutAtlas, parseCube, sampleAtlas, sampleLUT, writeCube, type LUT3D } from "./lut.js";

/** A warm LUT: r up, b down, a little contrast. */
function warm(size: number): LUT3D {
  const lut = identityLUT(size);
  for (let i = 0; i < lut.data.length; i += 3) {
    lut.data[i] = Math.min(1, (lut.data[i] as number) * 1.1 + 0.03);
    lut.data[i + 2] = (lut.data[i + 2] as number) * 0.85;
  }
  return lut;
}

/** A seeded generator (mulberry32): the same cases on every run. */
function random(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe(".cube LUTs (spec §21.19, Batch 75)", () => {
  it("parses a cube file: comments, title, size, domain, rows red-fastest", () => {
    const text = `# made by hand\nTITLE "two"\nLUT_3D_SIZE 2\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 1 1 1\n0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1\n`;
    const lut = parseCube(text);
    expect(lut?.size).toBe(2);
    expect(sampleLUT(lut as LUT3D, 0.25, 0.5, 0.75).map((v) => +v.toFixed(6))).toEqual([0.25, 0.5, 0.75]);
  });

  it("refuses 1D LUTs, a wrong row count, an oversized grid and junk", () => {
    expect(parseCube("LUT_1D_SIZE 2\n0 0 0\n1 1 1\n")).toBeNull();
    expect(parseCube("LUT_3D_SIZE 2\n0 0 0\n")).toBeNull();
    expect(parseCube("LUT_3D_SIZE 99\n")).toBeNull();
    expect(parseCube("hello")).toBeNull();
    expect(parseCube("LUT_3D_SIZE 2\n0 0 x\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1\n")).toBeNull();
  });

  it("round-trips through writeCube", () => {
    const lut = warm(5);
    const back = parseCube(writeCube(lut, 'a "warm" look')) as LUT3D;
    expect(back.size).toBe(5);
    back.data.forEach((v, i) => expect(v).toBeCloseTo(lut.data[i] as number, 5));
    const ranged = { ...identityLUT(3), domainMin: [0, 0, 0] as const, domainMax: [2, 2, 2] as const };
    expect(parseCube(writeCube(ranged, "hdr"))?.domainMax).toEqual([2, 2, 2]);
  });

  it("maps input through DOMAIN_MIN/MAX", () => {
    const lut = { ...identityLUT(2), domainMax: [2, 2, 2] as const };
    expect(sampleLUT(lut, 1, 1, 1).map((v) => +v.toFixed(6))).toEqual([0.5, 0.5, 0.5]);
    expect(sampleAtlas(lutAtlas(lut), 1, 1, 1)[0]).toBeCloseTo(0.5, 2);
  });

  it("samples the 8-bit atlas like the float LUT, within 8-bit rounding", () => {
    const lut = warm(17);
    const atlas = lutAtlas(lut);
    expect(atlas.width).toBe(17 * 17);
    expect(atlas.height).toBe(17);
    const next = random(17);
    for (let i = 0; i < 2000; i++) {
      const [r, g, b] = [next(), next(), next()];
      const exact = sampleLUT(lut, r, g, b);
      const packed = sampleAtlas(atlas, r, g, b);
      for (let c = 0; c < 3; c++) expect(Math.abs((packed[c] as number) - (exact[c] as number))).toBeLessThan(0.5 / 255 + 1e-9);
    }
  });

  it("is the identity on grid points of an identity LUT", () => {
    const atlas = lutAtlas(identityLUT(33));
    for (const v of [0, 8 / 32, 16 / 32, 1]) expect(sampleAtlas(atlas, v, 1 - v, v)[1]).toBeCloseTo(1 - v, 2);
  });
});
