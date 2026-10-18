import { describe, expect, it } from "vitest";
import { blobReader, children, EbmlError, readElementHeader, readFloat, readInt, readString, readUint, readVint, UNKNOWN_SIZE, vintLength, WindowReader } from "./ebml.js";
import { el, sizeBytes, uintEl } from "./testWebm.js";

const bytes = (...values: number[]) => Uint8Array.from(values);

describe("variable-length integers", () => {
  it("take their length from the leading zero bits", () => {
    expect(vintLength(0x81)).toBe(1);
    expect(vintLength(0x40)).toBe(2);
    expect(vintLength(0x1a)).toBe(4);
    expect(vintLength(0x01)).toBe(8);
    expect(vintLength(0)).toBe(0);
  });

  it("read values without their marker", () => {
    expect(readVint(bytes(0x81), 0)).toEqual([1, 1]);
    expect(readVint(bytes(0x40, 0x02), 0)).toEqual([2, 2]);
    expect(readVint(bytes(0x10, 0x00, 0x01, 0x00), 0)).toEqual([256, 4]);
    for (const value of [0, 1, 126, 127, 16_382, 16_383, 2 ** 21, 2 ** 40]) expect(readVint(sizeBytes(value), 0)?.[0]).toBe(value);
  });

  it("read all ones as an unknown size, at any length", () => {
    expect(readVint(bytes(0xff), 0)).toEqual([UNKNOWN_SIZE, 1]);
    expect(readVint(bytes(0x7f, 0xff), 0)).toEqual([UNKNOWN_SIZE, 2]);
    expect(readVint(bytes(0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff), 0)).toEqual([UNKNOWN_SIZE, 8]);
    expect(readVint(bytes(0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xfe), 0)?.[0]).toBe(2 ** 56 - 2);
  });

  it("return null when the bytes end inside one and throw on a zero byte", () => {
    expect(readVint(bytes(0x40), 0)).toBeNull();
    expect(readVint(bytes(), 0)).toBeNull();
    expect(() => readVint(bytes(0x00, 0x81), 0)).toThrow(EbmlError);
  });
});

describe("element headers", () => {
  it("read the ID with its marker, the size and the header length", () => {
    expect(readElementHeader(bytes(0x1a, 0x45, 0xdf, 0xa3, 0x9f), 0)).toEqual({ id: 0x1a45dfa3, size: 31, headerLength: 5 });
    expect(readElementHeader(bytes(0xa3, 0x84), 0)).toEqual({ id: 0xa3, size: 4, headerLength: 2 });
    expect(readElementHeader(bytes(0x1f, 0x43, 0xb6, 0x75, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff), 0)).toEqual({ id: 0x1f43b675, size: UNKNOWN_SIZE, headerLength: 12 });
  });

  it("return null when truncated and throw on IDs longer than 4 bytes", () => {
    expect(readElementHeader(bytes(0x1a, 0x45), 0)).toBeNull();
    expect(readElementHeader(bytes(0xa3), 0)).toBeNull();
    expect(() => readElementHeader(bytes(0x08, 0, 0, 0, 0, 0x81), 0)).toThrow(EbmlError);
  });
});

describe("payload values", () => {
  it("read integers, floats and strings", () => {
    expect(readUint(bytes(0x0f, 0x42, 0x40), 0, 3)).toBe(1_000_000);
    expect(readUint(bytes(), 0, 0)).toBe(0);
    expect(readInt(bytes(0xff, 0xfe), 0, 2)).toBe(-2);
    expect(readInt(bytes(0x7f, 0xff), 0, 2)).toBe(32_767);
    const f8 = new Uint8Array(8);
    new DataView(f8.buffer).setFloat64(0, 48000.5);
    expect(readFloat(f8, 0, 8)).toBe(48000.5);
    const f4 = new Uint8Array(4);
    new DataView(f4.buffer).setFloat32(0, 44100);
    expect(readFloat(f4, 0, 4)).toBe(44100);
    expect(readString(new TextEncoder().encode("V_VP9\0\0"), 0, 7)).toBe("V_VP9");
  });

  it("list the children of a master element and refuse truncated ones", () => {
    const master = el(0xe0, uintEl(0xb0, 1920), uintEl(0xba, 1080));
    const payload = master.subarray(2);
    expect([...children(payload)].map((child) => [child.id, readUint(payload, child.at, child.size)])).toEqual([
      [0xb0, 1920],
      [0xba, 1080],
    ]);
    expect(() => [...children(payload.subarray(0, payload.length - 1))]).toThrow(EbmlError);
  });
});

describe("WindowReader", () => {
  const file = Uint8Array.from({ length: 1000 }, (_, i) => i % 251);
  const reader = (window: number) => new WindowReader(blobReader(new Blob([file])), undefined, window);

  it("serves reads inside the window from memory", async () => {
    const r = reader(256);
    expect([...(await r.view(10, 4))]).toEqual([10, 11, 12, 13]);
    expect([...(await r.view(200, 3))]).toEqual([200, 201, 202]);
    expect(r.loads).toBe(1);
  });

  it("loads a new window for reads past it, even across the edge, and clamps at the end", async () => {
    const r = reader(256);
    await r.view(0, 1);
    expect([...(await r.view(254, 4))]).toEqual([3, 4, 5, 6]); // bytes 254-257 (i % 251)
    expect(r.loads).toBe(2);
    expect((await r.view(995, 20)).length).toBe(5);
    expect(await r.header(1000)).toBeNull();
  });

  it("reads windows larger than the default when asked", async () => {
    const r = reader(16);
    expect((await r.view(0, 600)).length).toBe(600);
    expect(r.loads).toBe(1);
  });

  it("stops when the signal aborts", async () => {
    const controller = new AbortController();
    const r = new WindowReader(blobReader(new Blob([file])), controller.signal, 16);
    await r.view(0, 4);
    controller.abort();
    await expect(r.view(500, 4)).rejects.toThrow();
  });
});
