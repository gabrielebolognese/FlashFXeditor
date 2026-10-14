import { describe, expect, it } from "vitest";
import { mipLevelCount, textureBytes } from "./mipmaps.js";

describe("mip chains", () => {
  it("counts levels down to 1 x 1", () => {
    expect(mipLevelCount(1, 1)).toBe(1);
    expect(mipLevelCount(2, 1)).toBe(2);
    expect(mipLevelCount(4000, 3000)).toBe(12);
    expect(mipLevelCount(1080, 1920)).toBe(11);
  });

  it("adds about a third for the chain", () => {
    expect(textureBytes(1920, 1080, 1)).toBe(1920 * 1080 * 4);
    const full = textureBytes(4000, 3000, mipLevelCount(4000, 3000));
    expect(full).toBeGreaterThan(48_000_000 * 1.33);
    expect(full).toBeLessThan(48_000_000 * 1.34);
    expect(textureBytes(4, 1, 3)).toBe(16 + 8 + 4);
  });
});
