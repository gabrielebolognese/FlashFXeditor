// Text presets (spec §10.3, §20.2): the model of the Presets tab, the quick row's Save / Update preset and
// the preset bar above the preview (its sets, their order, Recent). Pure.
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
import {
  CAPTION_HIGHLIGHTS,
  PRESET_SET_IDS,
  type CaptionHighlight,
  type Gradient,
  type PresetSetId,
  type PresetTextAnim,
  type Rational,
  type RGBA,
  type TextAnim,
  type TextBox,
  type TextClip,
  type TextPreset,
  type TextStyle,
} from "../core/document/types.js";
import { fromPresetAnim, isPlayable, sameAnim, sanitizePresetAnim, toPresetAnim } from "./anim.js";
import { DEFAULT_TEXT_BOX, DEFAULT_TEXT_STYLE, isGradient, scaleTextStyle, styleKey, TEXT_LIMITS, TEXT_REFERENCE_SIDE } from "./style.js";

/** The `format` of an exported presets file. */
export const PRESETS_FILE_FORMAT = "shorts-editor.text-presets";
export const PRESETS_FILE_VERSION = 1;
export const MAX_PRESET_NAME = 60;
/** A preset without its own sample text shows its name cut to this many characters (spec §20.2 "about 14"). */
export const PRESET_SAMPLE_MAX = 14;
/** The longest sample text a preset stores. */
export const MAX_SAMPLE_TEXT = 40;
/** Tags a preset keeps, and their length. */
export const MAX_PRESET_TAGS = 20;
export const MAX_TAG_LENGTH = 40;
/** The preset bar's Recent set: presets applied, most recent first. */
export const MAX_RECENT_PRESETS = 12;

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

/** A sample text as stored: one line, trimmed, at most MAX_SAMPLE_TEXT characters ("" for none). */
export function cleanSampleText(text: string): string {
  return [...text.replace(/\s+/g, " ").trim()].slice(0, MAX_SAMPLE_TEXT).join("").trim();
}

/**
 * The text a preset's thumbnail shows (spec §20.2, the Presets tab's cards too): its sample text, else
 * its name cut to PRESET_SAMPLE_MAX characters, else `Aa`.
 */
export function presetSampleText(preset: Pick<TextPreset, "name" | "sampleText">): string {
  const sample = preset.sampleText === undefined ? "" : cleanSampleText(preset.sampleText);
  if (sample !== "") return sample;
  const name = [...cleanPresetName(preset.name)].slice(0, PRESET_SAMPLE_MAX).join("").trim();
  return name === "" ? "Aa" : name;
}

/** Everything a thumbnail draws from (its cache key): the style, the box, the sample text and the word highlight. */
export function presetLookKey(preset: TextPreset): string {
  const highlight = preset.highlight && preset.highlight.mode !== "none" ? JSON.stringify(preset.highlight) : "";
  return `${styleKey(preset.style)}|${preset.box.mode}:${preset.box.width}|${presetSampleText(preset)}|${highlight}`;
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

// The preset bar's sets (spec §20.2).

/** A set of the preset bar: Favorites, a bundled set, Recent, All, or a user tag (`tag:<name>`). */
export type PresetSetKey = "favorites" | PresetSetId | "recent" | "all" | `tag:${string}`;
/** The fixed sets, in the selector's order (the user tags follow). */
export const FIXED_PRESET_SETS = ["favorites", ...PRESET_SET_IDS, "recent", "all"] as const satisfies readonly PresetSetKey[];
export const DEFAULT_PRESET_SET: PresetSetKey = "favorites";
const SET_LABELS: Record<(typeof FIXED_PRESET_SETS)[number], string> = { favorites: "Favorites", titles: "Titles", subtitles: "Subtitles", captions: "Captions", recent: "Recent", all: "All" };

const TAG_PREFIX = "tag:";
export const tagSetKey = (tag: string): PresetSetKey => `${TAG_PREFIX}${tag}`;
/** The tag of a user set's key, or null for a fixed set. */
export const setTag = (key: PresetSetKey): string | null => (key.startsWith(TAG_PREFIX) ? key.slice(TAG_PREFIX.length) : null);

export function isPresetSetKey(value: unknown): value is PresetSetKey {
  if (typeof value !== "string") return false;
  if ((FIXED_PRESET_SETS as readonly string[]).includes(value)) return true;
  const tag = value.startsWith(TAG_PREFIX) ? value.slice(TAG_PREFIX.length) : "";
  return tag !== "" && [...tag].length <= MAX_TAG_LENGTH && tag.trim() === tag && !tag.includes(",");
}

export function presetSetLabel(key: PresetSetKey): string {
  return setTag(key) ?? SET_LABELS[key as keyof typeof SET_LABELS];
}

/** Every preset once: the global ones, then the project's (one with a global id is hidden), each in card order. */
export function allPresets(global: readonly TextPreset[], project: readonly TextPreset[]): TextPreset[] {
  const ids = new Set(global.map((preset) => preset.id));
  return [...sortPresets(global), ...sortPresets(project.filter((preset) => !ids.has(preset.id)))];
}

/**
 * The set selector's choices: the fixed sets, then each user tag (sorted, case-insensitive). Tags in
 * `bundledTags` (lower case: the starters' own, which search uses) are not sets; only the user's are.
 */
export function presetSetChoices(presets: readonly TextPreset[], bundledTags: ReadonlySet<string>): { key: PresetSetKey; label: string }[] {
  const tags = new Map<string, string>();
  for (const preset of presets) {
    for (const tag of preset.tags) {
      const lower = tag.toLocaleLowerCase();
      if (!bundledTags.has(lower) && !tags.has(lower) && isPresetSetKey(tagSetKey(tag))) tags.set(lower, tag);
    }
  }
  const user = [...tags.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return [...FIXED_PRESET_SETS.map((key) => ({ key, label: SET_LABELS[key] })), ...user.map((tag) => ({ key: tagSetKey(tag), label: tag }))];
}

/** Whether `preset` is in a set (Recent and All list any preset). */
export function inPresetSet(preset: TextPreset, key: PresetSetKey): boolean {
  if (key === "favorites") return preset.favorite;
  if (key === "recent" || key === "all") return true;
  const tag = setTag(key);
  if (tag !== null) return preset.tags.some((own) => own.toLocaleLowerCase() === tag.toLocaleLowerCase());
  return preset.sets?.includes(key as PresetSetId) ?? false;
}

/** A drag reorders a set, which keeps its order (spec §20.2): every set but Recent (by recency) and All (card order). */
export const reorderableSet = (key: PresetSetKey): boolean => key !== "recent" && key !== "all";

/** `items` with those named in `order` first, in its order, then the rest as they were. */
export function applyOrder<T extends { id: string }>(items: readonly T[], order: readonly string[] | undefined): T[] {
  if (!order || order.length === 0) return [...items];
  const rank = new Map(order.map((id, index) => [id, index]));
  const ranked = items.filter((item) => rank.has(item.id)).sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  return [...ranked, ...items.filter((item) => !rank.has(item.id))];
}

/**
 * The buttons of a set, in order: Recent by recency (`recent` ids), All in card order (global first),
 * the others filtered and in their stored `order` (presets it does not name after, in card order).
 */
export function presetsInSet(
  global: readonly TextPreset[],
  project: readonly TextPreset[],
  key: PresetSetKey,
  saved: { recent: readonly string[]; order?: readonly string[] | undefined },
): TextPreset[] {
  const all = allPresets(global, project);
  if (key === "all") return all;
  if (key === "recent") {
    const byId = new Map(all.map((preset) => [preset.id, preset]));
    return saved.recent.map((id) => byId.get(id)).filter((preset): preset is TextPreset => preset !== undefined);
  }
  return applyOrder(
    all.filter((preset) => inPresetSet(preset, key)),
    saved.order,
  );
}

/** `ids` with `id` moved into gap `gap` of the list (0: before the first, ids.length: after the last). */
export function movedOrder(ids: readonly string[], id: string, gap: number): string[] {
  const from = ids.indexOf(id);
  if (from === -1) return [...ids];
  const rest = ids.filter((other) => other !== id);
  const at = Math.max(0, Math.min(rest.length, gap > from ? gap - 1 : gap));
  return [...rest.slice(0, at), id, ...rest.slice(at)];
}

/** `preset` in set `key` (spec §20.2 `+`: a new preset joins the shown set): a favorite, in a bundled set, or tagged. */
export function joinPresetSet(preset: TextPreset, key: PresetSetKey): TextPreset {
  if (key === "recent" || key === "all" || inPresetSet(preset, key)) return preset;
  if (key === "favorites") return { ...preset, favorite: true };
  const tag = setTag(key);
  if (tag !== null) return { ...preset, tags: [...preset.tags, tag].slice(0, MAX_PRESET_TAGS) };
  return { ...preset, sets: PRESET_SET_IDS.filter((set) => set === key || preset.sets?.includes(set)) };
}

/** `preset` in or out of a bundled set (the card menu's In Titles / In Subtitles / In Captions). */
export function togglePresetSet(preset: TextPreset, set: PresetSetId): TextPreset {
  const had = preset.sets?.includes(set) ?? false;
  const sets = PRESET_SET_IDS.filter((id) => (id === set ? !had : (preset.sets?.includes(id) ?? false)));
  const next: TextPreset = { ...preset, sets };
  if (sets.length === 0) delete next.sets;
  return next;
}

/** Tags typed as a comma-separated list: each one line and trimmed, unique (case-insensitive), at most MAX_PRESET_TAGS. */
export function parseTags(text: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const part of text.split(",")) {
    const tag = [...part.replace(/\s+/g, " ").trim()].slice(0, MAX_TAG_LENGTH).join("").trim();
    if (tag === "" || seen.has(tag.toLocaleLowerCase())) continue;
    seen.add(tag.toLocaleLowerCase());
    tags.push(tag);
  }
  return tags.slice(0, MAX_PRESET_TAGS);
}

/** The Recent set after `id` was applied: it first, at most MAX_RECENT_PRESETS. */
export function notedRecent(recent: readonly string[], id: string): string[] {
  return [id, ...recent.filter((other) => other !== id)].slice(0, MAX_RECENT_PRESETS);
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

/** A preset's word highlight read from a file (none when absent or off). */
function sanitizeHighlight(value: unknown): CaptionHighlight | null {
  const raw = obj(value);
  if (!raw) return null;
  const mode = oneOf(CAPTION_HIGHLIGHTS, raw.mode, "none");
  if (mode === "none") return null;
  const white = { r: 1, g: 1, b: 1, a: 1 };
  return { mode, color: rgba(raw.color, white), inactiveColor: rgba(raw.inactiveColor, white) };
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
  // Batch 52 (no file version change: older files have none of these, older editors drop them).
  const sampleText = typeof raw.sampleText === "string" ? cleanSampleText(raw.sampleText) : "";
  const sets = Array.isArray(raw.sets) ? PRESET_SET_IDS.filter((set) => (raw.sets as unknown[]).includes(set)) : [];
  const highlight = sanitizeHighlight(raw.highlight);
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
    ...(sampleText !== "" && { sampleText }),
    ...(sets.length > 0 && { sets }),
    ...(highlight && { highlight }),
    // A comma inside a tag would split it when edited as a list: it reads as a space.
    tags: Array.isArray(raw.tags) ? parseTags(raw.tags.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.replace(/,/g, " ")).join(",")) : [],
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