import { describe, expect, it } from "vitest";
import { paddedBytesPerRow, unpadAndUnpremultiply } from "./readback.js";

describe("readback", () => {
  it("pads rows to 256 bytes", () => {
    expect(paddedBytesPerRow(1)).toBe(256);
    expect(paddedBytesPerRow(64)).toBe(256);
    expect(paddedBytesPerRow(65)).toBe(512);
    expect(paddedBytesPerRow(1080)).toBe(4352);
  });

  it("drops the row padding and keeps opaque pixels as they are", () => {
    const pitch = 256;
    const source = new Uint8Array(pitch * 2);
    source.set([10, 20, 30, 255, 40, 50, 60, 255], 0);
    source.set([70, 80, 90, 255, 1, 2, 3, 255], pitch);
    expect([...unpadAndUnpremultiply(source, 2, 2, pitch)]).toEqual([10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255, 1, 2, 3, 255]);
  });

  it("turns premultiplied alpha into straight alpha", () => {
    const source = new Uint8Array(256);
    source.set([64, 32, 0, 128, 9, 9, 9, 0], 0);
    expect([...unpadAndUnpremultiply(source, 2, 1, 256)]).toEqual([128, 64, 0, 128, 0, 0, 0, 0]);
  });
});
