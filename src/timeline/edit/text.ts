// Text clip edits (spec §10.1, §11 Text section): the content, the box and the style of text clips,
// and new text clips.
// - The vertical anchor (§10.1) and the alignment say which point of the box stays in place when an
//   edit changes the box's size (more lines, a bigger font, a background box): top / middle / bottom
//   and left / center / right. The clip's position moves so that point stays where it was on the
//   frame (rotation and scale included); the default (center, middle) grows evenly.
// - `setTexts` writes edits as one command `clip.text` (one undo step; a field's arrow steps coalesce
//   by key). Locked clips and clips that would not change are skipped. An edit may bring its own
//   transform (a text box handle drag keeps another point in place). A clip still named after its
//   text (as created) keeps being named after it; a name the user gave stays.
// - `addTitle` (spec §10.2, `+ Title` / `+ Subtitle`): a text clip at the playhead on the topmost
//   video track when it is free there (unlocked, shown), else on a new video track above the others;
//   3 s long, or the rest of the video clip under the playhead ("match clip under playhead"); the
//   Title centered, or, created while a text clip is selected, 40 px below that one instead (stacked
//   titles do not overlap); the Subtitle's bottom edge always in the lower third (T, then Shift+T with
//   the title still selected, gives a subtitle under it in the lower third).
//   A text preset's look (spec §10.3) can replace the built-in one: its style, box and animations, and
//   its position when it applies one.
// - `addTextClip` puts a new text clip at a frame on the topmost video track free there, or on a new
//   video track above the others (the dev command).
// - `applyPreset` (spec §10.3 Apply): a preset's style, box and animations on the selected text clips,
//   their content, duration and position kept (the position taken too when the preset applies it);
//   one command `clip.applyPreset`. `linkPreset` records the preset a clip was saved as (`presetId`:
//   what `Update preset` writes into).
import type { Draft } from "immer";
import { addTrack } from "../../core/commands/basicCommands.js";
import type { Command } from "../../core/commands/command.js";
import { emptyTrack, nextTrackName } from "../../core/document/project.js";
import { secondsToFrames } from "../../core/document/time.js";
import type { ClipId, Frame, Project, TextAnim, TextBox, TextClip, TextContent, TextStyle, Track, Transform } from "../../core/document/types.js";
import { textLayout } from "../../render/text/layoutCache.js";
import { DEFAULT_TEXT_BOX, DEFAULT_TEXT_STYLE, firstLine, textContent, titleDefaults, type TitleKind } from "../../text/style.js";
import { clipAtFrame, clipsInRange, isClipLocked } from "../model/queries.js";
import { IDENTITY_TRANSFORM, layerContent, layerCorners, layerPoint, type Size } from "./transform.js";

export interface TextEdit {
  text: TextContent;
  style: TextStyle;
}

/** A text clip's edit for `setTexts`: new content and/or style, and the transform to take (else the anchored one). */
export interface TextEditInput extends Partial<TextEdit> {
  transform?: Transform;
}

const ALIGN_FRACTION = { left: 0, center: 0.5, right: 1 } as const;
const ANCHOR_FRACTION = { top: 0, middle: 0.5, bottom: 1 } as const;

/**
 * `transform` moved so the box point the style anchors (alignment across, vertical anchor down) stays
 * where it is on the frame when the box goes from `before` to `after`.
 */
export function keepAnchored(transform: Transform, before: Size, after: Size, style: Pick<TextStyle, "align" | "verticalAnchor">, frame: Size): Transform {
  if (before.width === after.width && before.height === after.height) return transform;
  const fx = ALIGN_FRACTION[style.align];
  const fy = ANCHOR_FRACTION[style.verticalAnchor];
  const from = layerPoint(transform, before, frame, fx * before.width, fy * before.height);
  const to = layerPoint(transform, after, frame, fx * after.width, fy * after.height);
  if (from.x === to.x && from.y === to.y) return transform;
  return { ...transform, x: transform.x + from.x - to.x, y: transform.y + from.y - to.y };
}

/** A text clip after `edit`: its new content and style, and the transform that keeps its anchored point in place (or the edit's own). */
export function textEdit(project: Project, clip: TextClip, edit: TextEditInput, transform: Transform = clip.transform): TextEdit & { transform: Transform } {
  const text = edit.text ?? clip.text;
  const style = edit.style ?? clip.style;
  if (edit.transform) return { text, style, transform: edit.transform };
  const before = textLayout(clip.text, clip.style);
  const after = textLayout(text, style);
  return { text, style, transform: keepAnchored(transform, before, after, style, project.settings) };
}

/** Whether a text change shows on the timeline (the body's first line, the missing font badge). */
function showsOnTimeline(clip: TextClip, edit: TextEdit): boolean {
  return clip.text.value !== edit.text.value || clip.style.fontFamily !== edit.style.fontFamily || clip.style.textCase !== edit.style.textCase;
}

const sameJson = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

/**
 * `edits` (new content and/or style by clip id) as one command `clip.text`, or null when nothing
 * changes. Clips that are gone, locked or not text are skipped.
 */
export function setTexts(project: Project, edits: ReadonlyMap<ClipId, TextEditInput>, options: { label: string; coalesceKey?: string }): Command | null {
  const writes: [ClipId, TextEdit & { transform: Transform }][] = [];
  let timeline = false;
  for (const [id, edit] of edits) {
    const clip = project.clips[id];
    if (clip?.kind !== "text" || isClipLocked(project, id)) continue;
    const next = textEdit(project, clip, edit);
    if (sameJson(clip.text, next.text) && sameJson(clip.style, next.style) && sameJson(clip.transform, next.transform)) continue;
    if (showsOnTimeline(clip, next)) timeline = true;
    writes.push([id, next]);
  }
  if (writes.length === 0) return null;
  return {
    id: "clip.text",
    label: options.label,
    ...(options.coalesceKey !== undefined && { coalesceKey: options.coalesceKey }),
    affects: timeline ? ["composite", "text", "clips"] : ["composite", "text"],
    run(draft) {
      for (const [id, next] of writes) {
        const clip = draft.clips[id] as Draft<TextClip>;
        if (clip.name === textClipName(clip.text, clip.style)) clip.name = textClipName(next.text, next.style);
        clip.text = structuredClone(next.text);
        clip.style = structuredClone(next.style);
        clip.transform = structuredClone(next.transform);
      }
    },
  };
}

/** A clip's name from its text: the first line, trimmed, at most 40 characters ("Text" when empty). */
export function textClipName(text: TextContent, style: Pick<TextStyle, "textCase">): string {
  const line = firstLine(text, style).replace(/\s+/g, " ").trim();
  return line === "" ? "Text" : line.length > 40 ? `${line.slice(0, 39)}…` : line;
}

/** What a new text clip may take besides its place: content, look, transform and the preset it came from. */
export interface TextClipFields {
  value: string;
  style?: TextStyle;
  box?: TextBox;
  transform?: Transform;
  animIn?: TextAnim;
  animOut?: TextAnim;
  presetId?: string;
}

export function newTextClip(fields: TextClipFields & { id: ClipId; trackId: string; start: Frame; duration: Frame }): TextClip {
  const text = textContent(fields.value, fields.box ?? DEFAULT_TEXT_BOX);
  const style = structuredClone(fields.style ?? DEFAULT_TEXT_STYLE);
  return {
    id: fields.id,
    trackId: fields.trackId,
    kind: "text",
    name: textClipName(text, style),
    start: fields.start,
    duration: fields.duration,
    enabled: true,
    text,
    style,
    transform: structuredClone(fields.transform ?? IDENTITY_TRANSFORM),
    opacity: 1,
    fades: { in: 0, out: 0 },
    ...(fields.animIn && { animIn: structuredClone(fields.animIn) }),
    ...(fields.animOut && { animOut: structuredClone(fields.animOut) }),
    ...(fields.presetId !== undefined && { presetId: fields.presetId }),
  };
}

/**
 * A new text clip of `duration` frames at `frame`: on the topmost unlocked video track free over that
 * span, else on a new video track above the others. One command ("Add text"); the new clip's id.
 */
export function addTextClip(project: Project, frame: Frame, duration: Frame, newId: () => string, fields: TextClipFields): { command: Command; clipId: ClipId } {
  const start = Math.max(0, Math.round(frame));
  const length = Math.max(1, Math.round(duration));
  const videos = project.tracks.filter((track) => track.kind === "video");
  const free = [...videos].reverse().find((track) => !track.locked && clipsInRange(project, track.id, start, start + length).length === 0);
  return insertTextClip(project, free ?? null, start, length, newId, fields, "Add text");
}

/** The default length of a title (spec §10.2). */
export const TITLE_SECONDS = 3;
/** The gap between a selected text clip and a title created under it (Batch 29), in project px. */
export const TITLE_STACK_GAP = 40;
/** Where the Subtitle's bottom edge sits, as a fraction of the frame height: in the lower third (spec §10.2). */
export const SUBTITLE_BOTTOM = 0.78;

export interface TitleOptions {
  kind: TitleKind;
  playhead: Frame;
  /** "Match clip under playhead" (spec §10.2, an app setting, on by default). */
  matchClip: boolean;
  /** A selected text clip: a new Title goes TITLE_STACK_GAP px below it. */
  below?: ClipId | null;
  /** A preset's look (spec §10.2 default Title / Subtitle presets, the favorite chips) instead of the built-in one. */
  look?: TitleLook | null;
  /** The undo label (default: "Add title" / "Add subtitle"). */
  label?: string;
}

/** A text preset's look scaled to the project (text/presets.ts `presetLook`) and the preset it is. */
export interface TitleLook {
  style: TextStyle;
  box: TextBox;
  /** The preset's position (it applies one), else null: the Title or Subtitle placement. */
  position: { x: number; y: number } | null;
  animIn?: TextAnim;
  animOut?: TextAnim;
  presetId?: string;
  /** The clip's length (the preset's default duration), else the title length. */
  duration?: Frame;
}

/** The topmost video clip under `frame` on a shown video track, or null. */
function videoUnder(project: Project, frame: Frame): Track | null {
  const videos = project.tracks.filter((track) => track.kind === "video" && !track.hidden);
  for (let i = videos.length - 1; i >= 0; i--) {
    const track = videos[i] as Track;
    if (clipAtFrame(project, track.id, frame)?.kind === "video") return track;
  }
  return null;
}

/** A title's length in frames (spec §10.2): the rest of the video clip under the playhead when matching, else TITLE_SECONDS. */
export function titleDuration(project: Project, playhead: Frame, matchClip: boolean): Frame {
  const fallback = secondsToFrames(TITLE_SECONDS, project.settings.fps);
  if (!matchClip) return fallback;
  const track = videoUnder(project, playhead);
  const clip = track ? clipAtFrame(project, track.id, playhead) : null;
  return clip ? Math.max(1, clip.start + clip.duration - playhead) : fallback;
}

/** Where a new title sits: the Subtitle in the lower third, a Title under the selected text clip `below` or centered. */
function titleTransform(project: Project, kind: TitleKind, box: Size, below: ClipId | null | undefined): Transform {
  const frame = project.settings;
  const over = below && kind === "title" ? project.clips[below] : undefined;
  const content = over?.kind === "text" ? layerContent(project, over) : null;
  if (over?.kind === "text" && content) {
    const corners = layerCorners(over.transform, content, frame);
    const xs = corners.map((p) => p.x);
    const bottom = Math.max(...corners.map((p) => p.y));
    const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
    return { ...IDENTITY_TRANSFORM, x: Math.round(centerX - frame.width / 2), y: Math.round(bottom + TITLE_STACK_GAP + box.height / 2 - frame.height / 2) };
  }
  if (kind === "subtitle") return { ...IDENTITY_TRANSFORM, y: Math.round(SUBTITLE_BOTTOM * frame.height - box.height / 2 - frame.height / 2) };
  return { ...IDENTITY_TRANSFORM };
}

/**
 * `+ Title` / `+ Subtitle` (spec §10.2): a new text clip with the default Title or Subtitle (content,
 * style, box) at the playhead. One command ("Add title" / "Add subtitle"); the new clip's id.
 */
export function addTitle(project: Project, options: TitleOptions, newId: () => string): { command: Command; clipId: ClipId } {
  const start = Math.max(0, Math.round(options.playhead));
  const look = options.look ?? null;
  const length = look?.duration !== undefined ? Math.max(1, Math.round(look.duration)) : titleDuration(project, start, options.matchClip);
  const builtIn = titleDefaults(options.kind, project.settings);
  const fields: TextClipFields = look
    ? {
        value: builtIn.value,
        style: look.style,
        box: look.box,
        ...(look.animIn && { animIn: look.animIn }),
        ...(look.animOut && { animOut: look.animOut }),
        ...(look.presetId !== undefined && { presetId: look.presetId }),
      }
    : builtIn;
  const videos = project.tracks.filter((track) => track.kind === "video");
  const top = videos.at(-1);
  const free = top && !top.locked && !top.hidden && clipsInRange(project, top.id, start, start + length).length === 0 ? top : null;
  const box = textLayout(textContent(fields.value, fields.box ?? DEFAULT_TEXT_BOX), fields.style ?? DEFAULT_TEXT_STYLE);
  const transform = look?.position ? { ...IDENTITY_TRANSFORM, x: look.position.x, y: look.position.y } : titleTransform(project, options.kind, box, options.below);
  return insertTextClip(project, free, start, length, newId, { ...fields, transform }, options.label ?? (options.kind === "title" ? "Add title" : "Add subtitle"));
}

/** A preset to apply (spec §10.3): its look scaled to the project, and its id. */
export interface PresetApply {
  presetId: string;
  style: TextStyle;
  box: TextBox;
  /** Taken when the preset applies its position, else null (the clips keep theirs). */
  position: { x: number; y: number } | null;
  animIn?: TextAnim;
  animOut?: TextAnim;
}

/**
 * A preset applied to the text clips among `ids` (spec §10.3 Apply): its style, box and animations
 * replace theirs, content and duration stay, the position too unless the preset applies its own. One
 * command `clip.applyPreset`, or null when no unlocked text clip would change.
 */
export function applyPreset(project: Project, ids: readonly ClipId[], preset: PresetApply, label: string): Command | null {
  const targets: ClipId[] = [];
  for (const id of ids) {
    const clip = project.clips[id];
    if (clip?.kind !== "text" || isClipLocked(project, id) || targets.includes(id)) continue;
    const moved = preset.position !== null && (clip.transform.x !== preset.position.x || clip.transform.y !== preset.position.y);
    const same = sameJson(clip.style, preset.style) && sameJson(clip.text.box, preset.box) && sameJson(clip.animIn, preset.animIn) && sameJson(clip.animOut, preset.animOut);
    if (same && !moved && clip.presetId === preset.presetId) continue;
    targets.push(id);
  }
  if (targets.length === 0) return null;
  return {
    id: "clip.applyPreset",
    label,
    affects: ["composite", "text", "clips"],
    run(draft) {
      for (const id of targets) {
        const clip = draft.clips[id] as Draft<TextClip>;
        const named = clip.name === textClipName(clip.text, clip.style);
        clip.style = structuredClone(preset.style);
        clip.text.box = { ...preset.box };
        if (preset.animIn) clip.animIn = structuredClone(preset.animIn);
        else delete clip.animIn;
        if (preset.animOut) clip.animOut = structuredClone(preset.animOut);
        else delete clip.animOut;
        if (preset.position) {
          clip.transform.x = preset.position.x;
          clip.transform.y = preset.position.y;
        }
        clip.presetId = preset.presetId;
        // Another text case changes the first line a clip named after its text shows.
        if (named) clip.name = textClipName(clip.text, clip.style);
      }
    },
  };
}

/** `clipId` records `presetId` as its preset (Save as preset); null when it already does or cannot. */
export function linkPreset(project: Project, clipId: ClipId, presetId: string, label: string): Command | null {
  const clip = project.clips[clipId];
  if (clip?.kind !== "text" || isClipLocked(project, clipId) || clip.presetId === presetId) return null;
  return {
    id: "clip.linkPreset",
    label,
    affects: ["text"],
    run(draft) {
      (draft.clips[clipId] as Draft<TextClip>).presetId = presetId;
    },
  };
}

/** The command adding a text clip on `track`, or on a new video track above the others when null. */
function insertTextClip(project: Project, track: Track | null, start: Frame, length: Frame, newId: () => string, fields: TextClipFields, label: string): { command: Command; clipId: ClipId } {
  const newTrack = track ? null : emptyTrack(newId(), "video", nextTrackName(project.tracks, "video"));
  const trackId = track?.id ?? (newTrack as NonNullable<typeof newTrack>).id;
  const clip = newTextClip({ id: newId(), trackId, start, duration: length, ...fields });
  const trackCommand = newTrack ? addTrack(newTrack) : null;
  return {
    clipId: clip.id,
    command: {
      id: "clip.addText",
      label,
      affects: ["clips", "timeline", "composite", "text", ...(newTrack ? (["tracks"] as const) : [])],
      run(draft, ctx) {
        trackCommand?.run(draft, ctx);
        draft.clips[clip.id] = structuredClone(clip);
        const track = draft.tracks.find((candidate) => candidate.id === trackId);
        if (!track) throw new Error(`clip.addText: track ${trackId} does not exist`);
        const at = track.clipIds.findIndex((id) => (draft.clips[id]?.start ?? 0) > start);
        track.clipIds.splice(at === -1 ? track.clipIds.length : at, 0, clip.id);
      },
    },
  };
}
