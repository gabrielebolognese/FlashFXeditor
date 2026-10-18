import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { makeTextClip } from "../core/document/fixtures.js";
import type { TextAnim, TextClip, TextPreset } from "../core/document/types.js";
import {
  allPresets,
  applyOrder,
  defaultPresetName,
  duplicatePreset,
  exportFileName,
  FIXED_PRESET_SETS,
  formatPresetFile,
  formatPresetsFile,
  inPresetSet,
  isPresetSetKey,
  joinPresetSet,
  MAX_RECENT_PRESETS,
  mergePresets,
  movedOrder,
  notedRecent,
  parseTags,
  presetLookKey,
  presetSampleText,
  presetSetChoices,
  presetSetLabel,
  presetsInSet,
  reorderableSet,
  setTag,
  tagSetKey,
  togglePresetSet,
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
  uniquePresetName,
} from "./presets.js";
import { sanitizePresetAnim } from "./anim.js";
import { parseCatalog } from "./fonts/catalog.js";
import { STARTER_PACK_VERSION, STARTER_SUBTITLE_ID, STARTER_TAGS, STARTER_TITLE_ID, starterPresets, upgradeStarterPack, upgradeStarters } from "./starterPresets.js";
import { DEFAULT_SUBTITLE_BOX, DEFAULT_SUBTITLE_STYLE, DEFAULT_TEXT_STYLE, DEFAULT_TITLE_STYLE } from "./style.js";

const FPS = { num: 30, den: 1 };
const SHORT = { width: 1080, height: 1920, fps: FPS };
const UHD = { width: 2160, height: 3840, fps: FPS };
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
    for (const frame of [SHORT, UHD, { width: 1000, height: 1777, fps: FPS }]) {
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

  it("stores animations in milliseconds, brings them back in the project's frames and compares them there", () => {
    const clip = styledClip({ animIn: { id: "wordPop", duration: 24, stagger: 3 }, animOut: { id: "fade", duration: 15 } });
    const saved = presetFromClip(clip, SHORT, { id: "a", name: "Pop", now: NOW });
    expect(saved.animIn).toEqual({ id: "wordPop", durationMs: 800, staggerMs: 100 });
    expect(saved.animOut).toEqual({ id: "fade", durationMs: 500 });
    expect(presetDiffers(saved, clip, SHORT)).toBe(false);
    expect(presetDiffers(saved, { ...clip, animIn: { id: "wordPop", duration: 25, stagger: 3 } }, SHORT)).toBe(true);
    expect(presetDiffers(saved, styledClip({ animIn: clip.animIn as TextAnim }), SHORT)).toBe(true);
    const fps60 = { ...SHORT, fps: { num: 60, den: 1 } };
    expect(presetLook(saved, fps60)).toMatchObject({ animIn: { id: "wordPop", duration: 48, stagger: 6 }, animOut: { id: "fade", duration: 30 } });
    // An animation the engine cannot play is not saved.
    expect(presetFromClip(styledClip({ animIn: { id: "fade" } as unknown as TextAnim }), SHORT, { id: "b", name: "B", now: NOW }).animIn).toBeUndefined();
  });

  it("updates a preset with a clip's look, keeping its name, flags and creation date", () => {
    const old = preset({ name: "Mine", favorite: true, applyPosition: true, tags: ["x"], animIn: { id: "fade", durationMs: 500 } });
    const clip = styledClip();
    const next = presetUpdatedFromClip(old, clip, SHORT, LATER);
    expect(next).toMatchObject({ id: "p", name: "Mine", favorite: true, applyPosition: true, tags: ["x"], createdAt: NOW, updatedAt: LATER, position: { x: 40, y: -300 } });
    expect(next.style).toEqual(clip.style);
    expect(next.animIn).toBeUndefined();
    expect(old.style).toEqual(DEFAULT_TEXT_STYLE);
  });
});

describe("names", () => {
  it("prefills the font and size, and shows the sample text, else the name cut to 14 characters, else Aa", () => {
    expect(defaultPresetName({ fontFamily: "Inter", fontSize: 120 })).toBe("Inter 120");
    expect(defaultPresetName({ fontFamily: "Playfair Display", fontSize: 56.25 })).toBe("Playfair Display 56.3");
    expect(presetSampleText({ name: "Bold outline" })).toBe("Bold outline");
    expect(presetSampleText({ name: "A much longer preset name" })).toBe("A much longer");
    expect(presetSampleText({ name: "  " })).toBe("Aa");
    expect(presetSampleText({ name: "Caption bold", sampleText: "  Say   it loud " })).toBe("Say it loud");
    expect(presetSampleText({ name: "Caption bold", sampleText: "   " })).toBe("Caption bold");
  });

  it("keys a thumbnail by everything it draws", () => {
    const base = preset();
    const key = presetLookKey(base);
    expect(presetLookKey({ ...base, name: "Other", favorite: true, tags: ["x"] })).not.toBe(key);
    expect(presetLookKey({ ...base, sampleText: "Preset" })).toBe(key);
    expect(presetLookKey({ ...base, style: { ...base.style, fontWeight: 400 } })).not.toBe(key);
    expect(presetLookKey({ ...base, highlight: { mode: "color", color: { r: 1, g: 1, b: 0, a: 1 }, inactiveColor: { r: 1, g: 1, b: 1, a: 1 } } })).not.toBe(key);
    expect(presetLookKey({ ...base, highlight: { mode: "none", color: { r: 1, g: 1, b: 0, a: 1 }, inactiveColor: { r: 1, g: 1, b: 1, a: 1 } } })).toBe(key);
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

  it("lists every preset once, the global ones first", () => {
    const global = [preset({ id: "b", createdAt: LATER }), preset({ id: "a" })];
    const project = [preset({ id: "p" }), preset({ id: "a", name: "shadowed" })];
    expect(allPresets(global, project).map((p) => p.id)).toEqual(["a", "b", "p"]);
    expect(allPresets(global, project)[0]?.name).toBe("Preset");
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

describe("preset bar sets (Batch 52)", () => {
  const global = [
    preset({ id: "t1", sets: ["titles"], favorite: true, createdAt: "2026-01-01T00:00:00.000Z" }),
    preset({ id: "t2", sets: ["titles", "captions"], tags: ["Promo"], createdAt: "2026-01-02T00:00:00.000Z" }),
    preset({ id: "s1", sets: ["subtitles"], tags: ["promo", "title"], createdAt: "2026-01-03T00:00:00.000Z" }),
  ];
  const project = [preset({ id: "p1", favorite: true, tags: ["Client"], createdAt: "2026-01-01T00:00:00.000Z" })];
  const ids = (list: readonly TextPreset[]) => list.map((p) => p.id);

  it("knows the set keys and their labels", () => {
    expect(FIXED_PRESET_SETS).toEqual(["favorites", "titles", "subtitles", "captions", "recent", "all"]);
    for (const key of FIXED_PRESET_SETS) expect(isPresetSetKey(key)).toBe(true);
    expect(isPresetSetKey(tagSetKey("Promo"))).toBe(true);
    expect(isPresetSetKey("tag:")).toBe(false);
    expect(isPresetSetKey("tag: padded ")).toBe(false);
    expect(isPresetSetKey("tag:a,b")).toBe(false);
    expect(isPresetSetKey("favourites")).toBe(false);
    expect(isPresetSetKey(3)).toBe(false);
    expect(setTag(tagSetKey("Promo"))).toBe("Promo");
    expect(setTag("titles")).toBeNull();
    expect(presetSetLabel("favorites")).toBe("Favorites");
    expect(presetSetLabel(tagSetKey("Promo"))).toBe("Promo");
  });

  it("offers the fixed sets, then the user tags (not the starters' own), once each", () => {
    const choices = presetSetChoices([...global, ...project], new Set(["title"]));
    expect(choices.map((c) => c.key)).toEqual([...FIXED_PRESET_SETS, "tag:Client", "tag:Promo"]);
    expect(choices.at(-1)?.label).toBe("Promo");
  });

  it("lists a set's presets: favorites, bundled sets, tags, Recent by recency, All in card order", () => {
    const saved = { recent: ["s1", "gone", "p1"] };
    expect(ids(presetsInSet(global, project, "favorites", saved))).toEqual(["t1", "p1"]);
    expect(ids(presetsInSet(global, project, "titles", saved))).toEqual(["t1", "t2"]);
    expect(ids(presetsInSet(global, project, "captions", saved))).toEqual(["t2"]);
    expect(ids(presetsInSet(global, project, tagSetKey("PROMO"), saved))).toEqual(["t2", "s1"]);
    expect(ids(presetsInSet(global, project, "recent", saved))).toEqual(["s1", "p1"]);
    expect(ids(presetsInSet(global, project, "all", saved))).toEqual(["t1", "t2", "s1", "p1"]);
    expect(inPresetSet(global[0] as TextPreset, "subtitles")).toBe(false);
  });

  it("keeps a set's stored order, presets it does not name after it in card order", () => {
    expect(ids(presetsInSet(global, project, "all", { recent: [], order: ["s1"] }))).toEqual(["t1", "t2", "s1", "p1"]);
    expect(ids(presetsInSet(global, project, "titles", { recent: [], order: ["t2", "gone", "t1"] }))).toEqual(["t2", "t1"]);
    expect(ids(applyOrder(global, ["s1"]))).toEqual(["s1", "t1", "t2"]);
    expect(reorderableSet("favorites")).toBe(true);
    expect(reorderableSet(tagSetKey("Promo"))).toBe(true);
    expect(reorderableSet("recent")).toBe(false);
    expect(reorderableSet("all")).toBe(false);
  });

  it("moves an id into a gap", () => {
    const list = ["a", "b", "c", "d"];
    expect(movedOrder(list, "a", 0)).toEqual(list);
    expect(movedOrder(list, "a", 1)).toEqual(list);
    expect(movedOrder(list, "a", 2)).toEqual(["b", "a", "c", "d"]);
    expect(movedOrder(list, "a", 4)).toEqual(["b", "c", "d", "a"]);
    expect(movedOrder(list, "d", 0)).toEqual(["d", "a", "b", "c"]);
    expect(movedOrder(list, "c", 1)).toEqual(["a", "c", "b", "d"]);
    expect(movedOrder(list, "x", 1)).toEqual(list);
    expect(movedOrder(list, "b", 99)).toEqual(["a", "c", "d", "b"]);
  });

  it("puts a new preset into the shown set, and toggles bundled sets", () => {
    const p = preset();
    expect(joinPresetSet(p, "favorites").favorite).toBe(true);
    expect(joinPresetSet(p, "captions").sets).toEqual(["captions"]);
    expect(joinPresetSet({ ...p, sets: ["captions"] }, "titles").sets).toEqual(["titles", "captions"]);
    expect(joinPresetSet(p, tagSetKey("Promo")).tags).toEqual(["Promo"]);
    expect(joinPresetSet(p, "recent")).toBe(p);
    expect(joinPresetSet(p, "all")).toBe(p);
    const titled = togglePresetSet(p, "titles");
    expect(titled.sets).toEqual(["titles"]);
    expect(togglePresetSet(titled, "titles").sets).toBeUndefined();
    expect(togglePresetSet({ ...p, sets: ["captions"] }, "subtitles").sets).toEqual(["subtitles", "captions"]);
  });

  it("parses tags and keeps Recent short", () => {
    expect(parseTags(" promo, Client ,,PROMO,  two   words ")).toEqual(["promo", "Client", "two words"]);
    expect(parseTags("x".repeat(50))).toEqual(["x".repeat(40)]);
    expect(parseTags(Array.from({ length: 30 }, (_, i) => `t${i}`).join(","))).toHaveLength(20);
    expect(notedRecent(["a", "b"], "b")).toEqual(["b", "a"]);
    const many = Array.from({ length: 20 }, (_, i) => `p${i}`);
    expect(notedRecent(many, "new")).toHaveLength(MAX_RECENT_PRESETS);
    expect(notedRecent(many, "new")[0]).toBe("new");
  });
});

describe("files", () => {
  it("reads a preset back exactly as written", () => {
    const original = preset({ id: "p1", name: "Box", style: structuredClone(DEFAULT_SUBTITLE_STYLE), box: { ...DEFAULT_SUBTITLE_BOX }, position: { x: 0, y: 500 }, applyPosition: true, tags: ["a"], favorite: true, defaultDuration: 2500, animIn: { id: "fade", durationMs: 333, staggerMs: 0, ease: "easeIn" } });
    expect(sanitizePreset(JSON.parse(formatPresetFile(original)), LATER)).toEqual(original);
    // Batch 52: the sample text, the sets and the word highlight.
    const bar = preset({ id: "p2", sampleText: "Say it", sets: ["titles", "captions"], highlight: { mode: "background", color: { r: 0.5, g: 0.3, b: 1, a: 1 }, inactiveColor: { r: 1, g: 1, b: 1, a: 1 } } });
    expect(sanitizePreset(JSON.parse(formatPresetFile(bar)), LATER)).toEqual(bar);
  });

  it("reads the Batch 52 fields defensively (older files have none)", () => {
    const read = sanitizePreset({ id: "a", style: {}, sampleText: "  two\nlines  ", sets: ["captions", "nope", "titles", "captions"], highlight: { mode: "laser" }, tags: ["a,b", "A b"] }, NOW);
    expect(read).toMatchObject({ sampleText: "two lines", sets: ["titles", "captions"], tags: ["a b"] });
    expect(read?.highlight).toBeUndefined();
    const old = sanitizePreset({ id: "b", style: {} }, NOW);
    expect(old).not.toHaveProperty("sampleText");
    expect(old).not.toHaveProperty("sets");
    expect(old).not.toHaveProperty("highlight");
    expect(sanitizePreset({ id: "c", style: {}, sampleText: "", sets: [] }, NOW)).not.toHaveProperty("sets");
    expect(sanitizePreset({ id: "d", style: {}, highlight: { mode: "scale", color: "red" } }, NOW)?.highlight).toEqual({ mode: "scale", color: { r: 1, g: 1, b: 1, a: 1 }, inactiveColor: { r: 1, g: 1, b: 1, a: 1 } });
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
  const catalog = parseCatalog(JSON.parse(readFileSync("public/fonts/library/catalog.json", "utf8")));

  it("are about 40 distinct looks (spec §20.2) with unique ids and names, in library fonts at weights they have", () => {
    expect(starters.length).toBeGreaterThanOrEqual(36);
    expect(starters.length).toBeLessThanOrEqual(44);
    expect(new Set(starters.map((p) => p.id)).size).toBe(starters.length);
    expect(new Set(starters.map((p) => p.name)).size).toBe(starters.length);
    expect(new Set(starters.map((p) => presetLookKey(p))).size).toBe(starters.length);
    for (const starter of starters) {
      const family = catalog.byFamily.get(starter.style.fontFamily.toLowerCase());
      expect(family, starter.style.fontFamily).toBeDefined();
      if (!family) continue;
      const weight = starter.style.fontWeight;
      const has = family.weights.includes(weight) || (family.variable !== null && weight >= family.variable.wght[0] && weight <= family.variable.wght[1]);
      expect(has, `${starter.name}: ${family.family} ${weight}`).toBe(true);
      if (starter.style.italic) expect(family.italic, starter.name).toBe(true);
    }
    // Animations (Batch 31): valid, and none on the defaults (T and Shift+T stay still).
    for (const starter of starters) for (const anim of [starter.animIn, starter.animOut]) if (anim) expect(sanitizePresetAnim(anim)).toEqual(anim);
    expect(starters.filter((p) => p.animIn).length).toBeGreaterThanOrEqual(3);
    expect(starters.find((p) => p.id === STARTER_TITLE_ID)?.animIn).toBeUndefined();
    expect(starters.find((p) => p.id === STARTER_SUBTITLE_ID)?.animIn).toBeUndefined();
  });

  it("gives untouched starters stored before Batch 31 their animations, and leaves changed ones alone", () => {
    const old = starterPresets().map((p) => {
      const copy = { ...p };
      delete copy.animIn;
      delete copy.animOut;
      return copy;
    });
    const caption = old.findIndex((p) => p.id === "starter-caption");
    const lower = old.findIndex((p) => p.id === "starter-lower-third");
    old[lower] = { ...(old[lower] as TextPreset), updatedAt: "2026-10-16T10:00:00.000Z" };
    const upgraded = upgradeStarters(old);
    expect(upgraded?.[caption]?.animIn).toEqual({ id: "wordPop", durationMs: 800 });
    expect(upgraded?.[caption]?.updatedAt).toBe(old[caption]?.updatedAt);
    expect(upgraded?.[lower]?.animIn).toBeUndefined();
    expect(upgradeStarters(upgraded as TextPreset[])).toBeNull();
    expect(upgradeStarters([])).toBeNull();
  });

  it("fill the Titles, Subtitles and Captions sets, with nine favorites and short sample texts", () => {
    const count = (set: "titles" | "subtitles" | "captions") => starters.filter((p) => p.sets?.includes(set)).length;
    expect(count("titles")).toBeGreaterThanOrEqual(15);
    expect(count("subtitles")).toBeGreaterThanOrEqual(6);
    expect(count("captions")).toBeGreaterThanOrEqual(6);
    for (const starter of starters) expect(starter.sets?.length, starter.name).toBe(1);
    expect(starters.filter((p) => p.favorite)).toHaveLength(9);
    for (const starter of starters) expect([...presetSampleText(starter)].length, starter.name).toBeLessThanOrEqual(14);
    // The captions' word highlights (yellow active word, boxed word, ...), and every mode once at least.
    const modes = new Set(starters.flatMap((p) => (p.highlight ? [p.highlight.mode] : [])));
    expect([...modes].sort()).toEqual(["background", "color", "colorAndScale", "scale"]);
    for (const starter of starters) if (starter.highlight) expect(starter.sets).toEqual(["captions"]);
    // Their tags are search words, not preset bar sets.
    expect(presetSetChoices(starters, STARTER_TAGS).map((c) => c.key)).toEqual([...FIXED_PRESET_SETS]);
  });

  it("keep the 12 Batch 30 starters first, at their ids, looks and dates", () => {
    const old = ["starter-title", "starter-subtitle", "starter-bold-outline", "starter-lower-third", "starter-caption", "starter-highlight", "starter-minimal-mono", "starter-big-number", "starter-elegant-serif", "starter-handwritten", "starter-neon", "starter-breaking"];
    expect(starters.slice(0, 12).map((p) => p.id)).toEqual(old);
    expect(starters[4]?.createdAt).toBe("2026-01-01T00:04:00.000Z");
    expect(starters[2]?.style).toMatchObject({ fontFamily: "Unbounded", fontWeight: 800, fontSize: 104, textCase: "upper" });
  });

  it("bring a pack 1 store up to date: new starters join, stored ones get their sets and sample texts", () => {
    const bundled = starterPresets();
    const strip = (p: TextPreset): TextPreset => {
      const copy = { ...p, favorite: false };
      delete copy.sets;
      delete copy.sampleText;
      delete copy.highlight;
      return copy;
    };
    // Pack 1: the 12 of Batch 30 as stored then; the user deleted Highlight and changed Bold outline; Title is untouched.
    const stored = bundled
      .slice(0, 12)
      .filter((p) => p.id !== "starter-highlight")
      .map(strip)
      .map((p) => (p.id === "starter-bold-outline" ? { ...p, name: "Mine", favorite: false, updatedAt: LATER } : p));
    const upgraded = upgradeStarterPack(stored, 1) as TextPreset[];
    expect(upgraded).not.toBeNull();
    expect(upgraded.length).toBe(bundled.length - 1);
    expect(upgraded.some((p) => p.id === "starter-highlight")).toBe(false);
    const bold = upgraded.find((p) => p.id === "starter-bold-outline");
    expect(bold).toMatchObject({ name: "Mine", sets: ["titles"], sampleText: "Bold", favorite: false, updatedAt: LATER });
    const title = upgraded.find((p) => p.id === STARTER_TITLE_ID);
    expect(title).toMatchObject({ sets: ["titles"], favorite: true, updatedAt: bundled[0]?.updatedAt });
    expect(upgraded.find((p) => p.id === "starter-caption-yellow")).toEqual(bundled.find((p) => p.id === "starter-caption-yellow"));
    // Nothing more to do at the current pack, nor for a store that is already current.
    expect(upgradeStarterPack(upgraded, STARTER_PACK_VERSION)).toBeNull();
    expect(upgradeStarterPack(upgraded, 1)).toBeNull();
    expect(upgradeStarterPack([], 1)?.length).toBe(bundled.length - 12);
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