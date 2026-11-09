// PNG files of the export (PNG sequence, spec §21.25, Batch 81), written here from straight-alpha RGBA
// pixels: a canvas would premultiply them and lose the color of nearly transparent pixels. 8-bit RGBA
// (color type 6), or RGB (type 2) when the frame is opaque; rows use the Sub filter, the zlib stream
// comes from CompressionStream ("deflate" is zlib-wrapped), which the worker has natively.
import { crc32 } from "../project/zip.js";
import type { RgbaImage } from "./gif.js";

const SIGNATURE = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** The scanlines of `image`: each row's filter byte (1, Sub) then its bytes minus the pixel to the left. */
export function filterRows(image: RgbaImage, alpha: boolean): Uint8Array {
  const { width, height, data } = image;
  const channels = alpha ? 4 : 3;
  const rowBytes = width * channels;
  const out = new Uint8Array(height * (rowBytes + 1));
  for (let y = 0; y < height; y++) {
    const at = y * (rowBytes + 1);
    out[at] = 1;
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < channels; c++) {
        const value = data[(y * width + x) * 4 + c] as number;
        const left = x === 0 ? 0 : (data[(y * width + x - 1) * 4 + c] as number);
        out[at + 1 + x * channels + c] = (value - left) & 255;
      }
    }
  }
  return out;
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Whether any pixel of `image` is not fully opaque. */
export function hasTransparency(image: RgbaImage): boolean {
  const { data } = image;
  for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) return true;
  return false;
}

/** The PNG file of `image` (RGBA when `alpha`, else RGB; by default RGBA only when a pixel is not opaque). */
export async function encodePng(image: RgbaImage, alpha: boolean = hasTransparency(image)): Promise<Uint8Array> {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, image.width);
  view.setUint32(4, image.height);
  header[8] = 8;
  header[9] = alpha ? 6 : 2;
  const parts = [SIGNATURE, chunk("IHDR", header), chunk("IDAT", await deflate(filterRows(image, alpha))), chunk("IEND", new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
