import { describe, expect, it } from "vitest";
import { isHdrColorSpace } from "./hdr.js";

describe("isHdrColorSpace (Batch 47)", () => {
  it("routes HLG, PQ and BT.2020 frames through the color-managed canvas", () => {
    // An iPhone HDR clip's decoded frames.
    expect(isHdrColorSpace({ primaries: "bt2020", transfer: "hlg", matrix: "bt2020-ncl", fullRange: false } as never)).toBe(true);
    expect(isHdrColorSpace({ primaries: "bt2020", transfer: "pq" })).toBe(true);
    expect(isHdrColorSpace({ primaries: "bt2020", transfer: "bt709" })).toBe(true);
  });

  it("leaves SDR frames on the direct GPU paths", () => {
    expect(isHdrColorSpace({ primaries: "bt709", transfer: "bt709" })).toBe(false);
    expect(isHdrColorSpace({ primaries: "smpte170m", transfer: "smpte170m" })).toBe(false);
    expect(isHdrColorSpace({ primaries: null, transfer: null })).toBe(false);
    expect(isHdrColorSpace(null)).toBe(false);
  });
});
