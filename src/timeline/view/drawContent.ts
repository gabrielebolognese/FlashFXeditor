// The timeline content canvas (spec §6.17): track backgrounds, clips, the content end marker, the
// ruler with the timeline markers (spec §6.3: triangles in their label color), the track header column (kind icon, name and toggles, spec §6.1), the divider and the
// "+ track" rows. Locked rows are hatched (§6.12); clips of tracks out of the composite or the mix
// (muted, hidden, not soloed) are dimmed. Clip bodies (§6.4) at M/L heights: filmstrips of videos,
// posters of images, waveforms of audio, the text of text and caption clips, a swatch for solids;
// what is not loaded yet is the body color, and the pass records it in `wants` for the loaders.
// Redrawn only when the document, the selection, the zoom/scroll, the size, the theme or the loaded
// visuals change, never for the playhead. Clips are virtualized per track (binary search on start with
// a longest-clip lookback, P10). The scrollbars (spec §6.1) close the bottom and right edges.
import { audibleTracks } from "../../audio/AudioMixer.js";
import { formatHexColor, isRgba } from "../../core/document/color.js";
import { formatSpeed, usPerFrame, type TimecodeMode } from "../../core/document/time.js";
import { isFreeze, isMediaClip, type Clip, type Frame, type Marker, type MediaClip, type Project, type SolidClip, type Track, type TrackId } from "../../core/document/types.js";
import type { Selection } from "../../core/store/selection.js";
import type { Theme } from "../../core/theme/theme.js";
import { cellOrigin, type ThumbLevel } from "../../media/cache/thumbSheets.js";
import { isPlayable } from "../../text/anim.js";
import { cueLine } from "../../text/captions.js";
import { firstLine } from "../../text/style.js";
import { clipsInRange, contentEnd, linkOffset } from "../model/queries.js";
import { clipLod, clipSpan, devicePx, LOD_THUMBS_PX, type ClipLod } from "./clipLayout.js";
import { columnPeaks, peaksLevel, planFilmstrip, tileThumb, wantPeaks, wantSheet, type ClipVisuals, type WantsCollector } from "./clipVisuals.js";
import type { HeaderToggle, Rect, Row, TimelineGeometry } from "./geometry.js";
import { CLIP_GLYPHS, drawGlyph, TRACK_GLYPHS, type GlyphName } from "./glyphs.js";
import { drawScrollbars } from "./drawScrollbars.js";
import { layoutRuler } from "./ruler.js";
import type { ScrollbarLayout } from "./scrollbars.js";
import type { TextCache } from "./textCache.js";

export interface ContentScene {
  ctx: CanvasRenderingContext2D;
  dpr: number;
  geometry: TimelineGeometry;
  project: Project;
  selection: Selection;
  theme: Theme;
  text: TextCache;
  /** Thumbnails, posters and peaks loaded so far (none: bodies stay their color). */
  visuals?: ClipVisuals | null;
  /** Collects what this pass wanted to draw (the content pass only). */
  wants?: WantsCollector | null;
  /** The scrollbars to draw (none: no scrollbars). */
  scrollbars?: ScrollbarLayout | null;
  /** Ruler labels in `mm:ss:ff` (default) or `mm:ss.mmm` (spec §6.3: the preview's format toggle). */
  timecodeFormat?: TimecodeMode;
  /** A marker being dragged: the overlay draws it at its new frame, the ruler leaves it out. */
  hiddenMarker?: string | null;
  /** Which font families are missing (text clips get a badge, spec §10.1). */
  fonts?: TimelineFonts | null;
}

export interface TimelineFonts {
  missing(family: string): boolean;
}

/** What drawing a clip needs (the overlay's trim preview draws clips too, from what is loaded). */
export type ClipScene = Pick<ContentScene, "ctx" | "dpr" | "geometry" | "theme" | "selection" | "text" | "visuals" | "wants" | "fonts"> & { project: Pick<Project, "settings"> };

export interface ContentStats {
  /** Clips drawn in this pass (the visible ones). */
  clipsDrawn: number;
}

export const fontOf = (theme: Theme, step: "caption" | "body", mono = false) =>
  `${theme.type[step].weight} ${theme.type[step].size}px ${mono ? theme.font.mono : theme.font.ui}`;

/** Snaps a CSS coordinate to the device pixel grid. */
const snap = (value: number, dpr: number) => Math.round(value * dpr) / dpr;

/**
 * Fills a clip's body or label bar: in its label color (spec §6.4) at the label alphas, else in its
 * kind's color. Respects the current `globalAlpha` (drag ghosts). The body fill is also the
 * placeholder under a filmstrip still loading.
 */
export function fillClip(ctx: CanvasRenderingContext2D, theme: Theme, clip: Clip, part: "body" | "label", x: number, y: number, width: number, height: number): void {
  const tl = theme.timeline;
  const label = clip.color !== undefined ? tl.labels[clip.color] : undefined;
  if (!label) {
    ctx.fillStyle = tl.clip[clip.kind][part];
    ctx.fillRect(x, y, width, height);
    return;
  }
  const alpha = ctx.globalAlpha;
  ctx.globalAlpha = alpha * (part === "body" ? tl.labelBodyAlpha : tl.labelBarAlpha);
  ctx.fillStyle = label;
  ctx.fillRect(x, y, width, height);
  ctx.globalAlpha = alpha;
}

function hline(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, dpr: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, snap(y, dpr), width, 1 / dpr);
}

function vline(ctx: CanvasRenderingContext2D, x: number, y: number, height: number, dpr: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(snap(x, dpr), y, 1 / dpr, height);
}

export function drawContent(scene: ContentScene): ContentStats {
  const { ctx, dpr, geometry, theme } = scene;
  const { color } = theme;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "medium";
  ctx.fillStyle = color.bgSunken;
  ctx.fillRect(0, 0, geometry.width, geometry.height);

  // Everything below the ruler scrolls vertically and is clipped under it.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, geometry.area.y, geometry.width, geometry.area.height);
  ctx.clip();
  ctx.fillStyle = color.surface1;
  ctx.fillRect(0, geometry.area.y, geometry.headerWidth, geometry.area.height);
  for (const row of geometry.rows) {
    if (row.y + row.height <= geometry.area.y || row.y >= geometry.height) continue;
    ctx.fillStyle = color.bg;
    ctx.fillRect(geometry.area.x, row.y, geometry.area.width, row.height);
    hline(ctx, 0, row.y + row.height - 1 / dpr, geometry.width, dpr, color.hairline);
  }
  ctx.fillStyle = color.surface2;
  ctx.fillRect(geometry.divider.x, snap(geometry.divider.y, dpr), geometry.divider.width, geometry.divider.height);

  const clipsDrawn = drawClips(scene);
  drawContentEnd(scene);
  drawHeaders(scene);
  ctx.restore();

  drawRuler(scene);
  if (scene.scrollbars) drawScrollbars(ctx, dpr, geometry, theme, scene.scrollbars);
  vline(ctx, geometry.headerWidth - 1 / dpr, 0, geometry.height, dpr, color.hairline);
  return { clipsDrawn };
}

/**
 * Tracks whose clips are seen or heard (spec §6.12): video tracks neither muted nor hidden, audio
 * tracks audible (not muted; soloed when any is), caption tracks not hidden.
 */
export function activeTracks(project: Project): ReadonlySet<TrackId> {
  const audible = audibleTracks(project);
  const active = new Set<TrackId>();
  for (const track of project.tracks) {
    if (track.kind === "audio" ? audible.get(track.id) : !track.hidden && !(track.kind === "video" && track.muted)) active.add(track.id);
  }
  return active;
}

function drawClips(scene: ContentScene): number {
  const { ctx, dpr, geometry, project, theme } = scene;
  const { from, to } = geometry.visibleFrames;
  const active = activeTracks(project);
  ctx.save();
  ctx.beginPath();
  ctx.rect(geometry.area.x, geometry.area.y, geometry.area.width, geometry.area.height);
  ctx.clip();
  let drawn = 0;
  for (const row of geometry.rows) {
    if (row.y + row.height <= geometry.area.y || row.y >= geometry.height) continue;
    const track = project.tracks[row.index] as Track;
    const clips = clipsInRange(project, track.id, Math.floor(from), Math.ceil(to) + 1);
    if (!active.has(track.id)) ctx.globalAlpha = theme.timeline.inactiveOpacity;
    clips.forEach((clip, i) => {
      const next = clips[i + 1];
      drawClip(scene, clip, row, track, next !== undefined && next.start === clip.start + clip.duration, linkOffset(project, clip.id));
    });
    ctx.globalAlpha = 1;
    // Locked: no edits, no selection (spec §6.12), drawn with a diagonal hatch over the row.
    if (track.locked) drawDiagonalHatch(ctx, dpr, geometry.area.x, geometry.area.x + geometry.area.width, row.y, row.height - 1 / dpr, theme.timeline.lockHatch, theme.timeline.hatchGap);
    drawn += clips.length;
  }
  ctx.restore();
  return drawn;
}

/**
 * Diagonal lines over [left, right) x [y, y + height), `gap` apart on a fixed grid (by x, so the
 * pattern never crawls while what it covers moves), 1 device px wide.
 */
export function drawDiagonalHatch(ctx: CanvasRenderingContext2D, dpr: number, left: number, right: number, y: number, height: number, color: string, gap: number): void {
  if (right <= left || height <= 0) return;
  const step = Math.max(gap, 1);
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, y, right - left, height);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1 / dpr;
  ctx.beginPath();
  for (let x = Math.floor((left - height) / step) * step; x < right; x += step) {
    ctx.moveTo(x, y + height);
    ctx.lineTo(x + height, y);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * One clip in its row: body (with its filmstrip, waveform, text or swatch at M/L heights), label bar
 * (kind glyph, name, badges), selection tint and outline, in the clip's label color when it has one.
 * A disabled or muted clip is dimmed and hatched (spec §6.4). `syncOffset`: frames off its link
 * partner (`linkOffset`), shown as a `+12` / `-12` badge.
 */
export function drawClip(scene: ClipScene, clip: Clip, row: Row, track: Track, abutsNext: boolean, syncOffset = 0): void {
  const { ctx, dpr, geometry, theme, selection } = scene;
  const tl = theme.timeline;
  const selected = selection.clipIds.has(clip.id);

  const span = clipSpan(geometry.frameToX(clip.start), geometry.frameToX(clip.start + clip.duration), abutsNext, dpr);
  const x = span.x0 / dpr;
  const width = (span.x1 - span.x0) / dpr;
  const y = snap(row.y + tl.clipInset, dpr);
  const height = snap(row.y + row.height - tl.clipInset, dpr) - y;
  const lod = clipLod(width);

  if (lod === "line") {
    // Below 6 px only the body color shows (spec §6.4).
    if (selected) {
      ctx.fillStyle = theme.color.accent;
      ctx.fillRect(x, y, width, height);
    } else {
      fillClip(ctx, theme, clip, "body", x, y, width, height);
    }
    return;
  }

  const radius = Math.min(theme.radius.sm, width / 2, height / 2);
  const disabled = !clip.enabled || (isMediaClip(clip) && clip.volume.muted);
  const alpha = ctx.globalAlpha;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.clip();
  if (disabled) ctx.globalAlpha = alpha * tl.inactiveOpacity;
  fillClip(ctx, theme, clip, "body", x, y, width, height);
  // The label bar is the whole clip on S tracks (spec §6.4): no body there.
  const labelHeight = track.kind === "caption" || track.height === "S" ? height : Math.min(height, tl.labelHeight);
  if (labelHeight < height) drawBody(scene, clip, x, y + labelHeight, width, height - labelHeight, lod);
  fillClip(ctx, theme, clip, "label", x, y, width, labelHeight);
  ctx.globalAlpha = alpha;
  if (disabled) drawDiagonalHatch(ctx, dpr, x, x + width, y, height, tl.disabledHatch, tl.hatchGap);
  if (selected) {
    ctx.fillStyle = theme.color.accentWash;
    ctx.fillRect(x, y, width, height);
  }
  if (lod === "full") drawLabel(scene, clip, x, y, width, labelHeight, syncOffset);
  ctx.restore();

  if (selected) {
    const line = (devicePx(tl.selectionOutline, dpr) + (selection.primary === clip.id ? 1 : 0)) / dpr;
    ctx.strokeStyle = theme.color.accent;
    ctx.lineWidth = line;
    ctx.beginPath();
    ctx.roundRect(x + line / 2, y + line / 2, Math.max(0, width - line), Math.max(0, height - line), Math.max(0, radius - line / 2));
    ctx.stroke();
  }
}

/** Peaks of the waveform columns being drawn (reused: no allocation per pass). */
let columns = new Float32Array(1024);

/** The body below the label bar: what the clip's kind shows (spec §6.4). Clipped to the clip. */
function drawBody(scene: ClipScene, clip: Clip, x: number, y: number, width: number, height: number, lod: ClipLod): void {
  const { geometry } = scene;
  const left = Math.max(x, geometry.area.x);
  const right = Math.min(x + width, geometry.area.x + geometry.area.width);
  if (right <= left || height <= 0) return;
  switch (clip.kind) {
    case "video":
      if (width >= LOD_THUMBS_PX) drawFilmstrip(scene, clip, y, height, left, right);
      return;
    case "image":
      if (width >= LOD_THUMBS_PX) drawPosterTiles(scene, clip, y, height, left, right);
      return;
    case "audio":
      drawWaveform(scene, clip, y, height, left, right);
      return;
    case "text":
      if (lod === "full") drawBodyText(scene, firstLine(clip.text, clip.style), left, right, y, height);
      return;
    case "caption":
      if (lod === "full") drawBodyText(scene, cueLine(clip.text), left, right, y, height);
      return;
    case "solid":
      if (lod === "full") drawSwatch(scene, clip, left, y, height);
      return;
  }
}

/**
 * Thumbnails tiled left to right from the clip's start, each the frame at its left edge's source time
 * (in point, speed), from the sheet level that gives every tile its own frame (spec §6.4, §6.17). A
 * tile whose sheet is not in memory shows another level's (coarser first) or stays the body color.
 */
function drawFilmstrip(scene: ClipScene, clip: MediaClip, y: number, height: number, left: number, right: number): void {
  const { ctx, dpr, geometry, visuals, wants } = scene;
  const layout = visuals?.thumbLayout(clip.mediaId);
  if (!visuals || !layout) return;
  const tileWidth = Math.max(1, (height * layout.width) / layout.height);
  const clipX = geometry.frameToX(clip.start);
  const usPerPx = (usPerFrame(scene.project.settings.fps) * clip.speed) / geometry.pxPerFrame;
  const plan = planFilmstrip(layout, clipX, tileWidth, left, right, usPerPx);
  for (let tile = plan.first; tile < plan.end; tile++) {
    let thumb = tileThumb(layout, plan.level, clip.in, tile, plan.tileUs);
    if (wants) wantSheet(wants, clip.mediaId, plan.level, Math.floor(thumb / layout.perSheet));
    let bitmap: ImageBitmap | null = null;
    for (const level of STAND_INS[plan.level]) {
      thumb = tileThumb(layout, level, clip.in, tile, plan.tileUs);
      bitmap = visuals.sheet(clip.mediaId, level, Math.floor(thumb / layout.perSheet));
      if (bitmap) break;
    }
    if (!bitmap) continue;
    const cell = cellOrigin(layout, thumb);
    const x0 = snap(clipX + tile * tileWidth, dpr);
    const x1 = snap(clipX + (tile + 1) * tileWidth, dpr);
    ctx.drawImage(bitmap, cell.x, cell.y, layout.width, layout.height, x0, y, x1 - x0, height);
  }
}

/** The levels a tile tries, in order: the one it wants, then coarser, then finer ones. */
const STAND_INS: Record<ThumbLevel, readonly ThumbLevel[]> = { 0: [0, 1, 2], 1: [1, 0, 2], 2: [2, 1, 0] };

/** An image clip: its poster tiled from the clip's start (a still has one picture). */
function drawPosterTiles(scene: ClipScene, clip: MediaClip, y: number, height: number, left: number, right: number): void {
  const { ctx, dpr, geometry } = scene;
  const poster = scene.visuals?.poster(clip.mediaId);
  if (!poster || poster.width === 0 || poster.height === 0) return;
  const tileWidth = Math.max(1, (height * poster.width) / poster.height);
  const clipX = geometry.frameToX(clip.start);
  const first = Math.max(0, Math.floor((left - clipX) / tileWidth));
  const end = Math.ceil((right - clipX) / tileWidth);
  for (let tile = first; tile < end; tile++) {
    const x0 = snap(clipX + tile * tileWidth, dpr);
    const x1 = snap(clipX + (tile + 1) * tileWidth, dpr);
    ctx.drawImage(poster, x0, y, x1 - x0, height);
  }
}

/**
 * The waveform (spec §6.4, §6.17): per device-pixel column, the peak of the source samples it covers
 * from the pyramid level closest to one bucket per CSS px, mirrored around the body's center line.
 * TODO(batch 37): the clip gain (and its keyframes) applied to the drawn level; 0 dB until then.
 * TODO(batch 36): fade curves as transparent wedges.
 */
function drawWaveform(scene: ClipScene, clip: MediaClip, y: number, height: number, left: number, right: number): void {
  const { ctx, dpr, geometry, theme, visuals, wants } = scene;
  const peaks = visuals?.peaks(clip.mediaId);
  if (!peaks) {
    if (visuals && wants) wantPeaks(wants, clip.mediaId);
    return;
  }
  const gain = 1;
  const c0 = Math.round(left * dpr);
  const count = Math.round(right * dpr) - c0;
  if (count <= 0) return;
  if (columns.length < count) columns = new Float32Array(Math.max(count, columns.length * 2));
  const sourceUsPerFrame = usPerFrame(scene.project.settings.fps) * clip.speed;
  const samplesPerUs = peaks.sampleRate / 1_000_000;
  const samplesPerPx = (sourceUsPerFrame / geometry.pxPerFrame) * samplesPerUs;
  const s0 = (clip.in + (geometry.xToFrame(c0 / dpr) - clip.start) * sourceUsPerFrame) * samplesPerUs;
  columnPeaks(peaks, peaksLevel(peaks, samplesPerPx), s0, samplesPerPx / dpr, columns, count);
  const mid = Math.round((y + height / 2) * dpr);
  const half = Math.max(1, (height / 2 - theme.space[0]) * dpr);
  ctx.fillStyle = theme.timeline.waveform;
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    // Silence still draws the 1 device px center line.
    const h = Math.max(1, Math.round(Math.min(1, (columns[i] as number) * gain) * half));
    ctx.rect((c0 + i) / dpr, (mid - h) / dpr, 1 / dpr, (2 * h) / dpr);
  }
  ctx.fill();
}

/** One line of text in the body (text and caption clips), sticking to the track area's left edge. */
function drawBodyText(scene: ClipScene, value: string, left: number, right: number, y: number, height: number): void {
  const { ctx, theme, text } = scene;
  const pad = theme.space[1];
  ctx.font = fontOf(theme, "caption");
  const line = text.fit(ctx, value, right - left - 2 * pad);
  if (line === "") return;
  ctx.fillStyle = theme.color.textPrimary;
  ctx.textBaseline = "middle";
  ctx.fillText(line, left + pad, y + height / 2);
}

/** A solid's color as a swatch at the start of the body. TODO(batch 34): gradient fills. */
function drawSwatch(scene: ClipScene, clip: SolidClip, left: number, y: number, height: number): void {
  const { ctx, dpr, theme } = scene;
  const pad = theme.space[1];
  const size = height - 2 * pad;
  if (size < theme.icon.small || !isRgba(clip.fill)) return;
  const x = snap(left + pad, dpr);
  const top = snap(y + pad, dpr);
  ctx.beginPath();
  ctx.roundRect(x, top, size, size, theme.radius.sm);
  ctx.fillStyle = formatHexColor(clip.fill);
  ctx.fill();
  ctx.strokeStyle = theme.color.hairline;
  ctx.lineWidth = 1 / dpr;
  ctx.stroke();
}

function drawLabel(scene: ClipScene, clip: Clip, x: number, y: number, width: number, labelHeight: number, syncOffset: number): void {
  const { ctx, theme, text } = scene;
  const pad = theme.space[1];
  const icon = theme.icon.small;
  // The label sticks to the left edge of the track area while the clip starts off screen, and its
  // badges to the right edge while it ends off screen.
  const { area } = scene.geometry;
  const left = Math.max(x, area.x);
  let right = Math.min(x + width, area.x + area.width);
  if (right - left < pad + icon + pad) return;
  const centerY = y + labelHeight / 2;
  // With the label bar spanning an S clip, keep the icon and name on the first text line.
  const lineY = Math.min(centerY, y + theme.timeline.labelHeight / 2);
  // Badges from the right end (spec §6.4): the sync offset, the speed (`2x` when it is not 1; video
  // and audio only, stills and graphics have no speed; a snowflake for a freeze frame, Batch 27), the
  // link and the keyframe icons, a text animation (sparkles, Batch 31), and a missing font (a text clip
  // whose family is not available draws with the fallback font, §10.1). The name ends before them.
  // TODO(batch 36): the `fx` badge when the clip has a transition.
  const minX = left + pad + icon + pad;
  const badgesEnd = right - theme.space[0];
  let badgesStart = badgesEnd;
  if (syncOffset !== 0) badgesStart = drawBadge(scene, `${syncOffset > 0 ? "+" : "-"}${Math.abs(syncOffset)}`, theme.color.danger, minX, badgesStart, lineY);
  if (isFreeze(clip)) badgesStart = drawIconBadge(scene, "snowflake", minX, badgesStart, lineY);
  else if ((clip.kind === "video" || clip.kind === "audio") && clip.speed !== 1) badgesStart = drawBadge(scene, formatSpeed(clip.speed), theme.color.textSecondary, minX, badgesStart, lineY);
  if (clip.linkGroup !== undefined) badgesStart = drawIconBadge(scene, "link", minX, badgesStart, lineY);
  if (hasKeyframes(clip)) badgesStart = drawIconBadge(scene, "diamond", minX, badgesStart, lineY);
  if (clip.kind === "text" && (isPlayable(clip.animIn) || isPlayable(clip.animOut))) badgesStart = drawIconBadge(scene, "sparkles", minX, badgesStart, lineY);
  if (clip.kind === "text" && scene.fonts?.missing(clip.style.fontFamily)) badgesStart = drawIconBadge(scene, "triangleAlert", minX, badgesStart, lineY, theme.color.danger);
  if (badgesStart < badgesEnd) right = badgesStart;
  drawGlyph(ctx, CLIP_GLYPHS[clip.kind], left + pad, lineY - icon / 2, icon, theme.color.textPrimary);
  const textX = left + pad + icon + pad;
  ctx.font = fontOf(theme, "caption");
  // A cue shows its text (spec §6.4), other clips their name.
  const name = text.fit(ctx, clip.kind === "caption" ? cueLine(clip.text) : clip.name, right - pad - textX);
  if (name === "") return;
  ctx.fillStyle = theme.color.textPrimary;
  ctx.textBaseline = "middle";
  ctx.fillText(name, textX, lineY);
}

/**
 * A label bar badge in a DS chip (`--surface-3`, radius-sm, badge type: 10 px mono), ending at `right`:
 * the sync badge (spec §6.12, `+12` / `-12` frames in the danger color) and the speed badge (§6.4,
 * `0.5x` in the secondary text color). Returns the x left of it (where the next badge or the name must
 * end), or `right` when there is no room for it.
 */
function drawBadge(scene: ClipScene, label: string, fill: string, minX: number, right: number, centerY: number): number {
  const { ctx, theme, text } = scene;
  const { space, color } = theme;
  ctx.font = `${theme.type.caption.weight} ${theme.type.overline.size}px ${theme.font.mono}`;
  const width = Math.ceil(text.width(ctx, label)) + 2 * space[1];
  const height = theme.type.overline.line;
  const x = right - width;
  if (x < minX) return right;
  ctx.fillStyle = color.surface3;
  ctx.beginPath();
  ctx.roundRect(x, centerY - height / 2, width, height, theme.radius.sm);
  ctx.fill();
  ctx.fillStyle = fill;
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + space[1], centerY);
  return x - space[0];
}

/** A label bar icon badge (link, keyframes; in the secondary text color by default), ending at `right`; see `drawBadge`. */
function drawIconBadge(scene: ClipScene, glyph: GlyphName, minX: number, right: number, centerY: number, color = scene.theme.color.textSecondary): number {
  const { ctx, theme } = scene;
  const size = theme.icon.small;
  const x = right - size;
  if (x < minX) return right;
  drawGlyph(ctx, glyph, x, centerY - size / 2, size, color);
  return x - theme.space[0];
}

const hasKeyframes = (clip: Clip) => "keyframes" in clip && clip.keyframes !== undefined && Object.values(clip.keyframes).some((keys) => keys.length > 0);

function drawContentEnd(scene: ContentScene): void {
  const { ctx, dpr, geometry, project, theme } = scene;
  const end = contentEnd(project);
  if (end === 0 || !geometry.isFrameVisible(end)) return;
  vline(ctx, geometry.frameToX(end), geometry.area.y, geometry.area.height, dpr, theme.color.border);
}

function drawHeaders(scene: ContentScene): void {
  const { geometry, project, selection } = scene;
  const selected = selection.kind === "track" ? selection.trackIds : undefined;
  for (const row of geometry.rows) {
    if (row.y + row.height <= geometry.area.y || row.y >= geometry.height) continue;
    const track = project.tracks[row.index] as Track;
    drawHeader(scene, row, track, selected?.has(track.id) === true);
  }
  drawAddRow(scene, geometry.addVideo, "Video track");
  drawAddRow(scene, geometry.addAudio, "Audio track");
}

/** What drawing a track header needs (the overlay draws the header of a dragged track too). */
export type HeaderScene = Pick<ContentScene, "ctx" | "dpr" | "geometry" | "theme" | "text">;

/**
 * One track header (spec §6.1), on its first line whatever the row height: the kind icon, the name and
 * the toggles. A selected track (the properties panel shows it) sits on a raised surface with its icon
 * in the accent and its name in the primary text color.
 */
export function drawHeader(scene: HeaderScene, row: Row, track: Track, selected: boolean): void {
  const { ctx, dpr, geometry, theme, text } = scene;
  const { color } = theme;
  if (selected) {
    ctx.fillStyle = color.surface3;
    ctx.fillRect(0, row.y, geometry.headerWidth, row.height - 1 / dpr);
  }
  const icon = theme.icon.size;
  const name = geometry.headerName(row, icon, theme.space[2]);
  const centerY = name.y + name.height / 2;
  drawGlyph(ctx, TRACK_GLYPHS[track.kind], name.x - theme.space[2] - icon, centerY - icon / 2, icon, selected ? color.accent : color.textTertiary);
  ctx.font = fontOf(theme, "body");
  ctx.textBaseline = "middle";
  ctx.fillStyle = selected ? color.textPrimary : color.textSecondary;
  ctx.fillText(text.fit(ctx, track.name, name.width), name.x, centerY);
  for (const { toggle, rect } of geometry.headerToggles(row)) drawToggle(scene, rect, toggle, track);
}

/** How a header toggle looks: its glyph (or letter) and whether it is on. */
function toggleLook(toggle: HeaderToggle, track: Track): { glyph: GlyphName | null; letter: string; on: boolean } {
  switch (toggle) {
    case "target":
      return { glyph: "crosshair", letter: "", on: track.targeted };
    case "lock":
      return { glyph: track.locked ? "lock" : "lockOpen", letter: "", on: track.locked };
    case "mute":
      return { glyph: null, letter: "M", on: track.muted };
    case "solo":
      return { glyph: null, letter: "S", on: track.solo };
    case "hide":
      return { glyph: track.hidden ? "eyeOff" : "eye", letter: "", on: track.hidden };
    case "height":
      return { glyph: "rows3", letter: "", on: false };
  }
}

/**
 * A header toggle in a hairline square (its hover wash is on the overlay). Lock, mute, solo and hide
 * are exceptions to the default, drawn in the accent when on (gold marks the active state). Every track
 * starts targeted, so the target toggle's on state is neutral (a raised square, secondary glyph) and
 * its off state dim: the column is not gold all over.
 */
function drawToggle(scene: HeaderScene, rect: Rect, toggle: HeaderToggle, track: Track): void {
  const { ctx, dpr, theme } = scene;
  const { color } = theme;
  const look = toggleLook(toggle, track);
  const target = toggle === "target";
  const line = 1 / dpr;
  const x = snap(rect.x, dpr) + line / 2;
  const y = snap(rect.y, dpr) + line / 2;
  const size = snap(rect.width, dpr) - line;
  ctx.beginPath();
  ctx.roundRect(x, y, size, size, theme.radius.sm);
  if (look.on) {
    ctx.fillStyle = target ? color.surface3 : color.accentWash;
    ctx.fill();
  }
  ctx.strokeStyle = look.on ? (target ? color.border : color.accentDim) : color.hairline;
  ctx.lineWidth = line;
  ctx.stroke();
  const ink = look.on ? (target ? color.textSecondary : color.accent) : target ? color.textMuted : color.textTertiary;
  if (look.glyph) {
    const glyph = theme.icon.small;
    drawGlyph(ctx, look.glyph, rect.x + (rect.width - glyph) / 2, rect.y + (rect.height - glyph) / 2, glyph, ink);
    return;
  }
  ctx.font = fontOf(theme, "caption");
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = ink;
  ctx.fillText(look.letter, rect.x + rect.width / 2, rect.y + rect.height / 2);
  ctx.textAlign = "left";
}

/** The drawn "+ track" button in the header column (its hover wash is on the overlay). */
function drawAddRow(scene: ContentScene, rect: Rect, label: string): void {
  const { ctx, geometry, theme, text } = scene;
  if (rect.y + rect.height <= geometry.area.y || rect.y >= geometry.height) return;
  const pad = theme.space[3];
  const icon = theme.icon.small;
  const centerY = rect.y + rect.height / 2;
  drawGlyph(ctx, "plus", pad, centerY - icon / 2, icon, theme.color.textTertiary);
  ctx.font = fontOf(theme, "caption");
  ctx.textBaseline = "middle";
  ctx.fillStyle = theme.color.textTertiary;
  const textX = pad + icon + theme.space[1];
  ctx.fillText(text.fit(ctx, label, geometry.headerWidth - textX - pad), textX, centerY);
}

function drawRuler(scene: ContentScene): void {
  const { ctx, dpr, geometry, project, theme, text } = scene;
  const { color, space } = theme;
  const height = geometry.rulerHeight;
  ctx.fillStyle = color.surface1;
  ctx.fillRect(0, 0, geometry.width, height);
  hline(ctx, 0, height - 1 / dpr, geometry.width, dpr, color.hairline);

  ctx.save();
  ctx.beginPath();
  ctx.rect(geometry.area.x, 0, geometry.area.width, height);
  ctx.clip();
  ctx.font = fontOf(theme, "caption", true);
  const { from, to } = geometry.visibleFrames;
  const layout = layoutRuler({
    from,
    to,
    frameToX: (frame) => geometry.frameToX(frame),
    pxPerFrame: geometry.pxPerFrame,
    fps: project.settings.fps,
    mode: scene.timecodeFormat ?? "frames",
    measure: (value) => text.width(ctx, value),
    labelGap: space[3],
    minorMinPx: space[3],
  });
  const majorTick = space[3];
  const minorTick = space[1];
  for (const x of layout.minors) vline(ctx, x, height - minorTick, minorTick, dpr, color.hairline);
  for (const x of layout.majors) vline(ctx, x, height - majorTick, majorTick, dpr, color.border);
  ctx.textBaseline = "middle";
  const labelY = (height - majorTick) / 2 + space[0];
  for (const label of layout.labels) {
    ctx.fillStyle = label.kind === "second" ? color.textSecondary : color.textTertiary;
    ctx.fillText(label.text, label.x + space[1], labelY);
  }
  const end = contentEnd(project);
  if (end > 0 && geometry.isFrameVisible(end)) vline(ctx, geometry.frameToX(end), 0, height, dpr, color.textTertiary);
  drawMarkers(scene);
  ctx.restore();
}

/**
 * Traces a marker's triangle (spec §6.3) at `frame`: its top edge `--timeline-marker-height` above the
 * ruler's bottom, its apex on the bottom, centered on a device pixel column. False when it is off screen.
 */
export function traceMarker(ctx: CanvasRenderingContext2D, geometry: TimelineGeometry, dpr: number, theme: Theme, frame: Frame): boolean {
  const { markerWidth, markerHeight } = theme.timeline;
  const x = geometry.frameToX(frame);
  const half = markerWidth / 2;
  if (x + half < geometry.area.x || x - half > geometry.area.x + geometry.area.width) return false;
  const center = (Math.floor(x * dpr) + 0.5) / dpr;
  const bottom = geometry.rulerHeight;
  const top = bottom - markerHeight;
  ctx.beginPath();
  ctx.moveTo(center - half, top);
  ctx.lineTo(center + half, top);
  ctx.lineTo(center, bottom);
  ctx.closePath();
  return true;
}

/** The visible markers in their label colors, in frame order (a later one on top); the dragged one is left out. */
function drawMarkers(scene: ContentScene): void {
  const { ctx, dpr, geometry, project, theme } = scene;
  const reach = theme.timeline.markerWidth / 2 / geometry.pxPerFrame;
  const { from, to } = geometry.visibleFrames;
  for (const marker of project.markers as readonly Marker[]) {
    if (marker.frame < from - reach) continue;
    if (marker.frame > to + reach) break;
    if (marker.id === scene.hiddenMarker || !traceMarker(ctx, geometry, dpr, theme, marker.frame)) continue;
    ctx.fillStyle = theme.timeline.labels[marker.color];
    ctx.fill();
  }
}
