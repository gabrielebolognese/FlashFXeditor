// Text presets (spec §10.3): the model of the Presets tab, the quick row's Save / Update preset and the
// toolbar's favorite chips. Pure.
// - Sizes are stored for a frame whose short side is TEXT_REFERENCE_SIDE (1080 px, a 1080 x 1920
//   short) and scale with the project a preset is used in (`presetLook`), as the default Title and
//   Subtitle did in Batch 29. On a 1080 px project nothing is scaled, so values stay exact.
// - A preset is the look of a text clip: its style, its box (auto or a fixed wrap width), its
//   animations and, used only when `applyPosition` is on, its position. Applying it keeps the
//   clip's content and duration (timeline/edit/text.ts `applyPreset`).
// - Animations are stored in milliseconds (presets cross frame rates, as `defaultDuration` does) and
//   come back in the project's frames (`presetLook`).
// - Files: one preset per JSON object; an export is `{ format, version, presets: [...] }`. Everything
//   read from a file goes through `sanitizePreset` (bad values fall back to the defaults, a preset
//   without an id or a style is skipped).
import type { Gradient, PresetTextAnim, Rational, RGBA, TextAnim, TextBox, TextClip, TextPreset, TextStyle } from "../core/document/types.js";
import { fromPresetAnim, isPlayable, sameAnim, sanitizePresetAnim, toPresetAnim } from "./anim.js";
import { DEFAULT_TEXT_BOX, DEFAULT_TEXT_STYLE, isGradient, scaleTextStyle, styleKey, TEXT_LIMITS, TEXT_REFERENCE_SIDE } from "./style.js";

/** The `format` of an exported presets file. */
export const PRESETS_FILE_FORMAT = "shorts-editor.text-presets";
export const PRESETS_FILE_VERSION = 1;
export const MAX_PRESET_NAME = 60;
/** Favorite presets shown as chips in the timeline toolbar (spec §6.1). */
export const MAX_FAVORITE_CHIPS = 8;
/** A card's thumbnail shows the preset's name up to this many characters, else `Aa` (spec §10.3). */
export const THUMBNAIL_NAME_MAX = 12;

/** A project's frame (its sizes scale presets) and frame rate (its animations' frames). */
type Frame = { width: number; height: number; fps: Rational };

/** The factor from preset sizes (1080 px short side) to a `frame`-sized project. */
export function presetScale(frame: { width: number; height: number }): number {
  const k = Math.min(frame.width, frame.height) / TEXT_REFERENCE_SIDE;
  return Number.isFinite(k) && k > 0 ? k : 1;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function scaleBox(box: TextBox, k: number): TextBox {
  if (k === 1) return { ...box };
  return { mode: box.mode, width: clamp(Math.round(box.width * k), TEXT_LIMITS.boxWidth.min, TEXT_LIMITS.boxWidth.max) };
}

const scaleStyle = (style: TextStyle, k: number): TextStyle => (k === 1 ? structuredClone(style) : scaleTextStyle(style, k));
const scalePoint = (point: { x: number; y: number }, k: number) => (k === 1 ? { ...point } : { x: Math.round(point.x * k), y: Math.round(point.y * k) });

/** What a preset gives a text clip in a `frame`-sized project. */
export interface PresetLook {
  style: TextStyle;
  box: TextBox;
  /** The position to take (applyPosition on), else null: the clip keeps (or the placement picks) its own. */
  position: { x: number; y: number } | null;
  animIn?: TextAnim;
  animOut?: TextAnim;
}

/** `preset` scaled to a `frame`-sized project, its animations in the project's frames. */
export function presetLook(preset: TextPreset, frame: Frame): PresetLook {
  const k = presetScale(frame);
  return {
    style: scaleStyle(preset.style, k),
    box: scaleBox(preset.box, k),
    position: preset.applyPosition && preset.position ? scalePoint(preset.position, k) : null,
    ...(preset.animIn && { animIn: fromPresetAnim(preset.animIn, frame.fps) }),
    ...(preset.animOut && { animOut: fromPresetAnim(preset.animOut, frame.fps) }),
  };
}

/** A clip's animation as a preset stores it; none when it does not play. */
function storedAnim(anim: TextAnim | undefined, fps: Rational): PresetTextAnim | undefined {
  return isPlayable(anim) ? toPresetAnim(anim, fps) : undefined;
}

/** A clip's look in preset sizes (the inverse of `presetLook`). */
function normalizedLook(clip: TextClip, frame: Frame): { style: TextStyle; box: TextBox; position: { x: number; y: number } } {
  const k = 1 / presetScale(frame);
  return { style: scaleStyle(clip.style, k), box: scaleBox(clip.text.box, k), position: scalePoint({ x: clip.transform.x, y: clip.transform.y }, k) };
}

/** A new preset with `clip`'s look (spec §10.3 "Save as preset"). */
export function presetFromClip(clip: TextClip, frame: Frame, fields: { id: string; name: string; now: string }): TextPreset {
  const look = normalizedLook(clip, frame);
  const animIn = storedAnim(clip.animIn, frame.fps);
  const animOut = storedAnim(clip.animOut, frame.fps);
  return {
    id: fields.id,
    name: cleanPresetName(fields.name) || defaultPresetName(clip.style),
    style: look.style,
    box: look.box,
    ...(animIn && { animIn }),
    ...(animOut && { animOut }),
    position: look.position,
    applyPosition: false,
    tags: [],
    favorite: false,
    createdAt: fields.now,
    updatedAt: fields.now,
  };
}

/** `preset` with `clip`'s current look (spec §10.3 "Update preset"); name, tags and flags stay. */
export function presetUpdatedFromClip(preset: TextPreset, clip: TextClip, frame: Frame, now: string): TextPreset {
  const look = normalizedLook(clip, frame);
  const next: TextPreset = { ...preset, style: look.style, box: look.box, position: look.position, updatedAt: now };
  delete next.animIn;
  delete next.animOut;
  const animIn = storedAnim(clip.animIn, frame.fps);
  const animOut = storedAnim(clip.animOut, frame.fps);
  if (animIn) next.animIn = animIn;
  if (animOut) next.animOut = animOut;
  return next;
}

const sameBox = (a: TextBox, b: TextBox) => a.mode === b.mode && (a.mode === "auto" || a.width === b.width);

/** Whether `clip`'s look (style, box, animations) is not `preset`'s: `Update preset` has something to write. */
export function presetDiffers(preset: TextPreset, clip: TextClip, frame: Frame): boolean {
  const look = normalizedLook(clip, frame);
  // Animations compare in the project's frames (milliseconds round).
  const shownAnim = (anim: PresetTextAnim | undefined) => (anim ? fromPresetAnim(anim, frame.fps) : undefined);
  const own = (anim: TextAnim | undefined) => (isPlayable(anim) ? anim : undefined);
  return (
    styleKey(look.style) !== styleKey(preset.style) ||
    !sameBox(look.box, preset.box) ||
    !sameAnim(own(clip.animIn), shownAnim(preset.animIn)) ||
    !sameAnim(own(clip.animOut), shownAnim(preset.animOut))
  );
}

/** A name field's start (spec §10.3: "prefilled with the font + size"): `Inter 120`. */
export function defaultPresetName(style: Pick<TextStyle, "fontFamily" | "fontSize">): string {
  return cleanPresetName(`${style.fontFamily} ${Math.round(style.fontSize * 10) / 10}`);
}

/** A name as stored: one line, trimmed, at most MAX_PRESET_NAME characters. */
export function cleanPresetName(name: string): string {
  return name.replace(/\s+/g, " ").trim().slice(0, MAX_PRESET_NAME);
}

/** The text a card's thumbnail shows: the name, or `Aa` when it is long (spec §10.3). */
export function thumbnailText(name: string): string {
  const clean = cleanPresetName(name);
  return clean === "" || [...clean].length > THUMBNAIL_NAME_MAX ? "Aa" : clean;
}

/** `name`, or `name 2`, `name 3`... the first not in `taken`. */
export function uniquePresetName(name: string, taken: Iterable<string>): string {
  const names = new Set(taken);
  if (!names.has(name)) return name;
  for (let n = 2; ; n++) {
    const candidate = cleanPresetName(`${name.slice(0, MAX_PRESET_NAME - String(n).length - 1)} ${n}`);
    if (!names.has(candidate)) return candidate;
  }
}

/** A copy of `preset` under a new id (spec §10.3 Duplicate): `Name copy`, not a favorite. */
export function duplicatePreset(preset: TextPreset, fields: { id: string; now: string; taken: Iterable<string> }): TextPreset {
  return { ...structuredClone(preset), id: fields.id, name: uniquePresetName(cleanPresetName(`${preset.name} copy`), fields.taken), favorite: false, createdAt: fields.now, updatedAt: fields.now };
}

/** Presets in card order: oldest first, then by name. */
export function sortPresets(presets: Iterable<TextPreset>): TextPreset[] {
  return [...presets].sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.name.localeCompare(b.name)));
}

/** The presets whose name, tags or font family contain every word of `query` (case-insensitive). */
export function searchPresets(presets: readonly TextPreset[], query: string): TextPreset[] {
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...presets];
  return presets.filter((preset) => {
    const haystack = [preset.name, preset.style.fontFamily, ...preset.tags].join(" ").toLocaleLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

/** The toolbar's favorite chips (spec §6.1: up to 8): global favorites first, then the project's, each in card order. */
export function favoriteChips(global: readonly TextPreset[], project: readonly TextPreset[]): TextPreset[] {
  return [...sortPresets(global), ...sortPresets(project)].filter((preset) => preset.favorite).slice(0, MAX_FAVORITE_CHIPS);
}

/**
 * Both lists as one, by id: a preset in both keeps the copy with the newer `updatedAt` (`a` on a tie).
 * Used when the global presets meet the library folder's.
 */
export function mergePresets(a: readonly TextPreset[], b: readonly TextPreset[]): TextPreset[] {
  const byId = new Map(a.map((preset) => [preset.id, preset]));
  for (const preset of b) {
    const known = byId.get(preset.id);
    if (!known || preset.updatedAt > known.updatedAt) byId.set(preset.id, preset);
  }
  return [...byId.values()];
}

// Reading presets from files.

type Raw = Record<string, unknown>;
const obj = (value: unknown): Raw | null => (typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Raw) : null);
const num = (value: unknown, fallback: number, min = -Infinity, max = Infinity) => (typeof value === "number" && Number.isFinite(value) ? clamp(value, min, max) : fallback);
const bool = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);
const oneOf = <T extends string>(values: readonly T[], value: unknown, fallback: T): T => (values.includes(value as T) ? (value as T) : fallback);

function rgba(value: unknown, fallback: RGBA): RGBA {
  const raw = obj(value);
  if (!raw) return { ...fallback };
  return { r: num(raw.r, fallback.r, 0, 1), g: num(raw.g, fallback.g, 0, 1), b: num(raw.b, fallback.b, 0, 1), a: num(raw.a, fallback.a, 0, 1) };
}

function fill(value: unknown, fallback: RGBA): RGBA | Gradient {
  const raw = obj(value);
  if (raw && obj(raw.from) && obj(raw.to)) return { from: rgba(raw.from, fallback), to: rgba(raw.to, fallback) };
  return rgba(value, fallback);
}

/** A text style read from a file: every value checked, a missing or bad one is the default's. */
export function sanitizeTextStyle(value: unknown, fallback: TextStyle = DEFAULT_TEXT_STYLE): TextStyle | null {
  const raw = obj(value);
  if (!raw) return null;
  const d = fallback;
  const L = TEXT_LIMITS;
  const stroke = obj(raw.stroke) ?? {};
  const shadow = obj(raw.shadow) ?? {};
  const background = obj(raw.background) ?? {};
  const family = typeof raw.fontFamily === "string" && raw.fontFamily.trim() !== "" ? raw.fontFamily.trim().slice(0, 200) : d.fontFamily;
  const solid = isGradient(d.fill) ? d.fill.from : d.fill;
  return {
    fontFamily: family,
    fontWeight: Math.round(num(raw.fontWeight, d.fontWeight, L.fontWeight.min, L.fontWeight.max)),
    italic: bool(raw.italic, d.italic),
    fontSize: num(raw.fontSize, d.fontSize, L.fontSize.min, L.fontSize.max),
    fill: fill(raw.fill, solid),
    stroke: { enabled: bool(stroke.enabled, d.stroke.enabled), width: num(stroke.width, d.stroke.width, L.strokeWidth.min, L.strokeWidth.max), color: rgba(stroke.color, d.stroke.color) },
    shadow: {
      enabled: bool(shadow.enabled, d.shadow.enabled),
      x: num(shadow.x, d.shadow.x, -1000, 1000),
      y: num(shadow.y, d.shadow.y, -1000, 1000),
      blur: num(shadow.blur, d.shadow.blur, L.shadowBlur.min, L.shadowBlur.max),
      color: rgba(shadow.color, d.shadow.color),
    },
    background: {
      enabled: bool(background.enabled, d.background.enabled),
      color: rgba(background.color, d.background.color),
      paddingX: num(background.paddingX, d.background.paddingX, L.padding.min, L.padding.max),
      paddingY: num(background.paddingY, d.background.paddingY, L.padding.min, L.padding.max),
      radius: num(background.radius, d.background.radius, L.radius.min, L.radius.max),
      mode: oneOf(["line", "block"], background.mode, d.background.mode),
    },
    textCase: oneOf(["none", "upper", "lower", "title"], raw.textCase, d.textCase),
    letterSpacing: num(raw.letterSpacing, d.letterSpacing, L.letterSpacing.min, L.letterSpacing.max),
    lineHeight: num(raw.lineHeight, d.lineHeight, L.lineHeight.min, L.lineHeight.max),
    align: oneOf(["left", "center", "right"], raw.align, d.align),
    verticalAnchor: oneOf(["top", "middle", "bottom"], raw.verticalAnchor, d.verticalAnchor),
  };
}

const isoTime = (value: unknown, fallback: string) => (typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : fallback);

/** A preset read from a file, or null when it has no id or no style. `now` dates a preset that has none. */
export function sanitizePreset(value: unknown, now: string): TextPreset | null {
  const raw = obj(value);
  if (!raw || typeof raw.id !== "string" || raw.id.trim() === "" || raw.id.length > 200) return null;
  const style = sanitizeTextStyle(raw.style);
  if (!style) return null;
  const box = obj(raw.box) ?? {};
  const position = obj(raw.position);
  const createdAt = isoTime(raw.createdAt, now);
  const duration = num(raw.defaultDuration, NaN, 1, 3_600_000);
  const animIn = sanitizePresetAnim(raw.animIn);
  const animOut = sanitizePresetAnim(raw.animOut);
  return {
    id: raw.id,
    name: (typeof raw.name === "string" && cleanPresetName(raw.name)) || defaultPresetName(style),
    style,
    box: { mode: oneOf(["auto", "fixed"], box.mode, DEFAULT_TEXT_BOX.mode), width: num(box.width, DEFAULT_TEXT_BOX.width, TEXT_LIMITS.boxWidth.min, TEXT_LIMITS.boxWidth.max) },
    ...(animIn && { animIn }),
    ...(animOut && { animOut }),
    ...(Number.isFinite(duration) && { defaultDuration: Math.round(duration) }),
    ...(position && { position: { x: Math.round(num(position.x, 0, -100_000, 100_000)), y: Math.round(num(position.y, 0, -100_000, 100_000)) } }),
    applyPosition: bool(raw.applyPosition, false),
    tags: Array.isArray(raw.tags) ? [...new Set(raw.tags.filter((tag): tag is string => typeof tag === "string" && tag.trim() !== "").map((tag) => tag.trim().slice(0, 40)))].slice(0, 20) : [],
    favorite: bool(raw.favorite, false),
    createdAt,
    updatedAt: isoTime(raw.updatedAt, createdAt),
  };
}

/** Presets as an export file (spec §10.3 "exported/imported as a JSON file"). */
export function formatPresetsFile(presets: readonly TextPreset[]): string {
  return `${JSON.stringify({ format: PRESETS_FILE_FORMAT, version: PRESETS_FILE_VERSION, presets }, null, 2)}\n`;
}

/**
 * The presets of a file: an export (`{ format, presets }`), a list of presets or one preset. Throws
 * with a message for the user when the text is not such a file; presets that cannot be read are counted.
 */
export function parsePresetsFile(text: string, now: string): { presets: TextPreset[]; skipped: number } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("The file is not JSON.");
  }
  const raw = obj(data);
  const list: unknown[] | null = Array.isArray(data) ? data : raw && Array.isArray(raw.presets) ? raw.presets : raw && "style" in raw ? [raw] : null;
  if (!list) throw new Error("The file holds no text presets.");
  if (raw && typeof raw.version === "number" && raw.version > PRESETS_FILE_VERSION) throw new Error("The file comes from a newer version of the editor.");
  const presets: TextPreset[] = [];
  const ids = new Set<string>();
  for (const entry of list) {
    const preset = sanitizePreset(entry, now);
    if (!preset || ids.has(preset.id)) continue;
    ids.add(preset.id);
    presets.push(preset);
  }
  return { presets, skipped: list.length - presets.length };
}

/** The file of a preset in `presets/text/` or the library folder. */
export function presetFileName(id: string): string {
  return `${id.replace(/[^A-Za-z0-9._-]/g, "_")}.json`;
}

/** One preset as a file of its folder. */
export function formatPresetFile(preset: TextPreset): string {
  return `${JSON.stringify(preset, null, 2)}\n`;
}

/** A file name for an export: the preset's name, or `text-presets`. */
export function exportFileName(name: string | null): string {
  const base = [...(name ?? "text-presets")]
    .filter((char) => char >= " " && !'\\/:*?"<>|'.includes(char))
    .join("")
    .trim()
    .slice(0, 60);
  return `${base || "text-presets"}.json`;
}