// SVG on the main thread: workers have no DOM to parse or rasterize SVG (createImageBitmap refuses
// SVG blobs). The size comes from the width/height attributes, else the viewBox; the poster is the
// image rasterized small through an <img>. TODO(batch 34): sharp rasterization at the needed scale.
import { ProbeError, type ProbeResult } from "./types.js";

/** Plain numbers or px; relative units (%, em) are not intrinsic sizes. */
function length(value: string | null): number | null {
  if (!value) return null;
  const match = /^\s*([0-9]*\.?[0-9]+)\s*(px)?\s*$/.exec(value);
  return match ? Number(match[1]) : null;
}

/** Intrinsic size of an SVG document, rounded to whole pixels; null when it has none. */
export function svgSize(text: string): { width: number; height: number } | null {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const svg = doc.documentElement;
  if (svg.nodeName.toLowerCase() !== "svg" || doc.getElementsByTagName("parsererror").length > 0) return null;
  const box = (svg.getAttribute("viewBox") ?? "").split(/[\s,]+/).filter(Boolean).map(Number);
  const boxW = box.length === 4 && (box[2] ?? 0) > 0 ? (box[2] as number) : null;
  const boxH = box.length === 4 && (box[3] ?? 0) > 0 ? (box[3] as number) : null;
  let width = length(svg.getAttribute("width"));
  let height = length(svg.getAttribute("height"));
  if (width === null && height !== null && boxW && boxH) width = (height * boxW) / boxH;
  if (height === null && width !== null && boxW && boxH) height = (width * boxH) / boxW;
  width ??= boxW;
  height ??= boxH;
  if (!width || !height) return null;
  return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
}

export async function probeSvg(file: Blob): Promise<ProbeResult> {
  const size = svgSize(await file.text());
  if (!size) throw new ProbeError("The SVG has no size (width/height or viewBox)");
  return { kind: "image", durationUs: 0, width: size.width, height: size.height, hasAudio: false, codec: "svg" };
}

/**
 * The SVG rasterized to fit `maxSize`. Drawn into a sized canvas: createImageBitmap on an <img> of
 * an SVG without width/height attributes (viewBox only) gives an empty bitmap.
 */
export async function svgPoster(file: Blob, maxSize: number): Promise<ImageBitmap> {
  // Files read back from the project folder may have no MIME type, and <img> never sniffs SVG.
  const url = URL.createObjectURL(file.type === "image/svg+xml" ? file : new Blob([file], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const size = svgSize(await file.text()) ?? { width: image.naturalWidth || maxSize, height: image.naturalHeight || maxSize };
    const scale = maxSize / Math.max(size.width, size.height);
    const canvas = new OffscreenCanvas(Math.max(1, Math.round(size.width * scale)), Math.max(1, Math.round(size.height * scale)));
    canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.transferToImageBitmap();
  } finally {
    URL.revokeObjectURL(url);
  }
}
