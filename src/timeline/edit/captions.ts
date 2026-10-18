// Caption edits (spec §10.5, §6.12): the pure edits behind the caption track and the cue list. Each is
// one command (one undo step).
// - The caption track is unique (`CC`, always S, above every video track) and carries its style in
//   `captionTracks[trackId]`; `+ Cue at playhead` and an import create it when it is missing.
// - Cues never overlap (the model enforces it): a moved cue stops at the cues around it that stay
//   (`cueMoveRange`); a copied one (Alt-drag) goes to the free spot nearest the drop, within its own
//   length of it, else nowhere (`clampCueDelta`); trims of a cue are regular trims (trim.ts: no push
//   on this track).
// - A new cue goes at the playhead, after the cue under it, for at most 2 s before the next one.
// - Splitting at the caret, merging with the previous cue and the text edit follow text/captions.ts.
// - Import replaces every cue of the track with the file's (overlaps resolved: a cue starting inside
//   the previous one cuts it there; two starting on the same frame become one); export writes the
//   cues in order with their frames as times (word timings are not exported).
// - A transcription (spec §10.6) replaces the cues overlapping its range with its own, placed inside
//   the range on the frame grid as an import's.
import type { Draft } from "immer";
import type { Command } from "../../core/commands/command.js";
import { defaultTrackIndex } from "../../core/commands/basicCommands.js";
import { emptyTrack } from "../../core/document/project.js";
import { frameToUs, secondsToFrames, usToFrame } from "../../core/document/time.js";
import type { CaptionClip, CaptionStyle, CaptionWord, Clip, ClipId, Frame, Project, Track, TrackId } from "../../core/document/types.js";
import { CAPTION_TRACK_NAME, CUE_SECONDS, defaultCaptionStyle, mergeCues, NEW_CUE_TEXT, splitCueAt } from "../../text/captions.js";
import type { SubtitleCue } from "../../text/subtitles.js";
import { clipInIndex, clipsOverlapping, lastClipStartingBy, trackIndex, type TrackIndex } from "../model/queries.js";

/** The name every cue gets (the cue list and the timeline show its text). */
export const CUE_NAME = "Caption";

/** The project's caption track, or null. */
export function captionTrackOf(project: Project): Track | null {
  return project.tracks.find((track) => track.kind === "caption") ?? null;
}

/** The style of the caption track `trackId` (the default one when its data is missing). */
export function captionStyleOf(project: Project, trackId: TrackId): CaptionStyle {
  return project.captionTracks[trackId]?.style ?? defaultCaptionStyle(project.settings);
}

/** The cues of the caption track in order (none without one). */
export function cuesOf(project: Project): readonly CaptionClip[] {
  const track = captionTrackOf(project);
  return track ? (trackIndex(project, track).clips as readonly CaptionClip[]) : [];
}

/** A new caption track (not in the document): `CC`, S, targeted. */
export function newCaptionTrack(id: TrackId): Track {
  return { ...emptyTrack(id, "caption", CAPTION_TRACK_NAME), height: "S" };
}

/** Puts `track` (a new caption track) above the video tracks with `style` (inside a command). */
function insertCaptionTrack(draft: Draft<Project>, track: Track, style: CaptionStyle): void {
  if (draft.tracks.some((t) => t.kind === "caption")) throw new Error("track.addCaption: the project has a caption track");
  draft.tracks.splice(defaultTrackIndex(draft.tracks, "caption"), 0, structuredClone(track));
  draft.captionTracks[track.id] = { style: structuredClone(style) };
}

/** `+ Caption track` (spec §17): the caption track with the default style. Null when the project has one. */
export function addCaptionTrack(project: Project, id: TrackId): Command | null {
  if (captionTrackOf(project)) return null;
  const track = newCaptionTrack(id);
  const style = defaultCaptionStyle(project.settings);
  return {
    id: "track.addCaption",
    label: "Add caption track",
    affects: ["tracks", "timeline", "captions"],
    run(draft) {
      insertCaptionTrack(draft, track, style);
    },
  };
}

/** A cue (not in the document). */
export function newCue(id: ClipId, trackId: TrackId, start: Frame, duration: Frame, text: string, words?: readonly CaptionWord[]): CaptionClip {
  return { id, trackId, kind: "caption", name: CUE_NAME, start, duration, enabled: true, text, ...(words && words.length > 0 && { words: words.map((word) => ({ ...word })) }) };
}

/**
 * Where a cue of up to `length` frames goes at `frame`: there, or after the cue it falls in (and the
 * cues right after that one), up to the next cue. Null when there is no track yet: anywhere fits.
 */
export function cueSpot(project: Project, track: Track | null, frame: Frame, length: Frame): { start: Frame; duration: Frame } {
  let start = Math.max(0, frame);
  if (!track) return { start, duration: length };
  const index = trackIndex(project, track);
  for (let covering = clipInIndex(index, start); covering; covering = clipInIndex(index, start)) start = covering.start + covering.duration;
  const next = index.clips[lastClipStartingBy(index, start) + 1];
  return { start, duration: Math.max(1, Math.min(length, next ? next.start - start : length)) };
}

export interface AddCueResult {
  command: Command;
  cueId: ClipId;
  trackId: TrackId;
}

/**
 * `+ Cue at playhead` (spec §10.5): a 2 s cue reading `Caption` at `frame` (see `cueSpot`), on the
 * caption track, which is created with the default style when missing (one undo step). Null when the
 * track is locked.
 */
export function addCueAt(project: Project, frame: Frame, newId: () => string, text = NEW_CUE_TEXT): AddCueResult | null {
  const existing = captionTrackOf(project);
  if (existing?.locked) return null;
  const track = existing ?? newCaptionTrack(newId());
  const style = existing ? null : defaultCaptionStyle(project.settings);
  const spot = cueSpot(project, existing, frame, secondsToFrames(CUE_SECONDS, project.settings.fps));
  const cue = newCue(newId(), track.id, spot.start, spot.duration, text);
  return {
    cueId: cue.id,
    trackId: track.id,
    command: {
      id: "caption.add",
      label: "Add cue",
      affects: style ? ["tracks", "clips", "timeline", "captions"] : ["clips", "timeline", "captions"],
      run(draft) {
        if (style) insertCaptionTrack(draft, track, style);
        const target = draft.tracks.find((t) => t.id === track.id) as Draft<Track>;
        draft.clips[cue.id] = structuredClone(cue) as Draft<Clip>;
        const at = target.clipIds.findIndex((id) => (draft.clips[id]?.start ?? 0) > cue.start);
        target.clipIds.splice(at === -1 ? target.clipIds.length : at, 0, cue.id);
      },
    },
  };
}

/** The cue `id` when it can be edited (it exists and its track is not locked). */
function editableCue(project: Project, id: ClipId): CaptionClip | null {
  const clip = project.clips[id];
  if (clip?.kind !== "caption") return null;
  return project.tracks.find((track) => track.id === clip.trackId)?.locked ? null : clip;
}

function cueFields(id: ClipId, fields: Partial<Pick<CaptionClip, "text" | "start" | "duration" | "words">>, words: "keep" | "set"): (draft: Draft<Project>) => void {
  return (draft) => {
    const cue = draft.clips[id];
    if (cue?.kind !== "caption") throw new Error(`caption: cue ${id} does not exist`);
    if (fields.text !== undefined) cue.text = fields.text;
    if (fields.start !== undefined) cue.start = fields.start;
    if (fields.duration !== undefined) cue.duration = fields.duration;
    if (words === "set") {
      if (fields.words && fields.words.length > 0) cue.words = structuredClone(fields.words);
      else delete cue.words;
    }
  };
}

/** The cue list's text edit (spec §10.5): one undo step "Edit caption"; the word timings stay. Null when nothing changes. */
export function setCueText(project: Project, id: ClipId, text: string): Command | null {
  const cue = editableCue(project, id);
  if (!cue || cue.text === text) return null;
  return { id: "caption.text", label: "Edit caption", affects: ["clips", "captions"], run: cueFields(id, { text }, "keep") };
}

export interface SplitCueResult {
  command: Command;
  /** The right half's id (the left keeps the cue's). */
  rightId: ClipId;
}

/**
 * Enter in the cue list (spec §10.5): the cue showing `text` (the edited text) split at `caret` into
 * two cues, the timing split by the share of characters (text/captions.ts `splitCueAt`). Null when
 * the cue is too short or locked.
 */
export function splitCue(project: Project, id: ClipId, text: string, caret: number, newId: () => string): SplitCueResult | null {
  const cue = editableCue(project, id);
  if (!cue) return null;
  const split = splitCueAt({ ...cue, text }, caret);
  if (!split) return null;
  const right: CaptionClip = { ...newCue(newId(), cue.trackId, cue.start + split.at, cue.duration - split.at, split.right.text, split.right.words), name: cue.name, enabled: cue.enabled, ...(cue.color && { color: cue.color }) };
  const setLeft = cueFields(id, { text: split.left.text, duration: split.at, ...(split.left.words && { words: split.left.words }) }, "set");
  return {
    rightId: right.id,
    command: {
      id: "caption.split",
      label: "Split cue",
      affects: ["clips", "timeline", "captions"],
      run(draft) {
        setLeft(draft);
        const track = draft.tracks.find((t) => t.id === cue.trackId) as Draft<Track>;
        track.clipIds.splice(track.clipIds.indexOf(id) + 1, 0, right.id);
        draft.clips[right.id] = structuredClone(right) as Draft<Clip>;
      },
    },
  };
}

export interface MergeCueResult {
  command: Command;
  /** The merged cue (the previous one's id) and where the caret goes: the junction. */
  cueId: ClipId;
  caret: number;
}

/**
 * Mod+Backspace at the start of a cue (spec §10.5): the cue (showing `text`) merged into the cue before
 * it, which keeps its id and start and spans to the cue's end. Null for the first cue or a locked track.
 */
export function mergeWithPrevious(project: Project, id: ClipId, text?: string): MergeCueResult | null {
  const cue = editableCue(project, id);
  const track = cue ? project.tracks.find((t) => t.id === cue.trackId) : undefined;
  if (!cue || !track) return null;
  const index = trackIndex(project, track);
  const prev = index.clips[index.clips.indexOf(cue) - 1] as CaptionClip | undefined;
  if (!prev) return null;
  const merged = mergeCues(prev, { ...cue, text: text ?? cue.text });
  const setPrev = cueFields(prev.id, { text: merged.text, duration: merged.duration, ...(merged.words && { words: merged.words }) }, "set");
  return {
    cueId: prev.id,
    caret: merged.caret,
    command: {
      id: "caption.merge",
      label: "Merge cues",
      affects: ["clips", "timeline", "captions"],
      run(draft) {
        const target = draft.tracks.find((t) => t.id === track.id) as Draft<Track>;
        target.clipIds.splice(target.clipIds.indexOf(id), 1);
        delete draft.clips[id];
        setPrev(draft);
      },
    },
  };
}

/** Clear all (spec §10.5): every cue goes, the track and its style stay. Null without cues or with a locked track. */
export function clearCues(project: Project): Command | null {
  const track = captionTrackOf(project);
  if (!track || track.locked || track.clipIds.length === 0) return null;
  const ids = [...track.clipIds];
  return {
    id: "caption.clear",
    label: "Clear captions",
    affects: ["clips", "timeline", "captions"],
    run(draft) {
      const target = draft.tracks.find((t) => t.id === track.id) as Draft<Track>;
      target.clipIds = [];
      for (const cueId of ids) delete draft.clips[cueId];
    },
  };
}

/** A cue read from a file, in frames (words relative to its start). */
export interface ImportedCue {
  start: Frame;
  duration: Frame;
  text: string;
  words?: CaptionWord[];
}

/**
 * Subtitle cues (µs) as cues on the frame grid: times to the nearest frame (at least one frame long),
 * in start order, overlaps resolved (a cue starting inside the previous one cuts it there; two on the
 * same start frame become one, their texts on separate lines). `adjusted` counts the cues changed so.
 */
export function cuesFromSubtitles(cues: readonly SubtitleCue[], fps: Project["settings"]["fps"]): { cues: ImportedCue[]; adjusted: number } {
  const timed = cues.map((cue, order) => {
    const start = Math.max(0, usToFrame(cue.startUs, fps));
    const duration = Math.max(1, usToFrame(cue.endUs, fps) - start);
    const words = cue.words?.map((word) => {
      const from = Math.min(duration - 1, Math.max(0, usToFrame(word.startUs, fps) - start));
      return { text: word.text, start: from, end: Math.max(from + 1, Math.min(duration, usToFrame(word.endUs, fps) - start)) };
    });
    return { order, cue: { start, duration, text: cue.text, ...(words && words.length > 0 && { words }) } as ImportedCue };
  });
  timed.sort((a, b) => a.cue.start - b.cue.start || a.order - b.order);
  const out: ImportedCue[] = [];
  let adjusted = 0;
  for (const { cue } of timed) {
    const prev = out[out.length - 1];
    if (prev && cue.start < prev.start + prev.duration) {
      adjusted += 1;
      if (cue.start === prev.start) {
        prev.text = [prev.text, cue.text].filter((text) => text !== "").join("\n");
        prev.duration = Math.max(prev.duration, cue.duration);
        continue;
      }
      prev.duration = cue.start - prev.start;
      if (prev.words) prev.words = prev.words.filter((word) => word.start < prev.duration).map((word) => ({ ...word, end: Math.min(word.end, prev.duration) }));
    }
    out.push(cue);
  }
  return { cues: out, adjusted };
}

export interface ImportCuesResult {
  command: Command;
  trackId: TrackId;
  /** Cues placed, cues of the track they replaced, cues changed to fit the frame grid without overlaps. */
  count: number;
  replaced: number;
  adjusted: number;
}

/**
 * Import SRT/VTT (spec §10.5): the file's cues replace the caption track's (created with the default
 * style when missing), one undo step. Null when the track is locked.
 */
export function importCues(project: Project, subtitles: readonly SubtitleCue[], newId: () => string): ImportCuesResult | null {
  const existing = captionTrackOf(project);
  if (existing?.locked) return null;
  const track = existing ?? newCaptionTrack(newId());
  const style = existing ? null : defaultCaptionStyle(project.settings);
  const { cues, adjusted } = cuesFromSubtitles(subtitles, project.settings.fps);
  const placed = cues.map((cue) => newCue(newId(), track.id, cue.start, cue.duration, cue.text, cue.words));
  const replaced = existing ? [...existing.clipIds] : [];
  return {
    trackId: track.id,
    count: placed.length,
    replaced: replaced.length,
    adjusted,
    command: {
      id: "caption.import",
      label: "Import captions",
      affects: ["tracks", "clips", "timeline", "captions"],
      run(draft) {
        if (style) insertCaptionTrack(draft, track, style);
        for (const id of replaced) delete draft.clips[id];
        for (const cue of placed) draft.clips[cue.id] = structuredClone(cue) as Draft<Clip>;
        (draft.tracks.find((t) => t.id === track.id) as Draft<Track>).clipIds = placed.map((cue) => cue.id);
      },
    },
  };
}

/** The cues overlapping frames [start, end): the ones a transcription of that range replaces. */
export function cuesInRange(project: Project, range: { start: Frame; end: Frame }): readonly CaptionClip[] {
  return cuesOf(project).filter((cue) => cue.start < range.end && cue.start + cue.duration > range.start);
}

/** `cues` (µs from `offsetUs`) moved to µs from the timeline's start. */
function shiftCues(cues: readonly SubtitleCue[], offsetUs: number): SubtitleCue[] {
  return cues.map((cue) => ({
    ...cue,
    startUs: cue.startUs + offsetUs,
    endUs: cue.endUs + offsetUs,
    ...(cue.words && { words: cue.words.map((word) => ({ ...word, startUs: word.startUs + offsetUs, endUs: word.endUs + offsetUs })) }),
  }));
}

/**
 * Transcribed cues (spec §10.6) of frames [start, end): `cues` are in µs from the range's start, with
 * their words. On the frame grid as an import's, kept inside the range (a cue running past its end is
 * cut there, with its words), but never two on one frame: an import joins those and keeps only the
 * first one's word timings, so a cue starting on or before the frame of the one before it moves to
 * the frame after it. Exported for the review step, which shows them before they are placed.
 */
export function transcribedCues(cues: readonly SubtitleCue[], range: { start: Frame; end: Frame }, fps: Project["settings"]["fps"]): ImportedCue[] {
  let last = -1;
  const apart = shiftCues(cues, frameToUs(range.start, fps))
    .sort((a, b) => a.startUs - b.startUs)
    .map((cue) => {
      const frame = Math.max(0, usToFrame(cue.startUs, fps));
      const start = Math.max(frame, last + 1);
      last = start;
      if (start === frame) return cue;
      const startUs = frameToUs(start, fps);
      return { ...cue, startUs, endUs: Math.max(cue.endUs, startUs) };
    });
  const framed = cuesFromSubtitles(apart, fps).cues;
  const inside: ImportedCue[] = [];
  for (const cue of framed) {
    if (cue.start < range.start || cue.start >= range.end) continue;
    const duration = Math.min(cue.duration, range.end - cue.start);
    const words = cue.words?.filter((word) => word.start < duration).map((word) => ({ ...word, end: Math.min(word.end, duration) }));
    inside.push({ start: cue.start, duration, text: cue.text, ...(words && words.length > 0 && { words }) });
  }
  return inside;
}

export interface TranscribeCuesResult {
  command: Command;
  trackId: TrackId;
  /** Cues placed, and the cues of the range they replaced. */
  count: number;
  replaced: number;
}

/**
 * A transcription's cues (`transcribedCues`) into the caption track (spec §10.6), replacing the cues
 * that overlap the range (the user confirmed it in the review), the track created with the default
 * style when missing. One undo step "Transcribe captions". Null when the track is locked or there is
 * no cue to place.
 */
export function replaceCuesInRange(project: Project, range: { start: Frame; end: Frame }, cues: readonly ImportedCue[], newId: () => string): TranscribeCuesResult | null {
  const existing = captionTrackOf(project);
  if (existing?.locked || cues.length === 0) return null;
  const track = existing ?? newCaptionTrack(newId());
  const style = existing ? null : defaultCaptionStyle(project.settings);
  const placed = cues.map((cue) => newCue(newId(), track.id, cue.start, cue.duration, cue.text, cue.words));
  const replaced = new Set(cuesInRange(project, range).map((cue) => cue.id));
  const kept = existing ? existing.clipIds.filter((id) => !replaced.has(id)) : [];
  const starts = new Map<ClipId, Frame>([...kept.map((id) => [id, project.clips[id]?.start ?? 0] as const), ...placed.map((cue) => [cue.id, cue.start] as const)]);
  const order = [...kept, ...placed.map((cue) => cue.id)].sort((a, b) => (starts.get(a) ?? 0) - (starts.get(b) ?? 0));
  return {
    trackId: track.id,
    count: placed.length,
    replaced: replaced.size,
    command: {
      id: "caption.transcribe",
      label: "Transcribe captions",
      affects: ["tracks", "clips", "timeline", "captions"],
      run(draft) {
        if (style) insertCaptionTrack(draft, track, style);
        for (const id of replaced) delete draft.clips[id];
        for (const cue of placed) draft.clips[cue.id] = structuredClone(cue) as Draft<Clip>;
        (draft.tracks.find((t) => t.id === track.id) as Draft<Track>).clipIds = order;
      },
    },
  };
}

/**
 * Export SRT/VTT (spec §10.5): the cues in order, their frames as times (word timings left out). With
 * a range (the Export tab's in/out, spec §16), the cues it shows, cut to it and timed from its start,
 * so they match a video exported from the same range.
 */
export function exportCues(project: Project, range?: { start: Frame; end: Frame }): SubtitleCue[] {
  const { fps } = project.settings;
  const from = range?.start ?? 0;
  const to = range?.end ?? Infinity;
  return cuesOf(project).flatMap((cue) => {
    const start = Math.max(cue.start, from);
    const end = Math.min(cue.start + cue.duration, to);
    return end > start ? [{ startUs: frameToUs(start - from, fps), endUs: frameToUs(end - from, fps), text: cue.text }] : [];
  });
}

/** The caption style edit (spec §10.5, §11 Caption style): one undo step; null when nothing changes. */
export function setCaptionStyle(project: Project, trackId: TrackId, style: CaptionStyle, options: { label: string; coalesceKey?: string }): Command | null {
  const track = project.tracks.find((t) => t.id === trackId);
  if (track?.kind !== "caption" || track.locked) return null;
  const current = project.captionTracks[trackId]?.style;
  if (current && JSON.stringify(current) === JSON.stringify(style)) return null;
  return {
    id: "caption.style",
    label: options.label,
    ...(options.coalesceKey !== undefined && { coalesceKey: options.coalesceKey }),
    affects: ["captions"],
    run(draft) {
      draft.captionTracks[trackId] = { style: structuredClone(style) };
    },
  };
}

// --- Moving cues -----------------------------------------------------------------------------------

/** The moved cues among `ids`, in track order, and the caption track's index. */
function movedCues(project: Project, ids: Iterable<ClipId>): { cues: CaptionClip[]; index: TrackIndex } | null {
  const track = captionTrackOf(project);
  if (!track) return null;
  const moving = new Set(ids);
  const index = trackIndex(project, track);
  const cues = (index.clips as CaptionClip[]).filter((cue) => moving.has(cue.id));
  return cues.length > 0 ? { cues, index } : null;
}

/**
 * The deltas a move of `ids` can take (spec §10.5: "moving a cue is clamped by its neighbors"): every
 * moved cue stays between the cues around it that stay (and after frame 0). Null when no cue moves.
 */
export function cueMoveRange(project: Project, ids: Iterable<ClipId>): { lo: number; hi: number } | null {
  const found = movedCues(project, ids);
  if (!found) return null;
  const moving = new Set(found.cues.map((cue) => cue.id));
  const { clips } = found.index;
  let lo = -Infinity;
  let hi = Infinity;
  let prevEnd = 0;
  let pending: CaptionClip[] = [];
  const close = (nextStart: number) => {
    for (const cue of pending) hi = Math.min(hi, nextStart - (cue.start + cue.duration));
    pending = [];
  };
  for (const clip of clips) {
    if (moving.has(clip.id)) {
      lo = Math.max(lo, prevEnd - clip.start);
      pending.push(clip as CaptionClip);
    } else {
      close(clip.start);
      prevEnd = clip.start + clip.duration;
    }
  }
  close(Infinity);
  return { lo: Math.min(0, lo), hi: Math.max(0, hi) };
}

/** Whether copies of `cues` moved by `delta` fit between the cues of `index` (the originals stay). */
function fits(cues: readonly Pick<Clip, "start" | "duration">[], index: TrackIndex, delta: number): boolean {
  for (const cue of cues) {
    const start = cue.start + delta;
    if (start < 0 || clipsOverlapping(index, start, start + cue.duration).length > 0) return false;
  }
  return true;
}

/**
 * The delta a drop of `ids` by `delta` gets on the caption track: a move is clamped to `cueMoveRange`;
 * copies (`duplicate`: the originals stay) go to the delta nearest `delta` where no copy overlaps a cue,
 * at most the copied block's length from it and with every dropped clip at frame 0 or later, or null
 * when there is none. `delta` itself when no cue is dropped.
 */
export function clampCueDelta(project: Project, ids: Iterable<ClipId>, delta: number, duplicate: boolean): number | null {
  const list = [...ids];
  if (!duplicate) {
    const range = cueMoveRange(project, list);
    return range ? Math.min(range.hi, Math.max(range.lo, delta)) : delta;
  }
  const found = movedCues(project, list);
  if (!found) return delta;
  // The clips copied with the cues stay at frame 0 or later too (as a paste's, `pasteClips`).
  const first = Math.min(...list.map((id) => project.clips[id]?.start ?? Infinity));
  return freeCueDelta(found.cues, found.index, delta, -first);
}

/**
 * The delta nearest `delta` at which copies of `cues` (the originals stay; or cues not in the document
 * yet: a paste, Batch 39) fit between the cues of `index`, at most the copied block's length from it and
 * not below `min` (what moves with them stays at frame 0 or later); null when there is none.
 */
export function freeCueDelta(cues: readonly Pick<Clip, "start" | "duration">[], index: TrackIndex, delta: number, min = -Infinity): number | null {
  if (cues.length === 0) return delta;
  if (delta >= min && fits(cues, index, delta)) return delta;
  // Candidates: deltas that put a copy against a cue's edge, tried nearest first, at most the copied
  // block's length away from the drop (a copy never lands far from the pointer).
  const span = Math.max(...cues.map((cue) => cue.start + cue.duration)) - Math.min(...cues.map((cue) => cue.start));
  const candidates: number[] = [];
  for (const cue of cues) for (const other of index.clips) candidates.push(other.start + other.duration - cue.start, other.start - (cue.start + cue.duration));
  candidates.sort((a, b) => Math.abs(a - delta) - Math.abs(b - delta) || a - b);
  return candidates.find((candidate) => candidate >= min && Math.abs(candidate - delta) <= span && fits(cues, index, candidate)) ?? null;
}
