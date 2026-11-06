// The persistent document (spec §5.2). Plain JSON only: no classes, Maps, Sets or undefined-valued
// keys, so a Project can be serialized as-is and diffed by Immer patches.

export const SCHEMA_VERSION = 23;

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

/** Integer frame at the project frame rate. */
export type Frame = number;
/** Integer microseconds, used for media sample times and source in/out points. */
export type Us = number;

export type MediaId = string;
export type TrackId = string;
export type ClipId = string;

/** A frame rate as an exact fraction: 30 = 30/1, 29.97 = 30000/1001. */
export interface Rational {
  num: number;
  den: number;
}

/** Channels 0..1 (straight alpha), the format the GPU consumes. */
export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** The 8 label colors of clips and markers (spec §6.4), in swatch order. */
export const LABEL_COLORS = ["red", "orange", "green", "teal", "blue", "violet", "pink", "grey"] as const;
export type LabelColor = (typeof LABEL_COLORS)[number];

/**
 * A vertical two-stop gradient, `from` at the top to `to` at the bottom of the box it fills: a text's
 * block (spec §10.1, Batch 28) or a solid's size (Batch 34), turning with the layer.
 */
export interface Gradient {
  from: RGBA;
  to: RGBA;
}

/** A gradient with 2 to 8 stops (spec §21.7, Batch 58), linear or radial. */
export interface GradientFill {
  type: "linear" | "radial";
  /** Linear: degrees, 0 = top to bottom, clockwise. */
  angle: number;
  /** Radial: fractions of the box. */
  center: { x: number; y: number };
  /** Radial: a fraction of half the box diagonal. */
  radius: number;
  /** 2 to 8 stops, `at` 0..1 ascending. */
  stops: GradientStop[];
}
export interface GradientStop {
  at: number;
  color: RGBA;
}
/** What a solid, a text or a box is filled with: a color, the v1 vertical two-stop gradient, or a gradient with stops. */
export type Fill = RGBA | Gradient | GradientFill;
export const MAX_GRADIENT_STOPS = 8;

export const STROKE_ALIGNS = ["inside", "center", "outside"] as const;
export type StrokeAlign = (typeof STROKE_ALIGNS)[number];
/** The outline of a solid or a picture (spec §21.7), project px; an absent stroke is none. */
export interface StrokeStyle {
  width: number;
  color: RGBA;
  align: StrokeAlign;
  /** Dash and gap lengths, project px (at most 4 are drawn); absent or empty: a solid line. */
  dash?: number[];
  dashOffset?: number;
}
/** The shadow of a solid or a picture (spec §21.7): `blur` 0 is a hard edge; an absent shadow is none. */
export interface ShadowStyle {
  x: number;
  y: number;
  blur: number;
  spread: number;
  color: RGBA;
}

/**
 * How a text box is sized (spec §10.1): `auto` fits the lines (only explicit line breaks wrap),
 * `fixed` wraps words at `width` project px.
 */
export interface TextBox {
  mode: "auto" | "fixed";
  /** Wrap width in project px (used while `fixed`). */
  width: number;
}

/**
 * What a text clip says (spec §10.1): plain text with `\n` line breaks (rich text is out of scope),
 * and its box. The box is kept apart from the style, as presets keep it (§10.3).
 */
export interface TextContent {
  value: string;
  box: TextBox;
}

/** Text case (spec §10.1 `textTransform`). */
export type TextCase = "none" | "upper" | "lower" | "title";
export type TextAlign = "left" | "center" | "right";
/** The vertical anchor (spec §10.1): the edge of the box that stays in place when the text grows or shrinks. */
export type TextAnchor = "top" | "middle" | "bottom";

/** An outline drawn outside the glyphs, `width` project px wide. */
export interface TextStroke {
  enabled: boolean;
  width: number;
  color: RGBA;
}

/** A drop shadow of the text (fill and stroke), in project px. */
export interface TextShadow {
  enabled: boolean;
  x: number;
  y: number;
  blur: number;
  color: RGBA;
}

/** A box behind each line (`line`) or the whole text (`block`), `padding` project px around it. */
export interface TextBackground {
  enabled: boolean;
  color: RGBA;
  paddingX: number;
  paddingY: number;
  radius: number;
  mode: TextBackgroundMode;
  /** The box's outline and shadow (spec §21.7); `enabled` lets a cue's override turn off what its track has. */
  stroke?: TextStroke;
  shadow?: TextShadow;
}
/** `word` (Batch 59, captions): a box behind each word. On a text clip it draws as `line`. */
export const TEXT_BACKGROUND_MODES = ["line", "block", "word"] as const;
export type TextBackgroundMode = (typeof TEXT_BACKGROUND_MODES)[number];

/** The look of a text clip (spec §10.1). Sizes are project px; `lineHeight` is a multiplier of the size. */
export interface TextStyle {
  fontFamily: string;
  /** 1..1000 (variable fonts take any value in their range). */
  fontWeight: number;
  italic: boolean;
  fontSize: number;
  fill: Fill;
  stroke: TextStroke;
  shadow: TextShadow;
  background: TextBackground;
  textCase: TextCase;
  letterSpacing: number;
  lineHeight: number;
  align: TextAlign;
  verticalAnchor: TextAnchor;
}

/**
 * The easing curves (spec §6.15, Batch 35), shared by keyframes and text animations (which offer the
 * first four, `text/anim.ts` TEXT_EASES): linear, the cubic ease in / out / in-out, hold (the value
 * jumps at the next key) and three cubic-bezier presets (smooth = CSS `ease`, snap = the DS `out`
 * curve, overshoot = a back-out). Curves live in `core/document/keyframes.ts`.
 */
export const PENNER_EASES = [
  "sineIn", "sineOut", "sineInOut", "quadIn", "quadOut", "quadInOut", "cubicIn", "cubicOut", "cubicInOut",
  "quartIn", "quartOut", "quartInOut", "quintIn", "quintOut", "quintInOut", "expoIn", "expoOut", "expoInOut",
  "circIn", "circOut", "circInOut", "backIn", "backOut", "backInOut", "elasticIn", "elasticOut", "elasticInOut",
  "bounceIn", "bounceOut", "bounceInOut",
] as const;
export type PennerEase = (typeof PENNER_EASES)[number];
/** The ease ids (spec §21.9, Batch 60): the 8 of v1, the 30 Penner eases, a custom `bezier` and a `spring`. */
export const EASE_IDS = ["linear", "easeIn", "easeOut", "easeInOut", "hold", "smooth", "snap", "overshoot", ...PENNER_EASES, "bezier", "spring"] as const;
export type EaseId = (typeof EASE_IDS)[number];

/** One key of a property (spec §21.9): `value` is a number, or an array for a color [r, g, b, a] or a point [x, y]. */
export interface KeyData {
  frame: Frame;
  value: number | number[];
  ease: EaseId;
  /** Ease `bezier`: CSS cubic-bezier(x1, y1, x2, y2); absent: the CSS `ease` (0.25, 0.1, 0.25, 1). */
  bezier?: [number, number, number, number];
  /** Ease `spring`: defaults 0.7 and 4. */
  spring?: { damping: number; frequency: number };
  /** `transform.position` keys (spec §21.14): tangent offsets of the motion path, relative to the key's point. */
  spatialIn?: [number, number];
  spatialOut?: [number, number];
}

/** The transitions (spec §6.15, Batch 36), in the order of the properties panel's chips. Audio crossfades are `crossDissolve`. */
export const TRANSITION_KINDS = ["crossDissolve", "dipToBlack", "dipToWhite",
  // Batch 71 (spec §21.16): the motion, wipe and stylized kinds.
  "slide", "push", "wipe", "iris", "zoomIn", "zoomOut", "whip", "blurDissolve", "glitch", "flash"] as const;
export type TransitionKind = (typeof TRANSITION_KINDS)[number];

/**
 * A transition at the cut between two abutting clips (spec §5.2, §6.15, Batch 36): the left clip's
 * `transitionOut` and the right clip's `transitionIn` hold the same values (one `id`; edited together).
 * It runs over `before` frames before the cut (the left clip's last frames, with the right clip's
 * source before its in point) and `after` frames after it (the right clip's first frames, with the left
 * clip's source after its out point): `before + after` frames in all. Where a clip's handle runs out,
 * its edge frame repeats (core/document/transitions.ts).
 */
export interface Transition {
  id: string;
  kind: TransitionKind;
  before: Frame;
  after: Frame;
  /** Slide, push, whip (Batch 71): the way the picture travels. Absent = left. */
  direction?: TransitionDirection;
  /** Wipe: degrees, 0 = the edge travels left to right, 90 = top to bottom. Absent = 0. */
  angle?: number;
  /** Wipe, iris: the soft width of the edge, 0..1 of its travel. Absent = 0. */
  softness?: number;
  /** Iris: the circle's center, fractions of the frame. Absent = the middle. */
  center?: { x: number; y: number };
  /** The progress curve. Absent = the v1 linear mix. */
  ease?: EaseId;
}

export const TRANSITION_DIRECTIONS = ["left", "right", "up", "down"] as const;
export type TransitionDirection = (typeof TRANSITION_DIRECTIONS)[number];

/** The text animations (spec §10.4), in the order of the properties panel's chips. */
export const TEXT_ANIM_IDS = ["fade", "slideUp", "slideDown", "slideLeft", "slideRight", "pop", "typewriter", "wordPop", "wordFade", "lineReveal", "blurIn", "scaleBounce",
  // Batch 68 (spec §21.13): the kinetic presets.
  "typeOn", "decode", "tumbleIn", "cascadeUp", "riseByLine", "popInByChar", "blurInByChar", "fadeInByChar", "highlightSweep"] as const;
export type TextAnimId = (typeof TEXT_ANIM_IDS)[number];
/** What a text animation moves one by one: characters (graphemes), words or lines; none = the whole text. */
export const TEXT_ANIM_UNITS = ["char", "word", "line"] as const;
export type TextAnimUnit = (typeof TEXT_ANIM_UNITS)[number];

/**
 * A text clip's in or out animation (spec §10.4). `duration` is the whole animation, every unit's
 * delay included; `perUnit` replaces the animation's own unit; `stagger` is the delay between two
 * units (spread over the duration when absent); `ease` the timing curve (the animation's own when
 * absent). Played at most over half the clip (`text/anim.ts`).
 */
export interface TextAnim {
  id: TextAnimId;
  duration: Frame;
  perUnit?: TextAnimUnit;
  stagger?: Frame;
  ease?: EaseId;
}

/** A preset's animation (spec §10.3): a `TextAnim` timed in milliseconds, as presets cross frame rates. */
export interface PresetTextAnim {
  id: TextAnimId;
  durationMs: number;
  perUnit?: TextAnimUnit;
  staggerMs?: number;
  ease?: EaseId;
}
/**
 * A text preset (spec §10.3): a look to apply to text clips. Sizes (font size, every px value of the
 * style, the box width, the position) are given for a frame whose short side is 1080 px
 * (`TEXT_REFERENCE_SIDE`) and scale with the project they are applied in.
 */
export interface TextPreset {
  id: string;
  name: string;
  style: TextStyle;
  box: TextBox;
  animIn?: PresetTextAnim;
  animOut?: PresetTextAnim;
  /** The length of a clip made from the preset, in whole milliseconds (else the title length). */
  defaultDuration?: number;
  /** Where the clip sits (project px from the frame center), taken when `applyPosition` is on. */
  position?: { x: number; y: number };
  /** Applying the preset also moves clips to `position` (spec §10.3 "apply position"). */
  applyPosition: boolean;
  /**
   * What its preset bar button and Presets card show, and the content of a clip made from it (spec
   * §20.2; absent: the name, cut to PRESET_SAMPLE_MAX characters, and a new clip reads `Title`).
   */
  sampleText?: string;
  /** The bundled sets it is in (spec §20.2: Titles, Subtitles, Captions); its user sets are its `tags`. */
  sets?: PresetSetId[];
  /** The word highlight it gives a caption track it styles (Batch 52: the Captions starters' active word). */
  highlight?: CaptionHighlight;
  /** The cue animations it gives a caption track it styles (Batch 59). */
  captionAnim?: CaptionAnim;
  /** Its user sets (spec §20.2 "each user tag"), also searched. */
  tags: string[];
  favorite: boolean;
  /** ISO times; the newer `updatedAt` wins when two copies of a preset meet (the library folder). */
  createdAt: string;
  updatedAt: string;
}
/** The bundled preset sets of the preset bar (spec §20.2). */
export const PRESET_SET_IDS = ["titles", "subtitles", "captions"] as const;
export type PresetSetId = (typeof PRESET_SET_IDS)[number];

/** Where a caption sits (spec §10.5): a preset, or `custom` at `CaptionStyle.y`. */
export type CaptionPosition = "bottom" | "center" | "top" | "custom";

/** How the word being spoken stands out when a cue has word timings (spec §10.5). */
export const CAPTION_HIGHLIGHTS = ["none", "color", "background", "scale", "colorAndScale", "progressive", "reveal"] as const;
export type CaptionHighlightMode = (typeof CAPTION_HIGHLIGHTS)[number];

export interface CaptionHighlight {
  mode: CaptionHighlightMode;
  /** The active word's fill (color modes) or its box (background). */
  color: RGBA;
  /** The fill of the other words while a cue has word timings. */
  inactiveColor: RGBA;
  /** The fill of a cue's emphasis words, from the cue's first frame (spec §21.8, Batch 59); absent: the highlight color. */
  emphasisColor?: RGBA;
}

/** The cue animations (spec §21.8, Batch 59), in the order of the properties panel's chips. */
export const CUE_ANIM_KINDS = ["fade", "pop", "slideUp", "slideDown"] as const;
export type CueAnimKind = (typeof CUE_ANIM_KINDS)[number];

/** A cue's in or out animation: the whole caption box, `frames` long (at most half the cue; 0: none, which a cue override sets to drop its track's). */
export interface CueAnim {
  kind: CueAnimKind;
  frames: number;
}

/** The animations of a cue's start and end. */
export interface CaptionAnim {
  in?: CueAnim;
  out?: CueAnim;
}

/**
 * The look of a caption track's cues (spec §10.5): a text style, where the cues sit, how wide and how
 * many lines they may be, and the word highlight. Sizes are project px.
 */
export interface CaptionStyle {
  text: TextStyle;
  position: CaptionPosition;
  /** `custom`: the middle of the caption, project px from the frame center (right is positive; Batch 53). */
  x: number;
  /** `custom`: the middle of the caption, project px from the frame center (down is positive). */
  y: number;
  /** Words wrap at this width (project px). */
  maxWidth: number;
  /** A cue with more lines is drawn smaller until it fits. */
  maxLines: number;
  highlight: CaptionHighlight;
  /** Cue in and out animations (spec §21.8, Batch 59); absent: none. */
  anim?: CaptionAnim;
}

/**
 * The text style fields a cue can set over its track's (spec §20.3): any of them, and the parts of the
 * stroke, shadow and background box one by one. The vertical anchor is not one: captions sit at their
 * position.
 */
export interface CaptionTextOverride {
  fontFamily?: string;
  fontWeight?: number;
  italic?: boolean;
  fontSize?: number;
  fill?: RGBA | Gradient;
  stroke?: Partial<TextStroke>;
  shadow?: Partial<TextShadow>;
  background?: Partial<TextBackground>;
  textCase?: TextCase;
  letterSpacing?: number;
  lineHeight?: number;
  align?: TextAlign;
}

/**
 * A cue's own style over its track's `CaptionStyle` (spec §20.3, Batch 53): a sparse set of fields, so
 * a change of the track style still changes every field the cue did not set.
 */
export interface CaptionStyleOverride {
  text?: CaptionTextOverride;
  position?: CaptionPosition;
  x?: number;
  y?: number;
  maxWidth?: number;
  maxLines?: number;
  highlight?: Partial<CaptionHighlight>;
  anim?: CaptionAnim;
}

/**
 * A caption track's data (spec §5.2 `captionTracks`): its style. The cue ids are the track's
 * `clipIds` (one source of truth).
 */
export interface CaptionTrackData {
  style: CaptionStyle;
}

export interface Project {
  schemaVersion: number;
  /** uuid, never changes */
  id: string;
  name: string;
  settings: {
    width: number;
    height: number;
    fps: Rational;
    background: RGBA;
    sampleRate: 48000;
    /** Viewing distance in px of the 2.5D layers (spec §21.15, Batch 70; schema 14); null: none (flat projection); absent: 1600. */
    perspective?: number | null;
    /** The export loudness target (spec §21.21, Batch 77; schema 21); null or absent: off. */
    loudness?: LoudnessTarget | null;
  };
  media: Record<MediaId, MediaItem>;
  /**
   * The media panel's bins (spec §12, Batch 41; schema 2): flat folders in strip order, one level. A
   * media item is in at most one (`MediaItem.binId`); the virtual bins (All, Video, Audio, Images) are
   * not stored.
   */
  bins: Bin[];
  /** Ordered: index 0 = bottom video track; audio tracks after video tracks. */
  tracks: Track[];
  /** All clips by id; tracks hold ordered id arrays. */
  clips: Record<ClipId, Clip>;
  markers: Marker[];
  /** Style + cue ids for tracks of kind 'caption'. */
  captionTracks: Record<TrackId, CaptionTrackData>;
  /**
   * Project-local presets (global ones live outside the project). Kept empty: the project's presets
   * are files in `presets/text/` (spec §9.7, Batch 30), outside the undo history like the global ones.
   */
  textPresetsLocal: TextPreset[];
  /**
   * Nested sequences (spec §21.10, Batch 62; schema 8): what compound clips show. Their inner clips live
   * in `clips` (ids unique project-wide) on the inner tracks of the sequence. Empty in older projects.
   */
  sequences: Record<SequenceId, Sequence>;
  meta: ProjectMeta;
}

export type SequenceId = string;

/** A sequence a compound clip shows (spec §21.10): its own size, length, background and inner tracks. */
export interface Sequence {
  id: SequenceId;
  name: string;
  /** Project px. */
  size: { w: number; h: number };
  duration: Frame;
  /** Null: transparent. */
  background: RGBA | null;
  /** Inner video and audio tracks, ordered like `Project.tracks`; no caption track. */
  tracks: Track[];
  /** Viewing distance in px of its 2.5D layers (spec §21.15, Batch 70); null: none; absent: 1600. */
  perspective?: number | null;
  /** Inner layers drawn by depth (farthest first) instead of track order (spec §21.15). */
  depthSort?: boolean;
}

/** The deepest a compound may nest (a compound in a compound in ...): spec §21.10. */
export const MAX_COMPOUND_DEPTH = 8;

/** The tool that wrote a project (spec §21.4, Batch 54); the editor shows it and never changes it. */
export interface ProjectGenerator {
  name: string;
  version?: string;
  source?: string;
  url?: string;
}

export interface ProjectMeta {
  createdAt: string;
  modifiedAt: string;
  appVersion: string;
  generator?: ProjectGenerator;
}

/**
 * A baked stand-in (spec §21.4, Batch 54): the clip stands for the native clip in `data` (the editor's
 * own JSON, possibly sparse, without `id`, `trackId`, `start` and `duration`). `data` is opaque apart
 * from its `kind`, which equals `kind`: never migrated, normalized or interpreted until converted.
 * `headTrim` (frames, default 0) is how far the stand-in's first frame moved into the native clip.
 */
export interface FallbackOf {
  kind: string;
  reason: string;
  schemaVersion: number;
  headTrim?: Frame;
  data: JsonObject;
}

export interface MediaItem {
  id: MediaId;
  kind: "video" | "audio" | "image" | "lottie";
  name: string;
  file: { relPath: string } | { handleKey: string; pathHint: string };
  durationUs: number;
  width?: number;
  height?: number;
  rotation?: 0 | 90 | 180 | 270;
  fps?: Rational;
  hasAudio: boolean;
  codec?: string;
  audioCodec?: string;
  proxy?: { relPath: string; width: number; height: number; status: "none" | "pending" | "ready" | "failed" };
  analysis: { thumbs: "none" | "pending" | "ready"; peaks: "none" | "pending" | "ready" };
  binId?: string;
  addedAt: string;
  /** The source file's size in bytes when it was imported (Batch 41): a folder relink matches by name and size. */
  size?: number;
  /** A VP8/VP9 WebM whose alpha channel the app decodes (Batch 64, spec §21.11). */
  alpha?: true;
  /** An image sequence (Batch 64): `kind` is "image", `durationUs` = count / fps, `file` names the first frame. */
  sequence?: ImageSequence;
}

/** The numbered frames of an image sequence (spec §21.11). */
export interface ImageSequence {
  /** The folder of the frames, relative to the project folder, `/` separated. */
  dir: string;
  /** printf-style file name of a frame, such as `frame_%05d.png`. */
  pattern: string;
  /** The number of the first frame (the %d value). */
  first: number;
  count: number;
  fps: Rational;
}

/** A media panel bin (spec §12). */
export interface Bin {
  id: string;
  name: string;
}

export const TRACK_KINDS = ["video", "audio", "caption"] as const;
export type TrackKind = (typeof TRACK_KINDS)[number];

/** What an export is normalized to (spec §21.21): integrated loudness in LUFS and the true-peak ceiling in dBTP. */
export interface LoudnessTarget {
  targetLufs: number;
  truePeakDb: number;
}

/** The shapes of an audio fade (spec §21.21): the default is equal power. */
export const FADE_CURVES = ["linear", "equalPower", "exponential"] as const;
export type FadeCurve = (typeof FADE_CURVES)[number];

export interface Track {
  id: TrackId;
  kind: TrackKind;
  name: string;
  /** Sorted by start, non-overlapping (invariant). */
  clipIds: ClipId[];
  locked: boolean;
  muted: boolean;
  solo: boolean;
  hidden: boolean;
  targeted: boolean;
  height: "S" | "M" | "L";
  /** Audio tracks (spec §21.21, Batch 77; schema 21): the track's level in dB (-60..+12, absent = 0) and pan (-1..1, absent = 0). */
  gainDb?: number;
  pan?: number;
}

/** Blend modes (spec §21.17, Batch 72), in the UI's order (normal, darken, lighten, contrast, inversion groups). */
export const BLEND_MODES = ["normal", "darken", "multiply", "colorBurn", "lighten", "screen", "colorDodge", "add", "overlay", "softLight", "hardLight", "difference", "exclusion"] as const;
export type BlendMode = (typeof BLEND_MODES)[number];

/** Track matte modes (spec §21.17): the matte clip's alpha or luma, optionally inverted. */
export const MATTE_MODES = ["alpha", "alphaInverted", "luma", "lumaInverted"] as const;
export type MatteMode = (typeof MATTE_MODES)[number];

/** A track matte (spec §21.17): the clip shows only where `clipId` (a visual clip of the same sequence) is opaque or bright. */
export interface TrackMatte {
  clipId: ClipId;
  mode: MatteMode;
}

/** How a mask combines with the masks above it (spec §21.18, Batch 73), in the UI's order. */
export const MASK_MODES = ["add", "subtract", "intersect"] as const;
export type MaskMode = (typeof MASK_MODES)[number];

/** The mask shape kinds (spec §21.18). */
export const MASK_KINDS = ["rect", "ellipse", "path"] as const;
export type MaskKind = (typeof MASK_KINDS)[number];

/** A rectangle or an ellipse in the clip's content px: (x, y) its top left corner, w x h its size; `radius` rounds a rectangle's corners. */
export interface MaskBox {
  kind: "rect" | "ellipse";
  x: number;
  y: number;
  w: number;
  h: number;
  radius?: number;
}

/** A closed outline in the clip's content px, as SVG path data (every subpath is closed). */
export interface MaskPath {
  kind: "path";
  d: string;
}

/**
 * A mask (spec §21.18, Batch 73): the clip shows only where its masks, combined in order, cover it.
 * `feather` softens the edge (content px, each side), `expansion` grows (or with a negative value shrinks)
 * the shape, `opacity` scales the mask's coverage (0..1), `inverted` uses the outside.
 */
export interface Mask {
  id: string;
  shape: MaskBox | MaskPath;
  mode: MaskMode;
  feather: number;
  expansion: number;
  opacity: number;
  inverted: boolean;
}

/**
 * The effect types (spec §21.19): Batch 74's blurs, glow, shadow and outline; Batch 75's color adjustment,
 * vignette, sharpen, grain, chroma and luma keys and LUT; Batch 76's RGB split, pixelate, mirror, wave, glitch,
 * posterize and invert.
 */
export const EFFECT_TYPES = [
  "gaussianBlur", "directionalBlur", "glow", "dropShadow", "outline",
  "colorAdjust", "vignette", "sharpen", "grain", "chromaKey", "lumaKey", "lut",
  "rgbSplit", "pixelate", "mirror", "wave", "glitch", "posterize", "invert",
] as const;
export type EffectType = (typeof EFFECT_TYPES)[number];

/**
 * An effect (spec §21.19, Batch 74): one step of a visual clip's effect stack, applied in order to the clip's
 * picture in its content space (after its masks, before its transform). `params` holds the type's parameters
 * by name (core/effects/effectParams.ts): numbers, colors as [r, g, b, a] (straight alpha, 0..1), choices
 * as strings and files as project paths (a LUT's `luts/<name>.cube`, Batch 75); a missing parameter takes
 * its default.
 */
export interface Effect {
  id: string;
  type: EffectType;
  enabled: boolean;
  params: Record<string, number | number[] | string>;
}

export const CLIP_KINDS = ["video", "audio", "image", "lottie", "text", "solid", "caption", "compound", "shape", "null", "adjustment"] as const;
export type ClipKind = (typeof CLIP_KINDS)[number];

export interface ClipBase {
  id: ClipId;
  trackId: TrackId;
  kind: ClipKind;
  name: string;
  start: Frame;
  /** >= 1 */
  duration: Frame;
  color?: LabelColor;
  linkGroup?: string;
  group?: string;
  enabled: boolean;
  /** Set when the clip is a baked stand-in for a clip kind or feature this build lacks (spec §21.4). */
  fallbackOf?: FallbackOf;
  /** Visual clips of video tracks (spec §21.14): the clip's transform is in this clip's space. Same sequence, no cycles. */
  parentId?: ClipId;
  /** Rotation follows the tangent of the `transform.position` motion path (added to `transform.rotation`). */
  autoOrient?: boolean;
  /** 2.5D (spec §21.15, Batch 70): the layer is not drawn while its back faces the viewer. */
  backfaceHidden?: boolean;
  /** Visual clips (spec §21.17, Batch 72): how the clip blends with what is below it; absent = normal. */
  blend?: BlendMode;
  /** Visual clips: the clip shows only where the matte clip is opaque (alpha) or bright (luma) at the frame. */
  matte?: TrackMatte;
  /** The clip is not drawn on its own (it is another clip's matte); absent = drawn. */
  matteOnly?: boolean;
  /** Visual clips (spec §21.18, Batch 73): the clip shows only where these masks, combined in order, cover it; absent or empty = whole. */
  masks?: Mask[];
  /** Visual clips (spec §21.19, Batch 74): the effect stack, applied in order after the masks; absent or empty = none. */
  effects?: Effect[];
}

export interface MediaClip extends ClipBase {
  kind: "video" | "audio" | "image" | "lottie";
  mediaId: MediaId;
  /** out - in == duration * speed * usPerFrame (invariant, within 1 frame) */
  in: Us;
  out: Us;
  speed: number;
  transform: Transform;
  opacity: number;
  crop: Crop;
  /** Video and image clips: rounded corners, an outline and a shadow around the cropped picture (spec §21.7). */
  cornerRadius?: number;
  stroke?: StrokeStyle;
  shadow?: ShadowStyle;
  volume: Volume;
  fades: { in: Frame; out: Frame; curve?: FadeCurve };
  keyframes?: Keyframes;
  /** Video clips (spec §21.22, Batch 78; schema 22): keys (clip-relative frames) mapping timeline frames to source times; replaces `speed` for the picture and mutes the linked audio. */
  timeRemap?: { frame: Frame; sourceUs: Us; ease: EaseId }[];
  /** Video and audio clips: the source plays backward (from `out` to `in`); ignored when `timeRemap` is set. */
  reverse?: boolean;
  /** Video clips: when the source advances less than a frame per timeline frame, the two nearest source frames are mixed; absent = off. */
  frameBlend?: boolean;
  /** Lottie clips (spec §21.23, Batch 79; schema 23): the animation repeats from its start when the clip is longer; absent or false = it holds its last frame. */
  loop?: boolean;
  /** Lottie clips: colors of the animation that are replaced, in order (the first `from` that matches wins). Channels 0..1. */
  colorOverrides?: { from: RGBA; to: RGBA }[];
  transitionIn?: Transition;
  transitionOut?: Transition;
}

/** What a span changes on its characters (spec §21.13): absent fields keep the clip style's. */
export interface TextSpanStyle {
  fill?: Fill;
  fontFamily?: string;
  fontWeight?: number;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  /** A box behind the span. */
  highlight?: RGBA;
}

/** A styled run of a text clip: `[start, end)` in UTF-16 units of `text.value`. */
export interface TextSpan {
  start: number;
  end: number;
  style: TextSpanStyle;
}

/** The separators a counter groups thousands with ("": none). */
export const COUNTER_SEPARATORS = ["", ",", ".", " ", "'"] as const;
export type CounterSeparator = (typeof COUNTER_SEPARATORS)[number];

/**
 * A number that counts (spec §21.13, Batch 68): the clip shows `prefix + value + suffix`, the value going
 * from `from` to `to` over the clip (through `ease`), or following the keys of `text.counter.value`.
 * `text.value` holds the final text (layout bounds).
 */
export interface TextCounter {
  from: number;
  to: number;
  decimals: number;
  prefix: string;
  suffix: string;
  separator: CounterSeparator;
  ease: EaseId;
}

export const SELECTOR_SHAPES = ["square", "rampUp", "rampDown", "triangle", "round", "smooth"] as const;
export type SelectorShape = (typeof SELECTOR_SHAPES)[number];
export const SELECTOR_ORDERS = ["forward", "reverse", "random"] as const;
export type SelectorOrder = (typeof SELECTOR_ORDERS)[number];

/** A range selector (After Effects semantics): which units an animator moves, and how much (0..1 each). */
export interface AnimatorSelector {
  start: number;
  end: number;
  offset: number;
  shape: SelectorShape;
  /** Reshape of the ramps, -1..1 (0: none). */
  ease: number;
  order: SelectorOrder;
  seed: number;
}

/** What an animator does to a unit at amount 1 (each prop is times the unit's amount; opacity moves toward its value). */
export interface AnimatorProps {
  x?: number;
  y?: number;
  scale?: number;
  rotation?: number;
  opacity?: number;
  blur?: number;
  tracking?: number;
  fill?: RGBA;
}
export const ANIMATOR_PROP_NAMES = ["x", "y", "scale", "rotation", "opacity", "blur", "tracking", "fill"] as const;
export type AnimatorPropName = (typeof ANIMATOR_PROP_NAMES)[number];

/** A per-character, word or line animation driven by a range selector (spec §21.13, Batch 68). */
export interface TextAnimator {
  id: string;
  unit: TextAnimUnit;
  selector: AnimatorSelector;
  props: AnimatorProps;
}

export interface TextClip extends ClipBase {
  kind: "text";
  text: TextContent;
  style: TextStyle;
  animIn?: TextAnim;
  animOut?: TextAnim;
  presetId?: string;
  /** Styled runs inside the text (spec §21.13, Batch 67): UTF-16 offsets into `text.value`, sorted, not overlapping. */
  spans?: TextSpan[];
  /** A counting number (spec §21.13, Batch 68). */
  counter?: TextCounter;
  /** Range-selector animators (spec §21.13, Batch 68). */
  animators?: TextAnimator[];
  transform: Transform;
  opacity: number;
  keyframes?: Keyframes;
  fades: { in: Frame; out: Frame };
}

/** The shapes of a solid (spec §5.2), in the order of the Solid section's chips. */
export const SOLID_SHAPE_IDS = ["rect", "roundedRect", "ellipse", "line"] as const;
export type SolidShape = (typeof SOLID_SHAPE_IDS)[number];

/**
 * A solid or shape layer (spec §5.2, Batch 34): `size` project px at scale 1. A rect, a rect with
 * rounded corners (`cornerRadius` px, at most half the shorter side), an ellipse filling the size, or a
 * horizontal line `size.w` long and `size.h` thick whose ends are rounded by `cornerRadius`.
 */
export interface SolidClip extends ClipBase {
  kind: "solid";
  fill: Fill;
  shape: SolidShape;
  size: { w: number; h: number };
  cornerRadius: number;
  /** Radii of the four corners (tl, tr, br, bl); wins over `cornerRadius` (spec §21.7). */
  cornerRadii?: [number, number, number, number];
  stroke?: StrokeStyle;
  shadow?: ShadowStyle;
  transform: Transform;
  opacity: number;
  keyframes?: Keyframes;
  /** Opacity fades (spec §6.15 lists solids among the fading clips; §5.2 has no field: optional, none when absent). */
  fades?: { in: Frame; out: Frame };
}

/** A word of a cue with its timing: frames relative to the cue's start, [start, end). */
export interface CaptionWord {
  text: string;
  start: Frame;
  end: Frame;
  /** Shows the highlight's emphasis color from the cue's first frame (spec §21.8, Batch 59). */
  emphasis?: boolean;
  /** This word's own fill: over the highlight, inactive and emphasis colors. */
  color?: RGBA;
}

/**
 * A cue (spec §10.5): plain text with `\n` line breaks, and optional word timings (karaoke). Its style
 * is its track's with `styleOverride` on top (spec §20.3); `presetId` names the preset it was styled
 * with.
 */
export interface CaptionClip extends ClipBase {
  kind: "caption";
  text: string;
  words?: CaptionWord[];
  styleOverride?: CaptionStyleOverride;
  presetId?: string;
}

/**
 * A sequence shown as one layer (spec §21.10, Batch 62). The sequence frame shown at the clip's start is
 * `offset`; inner frame = `offset + (frame - start)`. Trimming moves `offset` and `duration`; the clip
 * cannot run past the sequence's end. `volume` is the gain of the inner audio.
 */
export interface CompoundClip extends ClipBase {
  kind: "compound";
  sequenceId: SequenceId;
  offset: Frame;
  transform: Transform;
  opacity: number;
  keyframes?: Keyframes;
  fades: { in: Frame; out: Frame };
  volume: Volume;
}

export const LINE_CAPS = ["butt", "round", "square"] as const;
export type LineCap = (typeof LINE_CAPS)[number];
export const LINE_JOINS = ["miter", "round", "bevel"] as const;
export type LineJoin = (typeof LINE_JOINS)[number];
export const FILL_RULES = ["nonzero", "evenodd"] as const;
export type FillRule = (typeof FILL_RULES)[number];
export const PRIMITIVE_KINDS = ["rect", "ellipse", "polygon", "star", "arrow", "arc", "line"] as const;
export type PrimitiveKind = (typeof PRIMITIVE_KINDS)[number];

/** The stroke of a vector path (spec §21.12): a frame stroke with caps, joins and a miter limit (view-box px). */
export interface PathStroke extends StrokeStyle {
  cap: LineCap;
  join: LineJoin;
  /** Longest miter as a multiple of the width (SVG `stroke-miterlimit`); a longer one is beveled. */
  miterLimit: number;
}

/**
 * The part of a path's stroke that is drawn (spec §21.12): fractions 0..1 of the path length (all its
 * subpaths in order), `offset` shifting both ends (wrapping around).
 */
export interface PathTrim {
  start: number;
  end: number;
  offset: number;
}

/** A generated path (spec §21.12), centered in the view box; angles in degrees, 0 = up, clockwise. */
export type Primitive =
  | { kind: "rect"; w: number; h: number; radius: number }
  | { kind: "ellipse"; w: number; h: number }
  | { kind: "polygon"; sides: number; radius: number; roundness: number }
  | { kind: "star"; points: number; inner: number; outer: number; roundness: number }
  | { kind: "arrow"; length: number; shaft: number; head: number; headLength: number }
  | { kind: "arc"; radius: number; start: number; end: number }
  | { kind: "line"; length: number };

/** One path of a shape clip (spec §21.12), drawn in order. */
export interface ShapePath {
  id: string;
  /** SVG path data in view-box px, arcs allowed; generated from `primitive` when that is present. */
  d: string;
  fill: Fill | null;
  fillRule: FillRule;
  stroke?: PathStroke;
  trim?: PathTrim;
  primitive?: Primitive;
}

/** A vector graphic (spec §21.12, Batch 65): paths in a view box of `size` project px at scale 1. */
export interface ShapeClip extends ClipBase {
  kind: "shape";
  size: { w: number; h: number };
  paths: ShapePath[];
  transform: Transform;
  opacity: number;
  keyframes?: Keyframes;
  fades?: { in: Frame; out: Frame };
}

/** An invisible controller (spec §21.14, Batch 69): never drawn or exported; `size` is the outline shown when it is selected. */
export interface NullClip extends ClipBase {
  kind: "null";
  transform: Transform;
  keyframes?: Keyframes;
  size: { w: number; h: number };
}

/**
 * An adjustment clip (spec §21.20, Batch 76) on a video track: during its range its effects apply to the
 * composite of every layer below it in the same sequence; its masks (in project px over the frame) limit the
 * area and its opacity (with keys and fades) mixes the result with the unaffected picture. It draws nothing
 * of its own: no transform, blend mode or matte.
 */
export interface AdjustmentClip extends ClipBase {
  kind: "adjustment";
  effects: Effect[];
  opacity: number;
  keyframes?: Keyframes;
  fades?: { in: Frame; out: Frame };
}

export type Clip = MediaClip | TextClip | SolidClip | CaptionClip | CompoundClip | ShapeClip | NullClip | AdjustmentClip;

/** x,y in project pixels relative to project center; scale 1 = native media size; rotation degrees. */
export interface Transform {
  x: number;
  y: number;
  scale: number;
  scaleY?: number;
  rotation: number;
  /** 2.5D (spec §21.15, Batch 70): degrees about the layer's horizontal axis through its anchor. */
  rotationX?: number;
  /** 2.5D: degrees about the layer's vertical axis through its anchor. */
  rotationY?: number;
  /** 2.5D: depth in px, positive = farther away. */
  z?: number;
  anchor: { x: number; y: number };
  flipH: boolean;
  flipV: boolean;
}

/** Fractions 0..1 of media size. */
export interface Crop {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Volume {
  gainDb: number;
  muted: boolean;
  /** Audio clips (spec §21.21, Batch 77): -1 (left) to 1 (right); absent = 0 (centered). Keyframe prop `volume.pan`. */
  pan?: number;
}

/**
 * Keyframe frames are relative to the clip start; each list is sorted by frame (one key per frame).
 * A key's `ease` shapes the segment from it to the next key. Property ids and evaluation:
 * `core/document/keyframes.ts` (Batch 35).
 */
export interface Keyframes {
  [prop: string]: KeyData[];
}

export interface Marker {
  id: string;
  frame: Frame;
  color: LabelColor;
  label: string;
}

export function isMediaClip(clip: Clip): clip is MediaClip {
  return clip.kind === "video" || clip.kind === "audio" || clip.kind === "image" || clip.kind === "lottie";
}

/** A clip that shows a picture and takes media timing but is not bound by its media's length (a still, an animated image, a Lottie animation). */
export const isUnboundedMedia = (kind: string): boolean => kind === "image" || kind === "lottie";

/**
 * A freeze frame (Batch 27): a video clip with `speed = 0`, holding the source time `in` for its whole
 * duration (`out` is one project frame after it). Its source never moves: no media bounds, no slip,
 * no speed, no sound.
 */
export function isFreeze(clip: Clip): boolean {
  return clip.kind === "video" && clip.speed === 0;
}
