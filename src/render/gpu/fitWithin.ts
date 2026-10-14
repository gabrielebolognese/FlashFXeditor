// Upload size of a video frame (`TextureOptions.maxSize`): the long edge capped, the aspect kept.

/** `width` x `height` scaled down so the long edge is at most `maxSize` (unchanged when it already is). */
export function fitWithin(width: number, height: number, maxSize?: number): { width: number; height: number } {
  const longEdge = Math.max(width, height);
  if (maxSize === undefined || maxSize <= 0 || longEdge <= maxSize) return { width, height };
  const scale = maxSize / longEdge;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
