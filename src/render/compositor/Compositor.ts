// The compositor (spec §9.4, §5.1): evaluates the document at a frame into a `Composite`, bottom to
// top. For each visible video track it takes the clip at the frame (binary search, P10) and computes
// what the layer shows: the media frame (source time with speed), one matrix mapping the unit quad
// onto project pixels, opacity with fades, and the crop as a texture rectangle.
// - The matrix composes, applied first to last: the crop rectangle in texture space, the rotation
//   metadata (the texture stays as coded, §9.3), the flips, the display size, then the clip
//   transform (anchor, scale/scaleY, rotation clockwise in degrees, position from the frame center).
// - Crop fractions apply to the media as shown (upright and flipped): `left` always cuts the visible
//   left side.
// - Media time 0 is the first frame: `timeUs` is relative to it, whatever cts the container starts at.
// - Text layers (spec §10.1) carry their text and style and the matrix of their layout box (anchor,
//   scale, rotation, position; flips mirror the text inside its box); the preview draws them from the
//   text raster cache at its render scale. Their detail (raster px per project px they can show) lets
//   a zoom re-rasterize them (§7.1).
// - Text animations (spec §10.4, text/anim.ts): a text layer at a frame of its in or out animation
//   carries what the animation does there (`TextAnimFrame`): one state for the whole text, or one per
//   character, word or line (the units the atlas cuts, render/text/animUnits.ts). A typewriter cuts
//   its characters out of the drawn lines. A text edited inline shows at rest. `upcomingTexts` lists
//   the text clips about to show and the parts they will draw, so the preview rasterizes them ahead.
// - Gesture-aware (spec P2): during a canvas gesture or a properties field scrub `transforms`,
//   `opacities`, `crops`, `texts` and `anims` give the clips' ephemeral values, used instead of the
//   document's until it commits.
// - Captions (spec §10.5): the caption track (above every video track, so drawn last) adds its cue at
//   the frame as a text layer in the track's style (render/text/captionLayout.ts: wrapped at the max
//   width, smaller when it has more lines than the max), centered at the style's position. When the
//   cue has word timings and the style a highlight, the layer carries the active word
//   (`CaptionHighlightFrame`). `captions` gives the cue list's live text and a style field scrub's
//   live style. Cues about to show are listed by `upcomingTexts` too.
// - Styles per cue (spec §20.3, Batch 53): a cue is drawn in its effective style (the track's with its
//   `styleOverride` on top, text/captions.ts `effectiveCaptionStyle`: one object per override, so the
//   look and raster caches hold), at its own position and with its own highlight colors. `captions`
//   also gives cues' live styles (a Selected scope field scrub, a hovered preset, a corner handle drag)
//   and the cue edited inline (its draft text, its selection highlight, no word highlight); a canvas
//   drag of a cue gives its live position through `transforms` (the caption's box, anchored as placed).
// - Solids (spec §5.2, Batch 34) resolve to geometry: their size's box drawn as its shape (a box with
//   the drawn corner radius, or an ellipse) in their color or vertical gradient; flips mirror the
//   fill inside the box. `solids` gives a Solid field scrub's or a size handle drag's looks.
// - Images: a still's one texture; an animated image's media time plays from its in point and loops
//   (media/decode/animation.ts `imageTimeUs`).
// - Keyframes (spec §5.2, Batch 35; core/document/keyframes.ts): a clip's keyed transform and opacity
//   are evaluated at the frame (a gesture's or a field scrub's live values, given at the playhead,
//   still win). A text layer's raster scale is the largest scale its keys reach, so an animated zoom
//   never re-rasterizes while it plays (P11).
// - Transitions (spec §9.4, Batch 36; core/document/transitions.ts): at a frame of a transition the
//   track's two clips both play, each past its edge into its handle (an edge frame repeats where the
//   handle runs out), keeping its look at its edge frame (fades, keyframes). A cross dissolve is one
//   `dissolve` layer with both media layers and the mix; a dip to black or white draws the clip of its
//   half (the outgoing one, then the incoming one) under a solid of the color in the clip's own quad,
//   at twice the mix (up to the middle, then down).
// - Fades: video, image, text and solid clips fade their opacity (`fadeFactor`).
// - Offline media (spec §6.19, Batch 41; `OfflineSlates`): a video or image clip whose media is offline
//   (missing, no access, undecodable, or removed from the project) draws a slate instead: a solid in the
//   theme's slate color over the visible part of where the media would be (its size, crop and
//   transform; the frame's size when the record is gone) and a text layer with the media's name and
//   why it is offline, centered on it (its raster keyed `clipId + OFFLINE_SLOT`). In a transition an
//   offline side has no picture (the other side shows alone).
// - Compound clips (spec §21.10, Batch 62): a compound at its frame is one `compound` layer holding the
//   sequence evaluated at the inner frame (`offset + frame - start`) by a compositor of its own (one per
//   layer slot, so two instances never share a pooled composite) over a view of the document whose
//   tracks, size and background are the sequence's. The preview and the export render that composite into
//   a pooled texture and draw it under the clip's transform, opacity and fades.
// Layer structs and arrays are reused between frames; evaluating allocates nothing once warm.
import { sequenceView } from "../../core/document/sequences.js";
import { isRgba } from "../../core/document/color.js";
import { animatedOpacity, animatedTransform, maxKeyedScale } from "../../core/document/keyframes.js";
import { framesToSourceUs, secondsToFrames } from "../../core/document/time.js";
import { handleTimeUs, transitionMix } from "../../core/document/transitions.js";
import type { CaptionClip, CaptionStyle, CaptionWord, Clip, ClipId, CompoundClip, Crop, Frame, MediaClip, MediaId, Project, RGBA, ShadowStyle, ShapeClip, TextAnim, TextClip, TextContent, TextStyle, Track, TrackId, Transform } from "../../core/document/types.js";
import { pathFramesAt, type PathFrameScratch } from "./shapeFrames.js";
import { activeWordIndex, captionPlace, defaultCaptionStyle, effectiveCaptionStyle } from "../../text/captions.js";
import { activeAnim, animUnit, isPlayable, newUnitState, presence, resetUnitState, typedCount, unitProgress, writeUnitShape, type ActiveAnim, type UnitState } from "../../text/anim.js";
import { clipInIndex, lastClipStartingBy, trackIndex, type TrackIndex } from "../../timeline/model/queries.js";
import { multiplyInto, mutableIdentity, setMat, type MutableMat3 } from "../mat3.js";
import { DEFAULT_TEXT_STYLE, textContent } from "../../text/style.js";
import type { AtlasUnitKind } from "../text/atlas.js";
import { layoutStops, layoutUnits } from "../text/animUnits.js";
import type { TextLayout } from "../text/layout.js";
import { textLayout } from "../text/layoutCache.js";
import { captionLook, captionPlan, HIGHLIGHT_SCALE, hasWordPaint, type CaptionLook } from "../text/captionLayout.js";
import { cueAnimAt, newCueAnimState } from "../../text/cueAnim.js";
import { TEXT_RASTER_MAX, type TextHighlight } from "../text/raster.js";
import { MAX_TEXT_SCALE, type TextPart } from "../text/TextRasterCache.js";
import { imageTimeUs } from "../../media/decode/animation.js";
import { drawnRadii, drawnRadius, type SolidLook } from "../../timeline/edit/solid.js";
import { animatedCrop, animatedRadius, animatedSolidLook, newSolidScratch } from "./animatedLook.js";
import { keyedFillColors, maxKeyedFontSize, newTextMotion, styleVariant, textMotion, type TextMotion } from "./animatedText.js";
import { hasTextKeys } from "./animatedText.js";
import { isGradientFill } from "../../core/document/fill.js";
import { HIGHLIGHT_SLOT, TRANSITION_SLOT, type CaptionHighlightFrame, type CompoundCompositeLayer, type CaptionWordBoxes, type Composite, type CompositeLayer, type ShapeCompositeLayer, type ShapePathFrame, type MediaLayer, type PictureShape, type SolidGeometry, type SolidLayer, type SolidStyle, type TextAnimFrame, type TextCompositeLayer, type TransitionCompositeLayer } from "./drawList.js";

/** How far from the playhead the clips next to it count as cut neighbours (seconds). */
export const NEIGHBOR_SECONDS = 2;

/** How offline slates look (the theme's `--offline-slate*` tokens). */
export interface SlateLook {
  fill: RGBA;
  text: RGBA;
  /** The label's size, as a share of the slate's shorter visible side. */
  textShare: number;
  /** The label's wrap width, as a share of the slate's visible width. */
  wrapShare: number;
  weight: number;
  lineHeight: number;
}

/** What offline media clips show (spec §6.19, Batch 41). */
export interface OfflineSlates {
  /** The slate's second line for an offline media (why it is offline), or null when it is online. */
  label(mediaId: MediaId): string | null;
  look(): SlateLook;
}

/** A slate's label as made for one clip (`name` and `reason` as given, before cutting). */
interface SlateText {
  name: string;
  reason: string;
  content: TextContent;
  style: TextStyle;
}

/** The raster slot of a slate's label: its clip id plus this. */
export const OFFLINE_SLOT = "#offline";
/** The raster slot of a keyed text's second fill layer (Batch 60: `clipId + FILL_SLOT`). */
export const FILL_SLOT = "#fill";
/** Names longer than this are cut with an ellipsis on the slate. */
const SLATE_NAME_MAX = 60;

type WritableMediaLayer = Omit<MediaLayer, "transform" | "shape"> & { transform: MutableMat3; shape: PictureShape | null; shapeValue: PictureShape };
type WritableSolidLayer = Omit<SolidLayer, "transform" | "color" | "to" | "shape" | "style"> & { transform: MutableMat3; color: RGBA; to: RGBA | null; toValue: RGBA; shape: SolidGeometry | null; shapeValue: SolidGeometry; style: SolidStyle | null; styleValue: SolidStyle; shadowValue: ShadowStyle; radiiValue: [number, number, number, number] };
type WritableTransitionLayer = Omit<TransitionCompositeLayer, "from" | "to"> & { from: WritableMediaLayer; to: WritableMediaLayer };
type WritableAnimFrame = { atlas: TextAnimFrame["atlas"]; units: UnitState[]; background: number };
type WritableWordBoxes = Omit<CaptionWordBoxes, "shown" | "rects"> & { shown: number[]; rects: CaptionWordBoxes["rects"] };
type WritableKaraoke = Omit<CaptionHighlightFrame, "box" | "unitPaint" | "wordBoxes"> & {
  box: CaptionHighlightFrame["box"];
  boxValue: NonNullable<CaptionHighlightFrame["box"]>;
  unitPaint: number[];
  wordBoxes: CaptionWordBoxes | null;
  wordBoxesValue: WritableWordBoxes;
};
type WritableTextLayer = Omit<TextCompositeLayer, "model" | "anim" | "karaoke"> & {
  model: MutableMat3;
  anim: TextAnimFrame | null;
  animFrame: WritableAnimFrame;
  karaoke: CaptionHighlightFrame | null;
  karaokeFrame: WritableKaraoke;
};

/** A text clip's ephemeral content and style (a Text field scrub, spec §11, P2; inline editing, §7.7). */
export interface LiveText {
  text: TextContent;
  style: TextStyle;
  /** The selection highlight of inline editing, drawn in the raster. */
  highlight?: TextHighlight | null;
  /** Edited inline: shown at rest (no animation). */
  editing?: boolean;
}

/** A text clip's ephemeral animations (an Animation field scrub, spec §10.4). */
export interface LiveAnims {
  animIn?: TextAnim | undefined;
  animOut?: TextAnim | undefined;
}

/** The cue list's live cue texts and a Caption style field scrub's live style (spec §10.5, P2). */
export interface LiveCaptions {
  texts: ReadonlyMap<ClipId, string> | null;
  styles: ReadonlyMap<TrackId, CaptionStyle> | null;
  /** Cues' effective styles shown live (spec §20.3: a Selected scope field scrub, a hovered preset, a corner handle drag). */
  cueStyles?: ReadonlyMap<ClipId, CaptionStyle> | null;
  /** The cue edited inline on the canvas (spec §7.7, §20.3): its selection highlight (drawn in the raster); no word highlight while edited. */
  editing?: { cueId: ClipId; highlight: TextHighlight | null } | null;
}

/** A text clip about to show and what it will draw (`upcomingTexts`). */
export interface UpcomingText {
  clipId: ClipId;
  text: TextContent;
  style: TextStyle;
  /** The layer's own scale (as `TextCompositeLayer.scale`). */
  scale: number;
  parts: TextPart[];
}

/** A frame of a clip next to the playhead (the one a cut would show first). */
export interface NeighborFrame {
  mediaId: MediaId;
  still: boolean;
  timeUs: number;
}

interface WritableComposite extends Composite {
  layers: CompositeLayer[];
}

type WritableCompoundLayer = Omit<CompoundCompositeLayer, "model" | "inner"> & { model: MutableMat3; inner: Composite; child: Compositor };
/** A shape layer with the frames its keyed paths are written into (per path index). */
type WritableShapeLayer = Omit<ShapeCompositeLayer, "model" | "paths"> & { model: MutableMat3; paths: readonly ShapePathFrame[]; keyed: ShapePathFrame[]; scratch: PathFrameScratch[] };

const DEG = Math.PI / 180;

/** Scratch result of `sinCos` (evaluating runs every playback frame: no allocation). */
const trig = { sin: 0, cos: 1 };

/** Exact sine/cosine for quarter turns, so 90° rotations land on whole pixels. Read the result before the next call. */
function sinCos(degrees: number): Readonly<typeof trig> {
  const turns = ((degrees % 360) + 360) % 360;
  if (turns % 90 === 0) {
    trig.sin = turns === 90 ? 1 : turns === 270 ? -1 : 0;
    trig.cos = turns === 0 ? 1 : turns === 180 ? -1 : 0;
  } else {
    trig.sin = Math.sin(degrees * DEG);
    trig.cos = Math.cos(degrees * DEG);
  }
  return trig;
}

const clamp01 = (value: number) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);

/**
 * Opacity factor of the clip's fades at `frame`: 0 on the first frame of a fade-in and the last of a
 * fade-out, linear in between. Frames outside the clip (a transition's handle) take its edge frame's.
 */
export function fadeFactor(clip: { start: Frame; duration: Frame; fades?: { in: Frame; out: Frame } | undefined }, frame: Frame): number {
  const fades = clip.fades;
  if (!fades) return 1;
  const k = Math.min(clip.duration - 1, Math.max(0, frame - clip.start));
  let factor = 1;
  if (fades.in > 0) factor = Math.min(factor, k / fades.in);
  if (fades.out > 0) factor = Math.min(factor, (clip.duration - 1 - k) / fades.out);
  return clamp01(factor);
}

/** Media time (us, 0 = first frame) a media clip shows at timeline `frame` (§5.1), inside [in, out). */
export function sourceTimeUs(clip: Pick<MediaClip, "start" | "in" | "out" | "speed">, frame: Frame, fps: Project["settings"]["fps"]): number {
  const time = clip.in + framesToSourceUs(frame - clip.start, clip.speed, fps);
  return Math.min(Math.max(clip.in, time), Math.max(clip.in, clip.out - 1));
}

/**
 * The clip transform for content of `width` x `height` local px: anchor (fractions of the content),
 * scale, rotation, then position relative to the center of a `frameWidth` x `frameHeight` frame.
 */
export function writeModel(out: MutableMat3, transform: Transform, width: number, height: number, frameWidth: number, frameHeight: number): MutableMat3 {
  const { sin, cos } = sinCos(transform.rotation);
  const sx = transform.scale;
  const sy = transform.scaleY ?? transform.scale;
  const a = cos * sx;
  const b = sin * sx;
  const c = -sin * sy;
  const d = cos * sy;
  const ax = transform.anchor.x * width;
  const ay = transform.anchor.y * height;
  return setMat(out, a, b, c, d, frameWidth / 2 + transform.x - a * ax - c * ay, frameHeight / 2 + transform.y - b * ax - d * ay);
}

export class Compositor {
  private readonly out: WritableComposite = { width: 0, height: 0, background: { r: 0, g: 0, b: 0, a: 1 }, layers: [] };
  private readonly mediaPool: WritableMediaLayer[] = [];
  private readonly solidPool: WritableSolidLayer[] = [];
  private readonly transitionPool: WritableTransitionLayer[] = [];
  private readonly textPool: WritableTextLayer[] = [];
  private readonly compoundPool: WritableCompoundLayer[] = [];
  private readonly shapePool: WritableShapeLayer[] = [];
  private readonly neighborPool: NeighborFrame[] = [];
  private readonly neighborList: NeighborFrame[] = [];
  private readonly upcomingPool: UpcomingText[] = [];
  private readonly upcomingList: UpcomingText[] = [];
  private readonly step = mutableIdentity();
  private readonly step2 = mutableIdentity();
  /** The last written picture's frame (visible part) in project px, and its rounded rectangle (null: no frame style). */
  private readonly frameMatrix = mutableIdentity();
  private frameShape: PictureShape | null = null;
  private readonly active: ActiveAnim = { anim: { id: "fade", duration: 1 }, phase: "in", progress: 0, length: 0 };
  private readonly cueAnim = newCueAnimState();
  private readonly captionTransform: Transform = { x: 0, y: 0, scale: 1, rotation: 0, anchor: { x: 0.5, y: 0.5 }, flipH: false, flipV: false };
  /** A keyed clip's transform at the frame (read before the next layer). */
  private readonly animated: Transform = { x: 0, y: 0, scale: 1, rotation: 0, anchor: { x: 0.5, y: 0.5 }, flipH: false, flipV: false };
  /** The crop, solid look, text motion and drawn transform of keyed clips at the frame (read before the next layer). */
  private readonly cropScratch: Crop = { left: 0, top: 0, right: 0, bottom: 0 };
  private readonly solidScratch = newSolidScratch();
  private readonly motion: TextMotion = newTextMotion(DEFAULT_TEXT_STYLE);
  private readonly scaledTransform: Transform = { x: 0, y: 0, scale: 1, rotation: 0, anchor: { x: 0.5, y: 0.5 }, flipH: false, flipV: false };
  /** Slate labels by clip (made again only when the name, reason, size or color changes, never per frame). */
  private readonly slateTexts = new Map<ClipId, SlateText>();

  /** `offline`: what offline media show; without it every media clip is drawn as online. */
  constructor(private readonly offline: OfflineSlates | null = null) {}

  /**
   * The document at `frame`, bottom track first, with `transforms` (a canvas gesture's or a field
   * scrub's), `opacities` (a field scrub's), `crops` (a crop handle drag's or a field scrub's), `texts`
   * (a Text field scrub's), `anims` (an Animation field scrub's), `captions` (the cue list's text,
   * a Caption style scrub's style) and `solids` (a Solid field scrub's or a size handle drag's looks) and `shapeEdits` (a Shape section scrub's clips)
   * replacing the clips' own. The result and its layers are reused by the next call: read it before
   * evaluating again.
   */
  evaluate(
    doc: Project,
    frame: Frame,
    transforms: ReadonlyMap<ClipId, Transform> | null = null,
    opacities: ReadonlyMap<ClipId, number> | null = null,
    crops: ReadonlyMap<ClipId, Crop> | null = null,
    texts: ReadonlyMap<ClipId, LiveText> | null = null,
    anims: ReadonlyMap<ClipId, LiveAnims> | null = null,
    captions: LiveCaptions | null = null,
    solids: ReadonlyMap<ClipId, SolidLook> | null = null,
    shapeEdits: ReadonlyMap<ClipId, ShapeClip> | null = null,
  ): Composite {
    const out = this.out;
    const { width, height, background } = doc.settings;
    out.width = width;
    out.height = height;
    out.background = background;
    out.layers.length = 0;
    let media = 0;
    let solidLayers = 0;
    let textLayers = 0;
    let transitions = 0;
    let compounds = 0;
    let shapes = 0;
    for (const track of doc.tracks) {
      // The caption track's cue (spec §10.5), unless the track is hidden.
      if (track.kind === "caption") {
        const layer = (this.textPool[textLayers] ??= newTextLayer());
        if (!track.hidden && this.writeCaption(layer, doc, track, frame, captions, transforms)) {
          out.layers.push(layer);
          textLayers += 1;
        }
        continue;
      }
      // Muted and hidden video tracks are not in the composite (spec §6.12).
      if (track.kind !== "video" || track.hidden || track.muted) continue;
      const index = trackIndex(doc, track);
      const clip = clipInIndex(index, frame);
      if (!clip?.enabled || clip.kind === "audio" || clip.kind === "caption") continue;
      // A frame of a transition (Batch 36): the track's two clips.
      const pair = (clip.kind === "video" || clip.kind === "image") && (clip.transitionIn || clip.transitionOut) ? transitionPair(index, clip, frame) : null;
      if (pair) {
        const { left, right } = pair;
        const transition = right.transitionIn as NonNullable<MediaClip["transitionIn"]>;
        const mix = transitionMix(transition, right.start, frame);
        if (transition.kind === "crossDissolve") {
          const layer = (this.transitionPool[transitions] ??= newTransitionLayer());
          const from = this.writeMediaAt(layer.from, doc, left, frame, track.id, transforms, opacities, crops);
          const to = this.writeMediaAt(layer.to, doc, right, frame, track.id + TRANSITION_SLOT, transforms, opacities, crops);
          if (from && to) {
            layer.trackId = track.id;
            layer.mix = mix;
            out.layers.push(layer);
            transitions += 1;
          } else if (from || to) {
            // A side with no picture (its media has no size yet): the other one alone.
            const single = (this.mediaPool[media] ??= newMediaLayer());
            copyMediaLayer(single, from ? layer.from : layer.to);
            out.layers.push(single);
            media += 1;
          }
        } else {
          // A dip (spec §9.4 "dip-to-color via opacity to a solid"): the outgoing clip up to the middle, then the incoming one.
          const shown = mix < 0.5 ? left : right;
          const amount = mix < 0.5 ? 2 * mix : 2 * (1 - mix);
          const layer = (this.mediaPool[media] ??= newMediaLayer());
          if (this.writeMediaAt(layer, doc, shown, frame, track.id, transforms, opacities, crops)) {
            out.layers.push(layer);
            media += 1;
            const dip = (this.solidPool[solidLayers] ??= newSolidLayer());
            for (let i = 0; i < 6; i++) dip.transform[i] = layer.transform[i] as number;
            copyColor(dip.color, transition.kind === "dipToWhite" ? WHITE : BLACK);
            dip.to = null;
            dip.shape = null;
            dip.opacity = clamp01(amount) * layer.opacity;
            out.layers.push(dip);
            solidLayers += 1;
          }
        }
        continue;
      }
      // The keyed values at the frame (the clip's own when unkeyed; `animated` is reused per layer).
      const rel = frame - clip.start;
      const transform = transforms?.get(clip.id) ?? animatedTransform(clip, rel, this.animated);
      const opacity = opacities?.get(clip.id) ?? animatedOpacity(clip, rel);
      if (clip.kind === "video" || clip.kind === "image") {
        const reason = this.offline?.label(clip.mediaId) ?? null;
        if (reason !== null && this.offline) {
          const slate = (this.solidPool[solidLayers] ??= newSolidLayer());
          const label = (this.textPool[textLayers] ??= newTextLayer());
          const drawn = this.writeSlate(slate, label, doc, clip, transform, opacity * fadeFactor(clip, frame), crops?.get(clip.id) ?? animatedCrop(clip.keyframes, clip.crop, rel, this.cropScratch), reason, this.offline.look());
          if (drawn > 0) {
            out.layers.push(slate);
            solidLayers += 1;
          }
          if (drawn > 1) {
            out.layers.push(label);
            textLayers += 1;
          }
          continue;
        }
        const layer = (this.mediaPool[media] ??= newMediaLayer());
        if (this.writeMedia(layer, doc, clip, frame, transform, opacity, crops?.get(clip.id) ?? animatedCrop(clip.keyframes, clip.crop, rel, this.cropScratch))) {
          // A framed picture (spec §21.7): its shadow below it and its outline above it, in its own quad.
          const framed = this.frameShape !== null && (clip.shadow !== undefined || clip.stroke !== undefined);
          if (framed && clip.shadow) {
            const shadow = (this.solidPool[solidLayers] ??= newSolidLayer());
            this.writeFrameLayer(shadow, layer, clip, "shadow", transform);
            out.layers.push(shadow);
            solidLayers += 1;
          }
          out.layers.push(layer);
          media += 1;
          if (framed && clip.stroke) {
            const outline = (this.solidPool[solidLayers] ??= newSolidLayer());
            this.writeFrameLayer(outline, layer, clip, "stroke", transform);
            out.layers.push(outline);
            solidLayers += 1;
          }
        }
      } else if (clip.kind === "compound") {
        const layer = (this.compoundPool[compounds] ??= this.newCompoundLayer());
        if (this.writeCompound(layer, doc, clip, frame, transform, opacity)) {
          out.layers.push(layer);
          compounds += 1;
        }
      } else if (clip.kind === "shape") {
        const layer = (this.shapePool[shapes] ??= newShapeLayer());
        if (this.writeShape(layer, doc, shapeEdits?.get(clip.id) ?? clip, transform, opacity * fadeFactor(clip, frame), rel)) {
          out.layers.push(layer);
          shapes += 1;
        }
      } else if (clip.kind === "solid") {
        const layer = (this.solidPool[solidLayers] ??= newSolidLayer());
        if (this.writeSolid(layer, doc, animatedSolidLook(clip, solids?.get(clip.id) ?? clip, rel, this.solidScratch), transform, opacity * fadeFactor(clip, frame))) {
          out.layers.push(layer);
          solidLayers += 1;
        }
      } else if (clip.kind === "text") {
        const layer = (this.textPool[textLayers] ??= newTextLayer());
        // Live transforms (a gesture) raster at their own scale; keyed ones at the largest they reach.
        const rasterScale = transforms?.has(clip.id) ? null : maxKeyedScale(clip.keyframes, clip.transform);
        const shown = texts?.get(clip.id) ?? clip;
        // Keyed font size, letter spacing and fill (Batch 60; not while the text is edited inline).
        const motion = ("editing" in shown && shown.editing) ? null : textMotion(clip.keyframes, shown.style, rel, this.motion);
        let drawn = transform;
        if (motion && motion.scale !== 1) {
          const scaled = this.scaledTransform;
          scaled.x = transform.x;
          scaled.y = transform.y;
          scaled.scale = transform.scale * motion.scale;
          scaled.scaleY = (transform.scaleY ?? transform.scale) * motion.scale;
          scaled.rotation = transform.rotation;
          scaled.anchor = transform.anchor;
          scaled.flipH = transform.flipH;
          scaled.flipV = transform.flipV;
          drawn = scaled;
        }
        if (this.writeText(layer, doc, clip, frame, drawn, opacity, shown, anims?.get(clip.id) ?? clip, rasterScale, motion, 0)) {
          out.layers.push(layer);
          textLayers += 1;
          if (motion?.styleB) {
            const second = (this.textPool[textLayers] ??= newTextLayer());
            if (this.writeText(second, doc, clip, frame, drawn, opacity, shown, anims?.get(clip.id) ?? clip, rasterScale, motion, 1)) {
              out.layers.push(second);
              textLayers += 1;
            }
          }
        }
      }
    }
    return out;
  }

  private newCompoundLayer(): WritableCompoundLayer {
    return { kind: "compound", trackId: "", clipId: "", sequenceId: "", model: mutableIdentity(), opacity: 1, width: 0, height: 0, scale: 1, inner: this.out, child: new Compositor(this.offline) };
  }

  /** A compound layer: the sequence at the inner frame (false when the sequence is missing). */
  private writeCompound(layer: WritableCompoundLayer, doc: Project, clip: CompoundClip, frame: Frame, transform: Transform, opacity: number): boolean {
    const sequence = doc.sequences?.[clip.sequenceId];
    if (!sequence) return false;
    const innerFrame = Math.min(sequence.duration - 1, Math.max(0, clip.offset + (frame - clip.start)));
    layer.inner = layer.child.evaluate(sequenceView(doc, sequence), innerFrame);
    const { w, h } = sequence.size;
    const m = multiplyInto(layer.model, writeModel(this.step, transform, w, h, doc.settings.width, doc.settings.height), setMat(this.step2, w, 0, 0, h, 0, 0));
    layer.trackId = clip.trackId;
    layer.clipId = clip.id;
    layer.sequenceId = clip.sequenceId;
    layer.width = w;
    layer.height = h;
    layer.scale = Math.max(Math.hypot(m[0], m[1]) / w, Math.hypot(m[2], m[3]) / h);
    // TODO(batch 72): blend mode and track matte of a compound clip.
    // TODO(batch 73): masks on a compound clip.
    // TODO(batch 74): the effect stack of a compound clip (applied to its target before it is drawn).
    layer.opacity = clamp01(opacity) * fadeFactor(clip, frame);
    return true;
  }

  /**
   * The edge frames of the media clips just before and after `frame` on each visible video track
   * (within NEIGHBOR_SECONDS): the frames a scrub across the next cut shows first. Reused like `evaluate`.
   */
  neighbors(doc: Project, frame: Frame): readonly NeighborFrame[] {
    this.neighborList.length = 0;
    const reach = secondsToFrames(NEIGHBOR_SECONDS, doc.settings.fps);
    for (const track of doc.tracks) {
      if (track.kind !== "video" || track.hidden || track.muted) continue;
      const index = trackIndex(doc, track);
      const at = lastClipStartingBy(index, frame);
      const current = index.clips[at];
      const covers = current !== undefined && frame < current.start + current.duration;
      const prev = covers ? index.clips[at - 1] : current;
      const next = index.clips[at + 1];
      if (prev) this.addNeighbor(doc, prev, prev.start + prev.duration - 1, frame, reach);
      if (next) this.addNeighbor(doc, next, next.start, frame, reach);
    }
    return this.neighborList;
  }

  /**
   * The text clips on visible video tracks showing in [`frame`, `frame` + `reach`) and the parts they
   * draw there (the layer raster, the atlas and background boxes of their animations): what the
   * preview rasterizes ahead of time (spec §10.4, P11). Reused like `evaluate`.
   */
  upcomingTexts(doc: Project, frame: Frame, reach: Frame): readonly UpcomingText[] {
    const list = this.upcomingList;
    list.length = 0;
    for (const track of doc.tracks) {
      if (track.kind !== "video" || track.hidden || track.muted) continue;
      const index = trackIndex(doc, track);
      for (let at = lastClipStartingBy(index, frame + reach - 1); at >= 0; at--) {
        const clip = index.clips[at] as Clip;
        if (clip.start + clip.duration <= frame) break;
        if (clip.kind !== "text" || !clip.enabled) continue;
        const scale = maxKeyedScale(clip.keyframes, clip.transform);
        if (!(scale > 0)) continue;
        // Keyed text: its raster is the largest size in each key color, the characters from the atlas when the spacing is keyed.
        const keyed = hasTextKeys(clip.keyframes);
        const size = maxKeyedFontSize(clip.keyframes, clip.style);
        const colors = keyed ? keyedFillColors(clip.keyframes) : [];
        const spaced = keyed && (clip.keyframes?.["style.letterSpacing"]?.length ?? 0) > 0;
        const variants = Math.max(1, colors.length);
        for (let v = 0; v < variants; v++) {
          const item = (this.upcomingPool[list.length] ??= { clipId: "", text: clip.text, style: clip.style, scale: 1, parts: [] });
          item.clipId = v === 0 ? clip.id : `${clip.id}${FILL_SLOT}${v}`;
          item.text = clip.text;
          item.style = keyed ? styleVariant(clip.style, size, colors[v] ?? null) : clip.style;
          item.scale = scale;
          item.parts.length = 0;
          item.parts.push("all");
          addAnimParts(item.parts, clip.animIn);
          addAnimParts(item.parts, clip.animOut);
          if (spaced && !item.parts.includes("char")) item.parts.push("char");
          if (item.parts.length > 1 && clip.style.background.enabled) item.parts.push("backgrounds");
          list.push(item);
        }
      }
    }
    const captions = doc.tracks.find((track) => track.kind === "caption");
    if (captions && !captions.hidden) this.upcomingCues(doc, captions, frame, reach);
    return list;
  }

  /** The cues showing in [`frame`, `frame` + `reach`): their raster, and with a highlight their word atlases. */
  private upcomingCues(doc: Project, track: Track, frame: Frame, reach: Frame): void {
    const index = trackIndex(doc, track);
    const trackStyle = captionStyle(doc, track.id);
    for (let at = lastClipStartingBy(index, frame + reach - 1); at >= 0; at--) {
      const cue = index.clips[at] as CaptionClip;
      if (cue.start + cue.duration <= frame) break;
      if (!cue.enabled || cue.text.trim() === "") continue;
      const style = effectiveCaptionStyle(trackStyle, cue.styleOverride);
      const look = captionLook(cue.text, style);
      const highlighting = (style.highlight.mode !== "none" || hasWordPaint(cue.words)) && cue.words !== undefined && cue.words.length > 0;
      const shown = highlighting ? look.inactive : look.style;
      const parts = this.upcomingItem(cue.id, look.content, shown).parts;
      if (!highlighting) continue;
      parts.push("word");
      const plan = captionPlan(textLayout(look.content, shown), look, style, cue.words as CaptionClip["words"] & object);
      // Word boxes are solids, not a raster.
      if (shown.background.enabled && plan.boxes === null) parts.push("backgrounds");
      for (const paint of plan.paints) if (paint.slot !== "") this.upcomingItem(cue.id + paint.slot, look.content, paint.style).parts.push("word");
    }
  }

  /** A pooled upcoming entry drawing `text` in `style` at scale 1, its parts `all` only for now. */
  private upcomingItem(clipId: ClipId, text: TextContent, style: TextStyle): UpcomingText {
    const list = this.upcomingList;
    const item = (this.upcomingPool[list.length] ??= { clipId: "", text, style, scale: 1, parts: [] });
    item.clipId = clipId;
    item.text = text;
    item.style = style;
    item.scale = 1;
    item.parts.length = 0;
    if (!clipId.endsWith(HIGHLIGHT_SLOT)) item.parts.push("all");
    list.push(item);
    return item;
  }

  private addNeighbor(doc: Project, clip: Clip, at: Frame, frame: Frame, reach: Frame): void {
    if (!clip.enabled || (clip.kind !== "video" && clip.kind !== "image") || Math.abs(at - frame) > reach) return;
    // An offline media has nothing to warm (its slate is drawn).
    if (this.offline?.label(clip.mediaId) != null) return;
    const list = this.neighborList;
    const neighbor = (this.neighborPool[list.length] ??= { mediaId: "", still: false, timeUs: 0 });
    neighbor.mediaId = clip.mediaId;
    const sequence = clip.kind === "image" && doc.media[clip.mediaId]?.sequence !== undefined;
    neighbor.still = clip.kind === "image" && !sequence;
    neighbor.timeUs = neighbor.still ? 0 : sequence ? imageTimeUs(clip, at, doc.settings.fps, doc.media[clip.mediaId]?.durationUs ?? 0) : sourceTimeUs(clip, at, doc.settings.fps);
    list.push(neighbor);
  }

  /**
   * A transition's clip at `frame` (inside its span or in its handle) on texture slot `slot`: its look at
   * its nearest own frame (keyed values, fades, live values of a gesture), its media past its edges.
   */
  private writeMediaAt(
    layer: WritableMediaLayer,
    doc: Project,
    clip: MediaClip,
    frame: Frame,
    slot: TrackId,
    transforms: ReadonlyMap<ClipId, Transform> | null,
    opacities: ReadonlyMap<ClipId, number> | null,
    crops: ReadonlyMap<ClipId, Crop> | null,
  ): boolean {
    const rel = Math.min(clip.duration - 1, Math.max(0, frame - clip.start));
    const transform = transforms?.get(clip.id) ?? animatedTransform(clip, rel, this.animated);
    const opacity = opacities?.get(clip.id) ?? animatedOpacity(clip, rel);
    if (!this.writeMedia(layer, doc, clip, frame, transform, opacity, crops?.get(clip.id) ?? animatedCrop(clip.keyframes, clip.crop, rel, this.cropScratch), true)) return false;
    layer.trackId = slot;
    return true;
  }

  /** `handles`: `frame` may be outside the clip (a transition): its media plays on past its in or out point. */
  private writeMedia(layer: WritableMediaLayer, doc: Project, clip: MediaClip, frame: Frame, transform: Transform, opacity: number, shownCrop: Crop, handles = false): boolean {
    const item = doc.media[clip.mediaId];
    if (!item?.width || !item.height) return false;
    // An offline side of a transition has no picture.
    if (handles && this.offline?.label(clip.mediaId) != null) return false;
    const rotation = item.rotation ?? 0;
    const quarter = rotation === 90 || rotation === 270;
    const shownWidth = quarter ? item.height : item.width;
    const shownHeight = quarter ? item.width : item.height;
    const { flipH, flipV } = transform;

    // The visible part of the shown (upright, flipped) media, then where it lies in the texture.
    const left = clamp01(shownCrop.left);
    const right = 1 - clamp01(shownCrop.right);
    const top = clamp01(shownCrop.top);
    const bottom = 1 - clamp01(shownCrop.bottom);
    if (right <= left || bottom <= top) return false;
    const pl = flipH ? 1 - right : left;
    const ph = flipH ? 1 - left : right;
    const ql = flipV ? 1 - bottom : top;
    const qh = flipV ? 1 - top : bottom;
    const crop = layer.crop;
    switch (rotation) {
      case 90:
        // Upright (p, q) = (1 - t, s).
        crop.u0 = ql;
        crop.u1 = qh;
        crop.v0 = 1 - ph;
        crop.v1 = 1 - pl;
        break;
      case 180:
        crop.u0 = 1 - ph;
        crop.u1 = 1 - pl;
        crop.v0 = 1 - qh;
        crop.v1 = 1 - ql;
        break;
      case 270:
        // Upright (p, q) = (t, 1 - s).
        crop.u0 = 1 - qh;
        crop.u1 = 1 - ql;
        crop.v0 = pl;
        crop.v1 = ph;
        break;
      default:
        crop.u0 = pl;
        crop.u1 = ph;
        crop.v0 = ql;
        crop.v1 = qh;
    }

    // Unit quad -> crop rectangle in texture UV -> upright UV -> flipped -> shown px -> project px.
    const m = setMat(layer.transform, crop.u1 - crop.u0, 0, 0, crop.v1 - crop.v0, crop.u0, crop.v0);
    const step = this.step;
    if (rotation === 90) multiplyInto(m, setMat(step, 0, 1, -1, 0, 1, 0), m);
    else if (rotation === 180) multiplyInto(m, setMat(step, -1, 0, 0, -1, 1, 1), m);
    else if (rotation === 270) multiplyInto(m, setMat(step, 0, -1, 1, 0, 0, 1), m);
    if (flipH || flipV) multiplyInto(m, setMat(step, flipH ? -1 : 1, 0, 0, flipV ? -1 : 1, flipH ? 1 : 0, flipV ? 1 : 0), m);
    multiplyInto(m, setMat(step, shownWidth, 0, 0, shownHeight, 0, 0), m);
    multiplyInto(m, writeModel(step, transform, shownWidth, shownHeight, doc.settings.width, doc.settings.height), m);

    // The picture's rounded rectangle (spec §21.7): the visible part in shown px at scale 1, its corners at most half the shorter side.
    const frameW = (right - left) * shownWidth;
    const frameH = (bottom - top) * shownHeight;
    const frameMatrix = this.frameMatrix;
    multiplyInto(frameMatrix, writeModel(step, transform, shownWidth, shownHeight, doc.settings.width, doc.settings.height), setMat(this.step2, frameW, 0, 0, frameH, left * shownWidth, top * shownHeight));
    const radius = Math.max(0, Math.min(animatedRadius(clip.keyframes, clip.cornerRadius ?? 0, frame - clip.start), frameW / 2, frameH / 2));
    if (radius > 0 || clip.stroke || clip.shadow) {
      const shape = layer.shapeValue;
      shape.width = frameW;
      shape.height = frameH;
      shape.radii[0] = shape.radii[1] = shape.radii[2] = shape.radii[3] = radius;
      layer.shape = radius > 0 ? shape : null;
      // Even with square corners the stroke and the shadow follow the box: they use the frame matrix.
      this.frameShape = shape;
    } else {
      layer.shape = null;
      this.frameShape = null;
    }

    layer.trackId = clip.trackId;
    layer.clipId = clip.id;
    layer.mediaId = clip.mediaId;
    // An image sequence (Batch 64) is decoded like a video: its frames come from the frame service.
    const sequence = clip.kind === "image" && item.sequence !== undefined;
    layer.still = clip.kind === "image" && !sequence;
    // An animated image or a sequence loops from its in point (a still has no duration: time 0).
    const fps = doc.settings.fps;
    layer.timeUs = layer.still || sequence ? imageTimeUs(clip, frame, fps, item.durationUs) : handles ? handleTimeUs(clip, frame, fps, item.durationUs) : sourceTimeUs(clip, frame, fps);
    layer.opacity = clamp01(opacity) * fadeFactor(clip, frame);
    return true;
  }

  /** `rasterScale`: the scale the raster is made at (the largest keyed scale), null for the transform's own. */
  private writeText(layer: WritableTextLayer, doc: Project, clip: TextClip, frame: Frame, transform: Transform, opacity: number, shown: LiveText, anims: LiveAnims, rasterScale: number | null = null, motion: TextMotion | null = null, pass: 0 | 1 = 0): boolean {
    const style = motion ? (pass === 1 ? (motion.styleB as TextStyle) : motion.style) : shown.style;
    const layout = textLayout(shown.text, style);
    const raster = layout.raster;
    if (!raster) return false;
    const m = writeModel(layer.model, transform, layout.width, layout.height, doc.settings.width, doc.settings.height);
    // Flips mirror the text inside its box.
    if (transform.flipH || transform.flipV) multiplyInto(m, m, setMat(this.step, transform.flipH ? -1 : 1, 0, 0, transform.flipV ? -1 : 1, transform.flipH ? layout.width : 0, transform.flipV ? layout.height : 0));
    const own = Math.max(Math.abs(transform.scale), Math.abs(transform.scaleY ?? transform.scale));
    // A layer scaled to 0 at this frame draws nothing; a keyed one keeps its raster's scale.
    if (!(own > 0)) return false;
    const scale = rasterScale !== null ? Math.max(own, rasterScale) : own;
    layer.trackId = clip.trackId;
    layer.clipId = pass === 1 ? clip.id + FILL_SLOT : clip.id;
    layer.text = shown.text;
    layer.style = style;
    layer.highlight = shown.highlight ?? null;
    layer.scale = scale;
    layer.detail = scale > 0 ? Math.min(MAX_TEXT_SCALE, TEXT_RASTER_MAX / Math.max(raster.width, raster.height)) / scale : 0;
    layer.opacity = clamp01(opacity) * fadeFactor(clip, frame) * (pass === 1 && motion ? motion.mix : 1);
    const active = shown.editing ? null : activeAnim({ duration: clip.duration, animIn: anims.animIn, animOut: anims.animOut }, frame - clip.start, this.active);
    layer.anim = active ? writeAnimFrame(layer.animFrame, active, layout, style) : null;
    // Keyed letter spacing: the characters move apart or together (an in or out animation playing wins).
    if (!layer.anim && motion && motion.spacing !== 0) layer.anim = writeSpacingFrame(layer.animFrame, layout, style, motion.spacing);
    layer.karaoke = null;
    return scale > 0;
  }

  /**
   * The caption track's cue at `frame` (spec §10.5): its text (or the cue list's or the inline editor's
   * live text) laid out in its effective style (spec §20.3: the track's, or a field scrub's, with the
   * cue's override on top; or the cue's live style), at the style's position (or where a canvas drag
   * has it), with its active word.
   */
  private writeCaption(layer: WritableTextLayer, doc: Project, track: Track, frame: Frame, live: LiveCaptions | null, transforms: ReadonlyMap<ClipId, Transform> | null): boolean {
    const cue = clipInIndex(trackIndex(doc, track), frame);
    if (cue?.kind !== "caption" || !cue.enabled) return false;
    const text = live?.texts?.get(cue.id) ?? cue.text;
    if (text.trim() === "") return false;
    const style = live?.cueStyles?.get(cue.id) ?? effectiveCaptionStyle(live?.styles?.get(track.id) ?? captionStyle(doc, track.id), cue.styleOverride);
    const look = captionLook(text, style);
    const words = cue.words;
    const edited = live?.editing?.cueId === cue.id ? live.editing : null;
    const highlighting = (style.highlight.mode !== "none" || hasWordPaint(words)) && words !== undefined && words.length > 0 && text === cue.text && !edited;
    const shown = highlighting ? look.inactive : look.style;
    const layout = textLayout(look.content, shown);
    const raster = layout.raster;
    if (!raster) return false;
    const transform = this.captionTransform;
    const moved = transforms?.get(cue.id);
    if (moved) {
      transform.x = moved.x;
      transform.y = moved.y;
      transform.anchor.y = moved.anchor.y;
    } else {
      const place = captionPlace(style, doc.settings.height);
      transform.x = place.x;
      transform.y = place.y;
      transform.anchor.y = place.anchorY;
    }
    // The cue's own in and out animations: the whole box (not while its text is edited).
    const anim = edited ? null : cueAnimAt(style.anim, frame - cue.start, cue.duration, this.cueAnim);
    if (anim?.active) {
      // About the box's middle, whatever its anchor.
      transform.y += (0.5 - transform.anchor.y) * layout.height + anim.dy * layout.height;
      transform.anchor.y = 0.5;
      transform.scale = anim.scale;
    } else transform.scale = 1;
    writeModel(layer.model, transform, layout.width, layout.height, doc.settings.width, doc.settings.height);
    layer.trackId = track.id;
    layer.clipId = cue.id;
    layer.text = look.content;
    layer.style = shown;
    layer.highlight = edited?.highlight ?? null;
    layer.scale = 1;
    layer.detail = Math.min(MAX_TEXT_SCALE, TEXT_RASTER_MAX / Math.max(raster.width, raster.height));
    layer.opacity = anim ? anim.opacity : 1;
    layer.anim = null;
    layer.karaoke = highlighting ? writeKaraoke(layer.karaokeFrame, look, layout, style, words, frame - cue.start) : null;
    return true;
  }

  /**
   * An offline clip's slate (spec §6.19): the slate color over the visible part of the media's shown
   * box (the frame's size without a record), and its label (the media's or the clip's name, then
   * `reason`) centered on it. Returns how many layers it wrote: 0 (cropped away), 1 (no label raster)
   * or 2.
   */
  private writeSlate(slate: WritableSolidLayer, label: WritableTextLayer, doc: Project, clip: MediaClip, transform: Transform, opacity: number, shownCrop: Crop, reason: string, look: SlateLook): number {
    const item = doc.media[clip.mediaId];
    const quarter = item?.rotation === 90 || item?.rotation === 270;
    const known = item?.width !== undefined && item.width > 0 && item.height !== undefined && item.height > 0;
    const width = known ? ((quarter ? item.height : item.width) as number) : doc.settings.width;
    const height = known ? ((quarter ? item.width : item.height) as number) : doc.settings.height;
    const x0 = clamp01(shownCrop.left) * width;
    const x1 = (1 - clamp01(shownCrop.right)) * width;
    const y0 = clamp01(shownCrop.top) * height;
    const y1 = (1 - clamp01(shownCrop.bottom)) * height;
    if (x1 <= x0 || y1 <= y0) return 0;
    const m = writeModel(slate.transform, transform, width, height, doc.settings.width, doc.settings.height);
    multiplyInto(m, m, setMat(this.step, x1 - x0, 0, 0, y1 - y0, x0, y0));
    copyColor(slate.color, look.fill);
    slate.to = null;
    slate.shape = null;
    slate.opacity = clamp01(opacity);

    const text = this.slateText(clip.id, item?.name ?? clip.name, reason, Math.min(x1 - x0, y1 - y0), x1 - x0, look);
    const layout = textLayout(text.content, text.style);
    const raster = layout.raster;
    if (!raster) return 1;
    const model = writeModel(label.model, transform, width, height, doc.settings.width, doc.settings.height);
    multiplyInto(model, model, setMat(this.step, 1, 0, 0, 1, (x0 + x1 - layout.width) / 2, (y0 + y1 - layout.height) / 2));
    const own = Math.max(Math.abs(transform.scale), Math.abs(transform.scaleY ?? transform.scale));
    if (!(own > 0)) return 1;
    label.trackId = clip.trackId;
    label.clipId = clip.id + OFFLINE_SLOT;
    label.text = text.content;
    label.style = text.style;
    label.highlight = null;
    label.scale = own;
    label.detail = Math.min(MAX_TEXT_SCALE, TEXT_RASTER_MAX / Math.max(raster.width, raster.height)) / own;
    label.opacity = clamp01(opacity);
    label.anim = null;
    label.karaoke = null;
    return 2;
  }

  /** A slate label's content and style: the default text face, centered, wrapping inside the slate. */
  private slateText(clipId: ClipId, name: string, reason: string, side: number, width: number, look: SlateLook): SlateText {
    const fontSize = Math.max(1, Math.round(side * look.textShare));
    const wrap = Math.max(1, Math.round(width * look.wrapShare));
    const color = look.text;
    const known = this.slateTexts.get(clipId);
    const style = known?.style;
    const fill = style?.fill;
    if (
      known &&
      style &&
      known.name === name &&
      known.reason === reason &&
      style.fontSize === fontSize &&
      style.fontWeight === look.weight &&
      style.lineHeight === look.lineHeight &&
      known.content.box.width === wrap &&
      fill &&
      isRgba(fill) &&
      fill.r === color.r &&
      fill.g === color.g &&
      fill.b === color.b &&
      fill.a === color.a
    ) {
      return known;
    }
    if (this.slateTexts.size > 64) this.slateTexts.clear();
    const shown = name.length > SLATE_NAME_MAX ? `${name.slice(0, SLATE_NAME_MAX - 1)}…` : name;
    const text: SlateText = { name, reason, content: textContent(`${shown}\n${reason}`, { mode: "fixed", width: wrap }), style: { ...DEFAULT_TEXT_STYLE, fontWeight: look.weight, fontSize, fill: { ...color }, lineHeight: look.lineHeight } };
    this.slateTexts.set(clipId, text);
    return text;
  }

  /**
   * A shape clip (spec §21.12): its view box placed like a solid's box (flips mirror the drawing), its
   * paths at the frame with their keyed trims, strokes, fills and primitive params.
   */
  private writeShape(layer: WritableShapeLayer, doc: Project, clip: ShapeClip, transform: Transform, opacity: number, rel: Frame): boolean {
    const { w, h } = clip.size;
    if (!(w > 0) || !(h > 0) || clip.paths.length === 0) return false;
    const m = writeModel(layer.model, transform, w, h, doc.settings.width, doc.settings.height);
    if (transform.flipH || transform.flipV) multiplyInto(m, m, setMat(this.step, transform.flipH ? -1 : 1, 0, 0, transform.flipV ? -1 : 1, transform.flipH ? w : 0, transform.flipV ? h : 0));
    layer.trackId = clip.trackId;
    layer.clipId = clip.id;
    layer.width = w;
    layer.height = h;
    layer.scale = Math.max(Math.hypot(m[0], m[1]), Math.hypot(m[2], m[3]));
    layer.opacity = clamp01(opacity);
    layer.paths = pathFramesAt(clip, rel, layer.scratch, layer.keyed);
    return true;
  }

  /** A solid in `look` (its own, or a live one): its size's box as its shape, in its color or gradient, with its stroke and shadow. */
  private writeSolid(layer: WritableSolidLayer, doc: Project, look: SolidLook, transform: Transform, opacity: number): boolean {
    const { fill, size } = look;
    if (!(size.w > 0) || !(size.h > 0)) return false;
    const m = writeModel(layer.transform, transform, size.w, size.h, doc.settings.width, doc.settings.height);
    multiplyInto(m, m, setMat(this.step, size.w, 0, 0, size.h, 0, 0));
    // Flips mirror the fill inside the box (a gradient turns upside down).
    if (transform.flipH || transform.flipV) multiplyInto(m, m, setMat(this.step, transform.flipH ? -1 : 1, 0, 0, transform.flipV ? -1 : 1, transform.flipH ? 1 : 0, transform.flipV ? 1 : 0));
    const stops = isGradientFill(fill);
    copyColor(layer.color, isRgba(fill) ? fill : stops ? (fill.stops[0]?.color ?? BLACK) : (fill as { from: RGBA }).from);
    layer.to = isRgba(fill) || stops ? null : copyColor(layer.toValue, (fill as { to: RGBA }).to);
    const shape = (layer.shape = layer.shapeValue);
    shape.kind = look.shape === "ellipse" ? "ellipse" : "box";
    shape.width = size.w;
    shape.height = size.h;
    shape.radius = drawnRadius(look);
    const radii = drawnRadii(look);
    for (let i = 0; i < 4; i++) layer.radiiValue[i] = radii[i] as number;
    shape.radii = layer.radiiValue;
    layer.opacity = clamp01(opacity);
    if (stops || look.stroke || look.shadow) {
      const style = layer.styleValue;
      style.gradient = stops ? fill : null;
      style.stroke = look.stroke ?? null;
      style.shadow = look.shadow ? this.mirroredShadow(layer.shadowValue, look.shadow, transform) : null;
      style.part = "all";
      layer.style = style;
    } else layer.style = null;
    return true;
  }

  /** `shadow` for a layer drawn with `transform`: its offset stays on the same side of a mirrored layer. */
  private mirroredShadow(out: ShadowStyle, shadow: ShadowStyle, transform: Transform): ShadowStyle {
    out.x = transform.flipH ? -shadow.x : shadow.x;
    out.y = transform.flipV ? -shadow.y : shadow.y;
    out.blur = shadow.blur;
    out.spread = shadow.spread;
    out.color = shadow.color;
    return out;
  }

  /** The shadow (`part` "shadow") or the outline ("stroke") of the picture just written to `picture`, in its visible frame. */
  private writeFrameLayer(layer: WritableSolidLayer, picture: WritableMediaLayer, clip: MediaClip, part: "shadow" | "stroke", transform: Transform): void {
    const frame = this.frameShape as PictureShape;
    for (let i = 0; i < 6; i++) layer.transform[i] = this.frameMatrix[i] as number;
    copyColor(layer.color, BLACK_CLEAR);
    layer.to = null;
    const shape = (layer.shape = layer.shapeValue);
    shape.kind = "box";
    shape.width = frame.width;
    shape.height = frame.height;
    shape.radius = frame.radii[0];
    for (let i = 0; i < 4; i++) layer.radiiValue[i] = frame.radii[i] as number;
    shape.radii = layer.radiiValue;
    layer.opacity = picture.opacity;
    const style = layer.styleValue;
    style.gradient = null;
    style.stroke = part === "stroke" ? (clip.stroke ?? null) : null;
    style.shadow = part === "shadow" && clip.shadow ? this.mirroredShadow(layer.shadowValue, clip.shadow, transform) : null;
    style.part = part;
    layer.style = style;
  }
}

function newMediaLayer(): WritableMediaLayer {
  const shapeValue: PictureShape = { width: 0, height: 0, radii: [0, 0, 0, 0] };
  return { kind: "media", trackId: "", clipId: "", mediaId: "", still: false, timeUs: 0, transform: mutableIdentity(), opacity: 1, crop: { u0: 0, v0: 0, u1: 1, v1: 1 }, shape: null, shapeValue };
}

function newTextLayer(): WritableTextLayer {
  return {
    kind: "text",
    trackId: "",
    clipId: "",
    model: mutableIdentity(),
    opacity: 1,
    text: textContent(""),
    style: DEFAULT_TEXT_STYLE,
    scale: 1,
    detail: 1,
    highlight: null,
    anim: null,
    animFrame: { atlas: "block", units: [], background: 1 },
    karaoke: null,
    karaokeFrame: {
      style: DEFAULT_TEXT_STYLE,
      slot: HIGHLIGHT_SLOT,
      from: 0,
      to: 0,
      scale: 1,
      ox: 0,
      oy: 0,
      box: null,
      boxValue: { rect: { x: 0, y: 0, width: 0, height: 0 }, color: { r: 0, g: 0, b: 0, a: 0 }, radius: 0 },
      paints: null,
      unitPaint: [],
      wordBoxes: null,
      wordBoxesValue: { rects: [], shown: [], active: -1, activeColor: { r: 0, g: 0, b: 0, a: 0 }, style: DEFAULT_TEXT_STYLE.background },
    },
  };
}

/** The default caption style per project settings (a caption track without data). */
const defaultStyles = new WeakMap<Project["settings"], CaptionStyle>();

/** The style of the caption track `trackId`. */
function captionStyle(doc: Project, trackId: TrackId): CaptionStyle {
  const style = doc.captionTracks[trackId]?.style;
  if (style) return style;
  let fallback = defaultStyles.get(doc.settings);
  if (!fallback) {
    fallback = defaultCaptionStyle(doc.settings);
    defaultStyles.set(doc.settings, fallback);
  }
  return fallback;
}

/**
 * The words of a cue at `rel` frames into it (spec §10.5, §21.8), into `out`: the active word (units,
 * look, growth, box), and with a stateful plan each other word's paint (`unitPaint`): the spoken ones
 * lit in the progressive and reveal modes, the upcoming ones hidden in reveal, a word's own or emphasis
 * color always. Null when nothing differs from the cue's own look.
 */
function writeKaraoke(out: WritableKaraoke, look: CaptionLook, layout: TextLayout, style: CaptionStyle, words: CaptionClip["words"] & object, rel: Frame): CaptionHighlightFrame | null {
  const plan = captionPlan(layout, look, style, words);
  const index = activeWordIndex(words, rel);
  const unit = index === -1 ? null : (plan.units[index] ?? null);
  if (!unit && !plan.stateful) return null;
  const mode = style.highlight.mode;
  if (unit) {
    const paint = plan.paints[plan.lit[index] as number] as (typeof plan.paints)[number];
    out.style = paint.style;
    out.slot = paint.slot === "" ? HIGHLIGHT_SLOT : paint.slot;
    out.from = unit.from;
    out.to = unit.to;
    out.scale = mode === "scale" || mode === "colorAndScale" ? HIGHLIGHT_SCALE : 1;
    out.ox = unit.ox;
    out.oy = unit.oy;
  } else {
    out.style = look.inactive;
    out.slot = HIGHLIGHT_SLOT;
    out.from = 0;
    out.to = 0;
    out.scale = 1;
    out.ox = 0;
    out.oy = 0;
  }
  const boxes = plan.boxes;
  if (mode === "background" && unit && boxes === null) {
    const box = out.boxValue;
    box.rect = unit.box;
    box.color = style.highlight.color;
    // A pill behind the word.
    box.radius = unit.box.height / 2;
    out.box = box;
  } else out.box = null;
  if (!plan.stateful) {
    out.paints = null;
    out.wordBoxes = null;
    return out;
  }
  // Per atlas unit: its word's paint, the layer's own for text no word covers.
  const unitPaint = out.unitPaint;
  const count = plan.units.reduce((n, u) => Math.max(n, u?.to ?? 0), 0);
  unitPaint.length = count;
  unitPaint.fill(0);
  const reveals = mode === "reveal";
  const progressive = mode === "progressive" || reveals;
  const shown = out.wordBoxesValue.shown;
  shown.length = 0;
  for (let i = 0; i < words.length; i++) {
    const at = plan.units[i];
    if (!at) continue;
    const word = words[i] as CaptionWord;
    const spoken = progressive && rel >= word.start;
    const paint = i === index ? 0 : spoken ? (plan.lit[i] as number) : reveals ? -1 : (plan.dim[i] as number);
    for (let u = at.from; u < at.to; u++) unitPaint[u] = paint;
    if (boxes && boxes[i] && (i === index || !reveals || spoken)) shown.push(i);
  }
  out.paints = plan.paints;
  if (boxes) {
    const value = out.wordBoxesValue;
    value.rects = boxes;
    value.active = mode === "background" && unit ? index : -1;
    value.activeColor = style.highlight.color;
    value.style = look.style.background;
    out.wordBoxes = value;
  } else out.wordBoxes = null;
  return out;
}

/** The atlas an animation draws from: none for the whole text, lines for a typewriter's characters. */
export function animAtlas(anim: TextAnim): "block" | AtlasUnitKind {
  const unit = animUnit(anim);
  return anim.id === "typewriter" && unit === "char" ? "line" : unit;
}

function addAnimParts(parts: TextPart[], anim: TextAnim | undefined): void {
  if (!isPlayable(anim)) return;
  const atlas = animAtlas(anim);
  if (atlas !== "block" && !parts.includes(atlas)) parts.push(atlas);
}

/** `out`'s states, `count` of them (made once, reused). */
function unitStates(out: WritableAnimFrame, count: number): UnitState[] {
  const units = out.units;
  while (units.length < count) units.push(newUnitState());
  units.length = count;
  return units;
}

/** What `active` does to a text laid out as `layout` (spec §10.4), into `out`. */
function writeAnimFrame(out: WritableAnimFrame, active: ActiveAnim, layout: TextLayout, style: TextStyle): TextAnimFrame {
  const { anim, phase, progress, length } = active;
  const em = style.fontSize;
  const atlas = animAtlas(anim);
  out.atlas = atlas;
  out.background = 1;
  if (atlas === "block") {
    const state = unitStates(out, 1)[0] as UnitState;
    writeUnitShape(state, anim.id, phase, presence(anim, phase, progress), em, layout.block.height);
    state.ox = layout.block.x + layout.block.width / 2;
    state.oy = layout.block.y + layout.block.height / 2;
    state.cut = Infinity;
    return out;
  }
  const units = layoutUnits(layout, style, atlas);
  const states = unitStates(out, units.length);
  if (anim.id === "typewriter" && animUnit(anim) === "char") {
    // Characters typed by count, cut out of their lines.
    const { stops, before, total } = layoutStops(layout, style);
    const typed = typedCount(phase, progress, total);
    for (let i = 0; i < units.length; i++) {
      const unit = units[i] as (typeof units)[number];
      const state = resetUnitState(states[i] as UnitState);
      const lineStops = stops[unit.line] ?? [];
      const graphemes = lineStops.length - 1;
      const revealed = Math.min(graphemes, Math.max(0, typed - (before[unit.line] ?? 0)));
      state.opacity = revealed > 0 ? 1 : 0;
      state.cut = revealed >= graphemes ? Infinity : (lineStops[revealed] as number);
      state.ox = unit.originX;
      state.oy = unit.originY;
    }
    out.background = typed > 0 ? 1 : 0;
    return out;
  }
  const typed = anim.id === "typewriter" ? typedCount(phase, progress, units.length) : 0;
  let shown = 0;
  for (let i = 0; i < units.length; i++) {
    const unit = units[i] as (typeof units)[number];
    const state = states[i] as UnitState;
    if (anim.id === "typewriter") {
      resetUnitState(state);
      state.opacity = i < typed ? 1 : 0;
    } else {
      writeUnitShape(state, anim.id, phase, presence(anim, phase, unitProgress(anim, phase, progress, i, units.length, length)), em, unit.rect.height);
      state.cut = Infinity;
    }
    state.ox = unit.originX;
    state.oy = unit.originY;
    shown = Math.max(shown, state.opacity);
  }
  out.background = shown;
  return out;
}

/** Per layout: each character unit's place in its line and the number of characters of that line (cached). */
const spacingPlaces = new WeakMap<TextLayout, { index: number[]; count: number[] }>();

/**
 * A text with its letters `delta` px further apart (spec §21.9, keyed letter spacing): every character of
 * the atlas moves by its place in its line times `delta`, less the line's alignment shift (half of the
 * line's change for a centered one, all of it for a right-aligned one).
 */
function writeSpacingFrame(out: WritableAnimFrame, layout: TextLayout, style: TextStyle, delta: number): TextAnimFrame {
  const units = layoutUnits(layout, style, "char");
  let places = spacingPlaces.get(layout);
  if (!places) {
    const index: number[] = [];
    const count: number[] = [];
    const lengths = new Map<number, number>();
    for (const unit of units) {
      const line = layout.lines[unit.line];
      let before = 0;
      if (line) for (let i = 0; i < unit.offset; i++) before += (line.text.charCodeAt(i) & 0xfc00) === 0xdc00 ? 0 : 1;
      index.push(before);
      if (line && !lengths.has(unit.line)) {
        let total = 0;
        for (let i = 0; i < line.text.length; i++) total += (line.text.charCodeAt(i) & 0xfc00) === 0xdc00 ? 0 : 1;
        lengths.set(unit.line, total);
      }
    }
    for (const unit of units) count.push(lengths.get(unit.line) ?? 1);
    places = { index, count };
    spacingPlaces.set(layout, places);
  }
  out.atlas = "char";
  out.background = 1;
  const states = unitStates(out, units.length);
  const shift = style.align === "center" ? 0.5 : style.align === "right" ? 1 : 0;
  for (let i = 0; i < units.length; i++) {
    const unit = units[i] as (typeof units)[number];
    const state = resetUnitState(states[i] as UnitState);
    state.x = delta * ((places.index[i] as number) - shift * ((places.count[i] as number) - 1));
    state.ox = unit.originX;
    state.oy = unit.originY;
  }
  return out;
}

function newShapeLayer(): WritableShapeLayer {
  return { kind: "shape", trackId: "", clipId: "", model: mutableIdentity(), opacity: 1, width: 0, height: 0, scale: 1, paths: [], keyed: [], scratch: [] };
}

function newSolidLayer(): WritableSolidLayer {
  const shapeValue: SolidGeometry = { kind: "box", width: 0, height: 0, radius: 0 };
  const styleValue: SolidStyle = { gradient: null, stroke: null, shadow: null, part: "all" };
  return {
    kind: "solid",
    transform: mutableIdentity(),
    opacity: 1,
    color: { r: 0, g: 0, b: 0, a: 1 },
    to: null,
    toValue: { r: 0, g: 0, b: 0, a: 1 },
    shape: shapeValue,
    shapeValue,
    style: null,
    styleValue,
    shadowValue: { x: 0, y: 0, blur: 0, spread: 0, color: BLACK },
    radiiValue: [0, 0, 0, 0],
  };
}

function newTransitionLayer(): WritableTransitionLayer {
  return { kind: "dissolve", trackId: "", from: newMediaLayer(), to: newMediaLayer(), mix: 0 };
}

const BLACK: RGBA = { r: 0, g: 0, b: 0, a: 1 };
const BLACK_CLEAR: RGBA = { r: 0, g: 0, b: 0, a: 0 };
const WHITE: RGBA = { r: 1, g: 1, b: 1, a: 1 };

function copyMediaLayer(out: WritableMediaLayer, from: MediaLayer): void {
  out.trackId = from.trackId;
  out.clipId = from.clipId;
  out.mediaId = from.mediaId;
  out.still = from.still;
  out.timeUs = from.timeUs;
  for (let i = 0; i < 6; i++) out.transform[i] = from.transform[i] as number;
  out.opacity = from.opacity;
  out.crop.u0 = from.crop.u0;
  out.crop.v0 = from.crop.v0;
  out.crop.u1 = from.crop.u1;
  out.crop.v1 = from.crop.v1;
  out.shape = null;
}

/**
 * The two clips of the transition `clip` is part of at `frame` (its transition in over its first frames,
 * its transition out over its last ones): both picture clips, enabled, abutting, with matching halves.
 */
function transitionPair(index: TrackIndex, clip: MediaClip, frame: Frame): { left: MediaClip; right: MediaClip } | null {
  const at = lastClipStartingBy(index, frame);
  let left: Clip | undefined;
  let right: Clip | undefined;
  if (clip.transitionIn && frame < clip.start + clip.transitionIn.after) {
    left = index.clips[at - 1];
    right = clip;
  } else if (clip.transitionOut && frame >= clip.start + clip.duration - clip.transitionOut.before) {
    left = clip;
    right = index.clips[at + 1];
  }
  if (!left || !right || (left.kind !== "video" && left.kind !== "image") || (right.kind !== "video" && right.kind !== "image")) return null;
  if (!left.enabled || !right.enabled || left.start + left.duration !== right.start || left.transitionOut?.id !== right.transitionIn?.id) return null;
  return { left, right };
}

function copyColor(out: RGBA, color: RGBA): RGBA {
  out.r = color.r;
  out.g = color.g;
  out.b = color.b;
  out.a = color.a;
  return out;
}

