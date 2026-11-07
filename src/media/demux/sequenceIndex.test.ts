import { describe, expect, it } from "vitest";
import { frameAt, keyFor } from "./sampleIndex.js";
import { SEQUENCE_CODEC, sequenceIndex } from "./sequenceIndex.js";

describe("sequenceIndex", () => {
  it("makes every frame a sync sample at the project rate, with offset = frame number", () => {
    const index = sequenceIndex([10, 20, 30, 40], { num: 30, den: 1 }, 64, 48);
    expect(index.codec).toBe(SEQUENCE_CODEC);
    expect(index.sync.every((s) => s === 1)).toBe(true);
    expect(Array.from(index.offsets)).toEqual([0, 1, 2, 3]);
    expect(Array.from(index.sizes)).toEqual([10, 20, 30, 40]);
    expect(frameAt(index, 33_334)).toBe(1);
    expect(keyFor(index, 2)).toBe(2);
  });
});
