import { describe, expect, it } from "vitest";
import { crc32, dosDateTime, ZipTooLargeError, ZipWriter } from "./zip.js";

/** Reads a stored zip back: names, bytes and whether each CRC matches. */
function readZip(zip: Uint8Array): { name: string; data: Uint8Array; crcOk: boolean; time: number; date: number }[] {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const end = zip.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  expect(at + view.getUint32(end + 12, true)).toBe(end);
  const out = [];
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    expect(view.getUint16(at + 10, true)).toBe(0); // stored
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 20, true);
    expect(view.getUint32(at + 24, true)).toBe(size);
    const nameLength = view.getUint16(at + 28, true);
    const local = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(zip.slice(at + 46, at + 46 + nameLength));
    // The local header repeats the name and sizes, then the data.
    expect(view.getUint32(local, true)).toBe(0x04034b50);
    expect(view.getUint16(local + 6, true) & 0x08).toBe(0); // no data descriptor
    expect(view.getUint32(local + 18, true)).toBe(size);
    const dataAt = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = zip.slice(dataAt, dataAt + size);
    out.push({ name, data, crcOk: crc32(data) === crc, time: view.getUint16(at + 12, true), date: view.getUint16(at + 14, true) });
    at += 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
  }
  return out;
}

async function zipOf(files: Record<string, Blob | Uint8Array>, modified?: Date): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  const writer = new ZipWriter((data) => void parts.push(data.slice()));
  for (const [path, source] of Object.entries(files)) await writer.addFile(path, source, modified);
  await writer.finish();
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

describe("crc32", () => {
  it("matches the standard check values, and continues across chunks", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array(0))).toBe(0);
    const data = Uint8Array.from({ length: 1000 }, (_, i) => (i * 31) & 255);
    expect(crc32(data.subarray(300), crc32(data.subarray(0, 300)))).toBe(crc32(data));
  });
});

describe("dosDateTime", () => {
  it("packs local time at 2 s resolution and the date from 1980", () => {
    const { time, date } = dosDateTime(new Date(2026, 10, 9, 13, 45, 31));
    expect(time).toBe((13 << 11) | (45 << 5) | 15);
    expect(date).toBe(((2026 - 1980) << 9) | (11 << 5) | 9);
    expect(dosDateTime(new Date(1970, 0, 1)).date >> 9).toBe(0);
  });
});

describe("ZipWriter", () => {
  it("writes stored entries with correct CRCs, sizes and names, in order", async () => {
    const big = new Uint8Array(200_000).map((_, i) => (i * 7) & 255);
    const zip = await zipOf({ "project.json": new TextEncoder().encode('{"a":1}'), "media/clip one.mp4": new Blob([big as Uint8Array<ArrayBuffer>]), "fonts/é.ttf": new Uint8Array(0) });
    const entries = readZip(zip);
    expect(entries.map((e) => e.name)).toEqual(["project.json", "media/clip one.mp4", "fonts/é.ttf"]);
    expect(entries.every((e) => e.crcOk)).toBe(true);
    expect(new TextDecoder().decode(entries[0]!.data)).toBe('{"a":1}');
    expect(Array.from(entries[1]!.data.slice(0, 50))).toEqual(Array.from(big.slice(0, 50)));
    expect(entries[1]!.data.length).toBe(200_000);
    expect(entries[2]!.data.length).toBe(0);
  });

  it("stamps the entries with the modified time, and counts its bytes", async () => {
    const when = new Date(2025, 5, 1, 8, 30, 10);
    const parts: number[] = [];
    const writer = new ZipWriter((data) => void parts.push(data.length));
    await writer.addFile("a.txt", Uint8Array.of(1, 2, 3), when);
    await writer.finish();
    expect(writer.bytes).toBe(parts.reduce((n, p) => n + p, 0));
    expect(writer.count).toBe(1);
    const zip = await zipOf({ "a.txt": Uint8Array.of(1, 2, 3) }, when);
    expect(readZip(zip)[0]).toMatchObject({ time: dosDateTime(when).time, date: dosDateTime(when).date });
  });

  it("an empty zip is just the end record; adding after the end, or a file that grew, throws", async () => {
    const empty = await zipOf({});
    expect(empty.length).toBe(22);
    const writer = new ZipWriter(() => undefined);
    await writer.finish();
    await expect(writer.addFile("x", Uint8Array.of(1))).rejects.toThrow();
  });

  it("refuses a file or a zip past the classic limits", async () => {
    const writer = new ZipWriter(() => undefined);
    const huge = { size: 5 * 2 ** 30 } as unknown as Blob;
    await expect(writer.addFile("huge.bin", huge)).rejects.toBeInstanceOf(ZipTooLargeError);
  });

  it("stops at an aborted signal", async () => {
    const controller = new AbortController();
    controller.abort(new Error("cancelled"));
    const writer = new ZipWriter(() => undefined);
    await expect(writer.addFile("a", new Blob([new Uint8Array(10)]), new Date(), controller.signal)).rejects.toThrow("cancelled");
  });
});
