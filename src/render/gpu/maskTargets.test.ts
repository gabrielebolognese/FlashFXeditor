import { describe, expect, it } from "vitest";
import { MASK_DATA_WIDTH, packMasks, maskBlockFloats } from "../../core/masks/maskCoverage.js";
import type { Mask } from "../../core/document/types.js";
import type { MaskFrame } from "../compositor/drawList.js";
import { coverageSize, evictCoverage, MASK_COVERAGE_MAX, MASK_DATA_LEAD, maskDataRows, pickCoverage, writeMaskData, type CoverageEntry } from "./maskTargets.js";

const ellipse: Mask = { id: "e", shape: { kind: "ellipse", x: 10, y: 10, w: 80, h: 40 }, mode: "add", feather: 40, expansion: 0, opacity: 1, inverted: false };

function frame(clipId: string, version: number, width = 100, height = 60): MaskFrame {
  const data = new Float32Array(maskBlockFloats([ellipse]));
  const length = packMasks([ellipse], width, height, data);
  return { clipId, data, length, version, width, height, model: [1, 0, 0, 1, 0, 0], persp: null };
}

describe("mask coverage textures (spec §21.18)", () => {
  it("one texel per content px, the long side capped", () => {
    expect(coverageSize(1080, 1920)).toEqual({ width: 1080, height: 1920 });
    expect(coverageSize(3840, 2160)).toEqual({ width: MASK_COVERAGE_MAX, height: 1152 });
    expect(coverageSize(0.4, 0)).toEqual({ width: 1, height: 1 });
    expect(coverageSize(100.2, 50)).toEqual({ width: 101, height: 50 });
  });

  it("the data texture holds the lead texel, then the block", () => {
    const mask = frame("a", 1, 200, 100);
    const rows = maskDataRows(mask);
    expect(rows).toBe(1);
    const out = new Float32Array(rows * MASK_DATA_WIDTH * 4);
    const written = writeMaskData(out, mask, 100, 50);
    expect(written).toBe(MASK_DATA_LEAD * 4 + mask.length);
    expect([out[0], out[1]]).toEqual([2, 2]);
    expect(Array.from(out.subarray(4, 4 + mask.length))).toEqual(Array.from(mask.data.subarray(0, mask.length)));
    expect(maskDataRows({ ...mask, length: MASK_DATA_WIDTH * 4 })).toBe(2);
  });

  it("a kept version draws nothing; a new version redraws the clip's texture; two panes get two", () => {
    const pool: CoverageEntry[] = [];
    expect(pickCoverage(pool, frame("a", 1), 1)).toBeNull();
    pool.push({ clipId: "a", version: 1, width: 100, height: 60, used: 1 });
    expect(pickCoverage(pool, frame("a", 1), 2)).toEqual({ entry: pool[0], draw: false });
    // Animated: the same entry is drawn again.
    expect(pickCoverage(pool, frame("a", 2), 3)).toEqual({ entry: pool[0], draw: true });
    (pool[0] as CoverageEntry).version = 2;
    // The other pane shows the clip at another version in the same draw: a new entry.
    expect(pickCoverage(pool, frame("a", 3), 3)).toBeNull();
    expect(pickCoverage(pool, frame("b", 4), 3)).toBeNull();
  });

  it("entries unused for longer than `keep` draws are destroyed", () => {
    const pool: CoverageEntry[] = [
      { clipId: "a", version: 1, width: 1, height: 1, used: 1 },
      { clipId: "b", version: 2, width: 1, height: 1, used: 9 },
    ];
    const gone: string[] = [];
    evictCoverage(pool, 10, 3, (entry) => gone.push(entry.clipId));
    expect(gone).toEqual(["a"]);
    expect(pool.map((e) => e.clipId)).toEqual(["b"]);
  });
});
