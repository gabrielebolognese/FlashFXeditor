// The bundled starter presets (spec §10.3: 8-12 distinct looks): put into the global presets on the
// first start, then the user's to rename, change or delete. Sizes are for a 1080 px short side
// (presets.ts). Their colors are content colors, not UI colors: the design system governs the UI only.
// `Title` and `Subtitle` are the default Title (T) and Subtitle (Shift+T) until others are chosen.
import type { RGBA, TextPreset, TextStyle } from "../core/document/types.js";
import { DEFAULT_SUBTITLE_BOX, DEFAULT_SUBTITLE_STYLE, DEFAULT_TEXT_BOX, DEFAULT_TEXT_STYLE, DEFAULT_TITLE_STYLE } from "./style.js";

export const STARTER_TITLE_ID = "starter-title";
export const STARTER_SUBTITLE_ID = "starter-subtitle";

const rgb = (r: number, g: number, b: number, a = 1): RGBA => ({ r, g, b, a });
const BLACK = rgb(0, 0, 0);

/** A style from the plain text default with `patch` over it (nested parts replaced whole). */
const style = (patch: Partial<TextStyle>): TextStyle => ({ ...structuredClone(DEFAULT_TEXT_STYLE), ...patch });
const off = { stroke: { enabled: false, width: 6, color: BLACK }, shadow: { enabled: false, x: 0, y: 6, blur: 16, color: rgb(0, 0, 0, 0.6) } };

interface Starter {
  id: string;
  name: string;
  style: TextStyle;
  box?: TextPreset["box"];
  /** Where Apply position puts clips (default: the frame center). */
  position?: { x: number; y: number };
  /** Apply position on from the start. */
  applyPosition?: boolean;
  tags: string[];
}

const STARTERS: readonly Starter[] = [
  { id: STARTER_TITLE_ID, name: "Title", style: structuredClone(DEFAULT_TITLE_STYLE), tags: ["title", "default"] },
  // Its position (used once Apply position is on) is where Shift+T puts one line: the bottom edge at 78%.
  { id: STARTER_SUBTITLE_ID, name: "Subtitle", style: structuredClone(DEFAULT_SUBTITLE_STYLE), box: { ...DEFAULT_SUBTITLE_BOX }, position: { x: 0, y: 491 }, tags: ["subtitle", "box", "default"] },
  {
    id: "starter-bold-outline",
    name: "Bold outline",
    style: style({ fontFamily: "Unbounded", fontWeight: 800, fontSize: 104, textCase: "upper", lineHeight: 1.05, ...off, stroke: { enabled: true, width: 10, color: BLACK } }),
    tags: ["title", "outline", "bold"],
  },
  {
    id: "starter-lower-third",
    name: "Lower third",
    style: style({
      fontFamily: "Inter",
      fontWeight: 700,
      fontSize: 56,
      align: "left",
      lineHeight: 1.25,
      ...off,
      background: { enabled: true, color: rgb(0.06, 0.09, 0.16, 0.88), paddingX: 32, paddingY: 18, radius: 10, mode: "block" },
    }),
    position: { x: -180, y: 560 },
    applyPosition: true,
    tags: ["lower third", "name", "box"],
  },
  {
    id: "starter-caption",
    name: "Caption bold",
    style: style({ fontFamily: "Montserrat", fontWeight: 800, fontSize: 76, textCase: "upper", lineHeight: 1.15, stroke: { enabled: true, width: 8, color: BLACK }, shadow: { enabled: true, x: 0, y: 4, blur: 10, color: rgb(0, 0, 0, 0.55) } }),
    box: { mode: "fixed", width: 900 },
    tags: ["caption", "karaoke", "outline"],
  },
  {
    id: "starter-highlight",
    name: "Highlight",
    style: style({
      fontFamily: "Inter",
      fontWeight: 800,
      fontSize: 80,
      lineHeight: 1.3,
      fill: rgb(0.06, 0.06, 0.06),
      ...off,
      background: { enabled: true, color: rgb(1, 0.86, 0.12), paddingX: 18, paddingY: 6, radius: 6, mode: "line" },
    }),
    tags: ["highlight", "box", "marker"],
  },
  {
    id: "starter-minimal-mono",
    name: "Minimal mono",
    style: style({ fontFamily: "JetBrains Mono", fontWeight: 500, fontSize: 52, textCase: "upper", letterSpacing: 6, fill: rgb(0.92, 0.93, 0.95), ...off }),
    tags: ["minimal", "mono", "clean"],
  },
  {
    id: "starter-big-number",
    name: "Big number",
    style: style({ fontFamily: "Unbounded", fontWeight: 900, fontSize: 320, lineHeight: 1, fill: { from: rgb(1, 0.93, 0.62), to: rgb(0.98, 0.62, 0.1) }, ...off, shadow: { enabled: true, x: 0, y: 12, blur: 30, color: rgb(0, 0, 0, 0.45) } }),
    tags: ["number", "count", "gradient"],
  },
  {
    id: "starter-elegant-serif",
    name: "Elegant serif",
    style: style({ fontFamily: "Playfair Display", fontWeight: 600, italic: true, fontSize: 112, lineHeight: 1.1, fill: rgb(1, 0.97, 0.9), ...off, shadow: { enabled: true, x: 0, y: 4, blur: 18, color: rgb(0, 0, 0, 0.5) } }),
    tags: ["title", "serif", "elegant"],
  },
  {
    id: "starter-handwritten",
    name: "Handwritten",
    style: style({ fontFamily: "Caveat", fontWeight: 700, fontSize: 132, lineHeight: 1.05, ...off, shadow: { enabled: true, x: 0, y: 5, blur: 14, color: rgb(0, 0, 0, 0.5) } }),
    tags: ["handwritten", "script", "casual"],
  },
  {
    id: "starter-neon",
    name: "Neon glow",
    style: style({ fontFamily: "Montserrat", fontWeight: 700, fontSize: 100, fill: rgb(1, 0.92, 0.98), ...off, shadow: { enabled: true, x: 0, y: 0, blur: 28, color: rgb(1, 0.18, 0.78) } }),
    tags: ["neon", "glow", "title"],
  },
  {
    id: "starter-breaking",
    name: "Breaking",
    style: style({
      fontFamily: "Oswald",
      fontWeight: 600,
      fontSize: 92,
      textCase: "upper",
      letterSpacing: 2,
      ...off,
      background: { enabled: true, color: rgb(0.86, 0.1, 0.16), paddingX: 28, paddingY: 10, radius: 4, mode: "block" },
    }),
    tags: ["news", "box", "condensed"],
  },
];

/** The starter presets, dated in card order (a minute apart from the same time). */
export function starterPresets(): TextPreset[] {
  const base = Date.parse("2026-01-01T00:00:00.000Z");
  return STARTERS.map((starter, index) => {
    const at = new Date(base + index * 60_000).toISOString();
    return {
      id: starter.id,
      name: starter.name,
      style: structuredClone(starter.style),
      box: { ...(starter.box ?? DEFAULT_TEXT_BOX) },
      position: { ...(starter.position ?? { x: 0, y: 0 }) },
      applyPosition: starter.applyPosition ?? false,
      tags: [...starter.tags],
      favorite: false,
      createdAt: at,
      updatedAt: at,
    };
  });
}