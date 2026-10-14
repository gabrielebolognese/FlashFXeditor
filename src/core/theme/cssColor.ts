// Design-token color text (as read by the Theme bridge) -> RGBA with 0..1 channels, for GPU clear and
// solid colors. Accepts the forms tokens.css uses: hex, and the rgb/rgba functions with comma or space
// separators (channels 0..255 or %, alpha 0..1 or %).
import { parseHexColor } from "../document/color.js";
import type { RGBA } from "../document/types.js";

export function cssColorToRgba(text: string): RGBA | null {
  const value = text.trim();
  if (value.startsWith("#")) return parseHexColor(value);
  const open = value.indexOf("(");
  const close = value.lastIndexOf(")");
  if (open < 0 || close < open || !value.slice(0, open).trim().toLowerCase().startsWith("rgb")) return null;
  const parts = value
    .slice(open + 1, close)
    .split(/[\s,/]+/)
    .filter((part) => part !== "");
  if (parts.length !== 3 && parts.length !== 4) return null;
  const number = (part: string, scale: number) => (part.endsWith("%") ? Number.parseFloat(part) / 100 : Number.parseFloat(part) / scale);
  const [r, g, b, a] = [number(parts[0] ?? "", 255), number(parts[1] ?? "", 255), number(parts[2] ?? "", 255), parts[3] === undefined ? 1 : number(parts[3], 1)];
  if (![r, g, b, a].every(Number.isFinite)) return null;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return { r: clamp(r), g: clamp(g), b: clamp(b), a: clamp(a) };
}
