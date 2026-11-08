// Document invariants (spec §5.2). The DocumentStore runs `assertValid` after every command in dev
// builds; messages name the track and clip so a broken command is found at once.
import { isEaseId, keyframeIssues } from "./keyframes.js";
import { transitionIssues } from "./transitions.js";
import { sequenceGraphIssues } from "./sequences.js";
import { usPerFrame } from "./time.js";
import { sequenceDurationUs, sequenceRecordIssues } from "./sequence.js";
import { pathDataIssue } from "../shapes/pathData.js";
import { PRIMITIVE_LIMITS, PRIMITIVE_PARAMS } from "../shapes/primitives.js";
import { BLEND_MODES, MATTE_MODES, CAPTION_HIGHLIGHTS, COUNTER_SEPARATORS, CUE_ANIM_KINDS, FILL_RULES, SELECTOR_ORDERS, SELECTOR_SHAPES, TEXT_ANIM_UNITS, isFreeze, isMediaClip, LABEL_COLORS, LINE_CAPS, LINE_JOINS, PRIMITIVE_KINDS, SOLID_SHAPE_IDS, type NullClip, type PrimitiveKind, type ShapeClip, STROKE_ALIGNS, type CaptionClip, type CaptionStyle, type Clip, type ClipId, type ClipKind, type CompoundClip, type Sequence, type MediaClip, type MediaItem, type Project, type SolidClip, type TextClip, type TextSpan, type TextStyle, type Track, type TrackId, type TrackKind } from "./types.js";

export class DocumentInvariantError extends Error {
  readonly issues: readonly string[];

  constructor(context: string, issues: readonly string[]) {
    super(`Document invariants violated ${context}:\n${issues.map((issue) => `  - ${issue}`).join("\n")}`);
    this.name = "DocumentInvariantError";
    this.issues = issues;
  }
}

const ALLOWED_CLIPS: Record<TrackKind, ReadonlySet<ClipKind>> = {
  video: new Set(["video", "image", "text", "solid", "compound", "shape", "null"]),
  audio: new Set(["audio"]),
  caption: new Set(["caption"]),
};

const ROTATIONS: ReadonlySet<number> = new Set([0, 90, 180, 270]);
const PROXY_STATUSES: ReadonlySet<string> = new Set(["none", "pending", "ready", "failed"]);
const LABEL_SET: ReadonlySet<string> = new Set(LABEL_COLORS);
const isPositiveInteger = (value: unknown) => Number.isInteger(value) && (value as number) > 0;

const trackLabel = (track: Track) => `track "${track.name}" (${track.id})`;
const clipLabel = (clip: Clip) => `clip "${clip.name}" (${clip.id})`;

/** Integer microseconds and sizes (P4), a quarter-turn rotation, and a path inside the project folder. */
function mediaIssues(key: string, media: MediaItem): string[] {
  const issues: string[] = [];
  const label = `media "${media.name}" (${media.id})`;
  if (key !== media.id) issues.push(`${label}: stored under key ${key}`);
  if (!Number.isInteger(media.durationUs) || media.durationUs < 0) issues.push(`${label}: durationUs ${media.durationUs} must be an integer >= 0`);
  if (media.width !== undefined && !isPositiveInteger(media.width)) issues.push(`${label}: width ${media.width} must be a positive integer`);
  if (media.height !== undefined && !isPositiveInteger(media.height)) issues.push(`${label}: height ${media.height} must be a positive integer`);
  if (media.rotation !== undefined && !ROTATIONS.has(media.rotation)) issues.push(`${label}: rotation ${media.rotation} must be 0, 90, 180 or 270`);
  if (media.fps !== undefined && !(isPositiveInteger(media.fps.num) && isPositiveInteger(media.fps.den))) {
    issues.push(`${label}: fps ${media.fps.num}/${media.fps.den} must be a ratio of positive integers`);
  }
  if ("relPath" in media.file && !isInsidePath(media.file.relPath)) issues.push(`${label}: relPath "${media.file.relPath}" must be a relative path inside the project folder`);
  if (media.size !== undefined && !(Number.isInteger(media.size) && media.size >= 0)) issues.push(`${label}: size ${media.size} must be an integer >= 0`);
  if (media.sequence) {
    if (media.kind !== "image") issues.push(`${label}: only an image can be a sequence`);
    const problems = sequenceRecordIssues(media.sequence);
    for (const issue of problems) issues.push(`${label}: sequence ${issue}`);
    if (problems.length === 0 && media.durationUs !== sequenceDurationUs(media.sequence)) issues.push(`${label}: durationUs ${media.durationUs} must be the sequence's ${sequenceDurationUs(media.sequence)}`);
  }
  if (media.alpha !== undefined && media.kind !== "video") issues.push(`${label}: alpha only applies to a video`);
  const { proxy } = media;
  if (proxy) {
    if (!PROXY_STATUSES.has(proxy.status)) issues.push(`${label}: proxy status "${proxy.status}" is not none, pending, ready or failed`);
    if (!isPositiveInteger(proxy.width) || !isPositiveInteger(proxy.height)) issues.push(`${label}: proxy size ${proxy.width}x${proxy.height} must be positive integers`);
    if (!isInsidePath(proxy.relPath)) issues.push(`${label}: proxy relPath "${proxy.relPath}" must be a relative path inside the project folder`);
  }
  return issues;
}

function isInsidePath(path: string): boolean {
  return !path.startsWith("/") && !path.split("/").some((part) => part === "" || part === "." || part === "..");
}

function clipIssues(project: Project, clip: Clip): string[] {
  const issues: string[] = [];
  const label = clipLabel(clip);
  if (!Number.isInteger(clip.start) || clip.start < 0) issues.push(`${label}: start ${clip.start} must be an integer frame >= 0`);
  if (!Number.isInteger(clip.duration) || clip.duration < 1) issues.push(`${label}: duration ${clip.duration} must be an integer >= 1`);
  if (clip.color !== undefined && !LABEL_SET.has(clip.color)) issues.push(`${label}: color "${clip.color}" is not a label color`);
  if (clip.fallbackOf !== undefined) issues.push(...fallbackIssues(clip, label));
  if (clip.kind === "text") issues.push(...textIssues(clip, label));
  if (clip.kind === "caption") issues.push(...cueIssues(clip, label));
  if (clip.kind === "solid") issues.push(...solidIssues(clip, label));
  if (clip.kind === "compound") issues.push(...compoundIssues(project, clip, label));
  if (clip.kind === "shape") issues.push(...shapeIssues(clip, label));
  if (clip.kind === "null") issues.push(...nullIssues(clip, label));
  if (clip.autoOrient !== undefined && typeof clip.autoOrient !== "boolean") issues.push(`${label}: autoOrient must be true or false`);
  if (clip.parentId !== undefined && typeof clip.parentId !== "string") issues.push(`${label}: parentId must be a clip id`);
  issues.push(...depthIssues(clip, label));
  issues.push(...compositingIssues(clip, label));
  // Frame styles (spec §21.7): pictures have rounded corners, an outline and a shadow.
  if (clip.kind === "video" || clip.kind === "image") issues.push(...frameIssues(clip, label));
  // Keyframes (Batch 35): known properties, one key per integer frame in order, finite values, known eases.
  if ("keyframes" in clip && clip.keyframes !== undefined) issues.push(...keyframeIssues(clip.keyframes, clip).map((issue) => `${label}: ${issue}`));
  // Fades (Batch 36): integer frames, each within the clip.
  if ("fades" in clip && clip.fades !== undefined) {
    const { fades } = clip;
    if (!Number.isInteger(fades.in) || !Number.isInteger(fades.out) || fades.in < 0 || fades.out < 0) issues.push(`${label}: fades ${fades.in}/${fades.out} must be integer frames >= 0`);
    else if (fades.in > clip.duration || fades.out > clip.duration) issues.push(`${label}: fades ${fades.in}/${fades.out} are longer than the clip (${clip.duration})`);
  }
  if (!isMediaClip(clip)) return issues;

  if (!Number.isInteger(clip.in) || !Number.isInteger(clip.out)) issues.push(`${label}: in/out must be integer microseconds`);
  if (clip.in < 0) issues.push(`${label}: in ${clip.in} < 0`);
  if (clip.out <= clip.in) issues.push(`${label}: out ${clip.out} <= in ${clip.in}`);
  const media = project.media[clip.mediaId];
  // A clip whose media was removed from the project keeps its timing as an offline clip (spec §6.19
  // "Remove, keep offline clips", Batch 41): no media bound to check. Image clips show their picture
  // for any length: a still holds it (durationUs 0), an animated image loops (Batch 34), so `out` is
  // not bound by the media.
  if (media && clip.kind !== "image" && clip.out > media.durationUs) issues.push(`${label}: out ${clip.out} > media duration ${media.durationUs}`);
  if (isFreeze(clip)) {
    // A freeze frame holds `in` for any duration (Batch 27): no duration * speed invariant.
  } else if (!(clip.speed > 0)) {
    issues.push(`${label}: speed ${clip.speed} must be > 0 (0 only for a video freeze frame)`);
  } else {
    const sourceFrameUs = usPerFrame(project.settings.fps) * clip.speed;
    const expected = clip.duration * sourceFrameUs;
    if (Math.abs(clip.out - clip.in - expected) > sourceFrameUs) {
      issues.push(`${label}: out - in = ${clip.out - clip.in} us, expected duration * speed = ${Math.round(expected)} us (within 1 frame)`);
    }
  }
  return issues;
}

/** A compound clip (spec §21.10): a sequence that exists, an offset and a length inside it, a gain. */
function compoundIssues(project: Project, clip: CompoundClip, label: string): string[] {
  const issues: string[] = [];
  const sequence = project.sequences[clip.sequenceId];
  if (typeof clip.sequenceId !== "string" || !sequence) issues.push(`${label}: sequence ${String(clip.sequenceId)} does not exist`);
  if (!Number.isInteger(clip.offset) || clip.offset < 0) issues.push(`${label}: offset ${String(clip.offset)} must be an integer frame >= 0`);
  else if (sequence && Number.isInteger(clip.duration) && clip.offset + clip.duration > sequence.duration) {
    issues.push(`${label}: runs to sequence frame ${clip.offset + clip.duration}, past the sequence's end (${sequence.duration})`);
  }
  if (!isFiniteNumber(clip.opacity) || clip.opacity < 0 || clip.opacity > 1) issues.push(`${label}: opacity ${String(clip.opacity)} must be 0..1`);
  if (!isObjectLike(clip.volume) || !isFiniteNumber(clip.volume.gainDb) || typeof clip.volume.muted !== "boolean") issues.push(`${label}: volume must be { gainDb, muted }`);
  return issues;
}

/** A sequence (spec §21.10): its own id, a size and length, a background, inner tracks without a caption track. */
function sequenceIssues(key: string, sequence: Sequence): string[] {
  const issues: string[] = [];
  const label = `sequence "${String(sequence?.name)}" (${key})`;
  if (!isObjectLike(sequence)) return [`${label}: must be an object`];
  if (key !== sequence.id) issues.push(`${label}: stored under key ${key}`);
  if (typeof sequence.name !== "string") issues.push(`${label}: name must be a string`);
  if (!isPositiveInteger(sequence.size?.w) || !isPositiveInteger(sequence.size?.h)) issues.push(`${label}: size ${String(sequence.size?.w)}x${String(sequence.size?.h)} must be positive integers`);
  if (!isPositiveInteger(sequence.duration)) issues.push(`${label}: duration ${String(sequence.duration)} must be an integer >= 1`);
  if (sequence.background !== null && !isColor(sequence.background)) issues.push(`${label}: background must be RGBA or null`);
  if (!Array.isArray(sequence.tracks)) issues.push(`${label}: tracks must be a list`);
  issues.push(...perspectiveIssues(sequence.perspective, label));
  if (sequence.depthSort !== undefined && typeof sequence.depthSort !== "boolean") issues.push(`${label}: depthSort must be true or false`);
  return issues;
}

/** A viewing distance (spec §21.15): absent, null (none) or a positive number of px. */
function perspectiveIssues(perspective: unknown, label: string): string[] {
  if (perspective === undefined || perspective === null) return [];
  return typeof perspective === "number" && Number.isFinite(perspective) && perspective > 0 ? [] : [`${label}: perspective ${String(perspective)} must be a positive number of px or null`];
}

/** The 2.5D fields of a clip (spec §21.15, Batch 70): finite rotations and depth, a boolean backface flag. */
function depthIssues(clip: Clip, label: string): string[] {
  const issues: string[] = [];
  if (clip.backfaceHidden !== undefined && typeof clip.backfaceHidden !== "boolean") issues.push(`${label}: backfaceHidden must be true or false`);
  if (!("transform" in clip) || !isObjectLike(clip.transform)) return issues;
  for (const field of ["rotationX", "rotationY", "z"] as const) {
    const value = clip.transform[field];
    if (value !== undefined && !(typeof value === "number" && Number.isFinite(value))) issues.push(`${label}: transform.${field} must be a number`);
  }
  return issues;
}

/** A baked stand-in (spec §21.4): the outer shape only; `data` is opaque apart from its `kind`. */
function fallbackIssues(clip: Clip, label: string): string[] {
  const block = clip.fallbackOf as unknown;
  if (typeof block !== "object" || block === null || Array.isArray(block)) return [`${label}: fallbackOf must be an object`];
  const { kind, reason, schemaVersion, headTrim, data } = block as Record<string, unknown>;
  const issues: string[] = [];
  if (typeof kind !== "string" || kind === "") issues.push(`${label}: fallbackOf.kind must be a non-empty string`);
  if (typeof reason !== "string") issues.push(`${label}: fallbackOf.reason must be a string`);
  if (!isPositiveInteger(schemaVersion)) issues.push(`${label}: fallbackOf.schemaVersion ${String(schemaVersion)} must be a positive integer`);
  if (headTrim !== undefined && !(Number.isInteger(headTrim) && (headTrim as number) >= 0)) issues.push(`${label}: fallbackOf.headTrim ${String(headTrim)} must be an integer >= 0`);
  if (typeof data !== "object" || data === null || Array.isArray(data)) issues.push(`${label}: fallbackOf.data must be an object`);
  else if ((data as Record<string, unknown>).kind !== kind) issues.push(`${label}: fallbackOf.data.kind ${JSON.stringify((data as Record<string, unknown>).kind) ?? "undefined"} must equal fallbackOf.kind ${JSON.stringify(kind) ?? "undefined"}`);
  return issues;
}

/** `meta.generator` (spec §21.4): a name and optional version, source and url strings. */
function generatorIssues(project: Project): string[] {
  const generator = project.meta?.generator as unknown;
  if (generator === undefined) return [];
  if (typeof generator !== "object" || generator === null || Array.isArray(generator)) return ["meta.generator must be an object"];
  const issues: string[] = [];
  const fields = generator as Record<string, unknown>;
  if (typeof fields.name !== "string" || fields.name === "") issues.push("meta.generator.name must be a non-empty string");
  for (const key of ["version", "source", "url"]) if (fields[key] !== undefined && typeof fields[key] !== "string") issues.push(`meta.generator.${key} must be a string`);
  return issues;
}

const isPositive = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0;

/** A text style the layout can use: a family name, a size, weight and line height. */
function styleIssues(style: TextStyle | undefined, label: string): string[] {
  const issues: string[] = [];
  if (typeof style?.fontFamily !== "string" || style.fontFamily === "") issues.push(`${label}: font family must be a name`);
  if (!isPositive(style?.fontSize)) issues.push(`${label}: font size ${String(style?.fontSize)} must be > 0`);
  if (!isPositive(style?.lineHeight)) issues.push(`${label}: line height ${String(style?.lineHeight)} must be > 0`);
  if (!(isPositive(style?.fontWeight) && (style?.fontWeight ?? 0) <= 1000)) issues.push(`${label}: font weight ${String(style?.fontWeight)} must be in 1..1000`);
  return issues;
}

/** A text clip's content and style (spec §10.1): a string, a box with a positive width, and a style the layout can use. */
function textIssues(clip: TextClip, label: string): string[] {
  const issues: string[] = [];
  const { text } = clip;
  if (typeof text?.value !== "string") issues.push(`${label}: text value must be a string`);
  if (text?.box?.mode !== "auto" && text?.box?.mode !== "fixed") issues.push(`${label}: text box mode must be auto or fixed`);
  if (!isPositive(text?.box?.width)) issues.push(`${label}: text box width ${String(text?.box?.width)} must be > 0`);
  issues.push(...styleIssues(clip.style, label));
  if (typeof text?.value === "string") issues.push(...spanIssues(clip.spans, text.value.length).map((issue) => `${label}: ${issue}`));
  issues.push(...counterIssues(clip.counter).map((issue) => `${label}: ${issue}`));
  issues.push(...animatorIssues(clip.animators).map((issue) => `${label}: ${issue}`));
  return issues;
}

/** The problems of a text clip counter (empty when valid or absent; spec §21.13). */
function counterIssues(counter: unknown): string[] {
  if (counter === undefined) return [];
  if (typeof counter !== "object" || counter === null || Array.isArray(counter)) return ["counter must be an object"];
  const c = counter as Record<string, unknown>;
  const issues: string[] = [];
  for (const key of ["from", "to"]) if (!(typeof c[key] === "number" && Number.isFinite(c[key]))) issues.push(`counter ${key} must be a number`);
  if (!(Number.isInteger(c.decimals) && (c.decimals as number) >= 0 && (c.decimals as number) <= 6)) issues.push("counter decimals must be an integer in 0..6");
  for (const key of ["prefix", "suffix"]) if (typeof c[key] !== "string") issues.push(`counter ${key} must be a string`);
  if (!(COUNTER_SEPARATORS as readonly unknown[]).includes(c.separator)) issues.push("counter separator must be one of: none, comma, dot, space, apostrophe");
  if (!isEaseId(c.ease)) issues.push("counter ease must be an ease id");
  return issues;
}

/** The problems of a text clip animators (empty when valid or absent; spec §21.13). */
function animatorIssues(animators: unknown): string[] {
  if (animators === undefined) return [];
  if (!Array.isArray(animators)) return ["animators must be a list"];
  const issues: string[] = [];
  const seen = new Set<unknown>();
  animators.forEach((raw: unknown, i) => {
    const a = raw as Record<string, unknown> | null;
    if (typeof a !== "object" || a === null) {
      issues.push(`animator ${i} must be an object`);
      return;
    }
    if (typeof a.id !== "string" || !/^[A-Za-z0-9_-]+$/.test(a.id)) issues.push(`animator ${i} id must be letters, digits, - or _`);
    else if (seen.has(a.id)) issues.push(`animator ${i} id "${a.id}" is used twice`);
    seen.add(a.id);
    if (!(TEXT_ANIM_UNITS as readonly unknown[]).includes(a.unit)) issues.push(`animator ${i} unit must be char, word or line`);
    const s = a.selector as Record<string, unknown> | null;
    if (typeof s !== "object" || s === null) issues.push(`animator ${i} selector must be an object`);
    else {
      for (const key of ["start", "end", "offset"]) if (!(typeof s[key] === "number" && Number.isFinite(s[key]))) issues.push(`animator ${i} selector ${key} must be a number`);
      if (!(SELECTOR_SHAPES as readonly unknown[]).includes(s.shape)) issues.push(`animator ${i} selector shape is unknown`);
      if (!(typeof s.ease === "number" && s.ease >= -1 && s.ease <= 1)) issues.push(`animator ${i} selector ease must be in -1..1`);
      if (!(SELECTOR_ORDERS as readonly unknown[]).includes(s.order)) issues.push(`animator ${i} selector order must be forward, reverse or random`);
      if (!(Number.isInteger(s.seed) && (s.seed as number) >= 0)) issues.push(`animator ${i} selector seed must be an integer >= 0`);
    }
    const p = a.props as Record<string, unknown> | null;
    if (typeof p !== "object" || p === null || Array.isArray(p)) issues.push(`animator ${i} props must be an object`);
    else {
      for (const key of ["x", "y", "scale", "rotation", "opacity", "blur", "tracking"]) if (p[key] !== undefined && !(typeof p[key] === "number" && Number.isFinite(p[key]))) issues.push(`animator ${i} ${key} must be a number`);
      if (p.fill !== undefined && !isColor(p.fill)) issues.push(`animator ${i} fill must be RGBA`);
    }
  });
  return issues;
}

/** The problems of `spans` against a text of `length` units (empty when valid). */
function spanIssues(spans: unknown, length: number): string[] {
  if (spans === undefined) return [];
  if (!Array.isArray(spans)) return ["spans must be a list"];
  const issues: string[] = [];
  let last = 0;
  spans.forEach((span: unknown, i) => {
    const s = span as Partial<TextSpan> | null;
    if (typeof s !== "object" || s === null) {
      issues.push(`span ${i} must be an object`);
      return;
    }
    const { start, end, style } = s;
    if (!Number.isInteger(start) || !Number.isInteger(end) || (start as number) < 0 || (end as number) <= (start as number)) issues.push(`span ${i} must have integer offsets 0 <= start < end (${String(start)}, ${String(end)})`);
    else {
      if ((end as number) > length) issues.push(`span ${i} ends at ${end}, past the text (${length})`);
      if ((start as number) < last) issues.push(`span ${i} starts at ${start}, before the previous span ends (${last}): spans must be sorted and must not overlap`);
      last = end as number;
    }
    if (typeof style !== "object" || style === null || Array.isArray(style)) issues.push(`span ${i} style must be an object`);
    else {
      const st = style as Record<string, unknown>;
      if (st.fill !== undefined && fillIssue(st.fill) !== null) issues.push(`span ${i} fill is not a color or gradient`);
      if (st.fontFamily !== undefined && (typeof st.fontFamily !== "string" || st.fontFamily === "")) issues.push(`span ${i} font family must be a name`);
      if (st.fontWeight !== undefined && !(typeof st.fontWeight === "number" && st.fontWeight >= 1 && st.fontWeight <= 1000)) issues.push(`span ${i} font weight must be in 1..1000`);
      for (const key of ["italic", "underline", "strike"] as const) if (st[key] !== undefined && typeof st[key] !== "boolean") issues.push(`span ${i} ${key} must be true or false`);
      if (st.highlight !== undefined && !isColor(st.highlight)) issues.push(`span ${i} highlight must be RGBA`);
    }
  });
  return issues;
}

/** A cue (spec §10.5): a text string and word timings in integer frames, each ending after it starts. */
function cueIssues(clip: CaptionClip, label: string): string[] {
  const issues: string[] = [];
  if (typeof clip.text !== "string") issues.push(`${label}: cue text must be a string`);
  if (clip.presetId !== undefined && (typeof clip.presetId !== "string" || clip.presetId === "")) issues.push(`${label}: preset id must be a non-empty string`);
  if (clip.styleOverride !== undefined) issues.push(...overrideIssues(clip.styleOverride, label));
  if (clip.words === undefined) return issues;
  if (!Array.isArray(clip.words)) return [...issues, `${label}: words must be a list`];
  clip.words.forEach((word, i) => {
    if (typeof word?.text !== "string") issues.push(`${label}: word ${i} text must be a string`);
    if (!Number.isInteger(word?.start) || !Number.isInteger(word?.end) || word.end <= word.start) issues.push(`${label}: word ${i} must have integer frames start < end (${String(word?.start)}, ${String(word?.end)})`);
    if (word?.emphasis !== undefined && typeof word.emphasis !== "boolean") issues.push(`${label}: word ${i} emphasis must be true or false`);
    if (word?.color !== undefined && !isColor(word.color)) issues.push(`${label}: word ${i} color must be RGBA`);
  });
  return issues;
}

type Check = (value: unknown) => boolean;
const isFiniteNumber: Check = (value) => typeof value === "number" && Number.isFinite(value);
const isNonNegative: Check = (value) => isFiniteNumber(value) && (value as number) >= 0;
const isBoolean: Check = (value) => typeof value === "boolean";
// `isColor` is defined further down: called, not referenced, at load.
const isRgba: Check = (value) => isColor(value);
const oneOf =
  (...values: string[]): Check =>
  (value) =>
    typeof value === "string" && values.includes(value);

/** The checks of each field a cue override may set (spec §20.3: every field validated, nothing else allowed). */
const TEXT_OVERRIDE: Readonly<Record<string, Check>> = {
  fontFamily: (value) => typeof value === "string" && value !== "",
  fontWeight: (value) => isPositive(value) && (value as number) <= 1000,
  italic: isBoolean,
  fontSize: isPositive,
  fill: (value) => fillIssue(value) === null,
  textCase: oneOf("none", "upper", "lower", "title"),
  letterSpacing: isFiniteNumber,
  lineHeight: isPositive,
  align: oneOf("left", "center", "right"),
};
const isObjectLike = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isBoxStroke = (value: unknown) => isObjectLike(value) && isBoolean(value.enabled) && isNonNegative(value.width) && isRgba(value.color);
const isBoxShadow = (value: unknown) => isObjectLike(value) && isBoolean(value.enabled) && isFiniteNumber(value.x) && isFiniteNumber(value.y) && isNonNegative(value.blur) && isRgba(value.color);
const PART_OVERRIDES: Readonly<Record<string, Readonly<Record<string, Check>>>> = {
  stroke: { enabled: isBoolean, width: isNonNegative, color: isRgba },
  shadow: { enabled: isBoolean, x: isFiniteNumber, y: isFiniteNumber, blur: isNonNegative, color: isRgba },
  background: { enabled: isBoolean, color: isRgba, paddingX: isNonNegative, paddingY: isNonNegative, radius: isNonNegative, mode: oneOf("line", "block", "word"), stroke: isBoxStroke, shadow: isBoxShadow },
};
const CAPTION_OVERRIDE: Readonly<Record<string, Check>> = {
  position: (value) => CAPTION_POSITIONS.has(value as string),
  x: isFiniteNumber,
  y: isFiniteNumber,
  maxWidth: isPositive,
  maxLines: isPositiveInteger,
  anim: (value) => isCaptionAnim(value),
};
const HIGHLIGHT_OVERRIDE: Readonly<Record<string, Check>> = { mode: (value) => HIGHLIGHT_MODES.has(value as string), color: isRgba, inactiveColor: isRgba, emphasisColor: isRgba };
const isCueAnim = (value: unknown) => isObjectLike(value) && Object.keys(value).every((key) => key === "kind" || key === "frames") && CUE_ANIMS.has(value.kind as string) && Number.isInteger(value.frames) && (value.frames as number) >= 0;
/** A `CaptionAnim`: an object with at most `in` and `out`, each a valid cue animation. */
const isCaptionAnim = (value: unknown) => isObjectLike(value) && Object.entries(value).every(([key, inner]) => (key === "in" || key === "out") && isCueAnim(inner));

/** The fields of `value` (an object) against `checks`: unknown fields and bad values are issues. */
function fieldIssues(value: unknown, checks: Readonly<Record<string, Check>>, label: string, path: string, nested: Readonly<Record<string, (inner: unknown, at: string) => string[]>> = {}): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return [`${label}: style override ${path} must be an object`];
  const issues: string[] = [];
  for (const [key, inner] of Object.entries(value)) {
    const at = path === "" ? key : `${path}.${key}`;
    const deeper = nested[key];
    if (deeper) issues.push(...deeper(inner, at));
    else if (!Object.hasOwn(checks, key)) issues.push(`${label}: style override has an unknown field ${at}`);
    else if (!(checks[key] as Check)(inner)) issues.push(`${label}: style override ${at} ${JSON.stringify(inner) ?? String(inner)} is not valid`);
  }
  return issues;
}

/** A cue's style override (spec §20.3): known fields only, each a valid value. */
function overrideIssues(override: unknown, label: string): string[] {
  const parts = Object.fromEntries(Object.entries(PART_OVERRIDES).map(([key, checks]) => [key, (inner: unknown, at: string) => fieldIssues(inner, checks, label, at)]));
  return fieldIssues(override, CAPTION_OVERRIDE, label, "", {
    text: (inner, at) => fieldIssues(inner, TEXT_OVERRIDE, label, at, parts),
    highlight: (inner, at) => fieldIssues(inner, HIGHLIGHT_OVERRIDE, label, at),
  });
}

const CAPTION_POSITIONS: ReadonlySet<string> = new Set(["bottom", "center", "top", "custom"]);
const HIGHLIGHT_MODES: ReadonlySet<string> = new Set(CAPTION_HIGHLIGHTS);
const CUE_ANIMS: ReadonlySet<string> = new Set(CUE_ANIM_KINDS);
const isColor = (value: unknown) => typeof value === "object" && value !== null && ["r", "g", "b", "a"].every((key) => Number.isFinite((value as Record<string, unknown>)[key]));
const SOLID_SHAPES: ReadonlySet<string> = new Set(SOLID_SHAPE_IDS);

/** A solid (spec §5.2): one of the shapes, a positive size, a radius >= 0, a color or a two-stop gradient. */
function solidIssues(clip: SolidClip, label: string): string[] {
  const issues: string[] = [];
  if (!SOLID_SHAPES.has(clip.shape)) issues.push(`${label}: shape "${String(clip.shape)}" is not ${SOLID_SHAPE_IDS.join(", ")}`);
  if (!isPositive(clip.size?.w) || !isPositive(clip.size?.h)) issues.push(`${label}: size ${String(clip.size?.w)}x${String(clip.size?.h)} must be > 0`);
  if (!(Number.isFinite(clip.cornerRadius) && clip.cornerRadius >= 0)) issues.push(`${label}: corner radius ${String(clip.cornerRadius)} must be >= 0`);
  const problem = fillIssue(clip.fill);
  if (problem) issues.push(`${label}: fill ${problem}`);
  if (clip.cornerRadii !== undefined && !(Array.isArray(clip.cornerRadii) && clip.cornerRadii.length === 4 && clip.cornerRadii.every((r) => Number.isFinite(r) && r >= 0))) issues.push(`${label}: cornerRadii must be 4 numbers >= 0`);
  issues.push(...strokeShadowIssues(clip, label));
  return issues;
}

const PATH_ID = /^[A-Za-z0-9_-]+$/;
const FILL_RULE_SET: ReadonlySet<string> = new Set(FILL_RULES);
const CAP_SET: ReadonlySet<string> = new Set(LINE_CAPS);
const JOIN_SET: ReadonlySet<string> = new Set(LINE_JOINS);

/** A null clip (spec §21.14): a positive outline size. */
function nullIssues(clip: NullClip, label: string): string[] {
  const issues: string[] = [];
  if (!(clip.size?.w > 0) || !(clip.size?.h > 0)) issues.push(`${label}: null size ${String(clip.size?.w)}x${String(clip.size?.h)} must be positive`);
  return issues;
}

/**
 * Parents (spec §21.14): a visual clip of a video track, in the same sequence, never itself, no cycle.
 * Audio clips and cues take no parent; a parent is a clip with a transform.
 */
function parentIssues(project: Project): string[] {
  const issues: string[] = [];
  const scopes = new Map<ClipId, string>();
  const scan = (tracks: readonly Track[] | undefined, scope: string) => {
    for (const track of Array.isArray(tracks) ? tracks : []) {
      for (const id of track?.clipIds ?? []) scopes.set(id, track.kind === "video" ? scope : `${scope}:${track.kind}`);
    }
  };
  scan(project.tracks, "");
  for (const [key, sequence] of Object.entries(project.sequences ?? {})) scan(sequence?.tracks, key);
  for (const clip of Object.values(project.clips)) {
    if (typeof clip.parentId !== "string") continue;
    const label = clipLabel(clip);
    const parent = project.clips[clip.parentId];
    if (clip.kind === "audio" || clip.kind === "caption") issues.push(`${label}: a ${clip.kind} clip cannot have a parent`);
    else if (clip.parentId === clip.id) issues.push(`${label}: is its own parent`);
    // A parent that is gone (deleted, or never there) is ignored by the evaluation: the clip simply has none.
    else if (!parent) continue;
    else if (!("transform" in parent) || scopes.get(parent.id)?.includes(":")) issues.push(`${label}: parent ${clip.parentId} is a ${parent.kind} clip, which has no transform`);
    else if (scopes.get(parent.id) !== scopes.get(clip.id)) issues.push(`${label}: parent ${clip.parentId} is in another sequence`);
    else if (reachesItself(project, clip)) issues.push(`${label}: its parent chain loops back to it`);
  }
  return issues;
}

/** Clip kinds drawn in the picture: the ones that take a blend mode and a track matte (spec §21.17). */
/** Clip kinds that draw a picture (`isVisualClip` of core/effects/trackMatte.ts). */
const VISUAL_KINDS: ReadonlySet<ClipKind> = new Set(["video", "image", "text", "solid", "shape", "compound"]);
const BLEND_SET: ReadonlySet<string> = new Set(BLEND_MODES);
const MATTE_SET: ReadonlySet<string> = new Set(MATTE_MODES);

/** The compositing fields of a clip (spec §21.17, Batch 72): a known blend mode, a matte object, a boolean matteOnly, visual clips only. */
function compositingIssues(clip: Clip, label: string): string[] {
  const issues: string[] = [];
  const visual = VISUAL_KINDS.has(clip.kind);
  if (clip.blend !== undefined) {
    if (!BLEND_SET.has(clip.blend)) issues.push(`${label}: blend "${String(clip.blend)}" is not a blend mode`);
    else if (!visual) issues.push(`${label}: a ${clip.kind} clip takes no blend mode`);
  }
  if (clip.matte !== undefined) {
    const matte = clip.matte as unknown;
    if (!isObjectLike(matte) || typeof matte.clipId !== "string" || matte.clipId === "" || !MATTE_SET.has(matte.mode as string)) issues.push(`${label}: matte must be { clipId, mode } with mode alpha, alphaInverted, luma or lumaInverted`);
    else if (!visual) issues.push(`${label}: a ${clip.kind} clip takes no matte`);
  }
  if (clip.matteOnly !== undefined) {
    if (typeof clip.matteOnly !== "boolean") issues.push(`${label}: matteOnly must be true or false`);
    else if (!visual && clip.matteOnly) issues.push(`${label}: a ${clip.kind} clip cannot be a matte`);
  }
  return issues;
}

/**
 * Track mattes (spec §21.17): the matte is a visual clip of a video track in the same sequence, not the
 * clip itself. A matte clip that is gone is ignored by the evaluation (the clip draws as if it had none).
 */
function matteIssues(project: Project): string[] {
  const issues: string[] = [];
  const scopes = new Map<ClipId, string>();
  const scan = (tracks: readonly Track[] | undefined, scope: string) => {
    for (const track of Array.isArray(tracks) ? tracks : []) {
      for (const id of track?.clipIds ?? []) scopes.set(id, track.kind === "video" ? scope : `${scope}:${track.kind}`);
    }
  };
  scan(project.tracks, "");
  for (const [key, sequence] of Object.entries(project.sequences ?? {})) scan(sequence?.tracks, key);
  for (const clip of Object.values(project.clips)) {
    const matte = clip.matte as unknown;
    if (!isObjectLike(matte) || typeof matte.clipId !== "string") continue;
    const label = clipLabel(clip);
    const source = project.clips[matte.clipId];
    if (matte.clipId === clip.id) issues.push(`${label}: is its own matte`);
    else if (!source) continue;
    else if (!VISUAL_KINDS.has(source.kind) || scopes.get(source.id)?.includes(":")) issues.push(`${label}: matte ${matte.clipId} is a ${source.kind} clip, which draws no picture`);
    else if (scopes.get(source.id) !== scopes.get(clip.id)) issues.push(`${label}: matte ${matte.clipId} is in another sequence`);
  }
  return issues;
}

function reachesItself(project: Project, clip: Clip): boolean {
  const seen = new Set<ClipId>([clip.id]);
  let at: Clip | undefined = clip;
  while (at?.parentId !== undefined) {
    if (seen.has(at.parentId)) return true;
    seen.add(at.parentId);
    at = project.clips[at.parentId];
  }
  return false;
}

/** A shape clip (spec §21.12, Batch 65): a view box, paths with unique ids, path data that parses, known styles and primitives. */
function shapeIssues(clip: ShapeClip, label: string): string[] {
  const issues: string[] = [];
  if (!isPositive(clip.size?.w) || !isPositive(clip.size?.h)) issues.push(`${label}: size ${String(clip.size?.w)}x${String(clip.size?.h)} must be > 0`);
  if (!Array.isArray(clip.paths)) return [...issues, `${label}: paths must be a list`];
  const ids = new Set<string>();
  clip.paths.forEach((path, index) => {
    const at = `${label}: paths[${index}]`;
    if (!isObjectLike(path)) return void issues.push(`${at} must be an object`);
    if (typeof path.id !== "string" || !PATH_ID.test(path.id)) issues.push(`${at}: id ${JSON.stringify(path.id)} must be letters, digits, _ or -`);
    else if (ids.has(path.id)) issues.push(`${at}: id "${path.id}" is used twice`);
    else ids.add(path.id);
    if (typeof path.d !== "string") issues.push(`${at}: d must be a string`);
    else {
      const problem = pathDataIssue(path.d);
      if (problem) issues.push(`${at}: d: ${problem}`);
    }
    if (path.fill !== null) {
      const problem = fillIssue(path.fill);
      if (problem) issues.push(`${at}: fill ${problem}`);
    }
    if (!FILL_RULE_SET.has(path.fillRule)) issues.push(`${at}: fillRule must be nonzero or evenodd`);
    if (path.stroke !== undefined) {
      issues.push(...strokeShadowIssues({ stroke: path.stroke }, at));
      const s = path.stroke as unknown as Record<string, unknown>;
      if (!CAP_SET.has(s.cap as string) || !JOIN_SET.has(s.join as string) || !(isFiniteNumber(s.miterLimit) && (s.miterLimit as number) >= 1)) issues.push(`${at}: stroke needs cap butt, round or square, join miter, round or bevel and miterLimit >= 1`);
    }
    if (path.trim !== undefined) {
      const t = path.trim as unknown as Record<string, unknown>;
      if (!isObjectLike(t) || !isUnit(t.start) || !isUnit(t.end) || !isFiniteNumber(t.offset)) issues.push(`${at}: trim needs start and end within 0..1 and a numeric offset`);
    }
    if (path.primitive !== undefined) {
      const problem = primitiveIssue(path.primitive);
      if (problem) issues.push(`${at}: primitive ${problem}`);
    }
  });
  return issues;
}

const isUnit = (v: unknown) => isFiniteNumber(v) && (v as number) >= 0 && (v as number) <= 1;

/** What is wrong with a primitive: its kind, its params (numbers >= 0, counts, roundness, angles); null when valid. */
function primitiveIssue(value: unknown): string | null {
  if (!isObjectLike(value) || !PRIMITIVE_KINDS.includes(value.kind as PrimitiveKind)) return `kind must be one of ${PRIMITIVE_KINDS.join(", ")}`;
  const kind = value.kind as PrimitiveKind;
  for (const param of PRIMITIVE_PARAMS[kind]) {
    const v = value[param];
    if (!isFiniteNumber(v)) return `${kind} needs a number ${param}`;
    const n = v as number;
    if (param === "sides" || param === "points") {
      const limits = PRIMITIVE_LIMITS[param];
      if (!Number.isInteger(n) || n < limits.min || n > limits.max) return `${param} must be an integer ${limits.min}..${limits.max}`;
    } else if (param === "roundness") {
      if (n < 0 || n > 1) return "roundness must be within 0..1";
    } else if (kind === "arc" && param !== "radius") {
      if (n < PRIMITIVE_LIMITS.angle.min || n > PRIMITIVE_LIMITS.angle.max) return `${param} must be within ${PRIMITIVE_LIMITS.angle.min}..${PRIMITIVE_LIMITS.angle.max} degrees`;
    } else if (n < 0) return `${param} must be >= 0`;
  }
  return null;
}

/** What is wrong with `value` as a fill (spec §21.7): a color, `{ from, to }`, or a gradient with 2 to 8 ascending stops; null when valid. */
function fillIssue(value: unknown): string | null {
  if (!isObjectLike(value)) return "must be an RGBA color or a gradient";
  if (isColor(value)) return null;
  if (isColor(value.from) && isColor(value.to)) return null;
  if (!Array.isArray(value.stops)) return "must be RGBA, a gradient { from, to } or a gradient with stops";
  if (value.type !== "linear" && value.type !== "radial") return 'gradient type must be "linear" or "radial"';
  if (!isFiniteNumber(value.angle) || !isFiniteNumber(value.radius) || !isObjectLike(value.center) || !isFiniteNumber(value.center.x) || !isFiniteNumber(value.center.y)) return "gradient needs a numeric angle, center { x, y } and radius";
  const stops = value.stops as unknown[];
  if (stops.length < 2 || stops.length > 8) return `gradient has ${stops.length} stops: 2 to 8 are allowed`;
  let last = -1;
  for (const stop of stops) {
    if (!isObjectLike(stop) || !isColor(stop.color) || !isFiniteNumber(stop.at) || (stop.at as number) < 0 || (stop.at as number) > 1) return "every stop needs a color and an `at` within 0..1";
    if ((stop.at as number) < last) return "stops must be in ascending `at` order";
    last = stop.at as number;
  }
  return null;
}

/** `stroke` and `shadow` of a solid or a picture (spec §21.7): known values only. */
function strokeShadowIssues(clip: { stroke?: unknown; shadow?: unknown }, label: string): string[] {
  const issues: string[] = [];
  const stroke = clip.stroke;
  if (stroke !== undefined) {
    if (!isObjectLike(stroke) || !isNonNegative(stroke.width) || !isColor(stroke.color) || !STROKE_ALIGN_SET.has(stroke.align as string)) issues.push(`${label}: stroke needs width >= 0, a color and align inside, center or outside`);
    else {
      if (stroke.dash !== undefined && !(Array.isArray(stroke.dash) && stroke.dash.every((v) => isNonNegative(v)))) issues.push(`${label}: stroke dash must be a list of numbers >= 0`);
      if (stroke.dashOffset !== undefined && !isFiniteNumber(stroke.dashOffset)) issues.push(`${label}: stroke dashOffset must be a number`);
    }
  }
  const shadow = clip.shadow;
  if (shadow !== undefined && !(isObjectLike(shadow) && isFiniteNumber(shadow.x) && isFiniteNumber(shadow.y) && isNonNegative(shadow.blur) && isFiniteNumber(shadow.spread) && isColor(shadow.color))) issues.push(`${label}: shadow needs x, y, blur >= 0, spread and a color`);
  return issues;
}

/** A picture's frame (spec §21.7): a corner radius >= 0, a stroke, a shadow. */
function frameIssues(clip: MediaClip, label: string): string[] {
  const issues: string[] = [];
  if (clip.cornerRadius !== undefined && !isNonNegative(clip.cornerRadius)) issues.push(`${label}: corner radius ${String(clip.cornerRadius)} must be >= 0`);
  issues.push(...strokeShadowIssues(clip, label));
  return issues;
}

const STROKE_ALIGN_SET: ReadonlySet<string> = new Set(STROKE_ALIGNS);

/** A caption track's style (spec §10.5): a text style, a position preset, a positive width and line count, a highlight. */
function captionStyleIssues(style: CaptionStyle | undefined, label: string): string[] {
  if (typeof style !== "object" || style === null) return [`${label}: style must be an object`];
  const issues = styleIssues(style.text, label);
  if (!CAPTION_POSITIONS.has(style.position)) issues.push(`${label}: position "${String(style.position)}" is not bottom, center, top or custom`);
  if (typeof style.x !== "number" || !Number.isFinite(style.x)) issues.push(`${label}: x ${String(style.x)} must be a number`);
  if (typeof style.y !== "number" || !Number.isFinite(style.y)) issues.push(`${label}: y ${String(style.y)} must be a number`);
  if (!isPositive(style.maxWidth)) issues.push(`${label}: max width ${String(style.maxWidth)} must be > 0`);
  if (!isPositiveInteger(style.maxLines)) issues.push(`${label}: max lines ${String(style.maxLines)} must be a positive integer`);
  if (!HIGHLIGHT_MODES.has(style.highlight?.mode)) issues.push(`${label}: highlight mode "${String(style.highlight?.mode)}" is not ${CAPTION_HIGHLIGHTS.join(", ")}`);
  if (!isColor(style.highlight?.color) || !isColor(style.highlight?.inactiveColor)) issues.push(`${label}: highlight colors must be RGBA`);
  if (style.highlight?.emphasisColor !== undefined && !isColor(style.highlight.emphasisColor)) issues.push(`${label}: emphasis color must be RGBA`);
  if (style.anim !== undefined && !isCaptionAnim(style.anim)) issues.push(`${label}: anim must be { in?, out? } of { kind: ${CUE_ANIM_KINDS.join(" | ")}, frames: integer >= 0 }`);
  return issues;
}

interface TrackScan {
  trackIds: Set<TrackId>;
  placed: Set<ClipId>;
  transitionIds: Set<string>;
}

/** The tracks of the project (`scope` null) or of one sequence: order, overlaps, clip kinds, transitions. */
function trackIssues(project: Project, tracks: readonly Track[], scope: Sequence | null, state: TrackScan): string[] {
  const { trackIds, placed, transitionIds } = state;
  const issues: string[] = [];
  let sawAudio = false;
  for (const track of tracks) {
    if (trackIds.has(track.id)) issues.push(`${trackLabel(track)}: duplicate track id`);
    trackIds.add(track.id);
    if (scope && track.kind === "caption") issues.push(`${trackLabel(track)}: sequence "${scope.name}" cannot have a caption track`);
    if (track.kind === "audio") sawAudio = true;
    else if (track.kind === "video" && sawAudio) issues.push(`${trackLabel(track)}: video track placed after an audio track`);

    let prev: Clip | null = null;
    const ordered: Clip[] = [];
    for (const clipId of track.clipIds) {
      const clip = project.clips[clipId];
      if (!clip) {
        issues.push(`${trackLabel(track)}: lists clip ${clipId}, which is not in clips`);
        continue;
      }
      if (placed.has(clipId)) issues.push(`${clipLabel(clip)}: listed more than once across tracks`);
      placed.add(clipId);
      if (clip.trackId !== track.id) issues.push(`${clipLabel(clip)}: listed on ${trackLabel(track)} but points to track ${clip.trackId}`);
      if (!ALLOWED_CLIPS[track.kind].has(clip.kind)) issues.push(`${clipLabel(clip)}: a ${clip.kind} clip cannot sit on ${track.kind} ${trackLabel(track)}`);
      issues.push(...clipIssues(project, clip));
      if (scope && Number.isInteger(clip.start) && Number.isInteger(clip.duration) && clip.start + clip.duration > scope.duration) {
        issues.push(`${clipLabel(clip)}: ends at frame ${clip.start + clip.duration}, past the end of sequence "${scope.name}" (${scope.duration})`);
      }
      ordered.push(clip);
      if (prev) {
        if (clip.start < prev.start) issues.push(`${trackLabel(track)}: ${clipLabel(clip)} is listed after ${clipLabel(prev)} but starts earlier`);
        else if (clip.start < prev.start + prev.duration) issues.push(`${trackLabel(track)}: ${clipLabel(clip)} overlaps ${clipLabel(prev)}`);
      }
      prev = clip;
    }
    // Transitions (Batch 36): each pairs a transition out with the same transition in on the abutting clip after it.
    issues.push(...transitionIssues(project, ordered, clipLabel));
    for (const clip of ordered) {
      const id = isMediaClip(clip) ? clip.transitionOut?.id : undefined;
      if (id === undefined) continue;
      if (transitionIds.has(id)) issues.push(`${clipLabel(clip)}: transition id ${id} is used by another cut`);
      transitionIds.add(id);
    }
  }
  return issues;
}

/**
 * Returns every violated invariant (empty when valid). Linked clips may be offset on purpose
 * (flagged with a sync badge, Batch 16), so link groups are not checked here.
 */
export function validateProject(project: Project): string[] {
  const issues: string[] = [];
  const trackIds = new Set<TrackId>();
  const placed = new Set<ClipId>();
  const transitionIds = new Set<string>();

  const state: TrackScan = { trackIds, placed, transitionIds };
  issues.push(...trackIssues(project, project.tracks, null, state));
  issues.push(...perspectiveIssues(project.settings?.perspective, "settings"));
  for (const [key, sequence] of Object.entries(project.sequences ?? {})) {
    issues.push(...sequenceIssues(key, sequence));
    if (!Array.isArray(sequence?.tracks)) continue;
    issues.push(...trackIssues(project, sequence.tracks, sequence, state));
  }
  issues.push(...sequenceGraphIssues(project));
  issues.push(...parentIssues(project));
  issues.push(...matteIssues(project));

  for (const [key, clip] of Object.entries(project.clips)) {
    if (key !== clip.id) issues.push(`${clipLabel(clip)}: stored under key ${key}`);
    if (!placed.has(clip.id)) issues.push(`${clipLabel(clip)}: not listed on any track (trackId ${clip.trackId})`);
  }
  for (const [key, media] of Object.entries(project.media)) issues.push(...mediaIssues(key, media));
  issues.push(...binIssues(project));
  // One caption track at most (spec §6.12), above every video track (§10.5): after the last video track.
  const captions = project.tracks.filter((track) => track.kind === "caption");
  if (captions.length > 1) issues.push(`${captions.length} caption tracks: a project has one at most`);
  const lastVideo = project.tracks.findLastIndex((track) => track.kind === "video");
  for (const track of captions) if (project.tracks.indexOf(track) < lastVideo) issues.push(`${trackLabel(track)}: the caption track must be above every video track`);
  for (const [trackId, data] of Object.entries(project.captionTracks)) {
    const track = project.tracks.find((t) => t.id === trackId);
    if (track?.kind !== "caption") issues.push(`captionTracks entry ${trackId} has no caption track`);
    issues.push(...captionStyleIssues(data?.style, `captionTracks entry ${trackId}`));
  }
  issues.push(...markerIssues(project));
  issues.push(...generatorIssues(project));
  return issues;
}

/** Bins (spec §12, Batch 41): unique ids, a non-empty name; a media item's `binId` names one of them. */
function binIssues(project: Project): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  for (const bin of project.bins) {
    if (typeof bin?.id !== "string" || bin.id === "") {
      issues.push("a bin has no id");
      continue;
    }
    if (ids.has(bin.id)) issues.push(`bin ${bin.id}: listed more than once`);
    ids.add(bin.id);
    if (typeof bin.name !== "string" || bin.name.trim() === "") issues.push(`bin ${bin.id}: name must be a non-empty string`);
  }
  for (const media of Object.values(project.media)) {
    if (media.binId !== undefined && !ids.has(media.binId)) issues.push(`media "${media.name}" (${media.id}): bin ${media.binId} does not exist`);
  }
  return issues;
}

/** Markers (spec §5.2, §6.13): unique ids, integer frames >= 0 in ascending order, a label string, one of the 8 label colors. */
function markerIssues(project: Project): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  let prev = -Infinity;
  for (const marker of project.markers) {
    const label = `marker ${marker.id}`;
    if (ids.has(marker.id)) issues.push(`${label}: listed more than once`);
    ids.add(marker.id);
    if (!Number.isInteger(marker.frame) || marker.frame < 0) issues.push(`${label}: frame ${marker.frame} must be an integer >= 0`);
    else if (marker.frame < prev) issues.push(`${label}: at frame ${marker.frame}, listed after a marker at ${prev} (markers are sorted by frame); it belongs before`);
    else prev = marker.frame;
    if (typeof marker.label !== "string") issues.push(`${label}: label must be a string`);
    if (!LABEL_SET.has(marker.color)) issues.push(`${label}: color ${String(marker.color)} is not a label color`);
  }
  return issues;
}

export function assertValid(project: Project, context: string): void {
  const issues = validateProject(project);
  if (issues.length > 0) throw new DocumentInvariantError(context, issues);
}
