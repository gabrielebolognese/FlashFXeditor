// Text clip edits (spec §10.1, §11 Text section): the content, the box and the style of text clips,
// and new text clips.
// - The vertical anchor (§10.1) and the alignment say which point of the box stays in place when an
//   edit changes the box's size (more lines, a bigger font, a background box): top / middle / bottom
//   and left / center / right. The clip's position moves so that point stays where it was on the
//   frame (rotation and scale included); the default (center, middle) grows evenly.
// - `setTexts` writes edits as one command `clip.text` (one undo step; a field's arrow steps coalesce
//   by key). Locked clips and clips that would not change are skipped.
// - `addTextClip` puts a new text clip at a frame on the topmost video track free there, or on a new
//   video track above the others (the dev command; Batch 29's `+ Title` decides its own placement).
import type { Draft } from "immer";
import { addTrack } from "../../core/commands/basicCommands.js";
import type { Command } from "../../core/commands/command.js";
import { emptyTrack, nextTrackName } from "../../core/document/project.js";
import type { ClipId, Frame, Project, TextBox, TextClip, TextContent, TextStyle, Transform } from "../../core/document/types.js";
import { textLayout } from "../../render/text/layoutCache.js";
import { DEFAULT_TEXT_BOX, DEFAULT_TEXT_STYLE, firstLine, textContent } from "../../text/style.js";
import { clipsInRange, isClipLocked } from "../model/queries.js";
import { IDENTITY_TRANSFORM, layerPoint, type Size } from "./transform.js";

export interface TextEdit {
  text: TextContent;
  style: TextStyle;
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

/** A text clip after `edit`: its new content and style, and the transform that keeps its anchored point in place. */
export function textEdit(project: Project, clip: TextClip, edit: Partial<TextEdit>, transform: Transform = clip.transform): TextEdit & { transform: Transform } {
  const text = edit.text ?? clip.text;
  const style = edit.style ?? clip.style;
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
export function setTexts(project: Project, edits: ReadonlyMap<ClipId, Partial<TextEdit>>, options: { label: string; coalesceKey?: string }): Command | null {
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

export function newTextClip(fields: { id: ClipId; trackId: string; start: Frame; duration: Frame; value: string; style?: TextStyle; box?: TextBox; transform?: Transform }): TextClip {
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
  };
}

/**
 * A new text clip of `duration` frames at `frame`: on the topmost unlocked video track free over that
 * span, else on a new video track above the others. One command ("Add text"); the new clip's id.
 */
export function addTextClip(project: Project, frame: Frame, duration: Frame, newId: () => string, fields: { value: string; style?: TextStyle; box?: TextBox; transform?: Transform }): { command: Command; clipId: ClipId } {
  const start = Math.max(0, Math.round(frame));
  const length = Math.max(1, Math.round(duration));
  const videos = project.tracks.filter((track) => track.kind === "video");
  const free = [...videos].reverse().find((track) => !track.locked && clipsInRange(project, track.id, start, start + length).length === 0);
  const newTrack = free ? null : emptyTrack(newId(), "video", nextTrackName(project.tracks, "video"));
  const trackId = free?.id ?? (newTrack as NonNullable<typeof newTrack>).id;
  const clip = newTextClip({ id: newId(), trackId, start, duration: length, ...fields });
  const trackCommand = newTrack ? addTrack(newTrack) : null;
  return {
    clipId: clip.id,
    command: {
      id: "clip.addText",
      label: "Add text",
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
