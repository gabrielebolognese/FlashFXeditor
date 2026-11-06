// The poster of a compound clip or sequence (spec §21.10, Batch 63): a small 2D picture of the
// sequence at one inner frame, for the timeline clip body and the Compounds bin card. It is a layout
// sketch, not a render (the GPU compositor is the preview's alone): the sequence's frame fitted in the
// rect, its background, then each visible clip of each track bottom to top, a solid as its shape in
// its first fill color, a text as its first line in its fill color, an image or a video as the media
// poster `media` gives, a nested compound as its own sequence. Every color comes from the document
// or the caller's `colors` (design tokens). Pure apart from the drawing calls.
import { formatHexColor, isRgba } from "../../core/document/color.js";
import { instanceView } from "../../core/document/templates.js";
import type { CompoundClip, Fill, Frame, Project, RGBA, Sequence, Transform } from "../../core/document/types.js";
import { firstLine } from "../../text/style.js";
import { clipsAtFrame } from "../model/queries.js";

/** A picture of a media item: the bitmap and the region of it to show (a thumbnail sheet's first cell, or all of an image). */
export interface PosterMedia {
  image: CanvasImageSource;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export interface PosterColors {
  /** Behind a sequence with no background of its own. */
  backdrop: string;
  /** A media with no picture yet. */
  placeholder: string;
}

export interface PosterRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The 2D calls the sketch uses (a real context in the app, a recorder in tests). */
export type PosterContext = Pick<
  CanvasRenderingContext2D,
  "save" | "restore" | "beginPath" | "rect" | "clip" | "fillRect" | "fill" | "translate" | "rotate" | "scale" | "ellipse" | "roundRect" | "drawImage" | "fillText" | "globalAlpha" | "fillStyle" | "font" | "textAlign" | "textBaseline"
>;

const MAX_DEPTH = 3;

function firstColor(fill: Fill): RGBA {
  if (isRgba(fill)) return fill;
  if ("stops" in fill) return fill.stops[0]?.color ?? { r: 0, g: 0, b: 0, a: 1 };
  return fill.from;
}

/** Puts the origin at the clip's anchor point (project px from the frame center), rotated and scaled. */
function place(ctx: PosterContext, transform: Transform, frameW: number, frameH: number): void {
  ctx.translate(frameW / 2 + transform.x, frameH / 2 + transform.y);
  ctx.rotate((transform.rotation * Math.PI) / 180);
  ctx.scale(transform.scale * (transform.flipH ? -1 : 1), (transform.scaleY ?? transform.scale) * (transform.flipV ? -1 : 1));
}

const NO_INSTANCE = { params: undefined } as unknown as CompoundClip;

/**
 * Draws `sequence` at inner frame `frame` into `rect` of `ctx`. The sequence is fitted (contain) and
 * centered; clips outside the sequence's frame are cut.
 */
export function drawCompoundPoster(
  ctx: PosterContext,
  project: Project,
  sequence: Sequence,
  frame: Frame,
  rect: PosterRect,
  media: (mediaId: string) => PosterMedia | null,
  colors: PosterColors,
  depth = 0,
  /** The instance whose template values are drawn; none: the sequence as it is. */
  instance?: CompoundClip,
): void {
  const { w, h } = sequence.size;
  if (w <= 0 || h <= 0 || rect.w <= 0 || rect.h <= 0) return;
  const fit = Math.min(rect.w / w, rect.h / h);
  ctx.save();
  ctx.translate(rect.x + (rect.w - w * fit) / 2, rect.y + (rect.h - h * fit) / 2);
  ctx.scale(fit, fit);
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.clip();
  ctx.fillStyle = sequence.background && sequence.background.a > 0 ? formatHexColor(sequence.background) : colors.backdrop;
  ctx.fillRect(0, 0, w, h);
  const view = instance ? instanceView(project, sequence, instance) : instanceView(project, sequence, NO_INSTANCE);
  for (const clip of clipsAtFrame(view, Math.min(Math.max(0, frame), Math.max(0, sequence.duration - 1)))) {
    if (!clip.enabled) continue;
    if (view.tracks.find((track) => track.id === clip.trackId)?.hidden) continue;
    ctx.save();
    switch (clip.kind) {
      case "solid": {
        place(ctx, clip.transform, w, h);
        ctx.globalAlpha = clip.opacity;
        ctx.fillStyle = formatHexColor(firstColor(clip.fill));
        ctx.beginPath();
        if (clip.shape === "ellipse") ctx.ellipse(0, 0, clip.size.w / 2, clip.size.h / 2, 0, 0, 2 * Math.PI);
        else if (clip.shape === "roundedRect") ctx.roundRect(-clip.size.w / 2, -clip.size.h / 2, clip.size.w, clip.size.h, clip.cornerRadius);
        else ctx.rect(-clip.size.w / 2, -clip.size.h / 2, clip.size.w, Math.max(clip.size.h, clip.shape === "line" ? 2 / fit : 0));
        ctx.fill();
        break;
      }
      case "text": {
        place(ctx, clip.transform, w, h);
        ctx.globalAlpha = clip.opacity;
        ctx.fillStyle = formatHexColor(firstColor(clip.style.fill));
        ctx.font = `${clip.style.italic ? "italic " : ""}${clip.style.fontWeight} ${clip.style.fontSize}px ${clip.style.fontFamily}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(firstLine(clip.text, clip.style), 0, 0);
        break;
      }
      case "image":
      case "lottie":
      case "video": {
        place(ctx, clip.transform, w, h);
        ctx.globalAlpha = clip.opacity;
        const picture = media(clip.mediaId);
        const item = project.media[clip.mediaId];
        const mw = item && "width" in item && typeof item.width === "number" && item.width > 0 ? item.width : (picture?.sw ?? w);
        const mh = item && "height" in item && typeof item.height === "number" && item.height > 0 ? item.height : (picture?.sh ?? h);
        const contain = Math.min(w / mw, h / mh);
        if (picture) ctx.drawImage(picture.image, picture.sx, picture.sy, picture.sw, picture.sh, (-mw * contain) / 2, (-mh * contain) / 2, mw * contain, mh * contain);
        else {
          ctx.fillStyle = colors.placeholder;
          ctx.fillRect((-mw * contain) / 2, (-mh * contain) / 2, mw * contain, mh * contain);
        }
        break;
      }
      case "compound": {
        const inner = project.sequences[clip.sequenceId];
        if (inner && depth + 1 < MAX_DEPTH) {
          ctx.globalAlpha = clip.opacity;
          drawCompoundPoster(ctx, project, inner, clip.offset + frame - clip.start, { x: 0, y: 0, w, h }, media, colors, depth + 1, clip);
        }
        break;
      }
      default:
        break;
    }
    ctx.restore();
  }
  ctx.restore();
}
