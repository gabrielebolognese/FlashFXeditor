// The clip clipboard (spec §18 Cut / Copy / Paste / Paste insert, §6.16, §7.2; Batch 39): the pure
// edits behind copying clips and pasting them, and the payload the app keeps in memory and mirrors on
// the system clipboard as JSON text (so clips can be pasted into another project).
// - Copy takes the selected clips with their groups and, with Linked selection on, their linked
//   partners: each clip whole (keyframes, fades, label, source range), its lane (V2, A1, the caption
//   track) and its frames from the block's first frame, plus the media the clips use and the caption
//   track's style when cues are copied. A transition goes along only when both its clips are copied.
// - Paste puts the block at the playhead keeping the relative track offsets (spec §6.8): each kind's
//   lowest copied lane lands on the lowest targeted, unlocked track of that kind (§6.12 Target), the
//   others above or below it (missing tracks are created); with no targeted track of a kind, those
//   clips keep their own lanes. Paste overwrites what lies under the clips, Paste insert ripples every
//   unlocked track open (the §6.8 drop rules, `dropClips`). Cues never overwrite cues: an overwrite
//   paste with cues moves the block to the nearest spot where they fit (`freeCueDelta`). Copies get new
//   ids; clips that shared a link group or a group share a new one; a transition pair gets a new id.
// - Media: in the project they were copied from, clips keep their media; in another one, each media is
//   found by name (or file name) and kind when its duration holds every pasted clip's source range,
//   else the copied record is added as an offline item (a file reference that resolves nowhere, the
//   copied path kept as its hint; the clip keeps its source range: Batch 41 finds it offline, draws
//   its slate and relinks it by the hint's file name). Clips copied at another frame rate are converted
//   first (`payloadAtFrameRate`: the §15 fps conversion, Batch 42), as Paste attributes takes them.
// One command, one undo step ("Paste" / "Paste insert"), media records included.
import type { Command } from "../../core/commands/command.js";
import { convertClipRuns, FrameConverter, frameRatio, sameFrameRate } from "../../core/document/fpsConvert.js";
import { isEaseId, isKeyframeSection, SECTION_PROPS } from "../../core/document/keyframes.js";
import type { CaptionStyle, Clip, ClipId, Frame, MediaId, MediaItem, Project, Rational, Track, TrackId } from "../../core/document/types.js";
import { isMediaClip } from "../../core/document/types.js";
import { upgradeCaptionStyle } from "../../text/captions.js";
import type { KeyframeClipboard } from "./keyframes.js";
import { captionStyleOf, captionTrackOf, freeCueDelta, newCaptionTrack } from "./captions.js";
import { LaneTracks } from "./dropMedia.js";
import { dropClips, regroup, withField, type MoveMode } from "./move.js";
import { laneOf, laneTracks, selectionPartners, trackIndex, type LaneKind } from "../model/queries.js";

export const CLIPBOARD_FORMAT = "shorts-editor/clipboard";
export const CLIPBOARD_VERSION = 1;

/** Where a copied clip sat: a video or audio lane (0 = V1 / A1, counted away from the divider) or the caption track. */
export type CopiedLane = { kind: LaneKind; number: number } | { kind: "caption" };

export interface CopiedClip {
  /** The clip as copied; `start` counts from the block's first frame. */
  clip: Clip;
  lane: CopiedLane;
}

/** Copied clips (spec §18 Copy): what Paste, Paste insert and Paste attributes use. */
export interface ClipsPayload {
  format: typeof CLIPBOARD_FORMAT;
  version: typeof CLIPBOARD_VERSION;
  kind: "clips";
  /** The project the clips come from: their media ids are kept only there. */
  projectId: string;
  fps: Rational;
  /** The clip that was the primary selection (Paste attributes takes its look), or null. */
  primary: ClipId | null;
  /** In start order. */
  clips: CopiedClip[];
  /** The media the clips use. */
  media: MediaItem[];
  /** The caption track's style when cues are copied (a paste that creates the track gives it this style). */
  captionStyle?: CaptionStyle;
}

/** Copied keyframes (spec §6.15, Batch 35): pasted on the selected clips from the playhead on. */
export interface KeysPayload {
  format: typeof CLIPBOARD_FORMAT;
  version: typeof CLIPBOARD_VERSION;
  kind: "keys";
  keys: KeyframeClipboard;
}

export type ClipboardPayload = ClipsPayload | KeysPayload;

/** The clips a copy of `ids` takes: those that exist, their groups and, with `linked`, their linked partners. */
export function copySet(project: Project, ids: Iterable<ClipId>, linked: boolean): ClipId[] {
  const result = new Set<ClipId>();
  for (const id of ids) {
    if (!project.clips[id] || result.has(id)) continue;
    result.add(id);
    for (const partner of selectionPartners(project, id, linked)) result.add(partner);
  }
  return [...result];
}

/** The transition ids both of whose clips are among `clips`. */
function pairedTransitions(clips: readonly Clip[]): Set<string> {
  const outs = new Set<string>();
  const ins = new Set<string>();
  for (const clip of clips) {
    if (!isMediaClip(clip)) continue;
    if (clip.transitionOut) outs.add(clip.transitionOut.id);
    if (clip.transitionIn) ins.add(clip.transitionIn.id);
  }
  return new Set([...outs].filter((id) => ins.has(id)));
}

/** `clip` without the transitions whose other clip is not in `paired`, the kept ones renamed by `rename`. */
function keepTransitions(clip: Clip, paired: ReadonlySet<string>, rename: (id: string) => string = (id) => id): Clip {
  if (!isMediaClip(clip) || (!clip.transitionIn && !clip.transitionOut)) return clip;
  const next = { ...clip };
  for (const side of ["transitionIn", "transitionOut"] as const) {
    const transition = next[side];
    if (!transition) continue;
    if (paired.has(transition.id)) next[side] = { ...transition, id: rename(transition.id) };
    else delete next[side];
  }
  return next;
}

/**
 * The payload of a copy of `ids` (see `copySet`), or null when no clip is copied. `primary` names the
 * clip Paste attributes takes its look from (the first copied clip when it is not among them).
 */
export function copyClips(project: Project, ids: Iterable<ClipId>, primary: ClipId | null, options: { linked: boolean }): ClipsPayload | null {
  const order = new Map(project.tracks.map((track, index) => [track.id, index]));
  const clips = copySet(project, ids, options.linked)
    .map((id) => project.clips[id] as Clip)
    .sort((a, b) => a.start - b.start || (order.get(a.trackId) ?? 0) - (order.get(b.trackId) ?? 0));
  if (clips.length === 0) return null;
  const first = Math.min(...clips.map((clip) => clip.start));
  const paired = pairedTransitions(clips);
  const copied: CopiedClip[] = [];
  const media = new Map<MediaId, MediaItem>();
  let captionStyle: CaptionStyle | undefined;
  for (const clip of clips) {
    const lane = laneOf(project.tracks, clip.trackId);
    copied.push({ clip: { ...structuredClone(keepTransitions(clip, paired)), start: clip.start - first }, lane: lane ?? { kind: "caption" } });
    if (isMediaClip(clip)) {
      const item = project.media[clip.mediaId];
      if (item && !media.has(item.id)) media.set(item.id, structuredClone(item));
    }
    if (clip.kind === "caption") captionStyle ??= structuredClone(captionStyleOf(project, clip.trackId));
  }
  const payload: ClipsPayload = {
    format: CLIPBOARD_FORMAT,
    version: CLIPBOARD_VERSION,
    kind: "clips",
    projectId: project.id,
    fps: { ...project.settings.fps },
    primary: primary !== null && clips.some((clip) => clip.id === primary) ? primary : (clips[0] as Clip).id,
    clips: copied,
    media: [...media.values()],
  };
  return captionStyle ? { ...payload, captionStyle } : payload;
}

/** Copied keys as a payload. */
export function keysPayload(keys: KeyframeClipboard): KeysPayload {
  return { format: CLIPBOARD_FORMAT, version: CLIPBOARD_VERSION, kind: "keys", keys };
}

/** The payload as the system clipboard's text. */
export function serializeClipboard(payload: ClipboardPayload): string {
  return JSON.stringify(payload);
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isInt = (value: unknown): value is number => Number.isInteger(value);

/** A copied clip's shape (every paste, Paste attributes too, validates the document it makes before it is committed). */
function isCopiedClip(value: unknown): value is CopiedClip {
  if (!isRecord(value) || !isRecord(value.clip) || !isRecord(value.lane)) return false;
  const { clip, lane } = value;
  const laneOk = lane.kind === "caption" || ((lane.kind === "video" || lane.kind === "audio") && isInt(lane.number) && lane.number >= 0);
  return laneOk && typeof clip.id === "string" && typeof clip.kind === "string" && isInt(clip.start) && clip.start >= 0 && isInt(clip.duration) && clip.duration >= 1;
}

/**
 * Copied keys' shape, as strict as the document's keyframe invariants (`keyframeIssues`): a known
 * section, only its properties, whole-frame offsets from 0, finite values, known eases. Keys go
 * straight into the clips, so a broken list from elsewhere would save a project that cannot open.
 */
function isKeyframeClipboard(value: unknown): value is KeyframeClipboard {
  if (!isRecord(value) || !isKeyframeSection(value.section) || !isRecord(value.keys)) return false;
  const props: readonly string[] = SECTION_PROPS[value.section];
  const lists = Object.entries(value.keys);
  const isKey = (key: unknown) => isRecord(key) && isInt(key.offset) && key.offset >= 0 && Number.isFinite(key.value) && isEaseId(key.ease);
  return lists.length > 0 && lists.every(([prop, keys]) => props.includes(prop) && Array.isArray(keys) && keys.length > 0 && keys.every(isKey));
}

/**
 * A copied media record's shape: what the paste reads before the document is validated (its kind,
 * duration and file reference, matched against this project's media or added as an offline item).
 */
function isMediaRecord(value: unknown): value is MediaItem {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string" || !isRecord(value.file)) return false;
  const { file } = value;
  const fileOk = typeof file.relPath === "string" || (typeof file.handleKey === "string" && typeof file.pathHint === "string");
  return fileOk && (value.kind === "video" || value.kind === "audio" || value.kind === "image") && isInt(value.durationUs) && value.durationUs >= 0;
}

/**
 * The payload in a system clipboard text, or null when the text is not one (other text, another
 * format or version, a broken shape).
 */
export function parseClipboard(text: string): ClipboardPayload | null {
  if (!text.startsWith("{") || !text.includes(CLIPBOARD_FORMAT)) return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(value) || value.format !== CLIPBOARD_FORMAT || value.version !== CLIPBOARD_VERSION) return null;
  if (value.kind === "keys") return isKeyframeClipboard(value.keys) ? (value as unknown as KeysPayload) : null;
  if (value.kind !== "clips") return null;
  const fps = value.fps;
  if (typeof value.projectId !== "string" || !isRecord(fps) || !isInt(fps.num) || !isInt(fps.den)) return null;
  if (!Array.isArray(value.clips) || value.clips.length === 0 || !value.clips.every(isCopiedClip) || !Array.isArray(value.media)) return null;
  if (!value.media.every(isMediaRecord)) return null;
  // Cues copied in 1.0.0 carry a caption style without `x` (Batch 53): filled in, as project.json's migration does.
  const payload = value as unknown as ClipsPayload;
  return payload.captionStyle === undefined ? payload : { ...payload, captionStyle: upgradeCaptionStyle(payload.captionStyle) };
}

// --- Media ---------------------------------------------------------------------------------------

/** The file name of a media item (its relative path's or path hint's last part). */
function fileName(item: MediaItem): string {
  const path = "relPath" in item.file ? item.file.relPath : item.file.pathHint;
  return path.slice(path.lastIndexOf("/") + 1);
}

export interface MediaResolution {
  /** Copied media id -> the id the pasted clips use. */
  ids: Map<MediaId, MediaId>;
  /** Copied records added to the project as offline items (no file of theirs in it). */
  added: MediaItem[];
}

/**
 * The media the pasted clips use in `project`: the same items in the project they were copied from;
 * elsewhere an item of the same kind and name (else file name) whose duration holds the clips' source
 * ranges (and that has sound when audio clips use it), else the copied record added as an offline
 * item under a new id.
 */
export function resolveMedia(project: Project, payload: ClipsPayload, newId: () => string): MediaResolution {
  const ids = new Map<MediaId, MediaId>();
  const added: MediaItem[] = [];
  const sameProject = payload.projectId === project.id;
  const items = Object.values(project.media);
  for (const item of payload.media) {
    if (sameProject && project.media[item.id]) {
      ids.set(item.id, item.id);
      continue;
    }
    let needUs = 0;
    let needsSound = false;
    for (const { clip } of payload.clips) {
      if (!isMediaClip(clip) || clip.mediaId !== item.id) continue;
      if (clip.kind !== "image") needUs = Math.max(needUs, clip.out);
      if (clip.kind === "audio") needsSound = true;
    }
    const holds = (candidate: MediaItem) => candidate.kind === item.kind && (item.kind === "image" || candidate.durationUs >= needUs) && (!needsSound || candidate.hasAudio);
    const found = items.find((candidate) => holds(candidate) && candidate.name === item.name) ?? items.find((candidate) => holds(candidate) && fileName(candidate) === fileName(item));
    if (found) {
      ids.set(item.id, found.id);
      continue;
    }
    // The copied path belongs to the other project: the same `media/<name>` here can be another file.
    // An empty handle key resolves nowhere, so the item stays offline; the hint keeps the path for Relink.
    const pathHint = "relPath" in item.file ? item.file.relPath : item.file.pathHint;
    const offline: MediaItem = { ...structuredClone(item), id: newId(), file: { handleKey: "", pathHint }, analysis: { thumbs: "none", peaks: "none" } };
    delete offline.proxy;
    delete offline.binId;
    added.push(offline);
    ids.set(item.id, offline.id);
  }
  return { ids, added };
}

// --- Paste ---------------------------------------------------------------------------------------

export type PasteResult =
  | {
      kind: "ok";
      command: Command;
      /** The pasted clips' ids, in the payload's order. */
      placed: ClipId[];
      /** The pasted copy of the payload's primary clip. */
      primary: ClipId | null;
      /** The block's frames on the timeline. */
      start: Frame;
      end: Frame;
      /** Media records added as offline items. */
      offline: MediaItem[];
    }
  /** `locked`: a clip would land on a locked track; `noRoom`: no spot near the playhead holds the cues. */
  | { kind: "refused"; reason: "locked" | "noRoom"; trackId?: TrackId };

/**
 * `payload` with its frames at `fps` (spec §15 fps conversion): each lane's clips convert as a
 * timeline run from the block's first frame (`convertClipRuns`), with their keys, fades, transitions,
 * animations and words. The payload itself when it already is at that rate.
 */
export function payloadAtFrameRate(payload: ClipsPayload, fps: Rational): ClipsPayload {
  if (sameFrameRate(payload.fps, fps)) return payload;
  const next = structuredClone(payload);
  const lanes = new Map<string, Clip[]>();
  for (const { clip, lane } of next.clips) {
    const key = lane.kind === "caption" ? "caption" : `${lane.kind}:${lane.number}`;
    const run = lanes.get(key) ?? [];
    run.push(clip);
    lanes.set(key, run);
  }
  for (const run of lanes.values()) run.sort((a, b) => a.start - b.start);
  const media = new Map(next.media.map((item) => [item.id, item]));
  convertClipRuns([...lanes.values()], new FrameConverter(frameRatio(payload.fps, fps)), fps, (clip) => media.get(clip.mediaId));
  next.fps = { num: fps.num, den: fps.den };
  return next;
}

/** The first targeted, unlocked lane of `kind` (`Track.targeted`, spec §6.12), or null. */
function targetedLane(tracks: readonly Track[], kind: LaneKind): number | null {
  const index = laneTracks(tracks, kind).findIndex((track) => track.targeted && !track.locked);
  return index === -1 ? null : index;
}

/** Paste (`mode` overwrite) or Paste insert (`insert`) of `payload` at frame `at` (see the header). */
export function pasteClips(project: Project, copied: ClipsPayload, options: { at: Frame; mode: MoveMode; newId: () => string }): PasteResult {
  const { newId, mode } = options;
  const payload = payloadAtFrameRate(copied, project.settings.fps);
  const media = resolveMedia(project, payload, newId);

  // Lanes: each kind's lowest copied lane onto the lowest targeted lane of that kind.
  const lanes = new LaneTracks(project.tracks, newId);
  const base = new Map<LaneKind, { from: number; to: number }>();
  for (const kind of ["video", "audio"] as const) {
    const copied = payload.clips.map(({ lane }) => (lane.kind === kind ? lane.number : Infinity));
    const from = Math.min(...copied);
    if (from !== Infinity) base.set(kind, { from, to: targetedLane(project.tracks, kind) ?? from });
  }
  const captionTrack = captionTrackOf(project);
  const newCaptions = !captionTrack && payload.clips.some(({ lane }) => lane.kind === "caption") ? newCaptionTrack(newId()) : null;
  const trackFor = (lane: CopiedLane): TrackId => {
    if (lane.kind === "caption") return (captionTrack ?? (newCaptions as Track)).id;
    const shift = base.get(lane.kind) as { from: number; to: number };
    return lanes.at(lane.kind, shift.to + lane.number - shift.from).trackId;
  };

  // The copies, from the playhead: new ids, the copied link groups, groups and transition pairs renamed.
  const source = payload.clips.map(({ clip }) => clip);
  const links = regroup(source, "linkGroup", newId);
  const groups = regroup(source, "group", newId);
  const paired = pairedTransitions(source);
  const transitionIds = new Map([...paired].map((id) => [id, newId()]));
  const at = Math.max(0, Math.round(options.at));
  let clips = payload.clips.map(({ clip, lane }) => {
    let next = { ...structuredClone(keepTransitions(clip, paired, (id) => transitionIds.get(id) as string)), id: newId(), trackId: trackFor(lane), start: at + clip.start } as Clip;
    if (clip.linkGroup !== undefined) next = withField(next, "linkGroup", links.get(clip.linkGroup));
    if (clip.group !== undefined) next = withField(next, "group", groups.get(clip.group));
    if (isMediaClip(next)) next = { ...next, mediaId: media.ids.get(next.mediaId) ?? next.mediaId };
    return next;
  });

  // Cues never overwrite cues (spec §10.5): the block moves to the nearest spot where they fit.
  const cues = clips.filter((clip) => clip.kind === "caption");
  if (mode === "overwrite" && captionTrack && cues.length > 0) {
    const delta = freeCueDelta(cues, trackIndex(project, captionTrack), 0, -Math.min(...clips.map((clip) => clip.start)));
    if (delta === null) return { kind: "refused", reason: "noRoom", trackId: captionTrack.id };
    if (delta !== 0) clips = clips.map((clip) => ({ ...clip, start: clip.start + delta }));
  }

  const newTracks = newCaptions ? [...lanes.created, newCaptions] : lanes.created;
  const label = mode === "insert" ? "Paste insert" : "Paste";
  const result = dropClips(project, clips, mode, { newTracks, newId, label, id: mode === "insert" ? "clipboard.pasteInsert" : "clipboard.paste" });
  if (result.kind === "refused") return { kind: "refused", reason: "locked", trackId: result.refusal.trackId };
  if (result.kind === "noop") return { kind: "refused", reason: "locked" };
  const drop = result.command;
  const style = newCaptions ? structuredClone(payload.captionStyle ?? captionStyleOf(project, newCaptions.id)) : null;
  const command: Command = {
    ...drop,
    affects: [...new Set([...drop.affects, ...(media.added.length > 0 ? (["media"] as const) : []), ...(newCaptions ? (["tracks", "captions"] as const) : [])])],
    run(draft, ctx) {
      for (const item of media.added) {
        if (draft.media[item.id]) throw new Error(`${drop.id}: media ${item.id} already exists`);
        draft.media[item.id] = structuredClone(item);
      }
      drop.run(draft, ctx);
      if (newCaptions && style) draft.captionTracks[newCaptions.id] = { style: structuredClone(style) };
    },
  };
  const placed = clips.map((clip) => clip.id);
  const primaryAt = payload.clips.findIndex(({ clip }) => clip.id === payload.primary);
  return {
    kind: "ok",
    command,
    placed,
    primary: placed[primaryAt] ?? placed[0] ?? null,
    start: Math.min(...clips.map((clip) => clip.start)),
    end: Math.max(...clips.map((clip) => clip.start + clip.duration)),
    offline: media.added,
  };
}
