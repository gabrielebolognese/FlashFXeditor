// The edit fuzzer's kit (Batch 47, spec §6.19 "every operation with locked tracks, links, groups,
// transitions, keyframes"): a seeded PRNG, random documents built through real commands, a table of
// every edit operation with random but sensible arguments, the checks the validator does not make,
// and a runner. Used by the fuzz tests only (fuzz.test.ts, fuzz.perf.test.ts); never imported by app
// code. Runs without a DOM (text layouts use the approximate measurer).
// - Every document is made by dispatching commands through a validating DocumentStore, so it is
//   valid by construction; the operations build each command from `store.getState()` just before
//   dispatching it (one command, or one transaction: one undo step per operation).
// - `documentChecks` adds what validateProject leaves out: finite numbers and plain JSON everywhere,
//   clips on locked tracks unchanged, media records gone only through Remove, clips on media of their
//   kind, speeds within 0.25x..4x, crops within the media, non-empty link and group ids.
import { addTrack, updateClip } from "../../core/commands/basicCommands.js";
import type { Command } from "../../core/commands/command.js";
import { addBin, addMedia, relinkMedia, removeBin, removeMedia, renameBin, renameMedia, setMediaBin } from "../../core/commands/mediaCommands.js";
import { addMarker, removeMarker, updateMarker } from "../../core/commands/markerCommands.js";
import { sectionFrames, type KeyframeSection } from "../../core/document/keyframes.js";
import { createProject, emptyTrack, nextTrackName } from "../../core/document/project.js";
import { frameToUs } from "../../core/document/time.js";
import {
  CAPTION_HIGHLIGHTS,
  EASE_IDS,
  isFreeze,
  isMediaClip,
  LABEL_COLORS,
  SOLID_SHAPE_IDS,
  TEXT_ANIM_IDS,
  TRANSITION_KINDS,
  type CaptionClip,
  type CaptionStyle,
  type Clip,
  type ClipId,
  type Frame,
  type Gradient,
  type MediaClip,
  type MediaItem,
  type Project,
  type Rational,
  type RGBA,
  type TextStyle,
  type Track,
  type TrackId,
  type Transform,
} from "../../core/document/types.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createSessionStore } from "../../core/store/sessionStore.js";
import { PEAKS_BUCKET, type Peaks } from "../../media/cache/peaks.js";
import { approximateMeasurer, setTextMeasurer } from "../../render/text/layoutCache.js";
import { newTextAnim } from "../../text/anim.js";
import { presetLook } from "../../text/presets.js";
import { starterPresets } from "../../text/starterPresets.js";
import { DEFAULT_TEXT_STYLE, textContent } from "../../text/style.js";
import type { SubtitleCue } from "../../text/subtitles.js";
import type { FrameRange } from "../model/inOut.js";
import { contentEnd, linkOffset, selectionPartners, trackGaps } from "../model/queries.js";
import { arrangeLayers } from "./arrange.js";
import {
  addCaptionTrack,
  addCueAt,
  captionStyleOf,
  captionTrackOf,
  clearCues,
  importCues,
  mergeWithPrevious,
  replaceCuesInRange,
  setCaptionStyle,
  setCueText,
  splitCue,
  transcribedCues,
} from "./captions.js";
import { setEnabled, setOpacities, retimeClips, type ClipTimeField } from "./clipProps.js";
import { copyClips, pasteClips, payloadAtFrameRate, type ClipsPayload } from "./clipboard.js";
import { quickCrops, setCrops } from "./crop.js";
import { deleteClips, rippleDelete } from "./delete.js";
import { applyMediaDrop, commitPlan, planAtPlayhead, planCanvasDrop } from "./dropMedia.js";
import { duplicateClips, duplicateLayers } from "./duplicate.js";
import { BUILT_IN_EDIT_DEFAULTS, setEditDefaults } from "./editDefaults.js";
import { dragFade, FADE_PRESET_SECONDS, presetFade, quickFade, setFades, type FadeEdge } from "./fades.js";
import { freezeFrame, punchZoom } from "./freeze.js";
import { closeGap, compactGaps, gapAtPlayhead } from "./gaps.js";
import { mediaClips, type SourceRange } from "./insertMedia.js";
import { addKeyAt, copyKeys, deleteKeys, keyable, moveKeys, pasteKeys, setKeysEase, setStopwatch, toggleKeyAt } from "./keyframes.js";
import { closeExtracted, liftRange, rangeTracks } from "./liftExtract.js";
import { groupClips, moveIntoSync, toggleLink, ungroupClips } from "./links.js";
import { applyMoveRequest, dropClips, moveToAdjacentLane, NO_LANE_DELTA, nudgeClips, type MoveMode, type MoveResult } from "./move.js";
import { ATTRIBUTE_GROUPS, attributeTargets, pasteAttributes, pastedSpeed, type AttributeGroup } from "./pasteAttributes.js";
import { closeSilences, cutSilences, REMOVE_SILENCE_LABEL, silencePlan, silenceTargets, spanFrames, type SilenceGroup } from "./silence.js";
import { addSolid, newSolidClip, setSolids, type SolidEdit, type SolidLook } from "./solid.js";
import { setSpeedDurations, setSpeeds } from "./speed.js";
import { clipsToSplit, splitClips, type SplitScope } from "./split.js";
import { addTextClip, addTitle, applyPreset, linkPreset, newTextClip, setTexts, type PresetApply, type TextEditInput, type TitleLook } from "./text.js";
import { setTextAnims } from "./textAnim.js";
import { addTrackNear, deleteEmptyTracks, deleteTracks, lockAll, muteOthers, reorderTrack, setTrackFlag, type TrackFlag } from "./tracks.js";
import { isLayerClip, nudgeLayers, quickTransforms, setTransforms, type QuickTransform } from "./transform.js";
import { addTransition, cutsOf, dragTransitionEdge, removeTransitions, transitionAt, updateTransition, type Cut } from "./transitions.js";
import { extendToPlayhead, MAX_SPEED, MIN_SPEED, rateStretch, rollEdit, slide, slip, trimEdge, trimToPlayhead, type TrimEdge } from "./trim.js";
import { audioTargets, autoDuck, bandEdit, detachAudio, normalizeClips, setGains, setMuted, toggleMuted, volumeKeys } from "./volume.js";

// --- Random numbers ------------------------------------------------------------------------------

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max]. */
  int(min: number, max: number): number;
  /** One of `items` (undefined for an empty list: guard first). */
  pick<T>(items: readonly T[]): T;
  chance(p: number): boolean;
}

/** Deterministic PRNG (mulberry32): the same seed gives the same sequence. */
export function random(seed: number): Rng {
  let state = seed;
  const next = () => {
    state = (state + 1831565813) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  const pick = <T>(items: readonly T[]): T => items[int(0, items.length - 1)] as T;
  return { next, int, pick, chance: (p) => next() < p };
}

/** One of `items`, or null when there is none. */
function some<T>(rng: Rng, items: readonly T[]): T | null {
  return items.length > 0 ? (items[rng.int(0, items.length - 1)] as T) : null;
}

/** A random subset of `items` (at least one when there is any). */
function subset<T>(rng: Rng, items: readonly T[], p = 0.5): T[] {
  const out = items.filter(() => rng.chance(p));
  const first = some(rng, items);
  return out.length > 0 || first === null ? out : [first];
}

// --- Setup ---------------------------------------------------------------------------------------

const NOW = "2026-01-01T00:00:00.000Z";

/** Deterministic text layouts (no canvas) and the built-in edit defaults. Idempotent. */
export function setupFuzzKit(): void {
  setTextMeasurer(approximateMeasurer);
  setEditDefaults(BUILT_IN_EDIT_DEFAULTS);
}

export interface FuzzContext {
  newId(): string;
}

/** A counter-based id source: `${prefix}1`, `${prefix}2`... */
export function idSource(prefix: string): () => string {
  let n = 0;
  return () => `${prefix}${++n}`;
}

export interface FuzzStoreOptions {
  /** Prefix of the ids the operations create (default `z`, apart from random documents' `r`). */
  idPrefix?: string;
  historyLimit?: number;
}

export interface FuzzStore {
  store: DocumentStore;
  ctx: FuzzContext;
  /** A copy of the starting document (the store freezes its own). */
  original: Project;
}

/**
 * A validating DocumentStore over `project` (validation runs in every dispatch, undo and redo), whose
 * clock never lets two commands coalesce, with room for every step and a counter-based id source
 * shared by the store and the operations.
 */
export function makeFuzzStore(project: Project, options: FuzzStoreOptions = {}): FuzzStore {
  setupFuzzKit();
  const original = structuredClone(project);
  const newId = idSource(options.idPrefix ?? "z");
  let time = 0;
  const store = new DocumentStore(structuredClone(project), { session: createSessionStore(), newId, validate: true, now: () => (time += 1000), historyLimit: options.historyLimit ?? 100_000 });
  return { store, ctx: { newId }, original };
}

// --- Dispatch helpers ----------------------------------------------------------------------------

function exec(store: DocumentStore, command: Command | null | undefined): boolean {
  if (!command) return false;
  store.dispatch(command);
  return true;
}

function execMove(store: DocumentStore, result: MoveResult | null | undefined): boolean {
  return result?.kind === "ok" ? exec(store, result.command) : false;
}

/** Runs `fn` as one transaction; true when the document changed. */
function inTransaction(store: DocumentStore, label: string, fn: () => void): boolean {
  const before = store.getState();
  store.transaction(label, fn);
  return store.getState() !== before;
}

// --- Document queries ----------------------------------------------------------------------------

const lockedTracks = (p: Project): Set<TrackId> => new Set(p.tracks.filter((track) => track.locked).map((track) => track.id));

/** How often an operation aims at a clip on a locked track (it must then change nothing there). */
const LOCKED_AIM = 0.1;

/** A random clip `filter` accepts, mostly on an unlocked track. */
function pickClip(p: Project, rng: Rng, filter: (clip: Clip) => boolean = () => true): Clip | null {
  const all = Object.values(p.clips).filter(filter);
  if (all.length === 0) return null;
  const locked = lockedTracks(p);
  const free = all.filter((clip) => !locked.has(clip.trackId));
  return free.length > 0 && !rng.chance(LOCKED_AIM) ? (some(rng, free) as Clip) : (some(rng, all) as Clip);
}

/** The clip and the clips selected with it (its group and, with `linked`, its link partners), sometimes one more clip. */
function selection(p: Project, rng: Rng, clip: Clip, linked: boolean): ClipId[] {
  const ids = [clip.id, ...selectionPartners(p, clip.id, linked)];
  if (rng.chance(0.2)) {
    const other = pickClip(p, rng);
    if (other && !ids.includes(other.id)) ids.push(other.id, ...selectionPartners(p, other.id, linked).filter((id) => !ids.includes(id)));
  }
  return ids;
}

const endOf = (clip: Clip) => clip.start + clip.duration;
/** A frame anywhere on the timeline (a bit past its end too). */
const anyFrame = (p: Project, rng: Rng) => rng.int(0, contentEnd(p) + 30);
/** A frame strictly inside the clip when it has one (else its start). */
const frameIn = (clip: Clip, rng: Rng) => (clip.duration > 1 ? clip.start + rng.int(1, clip.duration - 1) : clip.start);
/** A frame delta, mostly small. */
const delta = (rng: Rng) => (rng.chance(0.15) ? rng.int(-400, 400) : rng.int(-40, 40));
const frameNear = (p: Project, rng: Rng) => {
  const clip = pickClip(p, rng);
  return clip && rng.chance(0.7) ? frameIn(clip, rng) : anyFrame(p, rng);
};
const isSourceClip = (clip: Clip): clip is MediaClip => (clip.kind === "video" || clip.kind === "audio") && !isFreeze(clip);
const sectionsOf = (clip: Clip): KeyframeSection[] => (clip.kind === "audio" ? ["volume"] : isLayerClip(clip) ? ["transform", "opacity"] : []);

/** Abutting clip pairs on every track (rolls, transitions). */
function abutting(p: Project): [Clip, Clip][] {
  const pairs: [Clip, Clip][] = [];
  for (const track of p.tracks) {
    for (let i = 1; i < track.clipIds.length; i++) {
      const left = p.clips[track.clipIds[i - 1] as ClipId];
      const right = p.clips[track.clipIds[i] as ClipId];
      if (left && right && endOf(left) === right.start) pairs.push([left, right]);
    }
  }
  return pairs;
}

/** Cuts that can hold a transition (on unlocked tracks), and those that have one. */
function cuts(p: Project): { valid: Cut[]; withTransition: Cut[] } {
  const valid: Cut[] = [];
  for (const track of p.tracks) for (const cut of cutsOf(p, track)) valid.push({ left: cut.left.id, right: cut.right.id });
  return { valid, withTransition: valid.filter((cut) => transitionAt(p, cut) !== null) };
}

// --- Random values -------------------------------------------------------------------------------

const TEXTS = ["Hello", "Two\nlines", "Ünïcødé ✓", "Emoji 🎬🔥", "مرحبا", "a & b < c > d", "", "  spaced  ", "1234", "Long caption text that wraps over the box width at least once"];

const randomText = (rng: Rng) => rng.pick(TEXTS);

function randomColor(rng: Rng): RGBA {
  return { r: rng.int(0, 255) / 255, g: rng.int(0, 255) / 255, b: rng.int(0, 255) / 255, a: rng.int(0, 100) / 100 };
}

const randomFill = (rng: Rng): RGBA | Gradient => (rng.chance(0.3) ? { from: randomColor(rng), to: randomColor(rng) } : randomColor(rng));

function randomTransform(rng: Rng, base?: Transform): Transform {
  const scale = rng.pick([0.25, 0.5, 0.8, 1, 1.25, 2, 3]);
  const transform: Transform = {
    x: rng.int(-600, 600),
    y: rng.int(-900, 900),
    scale,
    rotation: rng.chance(0.5) ? 0 : rng.int(-180, 180),
    anchor: rng.chance(0.7) ? { x: 0.5, y: 0.5 } : { x: rng.int(0, 10) / 10, y: rng.int(0, 10) / 10 },
    flipH: rng.chance(0.2) ? !(base?.flipH ?? false) : (base?.flipH ?? false),
    flipV: base?.flipV ?? false,
  };
  if (rng.chance(0.2)) transform.scaleY = rng.pick([0.5, 1.5, 2]);
  return transform;
}

function randomStyle(rng: Rng, base: TextStyle = DEFAULT_TEXT_STYLE): TextStyle {
  return {
    ...structuredClone(base),
    fontSize: rng.int(12, 220),
    fontWeight: rng.pick([300, 400, 700, 900]),
    italic: rng.chance(0.2),
    fill: rng.chance(0.8) ? randomColor(rng) : { from: randomColor(rng), to: randomColor(rng) },
    stroke: { enabled: rng.chance(0.3), width: rng.int(0, 20), color: randomColor(rng) },
    background: { ...base.background, enabled: rng.chance(0.3), mode: rng.pick(["line", "block"] as const) },
    textCase: rng.pick(["none", "upper", "lower", "title"] as const),
    letterSpacing: rng.int(-5, 20),
    lineHeight: rng.pick([0.9, 1, 1.2, 1.6]),
    align: rng.pick(["left", "center", "right"] as const),
    verticalAnchor: rng.pick(["top", "middle", "bottom"] as const),
  };
}

function randomLook(rng: Rng): SolidLook {
  return { shape: rng.pick(SOLID_SHAPE_IDS), fill: randomFill(rng), size: { w: rng.int(1, 1500), h: rng.int(1, 1500) }, cornerRadius: rng.int(0, 300) };
}

/** A solid edit: some of its look's fields, sometimes out of range or not finite (skipped or clamped), sometimes with a size handle's transform. */
function randomSolidEdit(rng: Rng): SolidEdit {
  const edit: SolidEdit = {};
  if (rng.chance(0.4)) edit.shape = rng.pick(SOLID_SHAPE_IDS);
  if (rng.chance(0.4)) edit.fill = randomFill(rng);
  if (rng.chance(0.4)) edit.size = rng.chance(0.1) ? { w: rng.pick([0, -5, Number.NaN, Number.POSITIVE_INFINITY]), h: 10 } : { w: rng.int(1, 20000) / rng.pick([1, 3]), h: rng.int(1, 20000) / rng.pick([1, 7]) };
  if (rng.chance(0.4)) edit.cornerRadius = rng.chance(0.05) ? Number.NaN : rng.int(-10, 9000);
  if (rng.chance(0.2)) edit.transform = randomTransform(rng);
  return edit;
}

function randomMedia(rng: Rng, newId: () => string, kind: MediaItem["kind"], hasAudio = true): MediaItem {
  const id = newId();
  const ext = kind === "audio" ? "m4a" : kind === "image" ? "png" : "mp4";
  const durationUs = kind === "image" ? (rng.chance(0.7) ? 0 : rng.int(1, 4) * 1_000_000) : rng.int(20, 90) * 1_000_000 + rng.int(0, 999_999);
  const item: MediaItem = {
    id,
    kind,
    name: `${kind}-${id}.${ext}`,
    file: { relPath: `media/${id}.${ext}` },
    durationUs,
    hasAudio: kind === "audio" || (kind === "video" && hasAudio),
    analysis: { thumbs: "ready", peaks: "ready" },
    addedAt: NOW,
    size: rng.int(1000, 1_000_000_000),
  };
  if (kind !== "audio") {
    const portrait = rng.chance(0.3);
    item.width = portrait ? 1080 : 1920;
    item.height = portrait ? 1920 : 1080;
    if (rng.chance(0.15)) item.rotation = 90;
  }
  if (kind === "video") item.fps = { num: 30, den: 1 };
  return item;
}

/** A source range of `frames` frames inside the media (all of a short one). */
function sourceRange(rng: Rng, media: MediaItem, frames: number, fps: Rational): SourceRange {
  const length = Math.min(frameToUs(frames, fps), media.durationUs);
  const inUs = rng.int(0, Math.max(0, media.durationUs - length));
  return { inUs, outUs: inUs + length };
}

function randomSubtitles(rng: Rng, count: number, fromUs: number, toUs: number): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  for (let i = 0; i < count; i++) {
    const startUs = rng.int(fromUs, Math.max(fromUs, toUs));
    const endUs = startUs + rng.int(100, 4000) * 1000;
    const text = randomText(rng);
    const cue: SubtitleCue = { startUs, endUs, text };
    if (rng.chance(0.2) && text.trim() !== "") {
      const words = text.split(/\s+/).filter((word) => word !== "");
      const step = Math.floor((endUs - startUs) / Math.max(1, words.length));
      cue.words = words.map((word, k) => ({ text: word, startUs: startUs + k * step, endUs: startUs + (k + 1) * step }));
    }
    cues.push(cue);
  }
  return cues;
}

function randomCaptionStyle(rng: Rng, base: CaptionStyle): CaptionStyle {
  return {
    ...structuredClone(base),
    text: randomStyle(rng, base.text),
    position: rng.pick(["bottom", "center", "top", "custom"] as const),
    y: rng.int(-900, 900),
    maxWidth: rng.int(100, 1080),
    maxLines: rng.int(1, 4),
    highlight: { mode: rng.pick(CAPTION_HIGHLIGHTS), color: randomColor(rng), inactiveColor: randomColor(rng) },
  };
}

/** A starter preset's look in the project (what Apply takes). */
function presetApply(rng: Rng, p: Project): PresetApply {
  const preset = rng.pick(starterPresets());
  const look = presetLook({ ...preset, applyPosition: rng.chance(0.3), position: { x: rng.int(-200, 200), y: rng.int(-400, 400) } }, p.settings);
  return { presetId: preset.id, style: look.style, box: look.box, position: look.position, ...(look.animIn && { animIn: look.animIn }), ...(look.animOut && { animOut: look.animOut }) };
}

function titleLook(rng: Rng, p: Project): TitleLook {
  const apply = presetApply(rng, p);
  const { presetId, ...look } = apply;
  return { ...look, presetId, ...(rng.chance(0.5) && { duration: rng.int(10, 120) }) };
}

// --- Fake waveform peaks -------------------------------------------------------------------------

const peaksCache = new Map<string, Peaks>();

/**
 * Deterministic waveform peaks of a media item with sound (runs of about half a second of sound or
 * silence), or null for media without sound; one media in five reads as not loaded yet.
 */
export function fakePeaks(media: MediaItem | undefined): Peaks | null {
  if (!media || media.kind === "image" || !media.hasAudio) return null;
  let hash = 0;
  for (const char of media.id) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) | 0;
  if ((hash >>> 0) % 5 === 0) return null;
  const key = `${media.id}:${media.durationUs}`;
  let peaks = peaksCache.get(key);
  if (!peaks) {
    const sampleRate = 48_000;
    const channels = 2;
    const frames = Math.ceil((media.durationUs * sampleRate) / 1e6);
    const buckets = Math.ceil(frames / PEAKS_BUCKET);
    const level = new Int8Array(buckets * channels * 2);
    for (let b = 0; b < buckets; b++) {
      const run = Math.floor(b / 94);
      const loud = ((Math.imul(run, 2654435761) ^ hash) >>> 0) % 3 !== 0;
      const amp = loud ? 20 + (((Math.imul(b, 40503) ^ hash) >>> 0) % 100) : 0;
      for (let c = 0; c < channels; c++) {
        level[(b * channels + c) * 2] = -amp;
        level[(b * channels + c) * 2 + 1] = amp;
      }
    }
    peaks = { sampleRate, frames, channels, levels: [level] };
    peaksCache.set(key, peaks);
  }
  return peaks;
}

// --- Random documents ----------------------------------------------------------------------------

export interface RandomProjectOptions {
  /** Project id (paste across projects needs two). */
  id?: string;
  fps?: Rational;
  /** Prefix of every id the document gets (default `r`). */
  idPrefix?: string;
  /** Locked tracks: none, some at random (default), or many (most kinds get one). */
  locks?: "none" | "some" | "many";
  /** A caption track with cues: default at random. */
  captions?: boolean;
}

/**
 * A valid random document, built by dispatching real commands through a validating store: 2-3
 * targeted video tracks and 1-2 audio tracks (some locked), often a caption track with cues; videos
 * with sound, a silent video, an audio and an image item (sizes given); linked video + audio pairs,
 * abutting clips with transitions (and linked crossfades), text clips, solids, fades, keyframes
 * (transform, opacity, volume, eased), speeds, a freeze frame, J/L cuts, groups, label colors, text
 * animations, markers, bins and sometimes an offline clip (its media removed, clips kept).
 */
export function randomProject(rng: Rng, options: RandomProjectOptions = {}): Project {
  setupFuzzKit();
  const newId = idSource(options.idPrefix ?? "r");
  const base = createProject({ id: options.id ?? "fuzz-project", name: "Fuzz", now: NOW, appVersion: "fuzz" });
  if (options.fps) base.settings.fps = { num: options.fps.num, den: options.fps.den };
  let time = 0;
  const store = new DocumentStore(base, { session: createSessionStore(), newId, validate: true, now: () => (time += 1000), historyLimit: 1 });
  const state = () => store.getState();
  const { fps } = base.settings;

  // Media.
  const videos: MediaItem[] = [];
  for (let i = rng.int(2, 3); i > 0; i--) videos.push(randomMedia(rng, newId, "video"));
  const silent = randomMedia(rng, newId, "video", false);
  const music = randomMedia(rng, newId, "audio");
  const image = randomMedia(rng, newId, "image");
  const offline = rng.chance(0.5) ? randomMedia(rng, newId, "video") : null;
  store.dispatch(addMedia([...videos, silent, music, image, ...(offline ? [offline] : [])]));

  // Tracks: video first, then the caption track, then audio.
  const videoCount = rng.int(2, 3);
  const audioCount = rng.int(1, 2);
  for (let i = 0; i < videoCount; i++) store.dispatch(addTrack(emptyTrack(newId(), "video", nextTrackName(state().tracks, "video"))));
  for (let i = 0; i < audioCount; i++) store.dispatch(addTrack(emptyTrack(newId(), "audio", nextTrackName(state().tracks, "audio"))));
  const videoTracks = () => state().tracks.filter((track) => track.kind === "video");
  const audioTracks = () => state().tracks.filter((track) => track.kind === "audio");

  // Clips, lane by lane: media (pairs on the matching audio lane), images, text and solids, abutting or apart.
  const drop = (clips: Clip[] | null) => {
    if (!clips || clips.length === 0) return;
    execMove(store, dropClips(state(), clips, "overwrite", { newId, label: "Add clips" }));
  };
  videoTracks().forEach((track, lane) => {
    const audio = audioTracks()[Math.min(lane, audioCount - 1)] as Track;
    let cursor = rng.int(0, 40);
    let previous: ClipId | null = null;
    for (let k = rng.int(3, 6); k > 0; k--) {
      const frames = rng.int(15, 150);
      const roll = rng.next();
      let placed: Clip[] | null = null;
      if (roll < 0.5) {
        const media = rng.pick(videos);
        placed = mediaClips(media, sourceRange(rng, media, frames, fps), cursor, { video: track.id, audio: audio.id }, state().settings, newId);
      } else if (roll < 0.62) {
        placed = mediaClips(silent, sourceRange(rng, silent, frames, fps), cursor, { video: track.id, audio: null }, state().settings, newId);
      } else if (roll < 0.72) {
        placed = mediaClips(image, null, cursor, { video: track.id, audio: null }, state().settings, newId);
      } else if (roll < 0.86) {
        placed = [newTextClip({ id: newId(), trackId: track.id, start: cursor, duration: frames, value: randomText(rng) || "Title", style: randomStyle(rng) })];
      } else {
        placed = [newSolidClip({ id: newId(), trackId: track.id, start: cursor, duration: frames, look: randomLook(rng), transform: randomTransform(rng) })];
      }
      drop(placed);
      const picture = placed?.[0];
      if (!picture) continue;
      // A transition (a linked crossfade too) at the cut with the clip before.
      if (previous && rng.chance(0.6)) {
        const added = addTransition(state(), { left: previous, right: picture.id }, rng.pick(TRANSITION_KINDS), { length: rng.int(2, 30), linked: rng.chance(0.7), newId });
        if (added) store.dispatch(added.command);
      }
      const abut = rng.chance(0.45);
      previous = abut && isMediaClip(picture) ? picture.id : null;
      cursor = endOf(state().clips[picture.id] ?? picture) + (abut ? 0 : rng.int(1, 40));
    }
  });
  // Music on the last audio track.
  if (rng.chance(0.6)) {
    const track = audioTracks().at(-1) as Track;
    drop(mediaClips(music, sourceRange(rng, music, rng.int(60, 300), fps), rng.int(0, 100), { video: null, audio: track.id }, state().settings, newId));
  }

  // Caption track and cues.
  if (options.captions ?? rng.chance(0.7)) {
    exec(store, addCaptionTrack(state(), newId()));
    const imported = importCues(state(), randomSubtitles(rng, rng.int(2, 8), 0, frameToUs(contentEnd(state()), fps)), newId);
    if (imported) store.dispatch(imported.command);
  }

  // Offline clips: a media item removed from the project, its clips kept.
  if (offline) {
    const video = videoTracks().at(-1) as Track;
    const audio = audioTracks().at(-1) as Track;
    drop(mediaClips(offline, sourceRange(rng, offline, rng.int(20, 90), fps), contentEnd(state()) + rng.int(0, 20), { video: video.id, audio: audio.id }, state().settings, newId));
  }

  // Decorations on random clips.
  const all = () => Object.values(state().clips);
  const any = (filter: (clip: Clip) => boolean) => some(rng, all().filter(filter));
  for (let i = rng.int(2, 5); i > 0; i--) {
    const clip = any((candidate) => candidate.kind !== "caption");
    if (clip) exec(store, setFades(state(), rng.pick(["in", "out"] as const), new Map([[clip.id, rng.int(0, 25)]]), "Fade"));
  }
  for (let i = rng.int(1, 4); i > 0; i--) {
    const clip = any(isLayerClip);
    if (!clip) break;
    exec(store, setStopwatch(state(), [clip.id], "transform", true, clip.start));
    const rel = rng.int(0, clip.duration - 1);
    exec(store, addKeyAt(state(), clip.id, "transform", rel));
    const current = state().clips[clip.id];
    if (current && isLayerClip(current)) exec(store, setTransforms(state(), new Map([[clip.id, randomTransform(rng, current.transform)]]), { label: "Transform", at: clip.start + rel }));
    const keyed = state().clips[clip.id];
    const frames = keyed && "keyframes" in keyed ? sectionFrames(keyed.keyframes, "transform") : [];
    if (frames.length > 0) exec(store, setKeysEase(state(), new Map([[clip.id, frames]]), "transform", rng.pick(EASE_IDS)));
  }
  for (let i = rng.int(0, 2); i > 0; i--) {
    const clip = any(isLayerClip);
    if (!clip) break;
    exec(store, setStopwatch(state(), [clip.id], "opacity", true, clip.start));
    exec(store, setOpacities(state(), new Map([[clip.id, rng.next()]]), { label: "Opacity", at: frameIn(clip, rng) }));
  }
  for (let i = rng.int(0, 3); i > 0; i--) {
    const clip = any((candidate) => candidate.kind === "audio");
    if (!clip) break;
    exec(store, setStopwatch(state(), [clip.id], "volume", true, clip.start));
    exec(store, setGains(state(), new Map([[clip.id, rng.int(-30, 6)]]), { at: frameIn(clip, rng) }));
  }
  for (let i = rng.int(0, 3); i > 0; i--) {
    const clip = any(isSourceClip);
    if (clip) exec(store, setSpeeds(state(), [clip.id], rng.pick([0.5, 0.75, 1.5, 2]), { link: rng.chance(0.7), ripple: false, linked: rng.chance(0.7) }).command);
  }
  if (rng.chance(0.6)) {
    const clip = any((candidate) => candidate.kind === "video" && !isFreeze(candidate));
    if (clip) {
      const frozen = freezeFrame(state(), frameIn(clip, rng), [clip.id], newId);
      if (typeof frozen === "object") store.dispatch(frozen.command);
    }
  }
  // J and L cuts: one side of a linked pair trimmed alone.
  for (let i = rng.int(0, 2); i > 0; i--) {
    const clip = any((candidate) => candidate.kind === "audio" && candidate.linkGroup !== undefined);
    if (clip) exec(store, trimEdge(state(), clip.id, rng.pick(["in", "out"] as const), rng.int(-12, 12), { ripple: false, linked: false }).command);
  }
  for (let i = rng.int(0, 2); i > 0; i--) {
    const a = any((candidate) => candidate.kind !== "caption");
    const b = a ? any((candidate) => candidate.trackId !== a.trackId && candidate.kind !== "caption") : null;
    if (a && b) exec(store, groupClips(state(), [a.id, b.id], newId));
  }
  for (let i = rng.int(0, 3); i > 0; i--) {
    const clip = any(() => true);
    if (clip) store.dispatch(updateClip(clip.id, { color: rng.pick(LABEL_COLORS) }));
  }
  for (const clip of all()) {
    if (clip.kind === "text" && rng.chance(0.4)) exec(store, setTextAnims(state(), new Map([[clip.id, { animIn: newTextAnim(rng.pick(TEXT_ANIM_IDS), fps) }]]), { label: "Animation" }));
  }
  for (let i = rng.int(1, 4); i > 0; i--) store.dispatch(addMarker({ id: newId(), frame: rng.int(0, contentEnd(state()) + 10), color: rng.pick(LABEL_COLORS), label: `M${i}` }));
  for (let i = rng.int(0, 2); i > 0; i--) {
    const id = newId();
    store.dispatch(addBin({ id, name: `Bin ${i}` }));
    const ids = subset(rng, Object.keys(state().media));
    store.dispatch(setMediaBin(ids, id));
  }
  if (offline) store.dispatch(removeMedia([offline.id], "keep"));

  // Track switches last, so locked tracks hold clips.
  const locks = options.locks ?? "some";
  const lockChance = locks === "none" ? 0 : locks === "many" ? 0.8 : 0.35;
  for (const kind of ["video", "audio", "caption"] as const) {
    const tracks = state().tracks.filter((track) => track.kind === kind);
    const track = some(rng, tracks);
    if (track && rng.chance(lockChance) && (locks === "many" || tracks.length > 1 || kind === "caption")) exec(store, setTrackFlag(state(), [track.id], "locked", true));
  }
  for (const track of state().tracks) {
    if (rng.chance(0.15)) exec(store, setTrackFlag(state(), [track.id], "targeted", false));
    if (rng.chance(0.08)) exec(store, setTrackFlag(state(), [track.id], rng.pick(["muted", "hidden", "solo"] as const), true));
  }
  return store.getState();
}

/** Payload sources from other projects (Paste across projects), made once each. */
const otherProjects = new Map<string, Project>();

function otherProject(fps: Rational): Project {
  const key = `${fps.num}/${fps.den}`;
  let project = otherProjects.get(key);
  if (!project) {
    project = randomProject(random(4242 + fps.num), { id: `other-${fps.num}-${fps.den}`, fps, idPrefix: `o${fps.num}_`, locks: "none", captions: true });
    otherProjects.set(key, project);
  }
  return project;
}

/** Clips copied in another project (at 30, 25 or 60 fps): its media resolve by name or come in offline. */
function foreignPayload(rng: Rng): ClipsPayload | null {
  const project = otherProject(rng.pick([{ num: 30, den: 1 }, { num: 25, den: 1 }, { num: 60, den: 1 }]));
  const clip = some(rng, Object.values(project.clips));
  if (!clip) return null;
  return copyClips(project, selection(project, rng, clip, rng.chance(0.7)), clip.id, { linked: rng.chance(0.7) });
}

// --- Operations ----------------------------------------------------------------------------------

export type FuzzArea =
  | "move"
  | "trim"
  | "split"
  | "delete"
  | "gaps"
  | "links"
  | "tracks"
  | "keyframes"
  | "transitions"
  | "fades"
  | "speed"
  | "audio"
  | "silence"
  | "clipboard"
  | "props"
  | "solids"
  | "text"
  | "captions"
  | "media"
  | "markers";

export const FUZZ_AREAS: readonly FuzzArea[] = ["move", "trim", "split", "delete", "gaps", "links", "tracks", "keyframes", "transitions", "fades", "speed", "audio", "silence", "clipboard", "props", "solids", "text", "captions", "media", "markers"];

export interface FuzzOp {
  name: string;
  area: FuzzArea;
  /** Builds the operation from `store.getState()` and dispatches it (one undo step); true when something was dispatched. */
  run(store: DocumentStore, rng: Rng, ctx: FuzzContext): boolean;
  /** Relative frequency (default 1). */
  weight?: number;
  /** Whether it tends to add clips or remove them (the long run keeps the document's size within bounds with it). */
  effect?: "grow" | "shrink";
}

const op = (name: string, area: FuzzArea, run: FuzzOp["run"], extra: Pick<FuzzOp, "weight" | "effect"> = {}): FuzzOp => ({ name, area, run, ...extra });

/** The clipboard of each store (the last copy or cut), for the pastes that follow. */
const clipboards = new WeakMap<DocumentStore, ClipsPayload>();

/** Copied clips: this document's (or the last copy), sometimes another project's. */
function payloadFor(store: DocumentStore, rng: Rng): ClipsPayload | null {
  if (rng.chance(0.2)) return foreignPayload(rng);
  const kept = clipboards.get(store);
  if (kept && rng.chance(0.4)) return kept;
  const p = store.getState();
  const clip = pickClip(p, rng);
  if (!clip) return kept ?? null;
  const linked = rng.chance(0.7);
  const payload = copyClips(p, selection(p, rng, clip, linked), clip.id, { linked });
  if (payload) clipboards.set(store, payload);
  return payload;
}

const MAX_TRACKS = 12;

function moveOp(mode: MoveMode, duplicate: boolean): FuzzOp["run"] {
  return (store, rng, ctx) => {
    const p = store.getState();
    const clip = pickClip(p, rng);
    if (!clip) return false;
    const room = p.tracks.length < MAX_TRACKS;
    const laneDelta = rng.chance(0.7) ? NO_LANE_DELTA : { video: rng.int(-1, room ? 1 : 0), audio: rng.int(-1, room ? 1 : 0) };
    return execMove(store, applyMoveRequest(p, { clipIds: selection(p, rng, clip, rng.chance(0.75)), primary: clip.id, deltaFrames: delta(rng), laneDelta, mode, duplicate }, ctx.newId));
  };
}

const randomMode = (rng: Rng): MoveMode => (rng.chance(0.7) ? "overwrite" : "insert");

const MOVE_OPS: FuzzOp[] = [
  op("move.overwrite", "move", moveOp("overwrite", false), { weight: 3 }),
  op("move.insert", "move", moveOp("insert", false)),
  op("move.duplicate", "move", (store, rng, ctx) => moveOp(randomMode(rng), true)(store, rng, ctx), { effect: "grow" }),
  op("move.nudge", "move", (store, rng, ctx) => {
    const p = store.getState();
    const clip = pickClip(p, rng);
    return clip ? execMove(store, nudgeClips(p, selection(p, rng, clip, rng.chance(0.75)), rng.pick([-10, -1, 1, 10]), ctx.newId)) : false;
  }),
  op("move.adjacentLane", "move", (store, rng, ctx) => {
    const p = store.getState();
    const clip = pickClip(p, rng, (candidate) => candidate.kind !== "caption");
    if (!clip) return false;
    return execMove(store, moveToAdjacentLane(p, selection(p, rng, clip, rng.chance(0.75)), rng.pick(["up", "down"] as const), clip.kind === "audio" ? "audio" : "video", ctx.newId));
  }),
  op(
    "move.dropMediaClips",
    "move",
    (store, rng, ctx) => {
      const p = store.getState();
      const media = some(rng, Object.values(p.media));
      if (!media) return false;
      const video = some(rng, p.tracks.filter((track) => track.kind === "video"));
      const audio = some(rng, p.tracks.filter((track) => track.kind === "audio"));
      const range = media.kind === "image" ? null : sourceRange(rng, media, rng.int(10, 200), p.settings.fps);
      const clips = mediaClips(media, range, anyFrame(p, rng), { video: video?.id ?? null, audio: audio?.id ?? null }, p.settings, ctx.newId);
      return clips ? execMove(store, dropClips(p, clips, randomMode(rng), { newId: ctx.newId, label: "Add clips" })) : false;
    },
    { effect: "grow" },
  ),
  op(
    "move.mediaDrop",
    "move",
    (store, rng, ctx) => {
      const p = store.getState();
      const items = subset(rng, Object.values(p.media), 0.2)
        .slice(0, 3)
        .map((media) => ({ mediaId: media.id, range: media.kind === "image" || rng.chance(0.3) ? null : sourceRange(rng, media, rng.int(10, 120), p.settings.fps) }));
      if (items.length === 0) return false;
      const room = p.tracks.length < MAX_TRACKS ? 1 : 0;
      const lanes = { video: rng.int(0, p.tracks.filter((track) => track.kind === "video").length - 1 + room), audio: rng.int(0, p.tracks.filter((track) => track.kind === "audio").length - 1 + room) };
      return execMove(store, applyMediaDrop(p, { items, start: anyFrame(p, rng), lanes, mode: randomMode(rng) }, ctx.newId).result);
    },
    { effect: "grow" },
  ),
  op(
    "move.dropAtPlayhead",
    "move",
    (store, rng, ctx) => {
      const p = store.getState();
      const media = some(rng, Object.values(p.media));
      if (!media) return false;
      const range = media.kind === "image" ? null : sourceRange(rng, media, rng.int(10, 120), p.settings.fps);
      const canvas = rng.chance(0.4);
      const plan = canvas ? planCanvasDrop(p, [{ media, range }], anyFrame(p, rng), rng.chance(0.5) ? null : { x: rng.int(0, 1080), y: rng.int(0, 1920) }, ctx.newId) : planAtPlayhead(p, [{ media, range }], anyFrame(p, rng), ctx.newId);
      if (plan.newTracks.length > 0 && p.tracks.length >= MAX_TRACKS) return false;
      return execMove(store, commitPlan(p, plan, canvas ? "overwrite" : randomMode(rng), "Add clip", ctx.newId));
    },
    { effect: "grow" },
  ),
];

const TRIM_OPS: FuzzOp[] = [
  op(
    "trim.edge",
    "trim",
    (store, rng) => {
      const p = store.getState();
      const clip = pickClip(p, rng);
      return clip ? exec(store, trimEdge(p, clip.id, rng.pick(["in", "out"] as const), delta(rng), { ripple: rng.chance(0.4), linked: rng.chance(0.75) }).command) : false;
    },
    { weight: 3 },
  ),
  op("trim.roll", "trim", (store, rng) => {
    const p = store.getState();
    const pair = some(rng, abutting(p));
    return pair ? exec(store, rollEdit(p, pair[0].id, pair[1].id, delta(rng), { linked: rng.chance(0.75) }).command) : false;
  }),
  op("trim.slip", "trim", (store, rng) => {
    const p = store.getState();
    const clip = pickClip(p, rng, isMediaClip);
    return clip ? exec(store, slip(p, clip.id, delta(rng), { linked: rng.chance(0.75) }).command) : false;
  }),
  op("trim.slide", "trim", (store, rng) => {
    const p = store.getState();
    const clip = pickClip(p, rng);
    return clip ? exec(store, slide(p, clip.id, delta(rng), { linked: rng.chance(0.75) }).command) : false;
  }),
  op("trim.stretch", "trim", (store, rng) => {
    const p = store.getState();
    const clip = pickClip(p, rng);
    return clip ? exec(store, rateStretch(p, clip.id, rng.pick(["in", "out"] as const), delta(rng), { linked: rng.chance(0.75) }).command) : false;
  }),
  op("trim.toPlayhead", "trim", (store, rng) => {
    const p = store.getState();
    return exec(store, trimToPlayhead(p, frameNear(p, rng), rng.pick(["start", "end"] as const), { linked: rng.chance(0.75) })?.result.command);
  }),
  op("trim.extend", "trim", (store, rng) => {
    const p = store.getState();
    const clip = pickClip(p, rng);
    return clip ? exec(store, extendToPlayhead(p, clip.id, clip.start + delta(rng), { linked: rng.chance(0.75) })?.command) : false;
  }),
  op("trim.retime", "trim", (store, rng) => {
    const p = store.getState();
    const clip = pickClip(p, rng);
    if (!clip) return false;
    const field: ClipTimeField = rng.pick(["start", "end", "duration", "sourceIn", "sourceOut"] as const);
    const value =
      field === "start" ? clip.start + delta(rng) : field === "end" ? endOf(clip) + delta(rng) : field === "duration" ? clip.duration + delta(rng) : isMediaClip(clip) ? (field === "sourceIn" ? clip.in : clip.out) + delta(rng) * 33_333 : 0;
    const ids = rng.chance(0.3) ? selection(p, rng, clip, false) : [clip.id];
    return exec(store, retimeClips(p, ids, field, value, { linked: rng.chance(0.75) }).command);
  }),
];

const SPLIT_OPS: FuzzOp[] = [
  op(
    "split.clips",
    "split",
    (store, rng, ctx) => {
      const p = store.getState();
      const clip = pickClip(p, rng);
      const frame = clip && rng.chance(0.8) ? frameIn(clip, rng) : anyFrame(p, rng);
      const linked = rng.chance(0.75);
      const scope: SplitScope = clip && rng.chance(0.6) ? { kind: "clips", clipIds: selection(p, rng, clip, linked) } : rng.chance(0.5) ? { kind: "targeted" } : { kind: "all" };
      return exec(store, splitClips(p, clipsToSplit(p, frame, scope, { linked }), frame, ctx.newId)?.command);
    },
    { weight: 2, effect: "grow" },
  ),
];

const DELETE_OPS: FuzzOp[] = [
  op(
    "delete.clips",
    "delete",
    (store, rng) => {
      const p = store.getState();
      const clip = pickClip(p, rng);
      const linked = rng.chance(0.75);
      return clip ? exec(store, deleteClips(p, selection(p, rng, clip, linked), { linked })) : false;
    },
    { effect: "shrink" },
  ),
  op(
    "delete.ripple",
    "delete",
    (store, rng) => {
      const p = store.getState();
      const clip = pickClip(p, rng);
      const linked = rng.chance(0.75);
      return clip ? exec(store, rippleDelete(p, selection(p, rng, clip, linked), { linked })?.command) : false;
    },
    { effect: "shrink" },
  ),
];

function randomRange(p: Project, rng: Rng): FrameRange {
  const start = frameNear(p, rng);
  return { start, end: start + rng.int(1, 120) };
}

const GAP_OPS: FuzzOp[] = [
  op("gaps.close", "gaps", (store, rng) => {
    const p = store.getState();
    const track = some(rng, p.tracks);
    const gap = track ? some(rng, trackGaps(p, track.id)) : null;
    return gap ? exec(store, closeGap(p, gap).command) : false;
  }),
  op("gaps.atPlayhead", "gaps", (store, rng) => {
    const p = store.getState();
    const gap = gapAtPlayhead(p, anyFrame(p, rng));
    return gap ? exec(store, closeGap(p, gap).command) : false;
  }),
  op("gaps.compact", "gaps", (store, rng) => {
    const p = store.getState();
    return exec(store, compactGaps(p, rng.chance(0.5) ? undefined : subset(rng, p.tracks.map((track) => track.id))).command);
  }),
  op(
    "gaps.lift",
    "gaps",
    (store, rng, ctx) => {
      const p = store.getState();
      return exec(store, liftRange(p, randomRange(p, rng), ctx.newId, rng.chance(0.7) ? rangeTracks(p) : subset(rng, p.tracks.map((track) => track.id))));
    },
    { effect: "shrink" },
  ),
  op(
    "gaps.extract",
    "gaps",
    (store, rng, ctx) => {
      const p = store.getState();
      const range = randomRange(p, rng);
      const tracks = rng.chance(0.7) ? rangeTracks(p) : subset(rng, p.tracks.map((track) => track.id));
      return inTransaction(store, "Extract", () => {
        const lift = liftRange(store.getState(), range, ctx.newId, tracks);
        if (lift) store.dispatch(lift);
        const close = closeExtracted(store.getState(), range, tracks);
        if (close.command) store.dispatch(close.command);
      });
    },
    { effect: "shrink" },
  ),
];

const LINK_OPS: FuzzOp[] = [
  op("links.toggle", "links", (store, rng, ctx) => {
    const p = store.getState();
    let ids: ClipId[];
    if (rng.chance(0.5)) {
      const clip = pickClip(p, rng);
      if (!clip) return false;
      ids = selection(p, rng, clip, true);
    } else {
      const picture = pickClip(p, rng, (clip) => clip.kind !== "audio" && clip.kind !== "caption");
      const sound = pickClip(p, rng, (clip) => clip.kind === "audio");
      if (!picture || !sound) return false;
      ids = [picture.id, sound.id];
    }
    const result = toggleLink(p, ids, ctx.newId);
    return result.kind === "refused" ? false : exec(store, result.command);
  }),
  op("links.group", "links", (store, rng, ctx) => {
    const p = store.getState();
    const ids = [pickClip(p, rng), pickClip(p, rng), rng.chance(0.3) ? pickClip(p, rng) : null].flatMap((clip) => (clip ? [clip.id] : []));
    return exec(store, groupClips(p, ids, ctx.newId));
  }),
  op("links.ungroup", "links", (store, rng) => {
    const p = store.getState();
    const clip = pickClip(p, rng, (candidate) => candidate.group !== undefined);
    return clip ? exec(store, ungroupClips(p, [clip.id])) : false;
  }),
  op("links.moveIntoSync", "links", (store, rng, ctx) => {
    const p = store.getState();
    const clip = pickClip(p, rng, (candidate) => candidate.linkGroup !== undefined);
    return clip ? execMove(store, moveIntoSync(p, clip.id, ctx.newId)) : false;
  }),
];

const TRACK_OPS: FuzzOp[] = [
  op("tracks.flag", "tracks", (store, rng) => {
    const p = store.getState();
    const flag: TrackFlag = rng.pick(["targeted", "targeted", "muted", "solo", "hidden", "locked"] as const);
    if (flag !== "locked") return exec(store, setTrackFlag(p, subset(rng, p.tracks.map((track) => track.id), 0.3), flag, rng.chance(0.5)));
    // Locks now and then; unlocks when most tracks are locked (after Lock all), so the run goes on editing.
    const locked = p.tracks.filter((track) => track.locked).map((track) => track.id);
    const lock = locked.length <= p.tracks.length / 2 && rng.chance(0.4);
    return exec(store, setTrackFlag(p, lock ? subset(rng, p.tracks.map((track) => track.id), 0.3) : subset(rng, locked, 0.7), "locked", lock));
  }),
  op(
    "tracks.muteOthers",
    "tracks",
    (store, rng) => {
      const track = some(rng, store.getState().tracks);
      return track ? exec(store, muteOthers(store.getState(), track.id)) : false;
    },
    { weight: 0.3 },
  ),
  op("tracks.lockAll", "tracks", (store, rng) => {
    // Lock all now and then (the next operations mostly refuse), and Unlock all soon after: `lockAll`
    // unlocks when every track is locked; tracks added since are unlocked, so then the locked ones go.
    const p = store.getState();
    const locked = p.tracks.filter((track) => track.locked).map((track) => track.id);
    if (locked.length === p.tracks.length) return exec(store, lockAll(p));
    if (locked.length > p.tracks.length / 2) return exec(store, setTrackFlag(p, locked, "locked", false));
    return rng.chance(0.1) ? exec(store, lockAll(p)) : false;
  }),
  op("tracks.add", "tracks", (store, rng, ctx) => {
    const p = store.getState();
    if (p.tracks.length >= MAX_TRACKS) return false;
    const kind = rng.pick(["video", "audio"] as const);
    const near = some(rng, p.tracks.filter((track) => track.kind === kind));
    return exec(store, addTrackNear(p, kind, near && rng.chance(0.8) ? near.id : null, rng.pick(["above", "below"] as const), ctx.newId()));
  }),
  op(
    "tracks.delete",
    "tracks",
    (store, rng) => {
      const p = store.getState();
      if (p.tracks.length <= 3) return false;
      const track = some(rng, p.tracks);
      return track ? exec(store, deleteTracks(p, [track.id]).command) : false;
    },
    { weight: 0.3, effect: "shrink" },
  ),
  op("tracks.deleteEmpty", "tracks", (store) => exec(store, deleteEmptyTracks(store.getState()))),
  op("tracks.reorder", "tracks", (store, rng) => {
    const p = store.getState();
    const track = some(rng, p.tracks);
    return track ? exec(store, reorderTrack(p, track.id, rng.int(-1, 4))) : false;
  }),
  op("tracks.arrange", "tracks", (store, rng, ctx) => {
    const p = store.getState();
    if (p.tracks.length >= MAX_TRACKS) return false;
    const clip = pickClip(p, rng, isLayerClip);
    return clip ? exec(store, arrangeLayers(p, selection(p, rng, clip, false), rng.pick(["forward", "backward"] as const), ctx.newId)) : false;
  }),
  op("tracks.addCaption", "tracks", (store, _rng, ctx) => exec(store, addCaptionTrack(store.getState(), ctx.newId())), { weight: 0.3 }),
];

/** A clip that can be keyed and one of its sections. */
function keyedTarget(p: Project, rng: Rng, withKeys: boolean): { clip: Clip; section: KeyframeSection; frames: Frame[] } | null {
  const clip = pickClip(p, rng, (candidate) => sectionsOf(candidate).some((section) => !withKeys || sectionFrames("keyframes" in candidate ? candidate.keyframes : undefined, section).length > 0));
  if (!clip) return null;
  const sections = sectionsOf(clip).filter((section) => !withKeys || sectionFrames("keyframes" in clip ? clip.keyframes : undefined, section).length > 0);
  const section = some(rng, sections);
  if (!section) return null;
  return { clip, section, frames: sectionFrames("keyframes" in clip ? clip.keyframes : undefined, section) };
}

const KEYFRAME_OPS: FuzzOp[] = [
  op("keys.stopwatch", "keyframes", (store, rng) => {
    const p = store.getState();
    const target = keyedTarget(p, rng, false);
    if (!target) return false;
    return exec(store, setStopwatch(p, selection(p, rng, target.clip, rng.chance(0.5)), target.section, rng.chance(0.7), rng.chance(0.8) ? frameIn(target.clip, rng) : anyFrame(p, rng)));
  }),
  op("keys.toggle", "keyframes", (store, rng) => {
    const p = store.getState();
    const target = keyedTarget(p, rng, false);
    return target ? exec(store, toggleKeyAt(p, [target.clip.id], target.section, rng.chance(0.5) && target.frames.length > 0 ? target.clip.start + rng.pick(target.frames) : frameIn(target.clip, rng))) : false;
  }),
  op(
    "keys.add",
    "keyframes",
    (store, rng) => {
      const p = store.getState();
      const target = keyedTarget(p, rng, false);
      return target ? exec(store, addKeyAt(p, target.clip.id, target.section, rng.int(-2, target.clip.duration + 1))) : false;
    },
    { weight: 2 },
  ),
  op("keys.delete", "keyframes", (store, rng) => {
    const p = store.getState();
    const target = keyedTarget(p, rng, true);
    return target ? exec(store, deleteKeys(p, target.clip.id, target.section, subset(rng, [...target.frames, -7]))) : false;
  }),
  op("keys.move", "keyframes", (store, rng) => {
    const p = store.getState();
    const target = keyedTarget(p, rng, true);
    return target ? exec(store, moveKeys(p, target.clip.id, target.section, subset(rng, target.frames), delta(rng))) : false;
  }),
  op("keys.ease", "keyframes", (store, rng) => {
    const p = store.getState();
    const target = keyedTarget(p, rng, true);
    return target ? exec(store, setKeysEase(p, new Map([[target.clip.id, subset(rng, target.frames)]]), target.section, rng.pick(EASE_IDS))) : false;
  }),
  op("keys.copyPaste", "keyframes", (store, rng) => {
    const p = store.getState();
    const source = keyedTarget(p, rng, true);
    if (!source) return false;
    const clipboard = copyKeys(source.clip, source.section, subset(rng, source.frames));
    const onto = pickClip(p, rng, (clip) => keyable(clip, source.section));
    return clipboard && onto ? exec(store, pasteKeys(p, selection(p, rng, onto, false), clipboard, frameIn(onto, rng))) : false;
  }),
  op(
    "keys.value",
    "keyframes",
    (store, rng) => {
      // A value edit at the playhead: keyed clips get a key there (Batch 35).
      const p = store.getState();
      const target = keyedTarget(p, rng, rng.chance(0.7));
      if (!target) return false;
      const { clip } = target;
      const at = rng.chance(0.5) && target.frames.length > 0 ? clip.start + rng.pick(target.frames) : frameIn(clip, rng);
      if (target.section === "volume") return exec(store, setGains(p, new Map([[clip.id, rng.int(-70, 20)]]), { at }));
      if (target.section === "opacity") return exec(store, setOpacities(p, new Map([[clip.id, rng.next()]]), { label: "Opacity", at }));
      return isLayerClip(clip) ? exec(store, setTransforms(p, new Map([[clip.id, randomTransform(rng, clip.transform)]]), { label: "Transform", at })) : false;
    },
    { weight: 2 },
  ),
];

const TRANSITION_OPS: FuzzOp[] = [
  op(
    "transitions.add",
    "transitions",
    (store, rng, ctx) => {
      const p = store.getState();
      const pair = some(rng, abutting(p));
      const cut = rng.chance(0.7) ? some(rng, cuts(p).valid) : pair ? { left: pair[0].id, right: pair[1].id } : null;
      if (!cut) return false;
      const added = addTransition(p, cut, rng.pick(TRANSITION_KINDS), { ...(rng.chance(0.7) && { length: rng.int(1, 60) }), linked: rng.chance(0.7), newId: ctx.newId });
      return exec(store, added?.command);
    },
    { weight: 2 },
  ),
  op("transitions.update", "transitions", (store, rng) => {
    const p = store.getState();
    const cut = some(rng, cuts(p).withTransition);
    if (!cut) return false;
    const patch: { kind?: (typeof TRANSITION_KINDS)[number]; before?: Frame; after?: Frame } = {};
    if (rng.chance(0.4)) patch.kind = rng.pick(TRANSITION_KINDS);
    if (rng.chance(0.6)) patch.before = rng.int(-5, 60);
    if (rng.chance(0.6)) patch.after = rng.int(-5, 60);
    return exec(store, updateTransition(p, cut, patch, { linked: rng.chance(0.7) }));
  }),
  op("transitions.remove", "transitions", (store, rng) => {
    const p = store.getState();
    const cut = some(rng, cuts(p).withTransition);
    return cut ? exec(store, removeTransitions(p, [cut], { linked: rng.chance(0.7) })) : false;
  }),
  op("transitions.drag", "transitions", (store, rng) => {
    // A block edge drag, committed as the timeline does: the sides it ends with.
    const p = store.getState();
    const cut = some(rng, cuts(p).withTransition);
    const drag = cut ? dragTransitionEdge(p, cut, rng.pick(["start", "end"] as const), delta(rng), rng.chance(0.3)) : null;
    return cut && drag ? exec(store, updateTransition(p, cut, { before: drag.before, after: drag.after }, { linked: rng.chance(0.7) })) : false;
  }),
];

const randomEdge = (rng: Rng): FadeEdge => (rng.chance(0.5) ? "in" : "out");

const FADE_OPS: FuzzOp[] = [
  op("fades.set", "fades", (store, rng) => {
    const p = store.getState();
    const clip = pickClip(p, rng);
    if (!clip) return false;
    return exec(store, setFades(p, randomEdge(rng), new Map(selection(p, rng, clip, rng.chance(0.5)).map((id) => [id, rng.chance(0.05) ? Number.NaN : rng.int(-5, 120)])), "Fade"));
  }),
  op("fades.quick", "fades", (store, rng) => {
    const p = store.getState();
    const clip = pickClip(p, rng);
    return clip ? exec(store, quickFade(p, selection(p, rng, clip, false), randomEdge(rng), rng.pick([0.25, 0.5, 1, 3]))) : false;
  }),
  op("fades.drag", "fades", (store, rng) => {
    const p = store.getState();
    const clip = pickClip(p, rng);
    return clip ? exec(store, dragFade(p, clip.id, randomEdge(rng), rng.int(-3, clip.duration + 3))) : false;
  }),
  op("fades.preset", "fades", (store, rng) => {
    const p = store.getState();
    const clip = pickClip(p, rng);
    return clip ? exec(store, presetFade(p, selection(p, rng, clip, false), randomEdge(rng), rng.pick(FADE_PRESET_SECONDS))) : false;
  }),
];

const SPEED_OPS: FuzzOp[] = [
  op(
    "speed.set",
    "speed",
    (store, rng) => {
      const p = store.getState();
      const clip = pickClip(p, rng, isMediaClip);
      if (!clip) return false;
      const speed = rng.chance(0.3) ? (each: MediaClip) => each.speed + rng.pick([-0.25, 0.25, 1]) : rng.pick([0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 8]);
      return exec(store, setSpeeds(p, selection(p, rng, clip, false), speed, { link: rng.chance(0.7), ripple: rng.chance(0.4), linked: rng.chance(0.7) }).command);
    },
    { weight: 2 },
  ),
  op("speed.duration", "speed", (store, rng) => {
    const p = store.getState();
    const clip = pickClip(p, rng, isMediaClip);
    return clip ? exec(store, setSpeedDurations(p, selection(p, rng, clip, false), clip.duration + delta(rng), { link: rng.chance(0.7), ripple: rng.chance(0.4), linked: rng.chance(0.7) }).command) : false;
  }),
  op(
    "speed.freeze",
    "speed",
    (store, rng, ctx) => {
      const p = store.getState();
      const clip = pickClip(p, rng, (candidate) => candidate.kind === "video");
      const frame = clip && rng.chance(0.8) ? (rng.chance(0.1) ? clip.start : rng.chance(0.15) ? endOf(clip) - 1 : frameIn(clip, rng)) : anyFrame(p, rng);
      const result = freezeFrame(p, frame, clip && rng.chance(0.7) ? [clip.id] : [], ctx.newId);
      return typeof result === "object" ? exec(store, result.command) : false;
    },
    { effect: "grow" },
  ),
  op("speed.punchZoom", "speed", (store, rng, ctx) => {
    const p = store.getState();
    const clip = pickClip(p, rng, isLayerClip);
    const frame = clip && rng.chance(0.8) ? (rng.chance(0.1) ? clip.start : frameIn(clip, rng)) : anyFrame(p, rng);
    const result = punchZoom(p, frame, clip && rng.chance(0.7) ? [clip.id] : [], rng.pick([1.2, 1.5, 0.8]), ctx.newId, { linked: rng.chance(0.7), animated: rng.chance(0.5) });
    return typeof result === "object" ? exec(store, result.command) : false;
  }),
];

const AUDIO_OPS: FuzzOp[] = [
  op("audio.gain", "audio", (store, rng) => {
    const p = store.getState();
    const clip = pickClip(p, rng, (candidate) => candidate.kind === "audio" || candidate.kind === "video");
    if (!clip) return false;
    const ids = audioTargets(p, selection(p, rng, clip, true));
    return exec(store, setGains(p, new Map(ids.map((id) => [id, rng.chance(0.05) ? Number.NaN : rng.int(-80, 20)])), { ...(rng.chance(0.5) && { at: frameIn(clip, rng) }) }));
  }),
  op("audio.mute", "audio", (store, rng) => {
    const p = store.getState();
    const clip = pickClip(p, rng, (candidate) => candidate.kind === "audio");
    return clip ? exec(store, setMuted(p, selection(p, rng, clip, true), rng.chance(0.5))) : false;
  }),
  op("audio.toggleMute", "audio", (store, rng) => {
    const p = store.getState();
    const clip = pickClip(p, rng, (candidate) => candidate.kind === "audio");
    return clip ? exec(store, toggleMuted(p, selection(p, rng, clip, true))) : false;
  }),
  op("audio.normalize", "audio", (store, rng) => {
    const p = store.getState();
    const clip = pickClip(p, rng, (candidate) => candidate.kind === "audio" || candidate.kind === "video");
    if (!clip) return false;
    const exact = rng.chance(0.3) ? (_media: string, from: number, to: number) => (to > from && rng.chance(0.7) ? rng.int(1, 100) / 100 : null) : undefined;
    return exec(store, normalizeClips(p, audioTargets(p, selection(p, rng, clip, true)), (id) => fakePeaks(p.media[id]), exact).command);
  }),
  op("audio.band", "audio", (store, rng) => {
    const p = store.getState();
    const clip = pickClip(p, rng, (candidate) => candidate.kind === "audio");
    if (!clip || !isMediaClip(clip)) return false;
    const keys = volumeKeys(clip).map((key) => key.frame);
    const edit = keys.length > 0 && rng.chance(0.8) ? { kind: "keys" as const, frames: subset(rng, keys, 0.3), deltaDb: rng.int(-30, 30), deltaFrames: delta(rng) } : { kind: "gain" as const, gainDb: rng.int(-80, 20) };
    return exec(store, bandEdit(p, clip.id, edit));
  }),
  op("audio.duck", "audio", (store, rng) => {
    const p = store.getState();
    const clip = pickClip(p, rng, (candidate) => candidate.kind === "audio");
    return clip ? exec(store, autoDuck(p, selection(p, rng, clip, false), { depthDb: rng.int(0, 30), rampFrames: rng.int(0, 20) }).command) : false;
  }),
  op(
    "audio.detach",
    "audio",
    (store, rng, ctx) => {
      const p = store.getState();
      if (p.tracks.length >= MAX_TRACKS) return false;
      const clip = pickClip(p, rng, (candidate) => candidate.kind === "video");
      return clip ? exec(store, detachAudio(p, selection(p, rng, clip, false), ctx.newId).command) : false;
    },
    { effect: "grow" },
  ),
];

/** One Remove silence: the pieces of every member (`cutSilences`), or null when nothing was cut. */
export interface SilenceRun {
  groups: readonly SilenceGroup[];
  pieces: ReadonlyMap<ClipId, readonly ClipId[]>;
}

/**
 * Remove silence on `ids` (default: a random clip and its partners) with random silences found in each
 * analysed clip: the cut and the close in one transaction, as the app runs it.
 */
export function removeSilence(store: DocumentStore, rng: Rng, ctx: FuzzContext, ids?: readonly ClipId[]): SilenceRun | null {
  const p = store.getState();
  let selected = ids;
  if (!selected) {
    const clip = pickClip(p, rng, (candidate) => candidate.kind === "audio" || candidate.kind === "video");
    if (!clip) return null;
    selected = selection(p, rng, clip, true);
  }
  const targets = silenceTargets(p, selected);
  if (targets.length === 0) return null;
  // What the analysis finds (media/analysis/silence.ts): sorted silent spans in media µs around each
  // analysed clip's source, as timeline frames through `spanFrames`; now and then not ready yet.
  const rangesOf = (id: ClipId): readonly FrameRange[] | null => {
    const clip = p.clips[id];
    if (!clip || !isMediaClip(clip) || rng.chance(0.05)) return null;
    const spans: number[] = [];
    const sourceUs = clip.out - clip.in;
    let cursor = clip.in - rng.int(0, 2) * 100_000;
    for (let i = rng.int(1, 4); i > 0; i--) {
      const from = cursor + rng.int(0, Math.max(1, Math.round(sourceUs / 3)));
      const to = from + rng.int(1, Math.max(2, Math.round(sourceUs / 4)));
      spans.push(from, to);
      cursor = to + 1;
    }
    return spanFrames(clip, spans, p.settings.fps);
  };
  const plan = silencePlan(p, targets, rangesOf);
  if (plan.groups.length === 0) return null;
  let pieces: ReadonlyMap<ClipId, readonly ClipId[]> = new Map();
  store.transaction(REMOVE_SILENCE_LABEL, () => {
    const cut = cutSilences(store.getState(), plan.groups, ctx.newId);
    pieces = cut.pieces;
    if (cut.command) store.dispatch(cut.command);
    const close = closeSilences(store.getState(), cut.gaps);
    if (close.command) store.dispatch(close.command);
  });
  return store.getState() === p ? null : { groups: plan.groups, pieces };
}

const SILENCE_OPS: FuzzOp[] = [op("silence.remove", "silence", (store, rng, ctx) => removeSilence(store, rng, ctx) !== null, { weight: 2 })];

const CLIPBOARD_OPS: FuzzOp[] = [
  op(
    "clipboard.paste",
    "clipboard",
    (store, rng, ctx) => {
      const payload = payloadFor(store, rng);
      if (!payload) return false;
      const p = store.getState();
      const result = pasteClips(p, payload, { at: anyFrame(p, rng), mode: "overwrite", newId: ctx.newId });
      return result.kind === "ok" ? exec(store, result.command) : false;
    },
    { effect: "grow" },
  ),
  op(
    "clipboard.pasteInsert",
    "clipboard",
    (store, rng, ctx) => {
      const payload = payloadFor(store, rng);
      if (!payload) return false;
      const p = store.getState();
      const result = pasteClips(p, payload, { at: anyFrame(p, rng), mode: "insert", newId: ctx.newId });
      return result.kind === "ok" ? exec(store, result.command) : false;
    },
    { effect: "grow" },
  ),
  op(
    "clipboard.cut",
    "clipboard",
    (store, rng) => {
      const p = store.getState();
      const clip = pickClip(p, rng);
      if (!clip) return false;
      const linked = rng.chance(0.75);
      const ids = selection(p, rng, clip, linked);
      const payload = copyClips(p, ids, clip.id, { linked });
      if (payload) clipboards.set(store, payload);
      const command = deleteClips(p, ids, { linked });
      return command ? exec(store, { ...command, id: "clipboard.cut", label: "Cut" }) : false;
    },
    { effect: "shrink" },
  ),
  op(
    "clipboard.duplicate",
    "clipboard",
    (store, rng, ctx) => {
      const p = store.getState();
      const clip = pickClip(p, rng);
      return clip ? exec(store, duplicateClips(p, selection(p, rng, clip, rng.chance(0.75)), ctx.newId)?.command) : false;
    },
    { effect: "grow" },
  ),
  op(
    "clipboard.duplicateLayers",
    "clipboard",
    (store, rng, ctx) => {
      const p = store.getState();
      if (p.tracks.length >= MAX_TRACKS) return false;
      const clip = pickClip(p, rng, isLayerClip);
      return clip ? exec(store, duplicateLayers(p, selection(p, rng, clip, false), ctx.newId, rng.pick([20, 0, -35]))?.command) : false;
    },
    { effect: "grow" },
  ),
  op("clipboard.pasteAttributes", "clipboard", (store, rng) => {
    const payload = payloadFor(store, rng);
    const p = store.getState();
    const clip = pickClip(p, rng);
    if (!payload || !clip) return false;
    const linked = rng.chance(0.7);
    const ids = selection(p, rng, clip, linked);
    const groups = new Set<AttributeGroup>(subset(rng, ATTRIBUTE_GROUPS, 0.4));
    const { link, ripple } = { link: rng.chance(0.7), ripple: rng.chance(0.4) };
    return inTransaction(store, "Paste attributes", () => {
      // Copied at another frame rate: its frames converted first, as the app does.
      const converted = payloadAtFrameRate(payload, p.settings.fps);
      const command = pasteAttributes(store.getState(), converted, ids, groups);
      if (command) store.dispatch(command);
      const speed = pastedSpeed(converted, groups);
      if (speed !== null) {
        const current = store.getState();
        const result = setSpeeds(current, attributeTargets(current, ids, "speed"), speed, { link, ripple, linked });
        if (result.command) store.dispatch(result.command);
      }
    });
  }),
];

const PROP_OPS: FuzzOp[] = [
  op("props.opacity", "props", (store, rng) => {
    const p = store.getState();
    const clip = pickClip(p, rng);
    if (!clip) return false;
    return exec(store, setOpacities(p, new Map(selection(p, rng, clip, false).map((id) => [id, rng.chance(0.05) ? Number.NaN : rng.int(-20, 120) / 100])), { label: "Opacity", ...(rng.chance(0.4) && { at: frameIn(clip, rng) }) }));
  }),
  op("props.enabled", "props", (store, rng) => {
    const p = store.getState();
    const clip = pickClip(p, rng);
    return clip ? exec(store, setEnabled(p, selection(p, rng, clip, true), rng.chance(0.5))) : false;
  }),
  op("props.crop", "props", (store, rng) => {
    const p = store.getState();
    const clip = pickClip(p, rng, (candidate) => candidate.kind === "video" || candidate.kind === "image");
    if (!clip) return false;
    const side = () => (rng.chance(0.05) ? rng.pick([Number.NaN, -0.5, 1.5]) : rng.int(0, 60) / 100);
    return exec(store, setCrops(p, new Map(selection(p, rng, clip, false).map((id) => [id, { left: side(), top: side(), right: side(), bottom: side() }])), { label: "Crop" }));
  }),
  op("props.quickCrop", "props", (store, rng) => {
    const p = store.getState();
    const clip = pickClip(p, rng, (candidate) => candidate.kind === "video" || candidate.kind === "image");
    return clip ? exec(store, quickCrops(p, selection(p, rng, clip, false), rng.pick(["reset", "frame"] as const))) : false;
  }),
  op("props.transform", "props", (store, rng) => {
    const p = store.getState();
    const clip = pickClip(p, rng, isLayerClip);
    if (!clip || !isLayerClip(clip)) return false;
    const transform = rng.chance(0.05) ? { ...clip.transform, x: Number.NaN } : randomTransform(rng, clip.transform);
    return exec(store, setTransforms(p, new Map([[clip.id, transform]]), { label: "Transform", ...(rng.chance(0.5) && { at: frameIn(clip, rng) }) }));
  }),
  op("props.nudge", "props", (store, rng) => {
    const p = store.getState();
    const clip = pickClip(p, rng, isLayerClip);
    return clip ? exec(store, nudgeLayers(p, selection(p, rng, clip, false), rng.pick([-10, -1, 0, 1, 10]), rng.pick([-10, -1, 1, 10]), rng.chance(0.5) ? frameIn(clip, rng) : undefined)) : false;
  }),
  op("props.quick", "props", (store, rng) => {
    const p = store.getState();
    const clip = pickClip(p, rng, isLayerClip);
    const action: QuickTransform = rng.pick(["fit", "fill", "center", "flipH", "flipV", "reset"] as const);
    return clip ? exec(store, quickTransforms(p, selection(p, rng, clip, false), action, rng.chance(0.5) ? frameIn(clip, rng) : undefined)) : false;
  }),
];

const SOLID_OPS: FuzzOp[] = [
  op(
    "solids.add",
    "solids",
    (store, rng, ctx) => {
      const p = store.getState();
      if (p.tracks.length >= MAX_TRACKS) return false;
      const { command } = addSolid(p, anyFrame(p, rng), ctx.newId, rng.chance(0.5) ? randomLook(rng) : undefined);
      return exec(store, command);
    },
    { effect: "grow" },
  ),
  op(
    "solids.set",
    "solids",
    (store, rng) => {
      const p = store.getState();
      const clip = pickClip(p, rng, (candidate) => candidate.kind === "solid");
      if (!clip) return false;
      const ids = rng.chance(0.3) ? selection(p, rng, clip, false) : [clip.id];
      return exec(store, setSolids(p, new Map(ids.map((id) => [id, randomSolidEdit(rng)])), { label: "Solid", ...(rng.chance(0.4) && { at: frameIn(clip, rng) }) }));
    },
    { weight: 2 },
  ),
];

const TEXT_OPS: FuzzOp[] = [
  op(
    "text.add",
    "text",
    (store, rng, ctx) => {
      const p = store.getState();
      if (p.tracks.length >= MAX_TRACKS) return false;
      return exec(store, addTextClip(p, anyFrame(p, rng), rng.int(1, 150), ctx.newId, { value: randomText(rng), ...(rng.chance(0.5) && { style: randomStyle(rng) }) }).command);
    },
    { effect: "grow" },
  ),
  op(
    "text.title",
    "text",
    (store, rng, ctx) => {
      const p = store.getState();
      if (p.tracks.length >= MAX_TRACKS) return false;
      const below = pickClip(p, rng, (clip) => clip.kind === "text");
      return exec(store, addTitle(p, { kind: rng.pick(["title", "subtitle"] as const), playhead: anyFrame(p, rng), matchClip: rng.chance(0.5), below: below?.id ?? null, look: rng.chance(0.4) ? titleLook(rng, p) : null }, ctx.newId).command);
    },
    { effect: "grow" },
  ),
  op(
    "text.set",
    "text",
    (store, rng) => {
      const p = store.getState();
      const clip = pickClip(p, rng, (candidate) => candidate.kind === "text");
      if (!clip || clip.kind !== "text") return false;
      const edit: TextEditInput = {};
      if (rng.chance(0.6)) edit.text = textContent(randomText(rng), rng.chance(0.3) ? { mode: "fixed", width: rng.int(10, 1200) } : clip.text.box);
      if (rng.chance(0.6)) edit.style = randomStyle(rng, clip.style);
      if (rng.chance(0.15)) edit.transform = randomTransform(rng, clip.transform);
      return exec(store, setTexts(p, new Map([[clip.id, edit]]), { label: "Text", ...(rng.chance(0.4) && { at: frameIn(clip, rng) }) }));
    },
    { weight: 2 },
  ),
  op("text.preset", "text", (store, rng) => {
    const p = store.getState();
    const clip = pickClip(p, rng, (candidate) => candidate.kind === "text");
    return clip ? exec(store, applyPreset(p, selection(p, rng, clip, false), presetApply(rng, p), "Apply preset")) : false;
  }),
  op("text.linkPreset", "text", (store, rng) => {
    const p = store.getState();
    const clip = pickClip(p, rng, (candidate) => candidate.kind === "text");
    return clip ? exec(store, linkPreset(p, clip.id, rng.pick(starterPresets()).id, "Save as preset")) : false;
  }),
  op("text.anims", "text", (store, rng) => {
    const p = store.getState();
    const clip = pickClip(p, rng, (candidate) => candidate.kind === "text");
    if (!clip) return false;
    const anim = () => (rng.chance(0.3) ? null : { ...newTextAnim(rng.pick(TEXT_ANIM_IDS), p.settings.fps), ...(rng.chance(0.3) && { ease: rng.pick(["linear", "easeIn", "easeOut", "easeInOut"] as const) }) });
    return exec(store, setTextAnims(p, new Map([[clip.id, { ...(rng.chance(0.7) && { animIn: anim() }), ...(rng.chance(0.7) && { animOut: anim() }) }]]), { label: "Animation" }));
  }),
];

/** A random cue (mostly on an unlocked track). */
const pickCue = (p: Project, rng: Rng): CaptionClip | null => pickClip(p, rng, (clip) => clip.kind === "caption") as CaptionClip | null;

const CAPTION_OPS: FuzzOp[] = [
  op(
    "captions.add",
    "captions",
    (store, rng, ctx) => {
      const p = store.getState();
      return exec(store, addCueAt(p, frameNear(p, rng), ctx.newId, rng.chance(0.5) ? randomText(rng) : undefined)?.command);
    },
    { weight: 2, effect: "grow" },
  ),
  op("captions.text", "captions", (store, rng) => {
    const p = store.getState();
    const cue = pickCue(p, rng);
    return cue ? exec(store, setCueText(p, cue.id, randomText(rng))) : false;
  }),
  op(
    "captions.split",
    "captions",
    (store, rng, ctx) => {
      const p = store.getState();
      const cue = pickCue(p, rng);
      if (!cue) return false;
      const text = rng.chance(0.7) ? cue.text : randomText(rng);
      return exec(store, splitCue(p, cue.id, text, rng.int(0, text.length), ctx.newId)?.command);
    },
    { effect: "grow" },
  ),
  op(
    "captions.merge",
    "captions",
    (store, rng) => {
      const p = store.getState();
      const cue = pickCue(p, rng);
      return cue ? exec(store, mergeWithPrevious(p, cue.id, rng.chance(0.3) ? randomText(rng) : undefined)?.command) : false;
    },
    { effect: "shrink" },
  ),
  op(
    "captions.import",
    "captions",
    (store, rng, ctx) => {
      const p = store.getState();
      const span = frameToUs(contentEnd(p) + 60, p.settings.fps);
      return exec(store, importCues(p, randomSubtitles(rng, rng.int(0, 12), 0, span), ctx.newId)?.command);
    },
    { weight: 0.5 },
  ),
  op("captions.transcribe", "captions", (store, rng, ctx) => {
    const p = store.getState();
    const range = randomRange(p, rng);
    const lengthUs = frameToUs(range.end - range.start, p.settings.fps);
    const cues = transcribedCues(randomSubtitles(rng, rng.int(1, 5), 0, lengthUs), range, p.settings.fps);
    return exec(store, replaceCuesInRange(p, range, cues, ctx.newId)?.command);
  }),
  op("captions.move", "captions", (store, rng, ctx) => {
    const p = store.getState();
    const cue = pickCue(p, rng);
    if (!cue) return false;
    const ids = rng.chance(0.3) ? [cue.id, ...subset(rng, captionTrackOf(p)?.clipIds ?? [], 0.2)] : [cue.id];
    return execMove(store, applyMoveRequest(p, { clipIds: ids, primary: cue.id, deltaFrames: delta(rng), laneDelta: NO_LANE_DELTA, mode: randomMode(rng), duplicate: rng.chance(0.3) }, ctx.newId));
  }),
  op("captions.trim", "captions", (store, rng) => {
    const p = store.getState();
    const cue = pickCue(p, rng);
    const edge: TrimEdge = rng.pick(["in", "out"] as const);
    return cue ? exec(store, trimEdge(p, cue.id, edge, delta(rng), { ripple: rng.chance(0.4), linked: rng.chance(0.75) }).command) : false;
  }),
  op("captions.style", "captions", (store, rng) => {
    const p = store.getState();
    const track = captionTrackOf(p);
    return track ? exec(store, setCaptionStyle(p, track.id, randomCaptionStyle(rng, captionStyleOf(p, track.id)), { label: "Caption style" })) : false;
  }),
  op("captions.clear", "captions", (store) => exec(store, clearCues(store.getState())), { weight: 0.2, effect: "shrink" }),
];

const BIN_NAMES = ["B-roll", "Music", "  ", "Interviews", "Bin"];

const MEDIA_OPS: FuzzOp[] = [
  op("media.add", "media", (store, rng, ctx) => exec(store, addMedia([randomMedia(rng, ctx.newId, rng.pick(["video", "video", "audio", "image"] as const), rng.chance(0.8))]))),
  op("media.binAdd", "media", (store, rng, ctx) => (store.getState().bins.length < 6 ? exec(store, addBin({ id: ctx.newId(), name: rng.pick(BIN_NAMES.filter((name) => name.trim() !== "")) })) : false)),
  op("media.binRename", "media", (store, rng) => {
    const bin = some(rng, store.getState().bins);
    return bin ? exec(store, renameBin(bin.id, rng.pick(BIN_NAMES))) : false;
  }),
  op("media.binRemove", "media", (store, rng) => {
    const bin = some(rng, store.getState().bins);
    return bin ? exec(store, removeBin(bin.id)) : false;
  }),
  op("media.setBin", "media", (store, rng) => {
    const p = store.getState();
    const bin = some(rng, p.bins);
    const ids = subset(rng, Object.keys(p.media), 0.3);
    return ids.length > 0 ? exec(store, setMediaBin(ids, bin && rng.chance(0.8) ? bin.id : null)) : false;
  }),
  op("media.removeKeep", "media", (store, rng) => {
    const media = some(rng, Object.keys(store.getState().media));
    return media ? exec(store, removeMedia([media], "keep")) : false;
  }),
  op(
    "media.removeDelete",
    "media",
    (store, rng) => {
      const media = some(rng, Object.keys(store.getState().media));
      return media ? exec(store, removeMedia([media], "delete")) : false;
    },
    { weight: 0.3, effect: "shrink" },
  ),
  op("media.relink", "media", (store, rng, ctx) => {
    // A missing file found again: another path, the same or a longer duration (clips stay inside it).
    const media = some(rng, Object.values(store.getState().media));
    if (!media) return false;
    const fields = { file: { relPath: `media/relinked-${ctx.newId()}.mp4` }, size: rng.int(1, 1e9), durationUs: media.durationUs + (rng.chance(0.5) ? 0 : rng.int(0, 5_000_000)), proxy: undefined };
    return exec(store, relinkMedia([{ id: media.id, fields }]));
  }),
  op("media.rename", "media", (store, rng) => {
    const media = some(rng, Object.keys(store.getState().media));
    return media ? exec(store, renameMedia(media, rng.pick(["Interview take 2.mp4", "   ", "b-roll"]))) : false;
  }),
];

const MARKER_OPS: FuzzOp[] = [
  op("markers.add", "markers", (store, rng, ctx) => {
    const p = store.getState();
    return exec(store, addMarker({ id: ctx.newId(), frame: anyFrame(p, rng), color: rng.pick(LABEL_COLORS), label: randomText(rng) }));
  }),
  op("markers.update", "markers", (store, rng) => {
    const p = store.getState();
    const marker = some(rng, p.markers);
    if (!marker) return false;
    const patch: { frame?: Frame; label?: string; color?: (typeof LABEL_COLORS)[number] } = {};
    if (rng.chance(0.6)) patch.frame = anyFrame(p, rng);
    if (rng.chance(0.3)) patch.label = randomText(rng);
    if (rng.chance(0.3)) patch.color = rng.pick(LABEL_COLORS);
    return exec(store, updateMarker(marker.id, patch));
  }),
  op("markers.remove", "markers", (store, rng) => {
    const marker = some(rng, store.getState().markers);
    return marker ? exec(store, removeMarker(marker.id)) : false;
  }),
];

/** Every edit operation of the catalogue, with random but sensible arguments. */
export const FUZZ_OPS: readonly FuzzOp[] = [
  ...MOVE_OPS,
  ...TRIM_OPS,
  ...SPLIT_OPS,
  ...DELETE_OPS,
  ...GAP_OPS,
  ...LINK_OPS,
  ...TRACK_OPS,
  ...KEYFRAME_OPS,
  ...TRANSITION_OPS,
  ...FADE_OPS,
  ...SPEED_OPS,
  ...AUDIO_OPS,
  ...SILENCE_OPS,
  ...CLIPBOARD_OPS,
  ...PROP_OPS,
  ...SOLID_OPS,
  ...TEXT_OPS,
  ...CAPTION_OPS,
  ...MEDIA_OPS,
  ...MARKER_OPS,
];

/** The operations of some areas. */
export function opsOf(...areas: FuzzArea[]): FuzzOp[] {
  return FUZZ_OPS.filter((candidate) => areas.includes(candidate.area));
}

/** A weighted pick. */
export function pickOp(rng: Rng, ops: readonly FuzzOp[]): FuzzOp {
  let total = 0;
  for (const candidate of ops) total += candidate.weight ?? 1;
  let roll = rng.next() * total;
  for (const candidate of ops) {
    roll -= candidate.weight ?? 1;
    if (roll < 0) return candidate;
  }
  return ops[ops.length - 1] as FuzzOp;
}

// --- Checks --------------------------------------------------------------------------------------

/** Operations that may change clips on locked tracks: track switches, and Remove media's "delete clips" (Batch 41: on every track). */
const LOCK_EXEMPT = /^(tracks\.flag|media\.removeDelete|project\.)/;
/** Deleting a track takes the lone partners' link and group away, on locked tracks too (tracks.ts `deleteTracks`). */
const DROPS_LONE_GROUPS = /^tracks\.(delete|deleteEmpty)$/;

/** Walks a value: every number finite (and not -0, which JSON writes as 0), no undefined-valued keys, only plain objects and arrays. */
function plainIssues(value: unknown, path: string, issues: string[]): void {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) issues.push(`${path}: ${value} is not finite`);
    else if (Object.is(value, -0)) issues.push(`${path}: -0 (JSON writes 0)`);
    return;
  }
  if (typeof value !== "object" || value === null) {
    if (value === undefined) issues.push(`${path}: undefined`);
    else if (typeof value !== "string" && typeof value !== "boolean") issues.push(`${path}: a ${typeof value} is not JSON`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => plainIssues(item, `${path}[${i}]`, issues));
    return;
  }
  const proto: unknown = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    issues.push(`${path}: not a plain object`);
    return;
  }
  for (const [key, item] of Object.entries(value)) plainIssues(item, `${path}.${key}`, issues);
}

const sameJson = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

/** `clip` without its link group and group when no other clip of `project` has them (what a track deletion drops). */
function withoutLoneGroups(clip: Clip, project: Project): Clip {
  const next = { ...clip };
  for (const field of ["linkGroup", "group"] as const) {
    const value = next[field];
    if (value !== undefined && !Object.values(project.clips).some((other) => other.id !== clip.id && other[field] === value)) delete next[field];
  }
  return next;
}

function clipIssues(project: Project, clip: Clip): string[] {
  const issues: string[] = [];
  const label = `clip ${clip.id}`;
  if (clip.linkGroup === "" || clip.group === "") issues.push(`${label}: empty link group or group id`);
  if (!isMediaClip(clip)) return issues;
  const media = project.media[clip.mediaId];
  if (media) {
    const ok = clip.kind === "image" ? media.kind === "image" : clip.kind === "audio" ? media.kind !== "image" && media.hasAudio : media.kind === "video";
    if (!ok) issues.push(`${label}: a ${clip.kind} clip on ${media.kind} media ${media.id}`);
  }
  if (!isFreeze(clip) && clip.kind !== "image" && !(clip.speed >= MIN_SPEED - 1e-6 && clip.speed <= MAX_SPEED + 1e-6)) {
    issues.push(`${label}: speed ${clip.speed} outside ${MIN_SPEED}..${MAX_SPEED}`);
  }
  const { crop } = clip;
  if (![crop.left, crop.top, crop.right, crop.bottom].every((side) => side >= 0 && side <= 1) || crop.left + crop.right >= 1 || crop.top + crop.bottom >= 1) {
    issues.push(`${label}: crop ${JSON.stringify(crop)} leaves nothing or is out of 0..1`);
  }
  return issues;
}

/**
 * What an operation `opName` that turned `before` into `after` broke beyond validateProject (empty
 * when nothing): see the module comment. `before` null checks all of `after`. Cheap: unchanged parts
 * (the same objects) are skipped.
 */
export function documentChecks(before: Project | null, after: Project, opName: string): string[] {
  const issues: string[] = [];
  // Plain JSON with finite numbers, in every part that changed.
  for (const key of Object.keys(after) as (keyof Project)[]) {
    if (key === "clips" || key === "media") continue;
    if (!before || before[key] !== after[key]) plainIssues(after[key], key, issues);
  }
  for (const [id, clip] of Object.entries(after.clips)) {
    if (before?.clips[id] === clip) continue;
    plainIssues(clip, `clips.${id}`, issues);
    issues.push(...clipIssues(after, clip));
  }
  if (!before || before.media !== after.media) {
    for (const [id, media] of Object.entries(after.media)) if (before?.media[id] !== media) plainIssues(media, `media.${id}`, issues);
    // A media record goes only through Remove (spec §12).
    if (before && !opName.startsWith("media.remove")) for (const id of Object.keys(before.media)) if (!after.media[id]) issues.push(`media ${id} disappeared`);
    // Relinked or re-added media still match their clips' kinds.
    for (const clip of Object.values(after.clips)) if (isMediaClip(clip) && before?.media[clip.mediaId] !== after.media[clip.mediaId]) issues.push(...clipIssues(after, clip));
  }
  if (!before || LOCK_EXEMPT.test(opName)) return issues;
  // Locked tracks take no edits (spec §6.12): the same clips, unchanged.
  for (const track of before.tracks) {
    if (!track.locked) continue;
    const now = after.tracks.find((candidate) => candidate.id === track.id);
    if (!now?.locked) {
      if (!now) issues.push(`locked track ${track.id} was deleted`);
      continue;
    }
    if (now.clipIds !== track.clipIds && !sameJson(now.clipIds, track.clipIds)) issues.push(`locked track ${track.id}: clips ${JSON.stringify(track.clipIds)} became ${JSON.stringify(now.clipIds)}`);
    for (const id of track.clipIds) {
      const was = before.clips[id];
      const is = after.clips[id];
      if (was === is) continue;
      if (is && DROPS_LONE_GROUPS.test(opName) && sameJson(withoutLoneGroups(was as Clip, after), is)) continue;
      if (!is || !sameJson(was, is)) issues.push(`locked clip ${id} on ${track.id} changed in ${opName}`);
    }
  }
  return issues;
}

/** The sync offsets (`linkOffset`) of every linked clip. */
export function linkOffsets(project: Project): Map<ClipId, Frame> {
  const offsets = new Map<ClipId, Frame>();
  for (const clip of Object.values(project.clips)) if (clip.linkGroup !== undefined) offsets.set(clip.id, linkOffset(project, clip.id));
  return offsets;
}

// --- Runner --------------------------------------------------------------------------------------

export interface FuzzRunOptions {
  seed: number;
  steps: number;
  ops?: readonly FuzzOp[];
  /** The starting document (default: `randomProject` of the seed with `projectOptions`). */
  project?: Project;
  projectOptions?: RandomProjectOptions;
  /** Chances of an undo or a redo instead of an operation (the interleaved run). */
  undo?: number;
  redo?: number;
  /** Keeps the clip count about inside [min, max]: below, growing operations are favoured; above, shrinking ones. */
  clipRange?: { min: number; max: number };
  /** More checks after each operation. */
  check?: (before: Project, after: Project, op: FuzzOp) => string[];
}

export interface FuzzRunResult extends FuzzStore {
  /** The document after the last step. */
  final: Project;
  /** Operations that changed the document (one undo step each). */
  changed: number;
  /** Operations run, per area and per name. */
  areas: Map<FuzzArea, number>;
  names: Map<string, number>;
}

/**
 * Runs `steps` random operations (and undos / redos) on a fuzz store, checking `documentChecks` (and
 * `check`) after each; dispatch validates every step. Throws on the first failure with the seed, the
 * step and the operation.
 */
export function fuzzRun(options: FuzzRunOptions): FuzzRunResult {
  const rng = random(options.seed);
  const project = options.project ?? randomProject(rng, options.projectOptions);
  const fuzz = makeFuzzStore(project);
  const { store, ctx } = fuzz;
  const ops = options.ops ?? FUZZ_OPS;
  const grow = ops.filter((candidate) => candidate.effect === "grow");
  const shrink = ops.filter((candidate) => candidate.effect === "shrink");
  const areas = new Map<FuzzArea, number>();
  const names = new Map<string, number>();
  const fail = (step: number, name: string, message: string): never => {
    throw new Error(`fuzz seed ${options.seed}, step ${step}, ${name}: ${message}`);
  };
  const initial = documentChecks(null, store.getState(), "start");
  if (initial.length > 0) fail(0, "start", initial.join("\n"));
  let changed = 0;
  for (let step = 1; step <= options.steps; step++) {
    const roll = rng.next();
    if (options.undo && roll < options.undo) {
      store.undo();
      continue;
    }
    if (options.redo && roll < (options.undo ?? 0) + options.redo) {
      store.redo();
      continue;
    }
    let pool = ops;
    if (options.clipRange && rng.chance(0.5)) {
      const count = Object.keys(store.getState().clips).length;
      if (count < options.clipRange.min && grow.length > 0) pool = grow;
      else if (count > options.clipRange.max && shrink.length > 0) pool = shrink;
    }
    const chosen = pickOp(rng, pool);
    areas.set(chosen.area, (areas.get(chosen.area) ?? 0) + 1);
    names.set(chosen.name, (names.get(chosen.name) ?? 0) + 1);
    const before = store.getState();
    try {
      chosen.run(store, rng, ctx);
    } catch (error) {
      fail(step, chosen.name, error instanceof Error ? error.message : String(error));
    }
    const after = store.getState();
    if (after === before) continue;
    changed++;
    const issues = [...documentChecks(before, after, chosen.name), ...(options.check?.(before, after, chosen) ?? [])];
    if (issues.length > 0) fail(step, chosen.name, issues.join("\n"));
  }
  return { ...fuzz, final: structuredClone(store.getState()), changed, areas, names };
}
