// The timeline content canvas (spec §6.17): track backgrounds, clips, the content end marker, the
// ruler, the track header column, the divider and the "+ track" rows. Redrawn only when the
// document, the selection, the zoom/scroll, the size or the theme change, never for the playhead.
// Clips are virtualized per track (binary search on start with a longest-clip lookback, P10).
import { formatSpeed } from "../../core/document/time.js";
import type { Clip, Project, Track } from "../../core/document/types.js";
import type { Selection } from "../../core/store/selection.js";
import type { Theme } from "../../core/theme/theme.js";
import { clipsInRange, contentEnd, linkOffset } from "../model/queries.js";
import { clipLod, clipSpan, devicePx } from "./clipLayout.js";
import type { Rect, Row, TimelineGeometry } from "./geometry.js";
import { CLIP_GLYPHS, drawGlyph, TRACK_GLYPHS } from "./glyphs.js";
import { layoutRuler } from "./ruler.js";
import type { TextCache } from "./textCache.js";

export interface ContentScene {
  ctx: CanvasRenderingContext2D;
  dpr: number;
  geometry: TimelineGeometry;
  project: Project;
  selection: Selection;
  theme: Theme;
  text: TextCache;
}

/** What drawing a clip needs (the overlay's trim preview draws clips too). */
export type ClipScene = Pick<ContentScene, "ctx" | "dpr" | "geometry" | "theme" | "selection" | "text">;

export interface ContentStats {
  /** Clips drawn in this pass (the visible ones). */
  clipsDrawn: number;
}

export const fontOf = (theme: Theme, step: "caption" | "body", mono = false) =>
  `${theme.type[step].weight} ${theme.type[step].size}px ${mono ? theme.font.mono : theme.font.ui}`;

/** Snaps a CSS coordinate to the device pixel grid. */
const snap = (value: number, dpr: number) => Math.round(value * dpr) / dpr;

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
  vline(ctx, geometry.headerWidth - 1 / dpr, 0, geometry.height, dpr, color.hairline);
  return { clipsDrawn };
}

function drawClips(scene: ContentScene): number {
  const { ctx, geometry, project } = scene;
  const { from, to } = geometry.visibleFrames;
  ctx.save();
  ctx.beginPath();
  ctx.rect(geometry.area.x, geometry.area.y, geometry.area.width, geometry.area.height);
  ctx.clip();
  let drawn = 0;
  for (const row of geometry.rows) {
    if (row.y + row.height <= geometry.area.y || row.y >= geometry.height) continue;
    const track = project.tracks[row.index] as Track;
    const clips = clipsInRange(project, track.id, Math.floor(from), Math.ceil(to) + 1);
    clips.forEach((clip, i) => {
      const next = clips[i + 1];
      drawClip(scene, clip, row, track, next !== undefined && next.start === clip.start + clip.duration, linkOffset(project, clip.id));
    });
    drawn += clips.length;
  }
  ctx.restore();
  return drawn;
}

/**
 * One clip in its row: body, label bar (kind glyph, name, speed and sync badges), selection tint and
 * outline. `syncOffset`: frames off its link partner (`linkOffset`), shown as a `+12` / `-12` badge.
 * TODO(batch 17): filmstrips and waveforms in the body, badges (link, keyframes, fx), label colors.
 */
export function drawClip(scene: ClipScene, clip: Clip, row: Row, track: Track, abutsNext: boolean, syncOffset = 0): void {
  const { ctx, dpr, geometry, theme, selection } = scene;
  const tl = theme.timeline;
  const colors = tl.clip[clip.kind];
  const selected = selection.clipIds.has(clip.id);

  const span = clipSpan(geometry.frameToX(clip.start), geometry.frameToX(clip.start + clip.duration), abutsNext, dpr);
  const x = span.x0 / dpr;
  const width = (span.x1 - span.x0) / dpr;
  const y = snap(row.y + tl.clipInset, dpr);
  const height = snap(row.y + row.height - tl.clipInset, dpr) - y;
  const lod = clipLod(width);

  if (lod === "line") {
    // Below 6 px only the body color shows (spec §6.4).
    ctx.fillStyle = selected ? theme.color.accent : colors.body;
    ctx.fillRect(x, y, width, height);
    return;
  }

  const radius = Math.min(theme.radius.sm, width / 2, height / 2);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.clip();
  ctx.fillStyle = colors.body;
  ctx.fillRect(x, y, width, height);
  // The label bar is the whole clip on S tracks (spec §6.4).
  const labelHeight = track.kind === "caption" || track.height === "S" ? height : Math.min(height, tl.labelHeight);
  ctx.fillStyle = colors.label;
  ctx.fillRect(x, y, width, labelHeight);
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

function drawLabel(scene: ClipScene, clip: Clip, x: number, y: number, width: number, labelHeight: number, syncOffset: number): void {
  const { ctx, theme, text } = scene;
  const pad = theme.space[1];
  const icon = theme.icon.small;
  // The label sticks to the left edge of the track area while the clip starts off screen.
  const left = Math.max(x, scene.geometry.area.x);
  let right = x + width;
  if (right - left < pad + icon + pad) return;
  const centerY = y + labelHeight / 2;
  // With the label bar spanning an S clip, keep the icon and name on the first text line.
  const lineY = Math.min(centerY, y + theme.timeline.labelHeight / 2);
  // Badges from the right end: the sync offset, then the speed (spec §6.4: `2x` when it is not 1;
  // video and audio only, stills and graphics have no speed). The name ends before them.
  const minX = left + pad + icon + pad;
  const badgesEnd = right - theme.space[0];
  let badgesStart = badgesEnd;
  if (syncOffset !== 0) badgesStart = drawBadge(scene, `${syncOffset > 0 ? "+" : "-"}${Math.abs(syncOffset)}`, theme.color.danger, minX, badgesStart, lineY);
  if ((clip.kind === "video" || clip.kind === "audio") && clip.speed !== 1) badgesStart = drawBadge(scene, formatSpeed(clip.speed), theme.color.textSecondary, minX, badgesStart, lineY);
  if (badgesStart < badgesEnd) right = badgesStart;
  drawGlyph(ctx, CLIP_GLYPHS[clip.kind], left + pad, lineY - icon / 2, icon, theme.color.textPrimary);
  const textX = left + pad + icon + pad;
  ctx.font = fontOf(theme, "caption");
  const name = text.fit(ctx, clip.name, right - pad - textX);
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

function drawContentEnd(scene: ContentScene): void {
  const { ctx, dpr, geometry, project, theme } = scene;
  const end = contentEnd(project);
  if (end === 0 || !geometry.isFrameVisible(end)) return;
  vline(ctx, geometry.frameToX(end), geometry.area.y, geometry.area.height, dpr, theme.color.border);
}

function drawHeaders(scene: ContentScene): void {
  const { ctx, geometry, project, theme, text } = scene;
  const pad = theme.space[3];
  const icon = theme.icon.size;
  ctx.font = fontOf(theme, "body");
  ctx.textBaseline = "middle";
  for (const row of geometry.rows) {
    if (row.y + row.height <= geometry.area.y || row.y >= geometry.height) continue;
    const track = project.tracks[row.index] as Track;
    // Icon, name and toggles on the first line, whatever the row height.
    // TODO(batch 16): target, lock and hide toggles, video mute; double-click rename.
    const centerY = row.y + Math.min(row.height, theme.control.comfortable) / 2;
    drawGlyph(ctx, TRACK_GLYPHS[track.kind], pad, centerY - icon / 2, icon, theme.color.textTertiary);
    const textX = pad + icon + theme.space[2];
    const toggles = geometry.headerToggles(row);
    const textRight = toggles ? toggles.mute.x - theme.space[2] : geometry.headerWidth - pad;
    ctx.font = fontOf(theme, "body");
    ctx.fillStyle = theme.color.textSecondary;
    ctx.fillText(text.fit(ctx, track.name, textRight - textX), textX, centerY);
    if (toggles) {
      drawToggle(scene, toggles.mute, "M", track.muted);
      drawToggle(scene, toggles.solo, "S", track.solo);
    }
  }
  drawAddRow(scene, geometry.addVideo, "Video track");
  drawAddRow(scene, geometry.addAudio, "Audio track");
}

/** A header toggle (mute, solo): a letter in a hairline square, accent when on (its hover wash is on the overlay). */
function drawToggle(scene: ContentScene, rect: Rect, letter: string, on: boolean): void {
  const { ctx, dpr, theme } = scene;
  const { color } = theme;
  const line = 1 / dpr;
  const x = snap(rect.x, dpr) + line / 2;
  const y = snap(rect.y, dpr) + line / 2;
  const size = snap(rect.width, dpr) - line;
  ctx.beginPath();
  ctx.roundRect(x, y, size, size, theme.radius.sm);
  if (on) {
    ctx.fillStyle = color.accentWash;
    ctx.fill();
  }
  ctx.strokeStyle = on ? color.accentDim : color.hairline;
  ctx.lineWidth = line;
  ctx.stroke();
  ctx.font = fontOf(theme, "caption");
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = on ? color.accent : color.textTertiary;
  ctx.fillText(letter, rect.x + rect.width / 2, rect.y + rect.height / 2);
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
  ctx.restore();
}
