// The bundled starter presets: put into the global presets on the first start, then the user's to
// rename, change or delete. Batch 30 shipped 12 looks (spec §10.3); Batch 52 grows the pack to 43 in
// the preset bar's sets (spec §20.2: Titles, Subtitles, Captions), in library fonts (§20.1), with a
// sample text each and nine favorites, so the bar and Alt+1..9 work from the first start. Sizes are for
// a 1080 px short side (presets.ts). Their colors are content colors, not UI colors: the design system
// governs the UI only. `Title` and `Subtitle` are the default Title (T) and Subtitle (Shift+T) until
// others are chosen. The Batch 30 starters keep their ids, looks and dates, so defaults, favorites and
// clips linked to them survive; stored ones are brought to the current pack by `upgradeStarterPack`.
import type { CaptionHighlight, PresetSetId, PresetTextAnim, RGBA, TextPreset, TextStyle } from "../core/document/types.js";
import { DEFAULT_SUBTITLE_BOX, DEFAULT_SUBTITLE_STYLE, DEFAULT_TEXT_BOX, DEFAULT_TEXT_STYLE, DEFAULT_TITLE_STYLE } from "./style.js";

export const STARTER_TITLE_ID = "starter-title";
export const STARTER_SUBTITLE_ID = "starter-subtitle";
/** The pack the stored starters were last brought to (IndexedDB `textPresets.starterPack`): 1 = Batch 30's 12. */
export const STARTER_PACK_VERSION = 2;

const rgb = (r: number, g: number, b: number, a = 1): RGBA => ({ r, g, b, a });
const BLACK = rgb(0, 0, 0);
const WHITE = rgb(1, 1, 1);

/** A style from the plain text default with `patch` over it (nested parts replaced whole). */
const style = (patch: Partial<TextStyle>): TextStyle => ({ ...structuredClone(DEFAULT_TEXT_STYLE), ...patch });
const off = { stroke: { enabled: false, width: 6, color: BLACK }, shadow: { enabled: false, x: 0, y: 6, blur: 16, color: rgb(0, 0, 0, 0.6) } };
const outline = (width: number) => ({ enabled: true, width, color: BLACK });
const soft = (y: number, blur: number, alpha: number) => ({ enabled: true, x: 0, y, blur, color: rgb(0, 0, 0, alpha) });
const hard = (x: number, y: number, color: RGBA) => ({ enabled: true, x, y, blur: 0, color });
const glow = (blur: number, color: RGBA) => ({ enabled: true, x: 0, y: 0, blur, color });
const box = (color: RGBA, paddingX: number, paddingY: number, radius: number, mode: "line" | "block") => ({ enabled: true, color, paddingX, paddingY, radius, mode });
const word = (mode: CaptionHighlight["mode"], color: RGBA): CaptionHighlight => ({ mode, color, inactiveColor: { ...WHITE } });
/** Captions wrap like the caption track's default (900 px). */
const CAPTION_BOX: TextPreset["box"] = { mode: "fixed", width: 900 };

interface Starter {
  id: string;
  name: string;
  style: TextStyle;
  box?: TextPreset["box"];
  /** Where Apply position puts clips (default: the frame center). */
  position?: { x: number; y: number };
  /** Apply position on from the start. */
  applyPosition?: boolean;
  /** Animations (Batch 31; the Title and Subtitle defaults have none, so T and Shift+T stay still). */
  animIn?: PresetTextAnim;
  animOut?: PresetTextAnim;
  /** Search words (the starters' tags are not preset bar sets: presets.ts `presetSetChoices`). */
  tags: string[];
  sets: PresetSetId[];
  sampleText?: string;
  highlight?: CaptionHighlight;
  favorite?: true;
}

// Card order = dates: the 12 Batch 30 starters first, at their old dates.
const STARTERS: readonly Starter[] = [
  { id: STARTER_TITLE_ID, name: "Title", style: structuredClone(DEFAULT_TITLE_STYLE), tags: ["title", "default"], sets: ["titles"], favorite: true },
  // Its position (used once Apply position is on) is where Shift+T puts one line: the bottom edge at 78%.
  {
    id: STARTER_SUBTITLE_ID,
    name: "Subtitle",
    style: structuredClone(DEFAULT_SUBTITLE_STYLE),
    box: { ...DEFAULT_SUBTITLE_BOX },
    position: { x: 0, y: 491 },
    tags: ["subtitle", "box", "default"],
    sets: ["subtitles"],
    favorite: true,
  },
  {
    id: "starter-bold-outline",
    name: "Bold outline",
    style: style({ fontFamily: "Unbounded", fontWeight: 800, fontSize: 104, textCase: "upper", lineHeight: 1.05, ...off, stroke: outline(10) }),
    tags: ["title", "outline", "bold"],
    sets: ["titles"],
    sampleText: "Bold",
    favorite: true,
  },
  {
    id: "starter-lower-third",
    name: "Lower third",
    style: style({ fontFamily: "Inter", fontWeight: 700, fontSize: 56, align: "left", lineHeight: 1.25, ...off, background: box(rgb(0.06, 0.09, 0.16, 0.88), 32, 18, 10, "block") }),
    position: { x: -180, y: 560 },
    applyPosition: true,
    animIn: { id: "slideRight", durationMs: 500 },
    animOut: { id: "fade", durationMs: 400 },
    tags: ["lower third", "name", "box"],
    sets: ["subtitles"],
  },
  {
    id: "starter-caption",
    name: "Caption bold",
    style: style({ fontFamily: "Montserrat", fontWeight: 800, fontSize: 76, textCase: "upper", lineHeight: 1.15, stroke: outline(8), shadow: soft(4, 10, 0.55) }),
    box: { mode: "fixed", width: 900 },
    animIn: { id: "wordPop", durationMs: 800 },
    tags: ["caption", "karaoke", "outline"],
    sets: ["captions"],
    sampleText: "Say it loud",
    favorite: true,
  },
  {
    id: "starter-highlight",
    name: "Highlight",
    style: style({ fontFamily: "Inter", fontWeight: 800, fontSize: 80, lineHeight: 1.3, fill: rgb(0.06, 0.06, 0.06), ...off, background: box(rgb(1, 0.86, 0.12), 18, 6, 6, "line") }),
    tags: ["highlight", "box", "marker"],
    sets: ["titles"],
  },
  {
    id: "starter-minimal-mono",
    name: "Minimal mono",
    style: style({ fontFamily: "JetBrains Mono", fontWeight: 500, fontSize: 52, textCase: "upper", letterSpacing: 6, fill: rgb(0.92, 0.93, 0.95), ...off }),
    tags: ["minimal", "mono", "clean"],
    sets: ["titles"],
    sampleText: "Minimal",
  },
  {
    id: "starter-big-number",
    name: "Big number",
    style: style({ fontFamily: "Unbounded", fontWeight: 900, fontSize: 320, lineHeight: 1, fill: { from: rgb(1, 0.93, 0.62), to: rgb(0.98, 0.62, 0.1) }, ...off, shadow: soft(12, 30, 0.45) }),
    tags: ["number", "count", "gradient"],
    sets: ["titles"],
    sampleText: "100",
  },
  {
    id: "starter-elegant-serif",
    name: "Elegant serif",
    style: style({ fontFamily: "Playfair Display", fontWeight: 600, italic: true, fontSize: 112, lineHeight: 1.1, fill: rgb(1, 0.97, 0.9), ...off, shadow: soft(4, 18, 0.5) }),
    tags: ["title", "serif", "elegant"],
    sets: ["titles"],
    sampleText: "Elegant",
  },
  {
    id: "starter-handwritten",
    name: "Handwritten",
    style: style({ fontFamily: "Caveat", fontWeight: 700, fontSize: 132, lineHeight: 1.05, ...off, shadow: soft(5, 14, 0.5) }),
    tags: ["handwritten", "script", "casual"],
    sets: ["titles"],
  },
  {
    id: "starter-neon",
    name: "Neon glow",
    style: style({ fontFamily: "Montserrat", fontWeight: 700, fontSize: 100, fill: rgb(1, 0.92, 0.98), ...off, shadow: glow(28, rgb(1, 0.18, 0.78)) }),
    animIn: { id: "blurIn", durationMs: 600 },
    tags: ["neon", "glow", "title"],
    sets: ["titles"],
    sampleText: "Neon",
    favorite: true,
  },
  {
    id: "starter-breaking",
    name: "Breaking",
    style: style({ fontFamily: "Oswald", fontWeight: 600, fontSize: 92, textCase: "upper", letterSpacing: 2, ...off, background: box(rgb(0.86, 0.1, 0.16), 28, 10, 4, "block") }),
    animIn: { id: "slideUp", durationMs: 400 },
    tags: ["news", "box", "condensed"],
    sets: ["titles"],
  },

  // Titles (Batch 52): luxury, bold, futuristic, handwritten, minimal, retro, neon, playful.
  {
    id: "starter-luxury-gold",
    name: "Luxury gold",
    style: style({ fontFamily: "Cinzel", fontWeight: 700, fontSize: 104, textCase: "upper", letterSpacing: 8, lineHeight: 1.1, fill: { from: rgb(1, 0.92, 0.66), to: rgb(0.78, 0.56, 0.18) }, ...off, shadow: soft(4, 16, 0.5) }),
    animIn: { id: "fade", durationMs: 700 },
    tags: ["luxury", "gold", "serif", "elegant"],
    sets: ["titles"],
    sampleText: "Luxury",
    favorite: true,
  },
  {
    id: "starter-couture",
    name: "Couture",
    style: style({ fontFamily: "Bodoni Moda", fontWeight: 700, fontSize: 96, textCase: "upper", letterSpacing: 14, lineHeight: 1.1, ...off }),
    tags: ["luxury", "fashion", "serif", "elegant"],
    sets: ["titles"],
  },
  {
    id: "starter-impact",
    name: "Impact",
    style: style({ fontFamily: "Anton", fontWeight: 400, fontSize: 150, textCase: "upper", lineHeight: 1.05, ...off, shadow: hard(0, 8, rgb(0, 0, 0, 0.85)) }),
    animIn: { id: "pop", durationMs: 350 },
    tags: ["bold", "impact", "condensed"],
    sets: ["titles"],
    favorite: true,
  },
  {
    id: "starter-headline",
    name: "Headline",
    style: style({ fontFamily: "Bebas Neue", fontWeight: 400, fontSize: 170, letterSpacing: 2, lineHeight: 1, fill: rgb(1, 0.86, 0.1), ...off, stroke: outline(6) }),
    tags: ["bold", "headline", "yellow"],
    sets: ["titles"],
  },
  {
    id: "starter-futuristic",
    name: "Futuristic",
    style: style({ fontFamily: "Orbitron", fontWeight: 800, fontSize: 92, textCase: "upper", letterSpacing: 6, fill: rgb(0.55, 0.96, 1), ...off, shadow: glow(24, rgb(0, 0.75, 1, 0.9)) }),
    animIn: { id: "blurIn", durationMs: 500 },
    tags: ["futuristic", "tech", "glow"],
    sets: ["titles"],
    sampleText: "Future",
    favorite: true,
  },
  {
    id: "starter-cyber",
    name: "Cyber",
    style: style({ fontFamily: "Audiowide", fontWeight: 400, fontSize: 110, lineHeight: 1.1, fill: { from: rgb(1, 0.25, 0.85), to: rgb(0.2, 0.85, 1) }, ...off, stroke: { enabled: true, width: 3, color: rgb(0.05, 0.02, 0.15) } }),
    tags: ["futuristic", "gradient", "tech"],
    sets: ["titles"],
  },
  {
    id: "starter-script",
    name: "Script",
    style: style({ fontFamily: "Great Vibes", fontWeight: 400, fontSize: 150, lineHeight: 1.1, ...off, shadow: soft(4, 14, 0.45) }),
    tags: ["handwritten", "script", "wedding", "elegant"],
    sets: ["titles"],
    sampleText: "Beautiful",
  },
  {
    id: "starter-marker",
    name: "Marker",
    style: style({ fontFamily: "Permanent Marker", fontWeight: 400, fontSize: 120, lineHeight: 1.1, ...off, shadow: soft(5, 12, 0.55) }),
    tags: ["handwritten", "marker", "casual"],
    sets: ["titles"],
    sampleText: "Let's go",
  },
  {
    id: "starter-clean-light",
    name: "Clean light",
    style: style({ fontFamily: "Manrope", fontWeight: 300, fontSize: 104, letterSpacing: 2, ...off }),
    animIn: { id: "fade", durationMs: 500 },
    tags: ["minimal", "clean", "thin"],
    sets: ["titles"],
    sampleText: "Clean",
  },
  {
    id: "starter-retro-sunset",
    name: "Retro sunset",
    style: style({ fontFamily: "Monoton", fontWeight: 400, fontSize: 120, textCase: "upper", lineHeight: 1.1, fill: { from: rgb(1, 0.8, 0.25), to: rgb(1, 0.25, 0.55) }, ...off }),
    tags: ["retro", "80s", "gradient"],
    sets: ["titles"],
    sampleText: "Retro",
  },
  {
    id: "starter-groovy",
    name: "Groovy",
    style: style({ fontFamily: "Shrikhand", fontWeight: 400, fontSize: 120, lineHeight: 1.1, fill: rgb(1, 0.93, 0.8), ...off, shadow: hard(6, 6, rgb(0.9, 0.3, 0.2)) }),
    tags: ["retro", "70s", "vintage"],
    sets: ["titles"],
  },
  {
    id: "starter-neon-blue",
    name: "Neon blue",
    style: style({ fontFamily: "Righteous", fontWeight: 400, fontSize: 120, fill: rgb(0.86, 0.95, 1), ...off, shadow: glow(30, rgb(0.1, 0.55, 1)) }),
    animIn: { id: "blurIn", durationMs: 600 },
    tags: ["neon", "glow", "retro"],
    sets: ["titles"],
    sampleText: "Neon",
  },
  {
    id: "starter-comic",
    name: "Comic",
    style: style({ fontFamily: "Bangers", fontWeight: 400, fontSize: 140, letterSpacing: 2, lineHeight: 1.05, fill: rgb(1, 0.87, 0.1), ...off, stroke: outline(10), shadow: hard(6, 6, BLACK) }),
    animIn: { id: "pop", durationMs: 350 },
    tags: ["comic", "playful", "bold"],
    sets: ["titles"],
    sampleText: "Boom!",
  },
  {
    id: "starter-arcade",
    name: "Arcade",
    style: style({ fontFamily: "Press Start 2P", fontWeight: 400, fontSize: 64, textCase: "upper", lineHeight: 1.3, fill: rgb(0.35, 1, 0.45), ...off, shadow: hard(5, 5, rgb(0.05, 0.25, 0.1)) }),
    tags: ["pixel", "gaming", "retro"],
    sets: ["titles"],
    sampleText: "Level up",
  },

  // Subtitles (Batch 52): box, lower third, outline.
  {
    id: "starter-subtitle-outline",
    name: "Subtitle outline",
    style: style({ ...DEFAULT_SUBTITLE_STYLE, fontWeight: 700, fontSize: 54, stroke: outline(5), shadow: soft(3, 8, 0.5), background: { ...DEFAULT_SUBTITLE_STYLE.background, enabled: false } }),
    box: { ...DEFAULT_SUBTITLE_BOX },
    tags: ["subtitle", "outline"],
    sets: ["subtitles"],
    sampleText: "Outline",
  },
  {
    id: "starter-subtitle-white",
    name: "Subtitle white box",
    style: style({ ...DEFAULT_SUBTITLE_STYLE, fontSize: 52, fill: rgb(0.07, 0.07, 0.09), background: box(rgb(1, 1, 1, 0.95), 22, 10, 10, "line") }),
    box: { ...DEFAULT_SUBTITLE_BOX },
    tags: ["subtitle", "box", "light"],
    sets: ["subtitles"],
    sampleText: "White box",
  },
  {
    id: "starter-subtitle-clean",
    name: "Subtitle clean",
    style: style({ ...DEFAULT_SUBTITLE_STYLE, fontFamily: "DM Sans", fontWeight: 500, fontSize: 52, shadow: soft(3, 18, 0.8), background: { ...DEFAULT_SUBTITLE_STYLE.background, enabled: false } }),
    box: { ...DEFAULT_SUBTITLE_BOX },
    tags: ["subtitle", "shadow", "clean"],
    sets: ["subtitles"],
    sampleText: "Clean",
  },
  {
    id: "starter-subtitle-yellow",
    name: "Subtitle yellow",
    style: style({ ...DEFAULT_SUBTITLE_STYLE, fontWeight: 700, fontSize: 54, fill: rgb(1, 0.9, 0.2), stroke: outline(4), background: { ...DEFAULT_SUBTITLE_STYLE.background, enabled: false } }),
    box: { ...DEFAULT_SUBTITLE_BOX },
    tags: ["subtitle", "yellow", "outline"],
    sets: ["subtitles"],
    sampleText: "Yellow",
  },
  {
    id: "starter-subtitle-quote",
    name: "Subtitle quote",
    style: style({ ...DEFAULT_SUBTITLE_STYLE, fontFamily: "Lora", fontWeight: 500, italic: true, fontSize: 54, background: box(rgb(0, 0, 0, 0.55), 22, 10, 8, "line") }),
    box: { ...DEFAULT_SUBTITLE_BOX },
    tags: ["subtitle", "serif", "quote"],
    sets: ["subtitles"],
    sampleText: "Quote",
  },
  {
    id: "starter-subtitle-mono",
    name: "Subtitle mono",
    style: style({ ...DEFAULT_SUBTITLE_STYLE, fontFamily: "JetBrains Mono", fontWeight: 500, fontSize: 46, background: box(rgb(0.1, 0.1, 0.12, 0.85), 20, 10, 4, "line") }),
    box: { ...DEFAULT_SUBTITLE_BOX },
    tags: ["subtitle", "mono", "code"],
    sets: ["subtitles"],
    sampleText: "mono",
  },
  {
    id: "starter-lower-third-gold",
    name: "Lower third gold",
    style: style({ fontFamily: "Montserrat", fontWeight: 700, fontSize: 50, align: "left", lineHeight: 1.25, fill: rgb(0.08, 0.08, 0.1), ...off, background: box(rgb(0.98, 0.76, 0.18), 30, 16, 4, "block") }),
    position: { x: -180, y: 600 },
    applyPosition: true,
    animIn: { id: "slideRight", durationMs: 450 },
    animOut: { id: "fade", durationMs: 400 },
    tags: ["lower third", "name", "gold"],
    sets: ["subtitles"],
    sampleText: "Your name",
  },
  {
    id: "starter-lower-third-line",
    name: "Lower third clean",
    style: style({ fontFamily: "Poppins", fontWeight: 600, fontSize: 52, align: "left", lineHeight: 1.25, ...off, shadow: soft(3, 12, 0.6) }),
    position: { x: -200, y: 600 },
    applyPosition: true,
    animIn: { id: "slideRight", durationMs: 450 },
    tags: ["lower third", "name", "clean"],
    sets: ["subtitles"],
    sampleText: "Your name",
  },

  // Captions (Batch 52): white with a black stroke, yellow active word, boxed word, big centered, all-caps impact.
  {
    id: "starter-caption-yellow",
    name: "Yellow word",
    style: style({ fontFamily: "Montserrat", fontWeight: 800, fontSize: 70, textCase: "upper", lineHeight: 1.15, stroke: outline(8), shadow: soft(4, 10, 0.55) }),
    box: { ...CAPTION_BOX },
    tags: ["caption", "karaoke", "yellow"],
    sets: ["captions"],
    sampleText: "The word",
    highlight: word("color", rgb(1, 0.84, 0.04)),
    favorite: true,
  },
  {
    id: "starter-caption-boxed",
    name: "Boxed word",
    style: style({ fontFamily: "Poppins", fontWeight: 800, fontSize: 68, textCase: "upper", lineHeight: 1.2, ...off, shadow: soft(4, 12, 0.6) }),
    box: { ...CAPTION_BOX },
    tags: ["caption", "karaoke", "box"],
    sets: ["captions"],
    sampleText: "Boxed word",
    highlight: word("background", rgb(0.55, 0.3, 1)),
  },
  {
    id: "starter-caption-big",
    name: "Big centered",
    style: style({ fontFamily: "Anton", fontWeight: 400, fontSize: 124, textCase: "upper", lineHeight: 1.05, stroke: outline(8), shadow: soft(6, 14, 0.6) }),
    box: { mode: "fixed", width: 860 },
    position: { x: 0, y: 0 },
    applyPosition: true,
    tags: ["caption", "big", "center"],
    sets: ["captions"],
    sampleText: "Big",
    highlight: word("color", rgb(1, 0.84, 0.04)),
  },
  {
    id: "starter-caption-impact",
    name: "All caps impact",
    style: style({ fontFamily: "Archivo Black", fontWeight: 400, fontSize: 72, textCase: "upper", lineHeight: 1.1, stroke: outline(10), shadow: hard(0, 6, BLACK) }),
    box: { ...CAPTION_BOX },
    tags: ["caption", "impact", "caps"],
    sets: ["captions"],
    sampleText: "All caps",
  },
  {
    id: "starter-caption-green",
    name: "Green karaoke",
    style: style({ fontFamily: "Poppins", fontWeight: 800, fontSize: 66, lineHeight: 1.15, stroke: outline(6), shadow: soft(4, 10, 0.5) }),
    box: { ...CAPTION_BOX },
    tags: ["caption", "karaoke", "green"],
    sets: ["captions"],
    sampleText: "Sing along",
    highlight: word("colorAndScale", rgb(0.3, 1, 0.45)),
  },
  {
    id: "starter-caption-pop",
    name: "Pop word",
    style: style({ fontFamily: "Montserrat", fontWeight: 900, fontSize: 70, textCase: "upper", lineHeight: 1.15, stroke: outline(8), shadow: soft(4, 10, 0.55) }),
    box: { ...CAPTION_BOX },
    tags: ["caption", "karaoke", "scale"],
    sets: ["captions"],
    sampleText: "Pop word",
    highlight: word("scale", WHITE),
  },
  {
    id: "starter-caption-comic",
    name: "Comic caption",
    style: style({ fontFamily: "Luckiest Guy", fontWeight: 400, fontSize: 72, lineHeight: 1.15, stroke: outline(8), shadow: hard(0, 5, BLACK) }),
    box: { ...CAPTION_BOX },
    tags: ["caption", "comic", "playful"],
    sets: ["captions"],
    sampleText: "No way",
    highlight: word("color", rgb(1, 0.35, 0.3)),
  },
  {
    id: "starter-caption-clean",
    name: "Clean caption",
    style: style({ fontFamily: "Inter", fontWeight: 700, fontSize: 62, lineHeight: 1.2, ...off, shadow: soft(3, 14, 0.75) }),
    box: { ...CAPTION_BOX },
    tags: ["caption", "clean", "minimal"],
    sets: ["captions"],
    sampleText: "Clean caption",
  },
  {
    id: "starter-caption-line",
    name: "Boxed line",
    style: style({ fontFamily: "Inter", fontWeight: 700, fontSize: 60, lineHeight: 1.3, ...off, background: box(rgb(0, 0, 0, 0.75), 20, 8, 10, "line") }),
    box: { ...CAPTION_BOX },
    tags: ["caption", "box", "line"],
    sets: ["captions"],
    sampleText: "Boxed line",
    highlight: word("color", rgb(1, 0.84, 0.04)),
  },
];

/** The ids Batch 30 shipped (pack 1): starters missing from a pack 1 store were deleted, not new. */
const PACK_1_IDS: ReadonlySet<string> = new Set(STARTERS.slice(0, 12).map((starter) => starter.id));

/** The starters' own tags (lower case): search words, not preset bar sets. */
export const STARTER_TAGS: ReadonlySet<string> = new Set(STARTERS.flatMap((starter) => starter.tags.map((tag) => tag.toLocaleLowerCase())));

/**
 * Starters stored before they had animations (Batch 30 seeded them once): the ones never changed since
 * (their `updatedAt` is still the bundled one) take the bundled animations; their date stays, so they
 * still count as untouched. Null when none changes.
 */
export function upgradeStarters(stored: readonly TextPreset[]): TextPreset[] | null {
  const bundled = new Map(starterPresets().map((preset) => [preset.id, preset]));
  let changed = false;
  const next = stored.map((preset) => {
    const starter = bundled.get(preset.id);
    if (!starter || preset.updatedAt !== starter.updatedAt || preset.animIn || preset.animOut || (!starter.animIn && !starter.animOut)) return preset;
    changed = true;
    return { ...preset, ...(starter.animIn && { animIn: { ...starter.animIn } }), ...(starter.animOut && { animOut: { ...starter.animOut } }) };
  });
  return changed ? next : null;
}

/**
 * Stored starters brought to the current pack (Batch 52) from pack `fromVersion`: the starters new
 * since then join, and every stored starter gets its sets, sample text and word highlight when it has
 * none (they add, never change a look; a starter deleted before stays deleted). Untouched starters
 * (their `updatedAt` is still the bundled one) also take the bundled favorite. Dates stay, so they still
 * count as untouched. Null when nothing changes.
 */
export function upgradeStarterPack(stored: readonly TextPreset[], fromVersion: number): TextPreset[] | null {
  if (fromVersion >= STARTER_PACK_VERSION) return null;
  const bundled = new Map(starterPresets().map((preset) => [preset.id, preset]));
  let changed = false;
  const next = stored.map((preset) => {
    const starter = bundled.get(preset.id);
    if (!starter) return preset;
    const copy: TextPreset = { ...preset };
    if (starter.sets && !copy.sets) copy.sets = [...starter.sets];
    if (starter.sampleText !== undefined && copy.sampleText === undefined) copy.sampleText = starter.sampleText;
    if (starter.highlight && !copy.highlight) copy.highlight = structuredClone(starter.highlight);
    if (starter.favorite && !copy.favorite && preset.updatedAt === starter.updatedAt) copy.favorite = true;
    const same = copy.sets === preset.sets && copy.sampleText === preset.sampleText && copy.highlight === preset.highlight && copy.favorite === preset.favorite;
    if (same) return preset;
    changed = true;
    return copy;
  });
  const ids = new Set(stored.map((preset) => preset.id));
  const added = fromVersion < 2 ? [...bundled.values()].filter((preset) => !PACK_1_IDS.has(preset.id) && !ids.has(preset.id)) : [];
  return changed || added.length > 0 ? [...next, ...added] : null;
}

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
      ...(starter.animIn && { animIn: { ...starter.animIn } }),
      ...(starter.animOut && { animOut: { ...starter.animOut } }),
      ...(starter.sampleText !== undefined && { sampleText: starter.sampleText }),
      sets: [...starter.sets],
      ...(starter.highlight && { highlight: structuredClone(starter.highlight) }),
      tags: [...starter.tags],
      favorite: starter.favorite ?? false,
      createdAt: at,
      updatedAt: at,
    };
  });
}
