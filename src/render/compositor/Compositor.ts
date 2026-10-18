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
// Layer structs and arrays are reused between frames; evaluating allocates nothing once warm.
import { isRgba } from "../../core/document/color.js";
import { animatedOpacity, animatedTransform, maxKeyedScale } from "../../core/document/keyframes.js";
import { framesToSourceUs, secondsToFrames } from "../../core/document/time.js";
import { handleTimeUs, transitionMix } from "../../core/document/transitions.js";
import type { CaptionClip, CaptionStyle, Clip, ClipId, Crop, Frame, MediaClip, MediaId, Project, RGBA, TextAnim, TextClip, TextContent, TextStyle, Track, TrackId, Transform } from "../../core/document/types.js";
import { activeWordIndex, captionPlace, defaultCaptionStyle } from "../../text/captions.js";
import { activeAnim, animUnit, isPlayable, newUnitState, presence, resetUnitState, typedCount, unitProgress, writeUnitShape, type ActiveAnim, type UnitState } from "../../text/anim.js";
import { clipInIndex, lastClipStartingBy, trackIndex, type TrackIndex } from "../../timeline/model/queries.js";
import { multiplyInto, mutableIdentity, setMat, type MutableMat3 } from "../mat3.js";
import { DEFAULT_TEXT_STYLE, textContent } from "../../text/style.js";
import type { AtlasUnitKind } from "../text/atlas.js";
import { layoutStops, layoutUnits } from "../text/animUnits.js";
import type { TextLayout } from "../text/layout.js";
import { textLayout } from "../text/layoutCache.js";
import { captionLook, HIGHLIGHT_SCALE, highlightUnits, type CaptionLook } from "../text/captionLayout.js";
import { TEXT_RASTER_MAX, type TextHighlight } from "../text/raster.js";
import { MAX_TEXT_SCALE, type TextPart } from "../text/TextRasterCache.js";
import { imageTimeUs } from "../../media/decode/animation.js";
import { drawnRadius, type SolidLook } from "../../timeline/edit/solid.js";
import { HIGHLIGHT_SLOT, TRANSITION_SLOT, type CaptionHighlightFrame, type Composite, type CompositeLayer, type MediaLayer, type SolidGeometry, type SolidLayer, type TextAnimFrame, type TextCompositeLayer, type TransitionCompositeLayer } from "./drawList.js";

/** How far from the playhead the clips next to it count as cut neighbours (seconds). */
export const NEIGHBOR_SECONDS = 2;

/** What offline media clips show (spec §6.19, Batch 41). */
export interface OfflineSlates {
  /** The slate's second line for an offline media (why it is offline), or null when it is online. */
  label(mediaId: MediaId): string | null;
  /** The slate's colors (the theme's). */
  look(): { fill: RGBA; text: RGBA };
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
/** The slate label's size, as a share of the slate's shorter visible side; its wrap width, of the visible width. */
const SLATE_TEXT_SHARE = 0.045;
const SLATE_WRAP_SHARE = 0.86;
/** Names longer than this are cut with an ellipsis on the slate. */
const SLATE_NAME_MAX = 60;

type WritableMediaLayer = Omit<MediaLayer, "transform"> & { transform: MutableMat3 };
type WritableSolidLayer = Omit<SolidLayer, "transform" | "color" | "to" | "shape"> & { transform: MutableMat3; color: RGBA; to: RGBA | null; toValue: RGBA; shape: SolidGeometry | null; shapeValue: SolidGeometry };
type WritableTransitionLayer = Omit<TransitionCompositeLayer, "from" | "to"> & { from: WritableMediaLayer; to: WritableMediaLayer };
type WritableAnimFrame = { atlas: TextAnimFrame["atlas"]; units: UnitState[]; background: number };
type WritableKaraoke = Omit<CaptionHighlightFrame, "box"> & { box: CaptionHighlightFrame["box"]; boxValue: NonNullable<CaptionHighlightFrame["box"]> };
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
  private readonly neighborPool: NeighborFrame[] = [];
  private readonly neighborList: NeighborFrame[] = [];
  private readonly upcomingPool: UpcomingText[] = [];
  private readonly upcomingList: UpcomingText[] = [];
  private readonly step = mutableIdentity();
  private readonly active: ActiveAnim = { anim: { id: "fade", duration: 1 }, phase: "in", progress: 0, length: 0 };
  private readonly captionTransform: Transform = { x: 0, y: 0, scale: 1, rotation: 0, anchor: { x: 0.5, y: 0.5 }, flipH: false, flipV: false };
  /** A keyed clip's transform at the frame (read before the next layer). */
  private readonly animated: Transform = { x: 0, y: 0, scale: 1, rotation: 0, anchor: { x: 0.5, y: 0.5 }, flipH: false, flipV: false };
  /** Slate labels by clip (made again only when the name, reason, size or color changes, never per frame). */
  private readonly slateTexts = new Map<ClipId, SlateText>();

  /** `offline`: what offline media show; without it every media clip is drawn as online. */
  constructor(private readonly offline: OfflineSlates | null = null) {}

  /**
   * The document at `frame`, bottom track first, with `transforms` (a canvas gesture's or a field
   * scrub's), `opacities` (a field scrub's), `crops` (a crop handle drag's or a field scrub's), `texts`
   * (a Text field scrub's), `anims` (an Animation field scrub's), `captions` (the cue list's text,
   * a Caption style scrub's style) and `solids` (a Solid field scrub's or a size handle drag's looks)
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
    for (const track of doc.tracks) {
      // The caption track's cue (spec §10.5), unless the track is hidden.
      if (track.kind === "caption") {
        const layer = (this.textPool[textLayers] ??= newTextLayer());
        if (!track.hidden && this.writeCaption(layer, doc, track, frame, captions)) {
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
        if (reason !== null) {
          const slate = (this.solidPool[solidLayers] ??= newSolidLayer());
          const label = (this.textPool[textLayers] ??= newTextLayer());
          const drawn = this.writeSlate(slate, label, doc, clip, transform, opacity * fadeFactor(clip, frame), crops?.get(clip.id) ?? clip.crop, reason);
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
        if (this.writeMedia(layer, doc, clip, frame, transform, opacity, crops?.get(clip.id) ?? clip.crop)) {
          out.layers.push(layer);
          media += 1;
        }
      } else if (clip.kind === "solid") {
        const layer = (this.solidPool[solidLayers] ??= newSolidLayer());
        if (this.writeSolid(layer, doc, solids?.get(clip.id) ?? clip, transform, opacity * fadeFactor(clip, frame))) {
          out.layers.push(layer);
          solidLayers += 1;
        }
      } else if (clip.kind === "text") {
        const layer = (this.textPool[textLayers] ??= newTextLayer());
        // Live transforms (a gesture) raster at their own scale; keyed ones at the largest they reach.
        const rasterScale = transforms?.has(clip.id) ? null : maxKeyedScale(clip.keyframes, clip.transform);
        if (this.writeText(layer, doc, clip, frame, transform, opacity, texts?.get(clip.id) ?? clip, anims?.get(clip.id) ?? clip, rasterScale)) {
          out.layers.push(layer);
          textLayers += 1;
        }
      }
    }
    return out;
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
        const item = (this.upcomingPool[list.length] ??= { clipId: "", text: clip.text, style: clip.style, scale: 1, parts: [] });
        item.clipId = clip.id;
        item.text = clip.text;
        item.style = clip.style;
        item.scale = scale;
        item.parts.length = 0;
        item.parts.push("all");
        addAnimParts(item.parts, clip.animIn);
        addAnimParts(item.parts, clip.animOut);
        if (item.parts.length > 1 && clip.style.background.enabled) item.parts.push("backgrounds");
        list.push(item);
      }
    }
    const captions = doc.tracks.find((track) => track.kind === "caption");
    if (captions && !captions.hidden) this.upcomingCues(doc, captions, frame, reach);
    return list;
  }

  /** The cues showing in [`frame`, `frame` + `reach`): their raster, and with a highlight their word atlases. */
  private upcomingCues(doc: Project, track: Track, frame: Frame, reach: Frame): void {
    const index = trackIndex(doc, track);
    const style = captionStyle(doc, track.id);
    for (let at = lastClipStartingBy(index, frame + reach - 1); at >= 0; at--) {
      const cue = index.clips[at] as CaptionClip;
      if (cue.start + cue.duration <= frame) break;
      if (!cue.enabled || cue.text.trim() === "") continue;
      const look = captionLook(cue.text, style);
      const highlighting = style.highlight.mode !== "none" && cue.words !== undefined && cue.words.length > 0;
      const shown = highlighting ? look.inactive : look.style;
      const parts = this.upcomingItem(cue.id, look.content, shown).parts;
      if (!highlighting) continue;
      parts.push("word");
      if (shown.background.enabled) parts.push("backgrounds");
      this.upcomingItem(cue.id + HIGHLIGHT_SLOT, look.content, look.active).parts.push("word");
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
    neighbor.still = clip.kind === "image";
    neighbor.timeUs = neighbor.still ? 0 : sourceTimeUs(clip, at, doc.settings.fps);
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
    if (!this.writeMedia(layer, doc, clip, frame, transform, opacity, crops?.get(clip.id) ?? clip.crop, true)) return false;
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

    layer.trackId = clip.trackId;
    layer.clipId = clip.id;
    layer.mediaId = clip.mediaId;
    layer.still = clip.kind === "image";
    // An animated image loops from its in point (a still has no duration: time 0).
    const fps = doc.settings.fps;
    layer.timeUs = layer.still ? imageTimeUs(clip, frame, fps, item.durationUs) : handles ? handleTimeUs(clip, frame, fps, item.durationUs) : sourceTimeUs(clip, frame, fps);
    layer.opacity = clamp01(opacity) * fadeFactor(clip, frame);
    return true;
  }

  /** `rasterScale`: the scale the raster is made at (the largest keyed scale), null for the transform's own. */
  private writeText(layer: WritableTextLayer, doc: Project, clip: TextClip, frame: Frame, transform: Transform, opacity: number, shown: LiveText, anims: LiveAnims, rasterScale: number | null = null): boolean {
    const layout = textLayout(shown.text, shown.style);
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
    layer.clipId = clip.id;
    layer.text = shown.text;
    layer.style = shown.style;
    layer.highlight = shown.highlight ?? null;
    layer.scale = scale;
    layer.detail = scale > 0 ? Math.min(MAX_TEXT_SCALE, TEXT_RASTER_MAX / Math.max(raster.width, raster.height)) / scale : 0;
    layer.opacity = clamp01(opacity) * fadeFactor(clip, frame);
    const active = shown.editing ? null : activeAnim({ duration: clip.duration, animIn: anims.animIn, animOut: anims.animOut }, frame - clip.start, this.active);
    layer.anim = active ? writeAnimFrame(layer.animFrame, active, layout, shown.style) : null;
    layer.karaoke = null;
    return scale > 0;
  }

  /**
   * The caption track's cue at `frame` (spec §10.5): its text (or the cue list's live text) laid out in
   * the track's style (or a field scrub's), centered at the style's position, with its active word.
   */
  private writeCaption(layer: WritableTextLayer, doc: Project, track: Track, frame: Frame, live: LiveCaptions | null): boolean {
    const cue = clipInIndex(trackIndex(doc, track), frame);
    if (cue?.kind !== "caption" || !cue.enabled) return false;
    const text = live?.texts?.get(cue.id) ?? cue.text;
    if (text.trim() === "") return false;
    // TODO(batch 53): the cue's style override over the track's style (spec §20.3).
    const style = live?.styles?.get(track.id) ?? captionStyle(doc, track.id);
    const look = captionLook(text, style);
    const words = cue.words;
    const highlighting = style.highlight.mode !== "none" && words !== undefined && words.length > 0 && text === cue.text;
    const shown = highlighting ? look.inactive : look.style;
    const layout = textLayout(look.content, shown);
    const raster = layout.raster;
    if (!raster) return false;
    const place = captionPlace(style, doc.settings.height);
    const transform = this.captionTransform;
    transform.y = place.y;
    transform.anchor.y = place.anchorY;
    writeModel(layer.model, transform, layout.width, layout.height, doc.settings.width, doc.settings.height);
    layer.trackId = track.id;
    layer.clipId = cue.id;
    layer.text = look.content;
    layer.style = shown;
    layer.highlight = null;
    layer.scale = 1;
    layer.detail = Math.min(MAX_TEXT_SCALE, TEXT_RASTER_MAX / Math.max(raster.width, raster.height));
    layer.opacity = 1;
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
  private writeSlate(slate: WritableSolidLayer, label: WritableTextLayer, doc: Project, clip: MediaClip, transform: Transform, opacity: number, shownCrop: Crop, reason: string): number {
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
    const look = this.offline?.look() ?? { fill: BLACK, text: WHITE };
    const m = writeModel(slate.transform, transform, width, height, doc.settings.width, doc.settings.height);
    multiplyInto(m, m, setMat(this.step, x1 - x0, 0, 0, y1 - y0, x0, y0));
    copyColor(slate.color, look.fill);
    slate.to = null;
    slate.shape = null;
    slate.opacity = clamp01(opacity);

    const text = this.slateText(clip.id, item?.name ?? clip.name, reason, Math.min(x1 - x0, y1 - y0), x1 - x0, look.text);
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
  private slateText(clipId: ClipId, name: string, reason: string, side: number, width: number, color: RGBA): SlateText {
    const fontSize = Math.max(1, Math.round(side * SLATE_TEXT_SHARE));
    const wrap = Math.max(1, Math.round(width * SLATE_WRAP_SHARE));
    const known = this.slateTexts.get(clipId);
    const fill = known?.style.fill;
    if (known && known.name === name && known.reason === reason && known.style.fontSize === fontSize && known.content.box.width === wrap && fill && isRgba(fill) && fill.r === color.r && fill.g === color.g && fill.b === color.b && fill.a === color.a) return known;
    if (this.slateTexts.size > 64) this.slateTexts.clear();
    const shown = name.length > SLATE_NAME_MAX ? `${name.slice(0, SLATE_NAME_MAX - 1)}…` : name;
    const text: SlateText = { name, reason, content: textContent(`${shown}\n${reason}`, { mode: "fixed", width: wrap }), style: { ...DEFAULT_TEXT_STYLE, fontWeight: 600, fontSize, fill: { ...color }, lineHeight: 1.3 } };
    this.slateTexts.set(clipId, text);
    return text;
  }

  /** A solid in `look` (its own, or a live one): its size's box as its shape, in its color or gradient. */
  private writeSolid(layer: WritableSolidLayer, doc: Project, look: SolidLook, transform: Transform, opacity: number): boolean {
    const { fill, size } = look;
    if (!(size.w > 0) || !(size.h > 0)) return false;
    const m = writeModel(layer.transform, transform, size.w, size.h, doc.settings.width, doc.settings.height);
    multiplyInto(m, m, setMat(this.step, size.w, 0, 0, size.h, 0, 0));
    // Flips mirror the fill inside the box (a gradient turns upside down).
    if (transform.flipH || transform.flipV) multiplyInto(m, m, setMat(this.step, transform.flipH ? -1 : 1, 0, 0, transform.flipV ? -1 : 1, transform.flipH ? 1 : 0, transform.flipV ? 1 : 0));
    copyColor(layer.color, isRgba(fill) ? fill : fill.from);
    layer.to = isRgba(fill) ? null : copyColor(layer.toValue, fill.to);
    const shape = (layer.shape = layer.shapeValue);
    shape.kind = look.shape === "ellipse" ? "ellipse" : "box";
    shape.width = size.w;
    shape.height = size.h;
    shape.radius = drawnRadius(look);
    layer.opacity = clamp01(opacity);
    return true;
  }
}

function newMediaLayer(): WritableMediaLayer {
  return { kind: "media", trackId: "", clipId: "", mediaId: "", still: false, timeUs: 0, transform: mutableIdentity(), opacity: 1, crop: { u0: 0, v0: 0, u1: 1, v1: 1 } };
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
    karaokeFrame: { style: DEFAULT_TEXT_STYLE, from: 0, to: 0, scale: 1, ox: 0, oy: 0, box: null, boxValue: { rect: { x: 0, y: 0, width: 0, height: 0 }, color: { r: 0, g: 0, b: 0, a: 0 }, radius: 0 } },
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

/** The highlight of the word playing `rel` frames into a cue (spec §10.5), into `out`; null between words. */
function writeKaraoke(out: WritableKaraoke, look: CaptionLook, layout: TextLayout, style: CaptionStyle, words: CaptionClip["words"] & object, rel: Frame): CaptionHighlightFrame | null {
  const index = activeWordIndex(words, rel);
  if (index === -1) return null;
  const unit = highlightUnits(layout, look.content, look.inactive, words)[index];
  if (!unit) return null;
  const mode = style.highlight.mode;
  out.style = look.active;
  out.from = unit.from;
  out.to = unit.to;
  out.scale = mode === "scale" || mode === "colorAndScale" ? HIGHLIGHT_SCALE : 1;
  out.ox = unit.ox;
  out.oy = unit.oy;
  if (mode === "background") {
    const box = out.boxValue;
    box.rect = unit.box;
    box.color = style.highlight.color;
    // A pill behind the word.
    box.radius = unit.box.height / 2;
    out.box = box;
  } else out.box = null;
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

function newSolidLayer(): WritableSolidLayer {
  const shapeValue: SolidGeometry = { kind: "box", width: 0, height: 0, radius: 0 };
  return { kind: "solid", transform: mutableIdentity(), opacity: 1, color: { r: 0, g: 0, b: 0, a: 1 }, to: null, toValue: { r: 0, g: 0, b: 0, a: 1 }, shape: shapeValue, shapeValue };
}

function newTransitionLayer(): WritableTransitionLayer {
  return { kind: "dissolve", trackId: "", from: newMediaLayer(), to: newMediaLayer(), mix: 0 };
}

const BLACK: RGBA = { r: 0, g: 0, b: 0, a: 1 };
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

