import { describe, expect, it } from "vitest";
import { clipLod, clipSpan, devicePx } from "./clipLayout.js";

describe("clip layout", () => {
  it("rounds edges to device pixels and gives abutting clips a 1 px separator", () => {
    expect(clipSpan(10.2, 50.7, false, 1)).toEqual({ x0: 10, x1: 51 });
    expect(clipSpan(10.2, 50.7, true, 1)).toEqual({ x0: 10, x1: 50 });
    expect(clipSpan(10.2, 50.7, true, 2)).toEqual({ x0: 20, x1: 100 });
    // Two abutting clips never share a pixel and leave exactly one between them.
    const a = clipSpan(0, 33.3, true, 1.5);
    const b = clipSpan(33.3, 70, false, 1.5);
    expect(b.x0 - a.x1).toBe(1);
  });

  it("keeps sub-pixel clips one device pixel wide", () => {
    expect(clipSpan(10, 10.2, false, 1)).toEqual({ x0: 10, x1: 11 });
    expect(clipSpan(10, 10.6, true, 1)).toEqual({ x0: 10, x1: 11 });
  });

  it("picks the level of detail from the width (spec §6.4)", () => {
    expect(clipLod(0.4)).toBe("line");
    expect(clipLod(5.9)).toBe("line");
    expect(clipLod(6)).toBe("body");
    expect(clipLod(23.9)).toBe("body");
    expect(clipLod(24)).toBe("full");
  });

  it("turns CSS lengths into whole device pixels, at least 1", () => {
    expect(devicePx(1.5, 1)).toBe(2);
    expect(devicePx(1.5, 2)).toBe(3);
    expect(devicePx(0.2, 1)).toBe(1);
  });
});
