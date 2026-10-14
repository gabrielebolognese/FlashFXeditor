// Texture readback helpers: WebGPU copies rows padded to 256 bytes, and render targets hold
// premultiplied alpha, while ImageData (and PNG) want tight rows with straight alpha.

/** Row pitch of a texture-to-buffer copy of an rgba8 texture `width` px wide. */
export function paddedBytesPerRow(width: number): number {
  return Math.ceil((width * 4) / 256) * 256;
}

/** Tight RGBA rows with straight alpha from padded, premultiplied rows. */
export function unpadAndUnpremultiply(source: Uint8Array, width: number, height: number, bytesPerRow: number): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const from = y * bytesPerRow;
    const to = y * width * 4;
    for (let x = 0; x < width * 4; x += 4) {
      const a = source[from + x + 3] ?? 0;
      if (a === 0) continue;
      const scale = a === 255 ? 1 : 255 / a;
      out[to + x] = (source[from + x] ?? 0) * scale;
      out[to + x + 1] = (source[from + x + 1] ?? 0) * scale;
      out[to + x + 2] = (source[from + x + 2] ?? 0) * scale;
      out[to + x + 3] = a;
    }
  }
  return out;
}
