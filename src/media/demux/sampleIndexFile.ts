// The binary file of a sample index (spec §9.2): cache/index/<mediaId>.bin. A header (magic,
// version, the source file's size and lastModified, the decoder configuration) and the sample
// arrays, each 8-byte aligned. A file whose header does not match the source (replaced or edited
// file) or that is damaged reads as null, and the index is built again.
import type { Rotation } from "../probe/rotation.js";
import { createSampleIndex, type SampleIndex } from "./sampleIndex.js";

const MAGIC = 0x58495853; // "SXIX" little-endian
export const INDEX_VERSION = 1;

/** What identifies the source file the index was built from. */
export interface SourceStamp {
  size: number;
  lastModified: number;
}

const align8 = (n: number) => (n + 7) & ~7;

/** The index as a file, stamped with its source file. */
export function writeSampleIndex(index: SampleIndex, source: SourceStamp): ArrayBuffer {
  const codec = new TextEncoder().encode(index.codec);
  const n = index.count;
  const headerBytes = 48 + codec.length + index.description.length;
  const layout: [ArrayBufferView, number][] = [];
  let offset = align8(headerBytes);
  for (const array of [index.offsets, index.dts, index.cts, index.sizes, index.durations, index.sync]) {
    layout.push([array, offset]);
    offset = align8(offset + array.byteLength);
  }
  const buffer = new ArrayBuffer(offset);
  const view = new DataView(buffer);
  view.setUint32(0, MAGIC, true);
  view.setUint32(4, INDEX_VERSION, true);
  view.setFloat64(8, source.size, true);
  view.setFloat64(16, source.lastModified, true);
  view.setUint32(24, index.timescale, true);
  view.setUint32(28, index.codedWidth, true);
  view.setUint32(32, index.codedHeight, true);
  view.setUint16(36, index.rotation, true);
  view.setUint16(38, codec.length, true);
  view.setUint32(40, index.description.length, true);
  view.setUint32(44, n, true);
  const bytes = new Uint8Array(buffer);
  bytes.set(codec, 48);
  bytes.set(index.description, 48 + codec.length);
  for (const [array, at] of layout) bytes.set(new Uint8Array(array.buffer, array.byteOffset, array.byteLength), at);
  return buffer;
}

const ROTATIONS: readonly number[] = [0, 90, 180, 270];

/** The index stored in `buffer`, or null when it is not one, is damaged, or was built from another version of the file. */
export function readSampleIndex(buffer: ArrayBuffer, source: SourceStamp): SampleIndex | null {
  if (buffer.byteLength < 48) return null;
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== MAGIC || view.getUint32(4, true) !== INDEX_VERSION) return null;
  if (view.getFloat64(8, true) !== source.size || view.getFloat64(16, true) !== source.lastModified) return null;
  const rotation = view.getUint16(36, true);
  const codecLength = view.getUint16(38, true);
  const descriptionLength = view.getUint32(40, true);
  const n = view.getUint32(44, true);
  if (!ROTATIONS.includes(rotation) || n === 0) return null;
  let offset = align8(48 + codecLength + descriptionLength);
  const take = <T>(Kind: { new (buffer: ArrayBuffer): T; BYTES_PER_ELEMENT: number }): T | null => {
    const length = n * Kind.BYTES_PER_ELEMENT;
    if (offset + length > buffer.byteLength) return null;
    const array = new Kind(buffer.slice(offset, offset + length));
    offset = align8(offset + length);
    return array;
  };
  const offsets = take(Float64Array);
  const dts = take(Float64Array);
  const cts = take(Float64Array);
  const sizes = take(Uint32Array);
  const durations = take(Uint32Array);
  const sync = take(Uint8Array);
  if (!offsets || !dts || !cts || !sizes || !durations || !sync) return null;
  const bytes = new Uint8Array(buffer);
  return createSampleIndex({
    codec: new TextDecoder().decode(bytes.subarray(48, 48 + codecLength)),
    description: bytes.slice(48 + codecLength, 48 + codecLength + descriptionLength),
    codedWidth: view.getUint32(28, true),
    codedHeight: view.getUint32(32, true),
    rotation: rotation as Rotation,
    timescale: view.getUint32(24, true),
    offsets,
    sizes,
    dts,
    cts,
    durations,
    sync,
  });
}
