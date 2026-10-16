// The persistent document (spec §5.2). Plain JSON only: no classes, Maps, Sets or undefined-valued
// keys, so a Project can be serialized as-is and diffed by Immer patches.

export const SCHEMA_VERSION = 1;

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
 * A vertical two-stop gradient, `from` at the top to `to` at the bottom (spec §10.1 text fill). Text
 * fills use it since Batch 28. TODO(batch 34): solid fills.
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

// Types owned by later batches. They stay opaque JSON until their batch defines them.
/** TODO(batch 35): easing ids. */
export type EaseId = string;
/** TODO(batch 36): transition kind, duration, alignment. */
export type Transition = JsonObject;
/** TODO(batch 31): text animation (§10.4). */
export type TextAnim = JsonObject;
/** TODO(batch 30): text preset (§10.3). */
export type TextPreset = JsonObject;
/** TODO(batch 32): caption track style and cue ids (§10.5). */
export type CaptionTrackData = JsonObject;

export interface Project {
  schemaVersion: number;
  /** uuid, never changes */
  id: string;
  name: string;
  settings: { width: number; height: number; fps: Rational; background: RGBA; sampleRate: 48000 };
  media: Record<MediaId, MediaItem>;
  /** Ordered: index 0 = bottom video track; audio tracks after video tracks. */
  tracks: Track[];
  /** All clips by id; tracks hold ordered id arrays. */
  clips: Record<ClipId, Clip>;
  markers: Marker[];
  /** Style + cue ids for tracks of kind 'caption'. */
  captionTracks: Record<TrackId, CaptionTrackData>;
  /** Project-local presets (global ones live outside the project). */
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

export interface SolidClip extends ClipBase {
  kind: "solid";
  fill: RGBA | Gradient;
  shape: "rect" | "roundedRect" | "ellipse" | "line";
  size: { w: number; h: number };
  cornerRadius: number;
  transform: Transform;
  opacity: number;
  keyframes?: Keyframes;
}

export interface CaptionClip extends ClipBase {
  kind: "caption";
  text: string;
  words?: { text: string; start: Frame; end: Frame }[];
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

/** Keyframe frames are relative to the clip start. */
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
