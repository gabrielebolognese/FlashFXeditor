// The persistent document (spec §5.2). Plain JSON only: no classes, Maps, Sets or undefined-valued
// keys, so a Project can be serialized as-is and diffed by Immer patches.

export const SCHEMA_VERSION = 2;

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
  mode: "line" | "block";
}

/** The look of a text clip (spec §10.1). Sizes are project px; `lineHeight` is a multiplier of the size. */
export interface TextStyle {
  fontFamily: string;
  /** 1..1000 (variable fonts take any value in their range). */
  fontWeight: number;
  italic: boolean;
  fontSize: number;
  fill: RGBA | Gradient;
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
export const EASE_IDS = ["linear", "easeIn", "easeOut", "easeInOut", "hold", "smooth", "snap", "overshoot"] as const;
export type EaseId = (typeof EASE_IDS)[number];

/** The transitions (spec §6.15, Batch 36), in the order of the properties panel's chips. Audio crossfades are `crossDissolve`. */
export const TRANSITION_KINDS = ["crossDissolve", "dipToBlack", "dipToWhite"] as const;
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
}

/** The text animations (spec §10.4), in the order of the properties panel's chips. */
export const TEXT_ANIM_IDS = ["fade", "slideUp", "slideDown", "slideLeft", "slideRight", "pop", "typewriter", "wordPop", "wordFade", "lineReveal", "blurIn", "scaleBounce"] as const;
export type TextAnimId = (typeof TEXT_ANIM_IDS)[number];
/** What a text animation moves one by one: characters (graphemes), words or lines; none = the whole text. */
export type TextAnimUnit = "char" | "word" | "line";

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
  tags: string[];
  favorite: boolean;
  /** ISO times; the newer `updatedAt` wins when two copies of a preset meet (the library folder). */
  createdAt: string;
  updatedAt: string;
}
/** Where a caption sits (spec §10.5): a preset, or `custom` at `CaptionStyle.y`. */
export type CaptionPosition = "bottom" | "center" | "top" | "custom";

/** How the word being spoken stands out when a cue has word timings (spec §10.5). */
export const CAPTION_HIGHLIGHTS = ["none", "color", "background", "scale", "colorAndScale"] as const;
export type CaptionHighlightMode = (typeof CAPTION_HIGHLIGHTS)[number];

export interface CaptionHighlight {
  mode: CaptionHighlightMode;
  /** The active word's fill (color modes) or its box (background). */
  color: RGBA;
  /** The fill of the other words while a cue has word timings. */
  inactiveColor: RGBA;
}

/**
 * The look of a caption track's cues (spec §10.5): a text style, where the cues sit, how wide and how
 * many lines they may be, and the word highlight. Sizes are project px.
 */
export interface CaptionStyle {
  text: TextStyle;
  position: CaptionPosition;
  /** `custom`: the middle of the caption, project px from the frame center (down is positive). */
  y: number;
  /** Words wrap at this width (project px). */
  maxWidth: number;
  /** A cue with more lines is drawn smaller until it fits. */
  maxLines: number;
  highlight: CaptionHighlight;
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
  settings: { width: number; height: number; fps: Rational; background: RGBA; sampleRate: 48000 };
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
  meta: { createdAt: string; modifiedAt: string; appVersion: string };
}

export interface MediaItem {
  id: MediaId;
  kind: "video" | "audio" | "image";
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
}

/** A media panel bin (spec §12). */
export interface Bin {
  id: string;
  name: string;
}

export type TrackKind = "video" | "audio" | "caption";

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
}

export type ClipKind = "video" | "audio" | "image" | "text" | "solid" | "caption";

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
}

export interface MediaClip extends ClipBase {
  kind: "video" | "audio" | "image";
  mediaId: MediaId;
  /** out - in == duration * speed * usPerFrame (invariant, within 1 frame) */
  in: Us;
  out: Us;
  speed: number;
  transform: Transform;
  opacity: number;
  crop: Crop;
  volume: Volume;
  fades: { in: Frame; out: Frame };
  keyframes?: Keyframes;
  transitionIn?: Transition;
  transitionOut?: Transition;
}

export interface TextClip extends ClipBase {
  kind: "text";
  text: TextContent;
  style: TextStyle;
  animIn?: TextAnim;
  animOut?: TextAnim;
  presetId?: string;
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
  fill: RGBA | Gradient;
  shape: SolidShape;
  size: { w: number; h: number };
  cornerRadius: number;
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
}

/** A cue (spec §10.5): plain text with `\n` line breaks, and optional word timings (karaoke). */
export interface CaptionClip extends ClipBase {
  kind: "caption";
  text: string;
  words?: CaptionWord[];
}

export type Clip = MediaClip | TextClip | SolidClip | CaptionClip;

/** x,y in project pixels relative to project center; scale 1 = native media size; rotation degrees. */
export interface Transform {
  x: number;
  y: number;
  scale: number;
  scaleY?: number;
  rotation: number;
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
}

/**
 * Keyframe frames are relative to the clip start; each list is sorted by frame (one key per frame).
 * A key's `ease` shapes the segment from it to the next key. Property ids and evaluation:
 * `core/document/keyframes.ts` (Batch 35).
 */
export interface Keyframes {
  [prop: string]: { frame: Frame; value: number; ease: EaseId }[];
}

export interface Marker {
  id: string;
  frame: Frame;
  color: LabelColor;
  label: string;
}

export function isMediaClip(clip: Clip): clip is MediaClip {
  return clip.kind === "video" || clip.kind === "audio" || clip.kind === "image";
}

/**
 * A freeze frame (Batch 27): a video clip with `speed = 0`, holding the source time `in` for its whole
 * duration (`out` is one project frame after it). Its source never moves: no media bounds, no slip,
 * no speed, no sound.
 */
export function isFreeze(clip: Clip): boolean {
  return clip.kind === "video" && clip.speed === 0;
}
