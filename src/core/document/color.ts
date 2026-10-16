// Hex text <-> RGBA (channels 0..1) for color fields. `#RGB`, `#RRGGBB` and `#RRGGBBAA` are accepted,
// with or without the leading `#`.
import type { RGBA, SolidClip } from "./types.js";

const HEX_DIGITS = /^[0-9a-f]+$/i;

export function parseHexColor(text: string): RGBA | null {
  let hex = text.trim();
  if (hex.startsWith("#")) hex = hex.slice(1);
  if (!HEX_DIGITS.test(hex)) return null;
  if (hex.length === 3) hex = [...hex].map((c) => c + c).join("");
  if (hex.length !== 6 && hex.length !== 8) return null;
  const channel = (at: number) => Number.parseInt(hex.slice(at, at + 2), 16) / 255;
  return { r: channel(0), g: channel(2), b: channel(4), a: hex.length === 8 ? channel(6) : 1 };
}

/** `#RRGGBB`, or `#RRGGBBAA` when not opaque. Lowercase. */
export function formatHexColor(color: RGBA): string {
  const byte = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, "0");
  const alpha = Math.round(Math.min(1, Math.max(0, color.a)) * 255) === 255 ? "" : byte(color.a);
  return `#${byte(color.r)}${byte(color.g)}${byte(color.b)}${alpha}`;
}

/** A fill that is a plain color, not a gradient (solids draw gradients from Batch 34). */
export function isRgba(fill: SolidClip["fill"]): fill is RGBA {
  const color = fill as Partial<RGBA>;
  return typeof color.r === "number" && typeof color.g === "number" && typeof color.b === "number" && typeof color.a === "number";
}
