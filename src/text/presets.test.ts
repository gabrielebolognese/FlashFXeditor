import { describe, expect, it } from "vitest";
import { makeTextClip } from "../core/document/fixtures.js";
import type { TextClip, TextPreset } from "../core/document/types.js";
import { BUNDLED_FONTS } from "../render/text/bundledFonts.js";
import {
  defaultPresetName,
  duplicatePreset,
  exportFileName,
  favoriteChips,
  formatPresetFile,
  formatPresetsFile,
  MAX_FAVORITE_CHIPS,
  mergePresets,
  parsePresetsFile,
  presetDiffers,
  presetFileName,
  presetFromClip,
  presetLook,
  presetScale,
  presetUpdatedFromClip,
  sanitizePreset,
  sanitizeTextStyle,
  searchPresets,
  thumbnailText,
  uniquePresetName,
} from "./presets.js";
import { STARTER_SUBTITLE_ID, STARTER_TITLE_ID, starterPresets } from "./starterPresets.js";
import { DEFAULT_SUBTITLE_BOX, DEFAULT_SUBTITLE_STYLE, DEFAULT_TEXT_STYLE, DEFAULT_TITLE_STYLE, styleKey } from "./style.js";

const SHORT = { width: 1080, height: 1920 };
const UHD = { width: 2160, height: 3840 };
const NOW = "2026-10-16T10:00:00.000Z";
const LATER = "2026-10-16T11:00:00.000Z";

function styledClip(patch: Partial<TextClip> = {}): TextClip {
  const clip = makeTextClip({ id: "t", trackId: "v1", start: 0, duration: 90, value: "Hello" });
  return {
    ...clip,
    style: { ...structuredClone(DEFAULT_TEXT_STYLE), fontFamily: "Oswald", fontSize: 120, stroke: { enabled: true, width: 8, color: { r: 0, g: 0, b: 0, a: 1 } }, letterSpacing: 4 },
    text: { value: "Hello", box: { mode: "fixed", width: 800 } },
    transform: { ...clip.transform, x: 40, y: -300 },
    ...patch,
  };
}

const preset = (patch: Partial<TextPreset> = {}): TextPreset => ({
  id: "p",
  name: "Preset",
  style: structuredClone(DEFAULT_TEXT_STYLE),
  box: { mode: "auto", width: 900 },
  applyPosition: false,
  tags: [],
  favorite: false,
  createdAt: NOW,
  updatedAt: NOW,
  ...patch,
});

describe("preset sizes", () => {
  it("scales with the frame's short side from 1080 px", () => {
    expect(presetScale(SHORT)).toBe(1);
    expect(presetScale({ width: 1920, height: 1080 })).toBe(1);
    expect(presetScale(UHD)).toBe(2);
    expect(presetScale({ width: 0, height: 0 })).toBe(1);
  });

  it("saves and applies a look unchanged on a 1080 px project", () => {
    const clip = styledClip();
    const saved = presetFromClip(clip, SHORT, { id: "a", name: "Bold", now: NOW });
    expect(saved).toMatchObject({ id: "a", name: "Bold", box: { mode: "fixed", width: 800 }, position: { x: 40, y: -300 }, applyPosition: false, favorite: false, tags: [], createdAt: NOW, updatedAt: NOW });
    expect(saved.style).toEqual(clip.style);
    const look = presetLook(saved, SHORT);
    expect(look.style).toEqual(clip.style);
    expect(look.style).not.toBe(saved.style);
    expect(look.box).toEqual({ mode: "fixed", width: 800 });
    // The position is applied only when the preset says so.
    expect(look.position).toBeNull();
    expect(presetLook({ ...saved, applyPosition: true }, SHORT).position).toEqual({ x: 40, y: -300 });
  });

  it("stores sizes for 1080 px and scales them back on a 4K project", () => {
    const clip = styledClip();
    const saved = presetFromClip(clip, UHD, { id: "a", name: "Bold", now: NOW });
    expect(saved.style).toMatchObject({ fontSize: 60, letterSpacing: 2, stroke: { width: 4 } });
    expect(saved.box.width).toBe(400);
    expect(saved.position).toEqual({ x: 20, y: -150 });
    expect(presetLook(saved, UHD).style).toEqual(clip.style);
    expect(presetLook(saved, SHORT).style.fontSize).toBe(60);
  });

  it("tells whether a clip's look differs from its preset (the box width only counts when fixed)", () => {
    const clip = styledClip();
    for (const frame of [SHORT, UHD, { width: 1000, height: 1777 }]) {
      const saved = presetFromClip(clip, frame, { id: "a", name: "A", now: NOW });
      expect(presetDiffers(saved, clip, frame)).toBe(false);
      expect(presetDiffers(saved, { ...clip, style: { ...clip.style, fontSize: 130 } }, frame)).toBe(true);
      expect(presetDiffers(saved, { ...clip, text: { ...clip.text, box: { mode: "fixed", width: 500 } } }, frame)).toBe(true);
      // Content and position are the clip's own.
      expect(presetDiffers(saved, { ...clip, text: { ...clip.text, value: "Other" }, transform: { ...clip.transform, x: 0 } }, frame)).toBe(false);
    }
    const auto = presetFromClip(styledClip({ text: { value: "a", box: { mode: "auto", width: 900 } } }), SHORT, { id: "b", name: "B", now: NOW });
    expect(presetDiffers(auto, styledClip({ text: { value: "a", box: { mode: "auto", width: 300 } } }), SHORT)).toBe(false);
  });

  it("updates a preset with a clip's look, keeping its name, flags and creation date", () => {
    const old = preset({ name: "Mine", favorite: true, applyPosition: true, tags: ["x"], animIn: { id: "fade" } });
    const clip = styledClip();
    const next = presetUpdatedFromClip(old, clip, SHORT, LATER);
    expect(next).toMatchObject({ id: "p", name: "Mine", favorite: true, applyPosition: true, tags: ["x"], createdAt: NOW, updatedAt: LATER, position: { x: 40, y: -300 } });
    expect(next.style).toEqual(clip.style);
    expect(next.animIn).toBeUndefined();
    expect(old.style).toEqual(DEFAULT_TEXT_STYLE);
  });
});

describe("names", () => {
  it("prefills the font and size, cleans names and shows Aa for long ones", () => {
    expect(defaultPresetName({ fontFamily: "Inter", fontSize: 120 })).toBe("Inter 120");
    expect(defaultPresetName({ fontFamily: "Playfair Display", fontSize: 56.25 })).toBe("Playfair Display 56.3");
    expect(thumbnailText("Bold outline")).toBe("Bold outline");
    expect(thumbnailText("A much longer preset name")).toBe("Aa");
    expect(thumbnailText("  ")).toBe("Aa");
  });

  it("makes names unique and duplicates as a copy that is no favorite", () => {
    expect(uniquePresetName("Title", ["Subtitle"])).toBe("Title");
    expect(uniquePresetName("Title", ["Title", "Title 2"])).toBe("Title 3");
    const copy = duplicatePreset(preset({ name: "Bold", favorite: true }), { id: "q", now: LATER, taken: ["Bold", "Bold copy"] });
    expect(copy).toMatchObject({ id: "q", name: "Bold copy 2", favorite: false, createdAt: LATER, updatedAt: LATER });
  });
});

describe("lists", () => {
  const list = [
    preset({ id: "a", name: "Bold outline", tags: ["title"], createdAt: "2026-01-01T00:00:00.000Z" }),
    preset({ id: "b", name: "Subtitle box", tags: ["subtitle"], style: { ...DEFAULT_TEXT_STYLE, fontFamily: "Oswald" }, createdAt: "2026-01-02T00:00:00.000Z" }),
  ];

  it("searches names, tags and families, every word", () => {
    expect(searchPresets(list, "").map((p) => p.id)).toEqual(["a", "b"]);
    expect(searchPresets(list, "BOLD").map((p) => p.id)).toEqual(["a"]);
    expect(searchPresets(list, "subtitle").map((p) => p.id)).toEqual(["b"]);
    expect(searchPresets(list, "oswald box").map((p) => p.id)).toEqual(["b"]);
    expect(searchPresets(list, "oswald bold")).toEqual([]);
  });

  it("gives at most 8 favorite chips, global ones first", () => {
    const many = Array.from({ length: 10 }, (_, i) => preset({ id: `g${i}`, favorite: i !== 3, createdAt: `2026-01-0${i % 9}T00:00:0${i}.000Z` }));
    const chips = favoriteChips(many, [preset({ id: "p1", favorite: true })]);
    expect(chips).toHaveLength(MAX_FAVORITE_CHIPS);
    expect(chips.some((p) => p.id === "g3" || p.id === "p1")).toBe(false);
    expect(favoriteChips([preset({ id: "g", favorite: true })], [preset({ id: "p1", favorite: true })]).map((p) => p.id)).toEqual(["g", "p1"]);
  });

  it("merges by id, the newer copy winning", () => {
    const a = [preset({ id: "x", name: "old", updatedAt: NOW }), preset({ id: "y" })];
    const b = [preset({ id: "x", name: "new", updatedAt: LATER }), preset({ id: "z" })];
    expect(mergePresets(a, b).map((p) => [p.id, p.name])).toEqual([
      ["x", "new"],
      ["y", "Preset"],
      ["z", "Preset"],
    ]);
    expect(mergePresets(b, a).find((p) => p.id === "x")?.name).toBe("new");
  });
});

describe("files", () => {
  it("reads a preset back exactly as written", () => {
    const original = preset({ id: "p1", name: "Box", style: structuredClone(DEFAULT_SUBTITLE_STYLE), box: { ...DEFAULT_SUBTITLE_BOX }, position: { x: 0, y: 500 }, applyPosition: true, tags: ["a"], favorite: true, defaultDuration: 2500, animIn: { id: "fade", duration: 10 } });
    expect(sanitizePreset(JSON.parse(formatPresetFile(original)), LATER)).toEqual(original);
  });

  it("falls back on bad values, skips presets without an id or a style", () => {
    expect(sanitizePreset({ name: "x", style: {} }, NOW)).toBeNull();
    expect(sanitizePreset({ id: "a" }, NOW)).toBeNull();
    const read = sanitizePreset({ id: "a", name: "  Two   words ", style: { fontFamily: 3, fontSize: 99999, fill: { from: { r: 2, g: 0, b: 0, a: 1 }, to: { r: 0, g: 0 } }, textCase: "shout", background: { mode: "x" } }, box: { mode: "wrap", width: -5 }, tags: ["t", 4, "t", " "], createdAt: "never" }, NOW);
    expect(read).toMatchObject({ id: "a", name: "Two words", box: { mode: "auto", width: 10 }, tags: ["t"], applyPosition: false, favorite: false, createdAt: NOW, updatedAt: NOW });
    expect(read?.style).toMatchObject({ fontFamily: DEFAULT_TEXT_STYLE.fontFamily, fontSize: 2000, textCase: "none", fill: { from: { r: 1, g: 0, b: 0, a: 1 }, to: { r: 0, g: 0, b: 1, a: 1 } }, background: { mode: DEFAULT_TEXT_STYLE.background.mode } });
    expect(sanitizeTextStyle(null)).toBeNull();
    expect(sanitizeTextStyle(DEFAULT_TITLE_STYLE)).toEqual(DEFAULT_TITLE_STYLE);
  });

  it("round-trips an export file, and reads a list or a single preset", () => {
    const presets = [preset({ id: "a", favorite: true }), preset({ id: "b", name: "Other" })];
    const text = formatPresetsFile(presets);
    expect(JSON.parse(text)).toMatchObject({ format: "shorts-editor.text-presets", version: 1 });
    expect(parsePresetsFile(text, LATER)).toEqual({ presets, skipped: 0 });
    expect(parsePresetsFile(JSON.stringify([presets[0], { id: "bad" }, presets[0]]), LATER)).toEqual({ presets: [presets[0]], skipped: 2 });
    expect(parsePresetsFile(JSON.stringify(presets[1]), LATER).presets).toEqual([presets[1]]);
  });

  it("refuses text that is not a presets file", () => {
    expect(() => parsePresetsFile("{nope", NOW)).toThrow("not JSON");
    expect(() => parsePresetsFile(JSON.stringify({ hello: 1 }), NOW)).toThrow("no text presets");
    expect(() => parsePresetsFile(JSON.stringify({ format: "shorts-editor.text-presets", version: 9, presets: [] }), NOW)).toThrow("newer version");
  });

  it("names files safely", () => {
    expect(presetFileName("starter-title")).toBe("starter-title.json");
    expect(presetFileName("a/b\\c:d")).toBe("a_b_c_d.json");
    expect(exportFileName("My: preset?")).toBe("My preset.json");
    expect(exportFileName(null)).toBe("text-presets.json");
    expect(exportFileName("///")).toBe("text-presets.json");
  });
});

describe("starter presets", () => {
  const starters = starterPresets();

  it("are 8 to 12 distinct looks with unique ids and names, in bundled fonts", () => {
    expect(starters.length).toBeGreaterThanOrEqual(8);
    expect(starters.length).toBeLessThanOrEqual(12);
    expect(new Set(starters.map((p) => p.id)).size).toBe(starters.length);
    expect(new Set(starters.map((p) => p.name)).size).toBe(starters.length);
    expect(new Set(starters.map((p) => styleKey(p.style))).size).toBe(starters.length);
    const families = new Set(BUNDLED_FONTS.map((font) => font.family));
    for (const starter of starters) expect(families.has(starter.style.fontFamily)).toBe(true);
  });

  it("read back unchanged from a file, oldest first in card order", () => {
    for (const starter of starters) expect(sanitizePreset(JSON.parse(formatPresetFile(starter)), LATER)).toEqual(starter);
    expect([...starters].sort((a, b) => a.createdAt.localeCompare(b.createdAt))).toEqual(starters);
  });

  it("start with the Batch 29 Title and Subtitle as the defaults", () => {
    const title = starters.find((p) => p.id === STARTER_TITLE_ID);
    const subtitle = starters.find((p) => p.id === STARTER_SUBTITLE_ID);
    expect(title?.style).toEqual(DEFAULT_TITLE_STYLE);
    expect(subtitle?.style).toEqual(DEFAULT_SUBTITLE_STYLE);
    expect(subtitle?.box).toEqual(DEFAULT_SUBTITLE_BOX);
    expect(title?.applyPosition).toBe(false);
    expect(subtitle?.applyPosition).toBe(false);
  });
});