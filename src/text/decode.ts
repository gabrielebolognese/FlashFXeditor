// The decode preset (spec §21.13, Batch 68): unrevealed characters flicker through random ones and lock
// to the real one as a reveal sweeps left to right. Pure and frame-deterministic (a seeded hash of the
// character's place and the frame bucket, never Math.random or the clock), so scrubbing and export agree.
// Ported from FlashFX-v2 `src/core/textDecode.ts` (commit a91c675). The compositor draws the scrambled
// characters from a per-clip glyph atlas (render/text: the real characters plus `DECODE_CHARSET`).

export const DECODE_CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&@?/<>=+";

/** Frames a scramble character stays before it changes. */
export const DECODE_HOLD = 2;

/** A stable seed from a clip id. */
export function decodeSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** The scramble character for (seed, character index, time bucket). */
export function scrambleChar(seed: number, index: number, bucket: number): string {
  let h = (seed >>> 0) ^ Math.imul(index + 1, 0x9e3779b1) ^ Math.imul(bucket + 1, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 13), 0x297a2d39);
  h = (h ^ (h >>> 16)) >>> 0;
  return DECODE_CHARSET[h % DECODE_CHARSET.length] as string;
}

/** Whether character `index` of `count` has locked at reveal `progress` (0..1): none at 0, all at 1, left to right. */
export function isLocked(index: number, count: number, progress: number): boolean {
  return count <= 0 || (index + 1) / count <= progress + 1e-9;
}

/** The character `index` shows at `frame`: the real one once locked, else a scramble character. */
export function decodedChar(real: string, index: number, count: number, progress: number, frame: number, seed: number): string {
  if (isLocked(index, count, progress)) return real;
  return scrambleChar(seed, index, Math.floor(frame / DECODE_HOLD));
}
