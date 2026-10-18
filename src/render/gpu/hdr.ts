// HDR video (Batch 47). iPhone HDR footage is HEVC tagged BT.2020 primaries with the HLG transfer
// (Dolby Vision 8.4 with an HLG base layer); other cameras write PQ. Measured in Chrome 155 on an iPhone
// HLG clip: copyExternalImageToTexture and importExternalTexture convert such a frame to sRGB without
// tone mapping (mean saturation 0.10, luma 0.72: washed out), while a 2D canvas is color managed and
// tone maps it to SDR as a <video> element shows it (saturation 0.22, luma 0.46). So an HDR frame is
// drawn into a 2D canvas at its upload size and that canvas is uploaded (both GPU backends). Proxies and
// thumbnails are drawn through 2D canvases already, so every path shows the same picture.

/** The color space fields of a VideoFrame (`frame.colorSpace`). */
export interface ColorSpaceLike {
  primaries?: string | null;
  transfer?: string | null;
}

/** HLG or PQ (HDR), or BT.2020 primaries (wide gamut): drawn through a color-managed 2D canvas. */
export function isHdrColorSpace(colorSpace: ColorSpaceLike | null | undefined): boolean {
  return colorSpace?.transfer === "hlg" || colorSpace?.transfer === "pq" || colorSpace?.primaries === "bt2020";
}

/**
 * Draws `frame` into a color-managed 2D canvas of `width` x `height` (sRGB: tone mapped to SDR) and
 * returns it: `canvas` reused (resized) when given, else a new one. Both GPU backends upload it.
 */
export function toneMapToCanvas(canvas: OffscreenCanvas | null, frame: VideoFrame, width: number, height: number): OffscreenCanvas {
  const out = canvas ?? new OffscreenCanvas(width, height);
  if (out.width !== width || out.height !== height) {
    out.width = width;
    out.height = height;
  }
  const context = out.getContext("2d", { alpha: false, colorSpace: "srgb" });
  if (!context) throw new Error("No 2D canvas for an HDR frame");
  context.imageSmoothingQuality = "high";
  context.drawImage(frame, 0, 0, width, height);
  return out;
}
