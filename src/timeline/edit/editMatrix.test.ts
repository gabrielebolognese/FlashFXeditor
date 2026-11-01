// Every operation with locked tracks, links, groups, transitions and keyframes (spec §6.19, Batch 47
// Build). One hand-made document holds each of them; every builder of timeline/edit (and the raw,
// media, marker and project commands) runs on it once, aimed at the interesting clips. For each row:
// the dispatch is valid (validateProject in the store: transitions and keyframes included), the locked
// track's clips are unchanged (except where the design says otherwise: Remove media's "delete clips",
// Adapt layout, frame rate conversion), `documentChecks` finds nothing, and undo gives the document
// back exactly (redo the result). Rows add what the behaviour defines for linked partners, groups,
// transitions and keys. The single-feature tests (locks.test.ts, links.test.ts, transitions.test.ts,
// keyframes.test.ts, split.test.ts) cover each rule in depth; this table crosses them.
import { beforeAll, describe, expect, it } from "vitest";
import { addClip, addTrack, removeClips, removeTrack, updateClip, updateTrack } from "../../core/commands/basicCommands.js";
import type { Command } from "../../core/commands/command.js";
import { addMarker, removeMarker, updateMarker } from "../../core/commands/markerCommands.js";
import { addBin, addMedia, relinkMedia, removeBin, removeMedia, renameBin, renameMedia, setMediaBin } from "../../core/commands/mediaCommands.js";
import { renameProject, setBackground, setFrameRate, setResolution } from "../../core/commands/projectCommands.js";
import { addCaptionTrack as withCaptionTrack, makeCaptionClip, makeMedia, makeProject, makeSolidClip, makeTextClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import { frameToUs } from "../../core/document/time.js";
import { PEAKS_BUCKET, type Peaks } from "../../media/cache/peaks.js";
import type { Clip, Keyframes, MediaClip, Project, TextPreset, Transition } from "../../core/document/types.js";
import { validateProject } from "../../core/document/validate.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createSessionStore } from "../../core/store/sessionStore.js";
import { presetLook } from "../../text/presets.js";
import { starterPresets } from "../../text/starterPresets.js";
import { textContent } from "../../text/style.js";
import { linkOffset, selectionPartners } from "../model/queries.js";
import { adaptResolution } from "./adaptLayout.js";
import { arrangeLayers } from "./arrange.js";
import { addCaptionTrack, addCueAt, captionStyleOf, clearCues, importCues, mergeWithPrevious, replaceCuesInRange, setCaptionStyle, setCueText, splitCue } from "./captions.js";
import { copyClips, pasteClips } from "./clipboard.js";
import { retimeClips, setEnabled, setOpacities } from "./clipProps.js";
import { quickCrops, setCrops } from "./crop.js";
import { deleteClips, rippleDelete } from "./delete.js";
import { applyMediaDrop, commitPlan, planAtPlayhead, planCanvasDrop } from "./dropMedia.js";
import { duplicateClips, duplicateLayers } from "./duplicate.js";
import { dragFade, presetFade, quickFade, setFades } from "./fades.js";
import { freezeFrame, punchZoom } from "./freeze.js";
import { documentChecks, randomProject, random, setupFuzzKit } from "./fuzzKit.js";
import { closeGap, compactGaps, gapAtPlayhead } from "./gaps.js";
import { mediaClips } from "./insertMedia.js";
import { addKeyAt, copyKeys, deleteKeys, moveKeys, pasteKeys, setKeysEase, setStopwatch, toggleKeyAt } from "./keyframes.js";
import { closeExtracted, liftRange, rangeTracks } from "./liftExtract.js";
import { groupClips, moveIntoSync, toggleLink, ungroupClips } from "./links.js";
import { applyMoveRequest, dropClips, moveToAdjacentLane, NO_LANE_DELTA, nudgeClips, type MoveResult } from "./move.js";
import { attributeTargets, pasteAttributes, pastedSpeed } from "./pasteAttributes.js";
import { closeSilences, cutSilences, silencePlan, silenceTargets } from "./silence.js";
import { addSolid, setSolids } from "./solid.js";
import { setSpeedDurations, setSpeeds } from "./speed.js";
import { clipsToSplit, splitClips } from "./split.js";
import { addTextClip, addTitle, applyPreset, linkPreset, setTexts } from "./text.js";
import { setTextAnims } from "./textAnim.js";
import { addTrackNear, deleteEmptyTracks, deleteTracks, lockAll, muteOthers, reorderTrack, setTrackFlag, setTrackHeights } from "./tracks.js";
import { nudgeLayers, quickTransforms, setTransforms } from "./transform.js";
import { addTransition, dragTransitionEdge, removeTransitions, transitionAt, updateTransition } from "./transitions.js";
import { extendToPlayhead, rateStretch, rollEdit, slide, slip, trimEdge, trimToPlayhead } from "./trim.js";
import { autoDuck, bandEdit, detachAudio, normalizeClips, setGains, setMuted, toggleMuted, volumeKeys } from "./volume.js";

const FPS = { num: 30, den: 1 };
const us = (frames: number) => frameToUs(frames, FPS);
const linear = (frame: number, value: number) => ({ frame, value, ease: "linear" as const });

/** A video or audio clip at 1x, `inFrames` into its media. */
function media(id: string, trackId: string, start: number, duration: number, inFrames: number, fields: Partial<MediaClip> = {}): MediaClip {
  return {
    id,
    trackId,
    kind: trackId.startsWith("a") ? "audio" : "video",
    name: id,
    start,
    duration,
    enabled: true,
    mediaId: trackId.startsWith("a") && id === "mu" ? "mus" : "m",
    in: us(inFrames),
    out: us(inFrames + duration),
    speed: 1,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, anchor: { x: 0.5, y: 0.5 }, flipH: false, flipV: false },
    opacity: 1,
    crop: { left: 0, top: 0, right: 0, bottom: 0 },
    volume: { gainDb: 0, muted: false },
    fades: { in: 0, out: 0 },
    ...fields,
  };
}

const T1: Transition = { id: "T1", kind: "crossDissolve", before: 10, after: 10 };
const T2: Transition = { id: "T2", kind: "crossDissolve", before: 10, after: 10 };
const C_KEYS: Keyframes = { "transform.x": [linear(0, 0), linear(50, 100)], "transform.scale": [linear(0, 1), linear(50, 1.5)] };
const CA_KEYS: Keyframes = { "volume.gainDb": [linear(0, 0), linear(40, -12), linear(90, 0)] };

/**
 * V1: a 0..100 (linked to aa, grouped with the locked lk; cross dissolve T1 to b), b 100..200 (linked to
 * ab; opacity keys), c 260..360 (linked to ca; transform keys, fades), im 400..460 (image, grouped
 * with t). V2, locked: lk 50..150 (linked to lka, grouped with a), lk2 300..360. V3: t 20..80 (text,
 * grouped with im), s 120..180 (solid, opacity keys). CC: q1 0..60, q2 60..120, q3 200..260. A1: aa
 * 0..100 and ab 100..200 (crossfade T2), ca 260..360 (volume keys, fades). A2: lka 50..150, mu 0..400
 * (music, -6 dB). A marker, a bin.
 */
function fixture(): Project {
  let p = makeProject();
  p.media.m = { ...makeMedia("m", "video", 100_000_000), width: 1920, height: 1080, binId: "bin1" };
  p.media.mus = makeMedia("mus", "audio", 100_000_000);
  p.media.img = { ...makeMedia("img", "image", 0), width: 1080, height: 1080 };
  p.bins = [{ id: "bin1", name: "Footage" }];
  const track = (id: string, kind: "video" | "audio" = "video") => ({ ...makeTrack(id, kind), targeted: true });
  p.tracks = [track("v1"), { ...track("v2"), locked: true }, track("v3"), track("a1", "audio"), track("a2", "audio")];
  p = withCaptionTrack(p);
  const clips: Clip[] = [
    media("a", "v1", 0, 100, 60, { linkGroup: "LA", group: "G1", transitionOut: { ...T1 } }),
    media("b", "v1", 100, 100, 300, { linkGroup: "LB", transitionIn: { ...T1 }, keyframes: { opacity: [linear(0, 1), linear(60, 0.2)] } }),
    media("c", "v1", 260, 100, 600, { linkGroup: "LC", fades: { in: 10, out: 10 }, keyframes: structuredClone(C_KEYS) }),
    { ...media("im", "v1", 400, 60, 0, { group: "G2" }), kind: "image", mediaId: "img", in: 0, out: us(60) },
    media("lk", "v2", 50, 100, 900, { linkGroup: "LK", group: "G1" }),
    media("lk2", "v2", 300, 60, 1200),
    { ...makeTextClip({ id: "t", trackId: "v3", start: 20, duration: 60, value: "Hello" }), group: "G2" },
    { ...makeSolidClip({ id: "s", trackId: "v3", start: 120, duration: 60 }), keyframes: { opacity: [linear(0, 0), linear(30, 1)] } },
    makeCaptionClip({ id: "q1", trackId: "cc", start: 0, duration: 60, text: "one two" }),
    makeCaptionClip({ id: "q2", trackId: "cc", start: 60, duration: 60, text: "three" }),
    makeCaptionClip({ id: "q3", trackId: "cc", start: 200, duration: 60, text: "four five" }),
    media("aa", "a1", 0, 100, 60, { linkGroup: "LA", transitionOut: { ...T2 } }),
    media("ab", "a1", 100, 100, 300, { linkGroup: "LB", transitionIn: { ...T2 } }),
    media("ca", "a1", 260, 100, 600, { linkGroup: "LC", fades: { in: 5, out: 5 }, keyframes: structuredClone(CA_KEYS) }),
    media("lka", "a2", 50, 100, 900, { linkGroup: "LK" }),
    media("mu", "a2", 160, 400, 0, { volume: { gainDb: -6, muted: false } }),
  ];
  p = withClips(p, clips);
  p.markers = [{ id: "k1", frame: 30, color: "red", label: "Intro" }];
  return p;
}

/** 200 s of mono audio peaking at 64/127 of full scale everywhere. */
const halfScalePeaks: Peaks = { sampleRate: 48_000, frames: 200 * 48_000, channels: 1, levels: [new Int8Array(Math.ceil((200 * 48_000) / PEAKS_BUCKET) * 2).map((_, i) => (i % 2 === 0 ? -64 : 64))] };

const get = (p: Project, id: string) => p.clips[id] as Clip;
const mediaClip = (p: Project, id: string) => p.clips[id] as MediaClip;
const LOCKED = ["lk", "lk2"];

interface Row {
  name: string;
  /** Dispatches the operation (one command or one transaction). */
  run(store: DocumentStore, newId: () => string): void;
  /** The document changes (default) or not (a refusal, nothing to do). */
  changes?: boolean;
  /** Clips on the locked track change by design. */
  lockedChanges?: boolean;
  /** The operation's name for `documentChecks` (its exemptions), when it has one. */
  op?: string;
  /** What the behaviour defines for this operation. */
  then?(after: Project, before: Project): void;
}

function exec(store: DocumentStore, command: Command | null | undefined): void {
  if (command) store.dispatch(command);
}

function move(store: DocumentStore, result: MoveResult | null): void {
  if (result?.kind === "ok") store.dispatch(result.command);
}

/** The clip and its selection partners (its group and, with `linked`, its link partners; locked ones left out). */
const withPartners = (p: Project, id: string, linked = true) => [id, ...selectionPartners(p, id, linked)];

const ROWS: Row[] = [
  // --- move.ts
  {
    name: "applyMoveRequest overwrite: a linked pair moves together",
    run: (s, id) => move(s, applyMoveRequest(s.getState(), { clipIds: withPartners(s.getState(), "c"), primary: "c", deltaFrames: 20, laneDelta: NO_LANE_DELTA, mode: "overwrite", duplicate: false }, id)),
    then: (p) => {
      expect([get(p, "c").start, get(p, "ca").start]).toEqual([280, 280]);
      expect(linkOffset(p, "c")).toBe(0);
    },
  },
  {
    name: "applyMoveRequest overwrite: the transition survives a move of its pair",
    run: (s, id) => move(s, applyMoveRequest(s.getState(), { clipIds: [...withPartners(s.getState(), "a"), ...withPartners(s.getState(), "b")], primary: "a", deltaFrames: 30, laneDelta: NO_LANE_DELTA, mode: "overwrite", duplicate: false }, id)),
    then: (p) => {
      expect([get(p, "a").start, get(p, "b").start, get(p, "aa").start, get(p, "ab").start]).toEqual([30, 130, 30, 130]);
      expect(transitionAt(p, { left: "a", right: "b" })).toEqual(T1);
      expect(transitionAt(p, { left: "aa", right: "ab" })).toEqual(T2);
    },
  },
  {
    name: "applyMoveRequest insert: unlocked tracks open, the locked one stays",
    run: (s, id) => move(s, applyMoveRequest(s.getState(), { clipIds: ["s"], primary: "s", deltaFrames: 100, laneDelta: NO_LANE_DELTA, mode: "insert", duplicate: false }, id)),
    then: (p) => expect(get(p, "c").start).toBe(320),
  },
  {
    name: "applyMoveRequest duplicate: copies get a new link and group",
    run: (s, id) => move(s, applyMoveRequest(s.getState(), { clipIds: withPartners(s.getState(), "t"), primary: "t", deltaFrames: 500, laneDelta: NO_LANE_DELTA, mode: "overwrite", duplicate: true }, id)),
    then: (p, before) => {
      const copies = Object.values(p.clips).filter((clip) => !before.clips[clip.id]);
      expect(copies.map((clip) => clip.start).sort((x, y) => x - y)).toEqual([520, 900]);
      expect(new Set(copies.map((clip) => clip.group)).size).toBe(1);
      expect(copies[0]?.group).not.toBe("G2");
    },
  },
  { name: "applyMoveRequest onto the locked track is refused", changes: false, run: (s, id) => move(s, applyMoveRequest(s.getState(), { clipIds: ["c"], primary: "c", deltaFrames: 0, laneDelta: { video: 1, audio: 0 }, mode: "overwrite", duplicate: false }, id)) },
  { name: "nudgeClips: a group member drags its group", run: (s, id) => move(s, nudgeClips(s.getState(), withPartners(s.getState(), "t"), 10, id)), then: (p) => expect([get(p, "t").start, get(p, "im").start]).toEqual([30, 410]) },
  { name: "moveToAdjacentLane: down onto the locked track is refused", changes: false, run: (s, id) => move(s, moveToAdjacentLane(s.getState(), ["s"], "down", "video", id)) },
  { name: "moveToAdjacentLane: up onto an occupied span is refused", changes: false, run: (s, id) => move(s, moveToAdjacentLane(s.getState(), ["mu"], "up", "audio", id)) },
  {
    name: "moveToAdjacentLane: up onto a free track (a new one, one transaction)",
    run: (s, id) =>
      s.transaction("Lane", () => {
        exec(s, addTrackNear(s.getState(), "video", "v3", "above", "v4"));
        move(s, moveToAdjacentLane(s.getState(), ["t"], "up", "video", id));
      }),
    then: (p) => expect([get(p, "t").trackId, get(p, "im").trackId]).toEqual(["v4", "v1"]),
  },
  {
    name: "dropClips of mediaClips: a linked pair lands, overwriting the music",
    run: (s, id) => move(s, dropClips(s.getState(), mediaClips(s.getState().media.m as never, { inUs: 0, outUs: us(40) }, 480, { video: "v3", audio: "a2" }, s.getState().settings, id) ?? [], "overwrite", { newId: id, label: "Add clips" })),
    then: (p) => expect(Object.values(p.clips).filter((clip) => clip.start === 480 && clip.linkGroup !== undefined)).toHaveLength(2),
  },
  { name: "moveIntoSync: a clip in sync stays", changes: false, run: (s, id) => move(s, moveIntoSync(s.getState(), "ca", id)) },
  {
    name: "moveIntoSync: an offset partner moves back (after a move of one side, one transaction)",
    run: (s, id) =>
      s.transaction("Sync", () => {
        move(s, nudgeClips(s.getState(), ["ca"], 12, id));
        expect(linkOffset(s.getState(), "ca")).toBe(12);
        move(s, moveIntoSync(s.getState(), "ca", id));
      }),
    then: (p) => expect([get(p, "ca").start, linkOffset(p, "ca")]).toEqual([260, 0]),
  },
  // --- dropMedia.ts
  { name: "applyMediaDrop: media dragged onto V3 / A2 at 600", run: (s, id) => move(s, applyMediaDrop(s.getState(), { items: [{ mediaId: "m", range: { inUs: 0, outUs: us(30) } }], start: 600, lanes: { video: 2, audio: 1 }, mode: "overwrite" }, id).result) },
  { name: "planAtPlayhead + commitPlan insert: the targeted tracks open", run: (s, id) => move(s, commitPlan(s.getState(), planAtPlayhead(s.getState(), [{ media: s.getState().media.img as never, range: null }], 230, id), "insert", "Insert clip", id)) },
  { name: "planCanvasDrop + commitPlan: on a new top track", run: (s, id) => move(s, commitPlan(s.getState(), planCanvasDrop(s.getState(), [{ media: s.getState().media.m as never, range: { inUs: 0, outUs: us(20) } }], 70, { x: 100, y: 200 }, id), "overwrite", "Add clip", id)) },
  // --- trim.ts
  { name: "trimEdge regular: linked partners trim together", run: (s) => exec(s, trimEdge(s.getState(), "c", "out", -10, { ripple: false, linked: true }).command), then: (p) => expect([get(p, "c").duration, get(p, "ca").duration]).toEqual([90, 90]) },
  {
    name: "trimEdge ripple: later clips shift on unlocked tracks only",
    run: (s) => exec(s, trimEdge(s.getState(), "c", "out", -20, { ripple: true, linked: true }).command),
    then: (p) => expect([get(p, "c").duration, get(p, "im").start]).toEqual([80, 380]),
  },
  {
    name: "trimEdge in: keys follow the source",
    run: (s) => exec(s, trimEdge(s.getState(), "c", "in", 20, { ripple: false, linked: false }).command),
    then: (p) => expect((get(p, "c") as MediaClip).keyframes?.["transform.x"]?.map((key) => key.frame)).toEqual([-20, 30]),
  },
  { name: "trimEdge of a partner of a locked clip: the locked side stays", run: (s) => exec(s, trimEdge(s.getState(), "lka", "out", -30, { ripple: false, linked: true }).command), then: (p) => expect(get(p, "lka").duration).toBe(70) },
  {
    name: "rollEdit: the cut moves, the transition with it",
    run: (s) => exec(s, rollEdit(s.getState(), "a", "b", 5, { linked: true }).command),
    then: (p) => {
      expect([get(p, "a").duration, get(p, "b").start, get(p, "aa").duration, get(p, "ab").start]).toEqual([105, 105, 105, 105]);
      expect(transitionAt(p, { left: "a", right: "b" })?.id).toBe("T1");
    },
  },
  {
    name: "slip: linked partners slip together, keys stay on their source",
    run: (s) => exec(s, slip(s.getState(), "c", 10, { linked: true }).command),
    then: (p, before) => {
      expect(mediaClip(p, "c").in - mediaClip(before, "c").in).toBe(333_333);
      expect(mediaClip(p, "ca").in).toBe(mediaClip(p, "c").in);
      expect(mediaClip(p, "c").keyframes?.["transform.x"]?.map((key) => key.frame)).toEqual([-10, 40]);
    },
  },
  { name: "slide: b slides between a and the gap", run: (s) => exec(s, slide(s.getState(), "b", 10, { linked: true }).command), then: (p) => expect([get(p, "a").duration, get(p, "b").start]).toEqual([110, 110]) },
  {
    name: "rateStretch: speed and keys follow, partners too",
    run: (s) => exec(s, rateStretch(s.getState(), "c", "out", -50, { linked: true }).command),
    then: (p) => {
      expect([mediaClip(p, "c").speed, mediaClip(p, "ca").speed]).toEqual([2, 2]);
      expect(mediaClip(p, "c").keyframes?.["transform.x"]?.map((key) => key.frame)).toEqual([0, 25]);
    },
  },
  { name: "trimToPlayhead (W): ripple to the playhead on targeted tracks", run: (s) => exec(s, trimToPlayhead(s.getState(), 330, "end", { linked: true })?.result.command) },
  { name: "extendToPlayhead (E): the nearest edge to the playhead", run: (s) => exec(s, extendToPlayhead(s.getState(), "c", 380, { linked: true })?.command), then: (p) => expect([get(p, "c").duration, get(p, "ca").duration]).toEqual([120, 120]) },
  // --- clipProps.ts
  { name: "retimeClips: Start of a linked clip", run: (s) => exec(s, retimeClips(s.getState(), ["c"], "start", 250, { linked: true }).command), then: (p) => expect([get(p, "c").start, get(p, "ca").start]).toEqual([250, 250]) },
  { name: "setOpacities at the playhead keys a keyed clip", run: (s) => exec(s, setOpacities(s.getState(), new Map([["b", 0.5], ["lk", 0.1]]), { label: "Opacity", at: 130 })), then: (p) => expect(mediaClip(p, "b").keyframes?.opacity?.map((key) => key.frame)).toEqual([0, 30, 60]) },
  { name: "setEnabled skips the locked clip", run: (s) => exec(s, setEnabled(s.getState(), ["a", "lk"], false)), then: (p) => expect(get(p, "a").enabled).toBe(false) },
  // --- crop.ts, transform.ts
  { name: "setCrops", run: (s) => exec(s, setCrops(s.getState(), new Map([["c", { left: 0.1, top: 0, right: 0.1, bottom: 0 }], ["lk", { left: 0.2, top: 0, right: 0, bottom: 0 }]]), { label: "Crop" })) },
  { name: "quickCrops: crop to frame", run: (s) => exec(s, quickCrops(s.getState(), ["a", "lk", "im"], "frame")) },
  { name: "setTransforms at the playhead keys the keyed clip", run: (s) => exec(s, setTransforms(s.getState(), new Map([["c", { ...mediaClip(s.getState(), "c").transform, x: 300 }]]), { label: "Transform", at: 280 })), then: (p) => expect(mediaClip(p, "c").keyframes?.["transform.x"]?.map((key) => key.frame)).toEqual([0, 20, 50]) },
  { name: "nudgeLayers: a keyed clip gets a key at the playhead, the locked one is skipped", run: (s) => exec(s, nudgeLayers(s.getState(), ["c", "lk", "t"], 10, -10, 270)), then: (p) => expect(mediaClip(p, "c").keyframes?.["transform.x"]?.map((key) => key.frame)).toEqual([0, 10, 50]) },
  { name: "quickTransforms: fill", run: (s) => exec(s, quickTransforms(s.getState(), ["a", "lk", "s"], "fill")) },
  // --- split.ts
  {
    name: "splitClips: linked partners split, the right piece's keys start at its new start",
    run: (s, id) => exec(s, splitClips(s.getState(), clipsToSplit(s.getState(), 290, { kind: "clips", clipIds: ["c"] }, { linked: true }), 290, id)?.command),
    then: (p, before) => {
      const rights = Object.values(p.clips).filter((clip) => !before.clips[clip.id]);
      expect(rights.map((clip) => [clip.kind, clip.start])).toEqual([
        ["video", 290],
        ["audio", 290],
      ]);
      expect(rights[0]?.linkGroup).toBe(rights[1]?.linkGroup);
      expect(rights[0]?.linkGroup).not.toBe("LC");
      expect((rights[0] as MediaClip).keyframes?.["transform.x"]).toEqual([linear(0, 60), linear(20, 100)]);
      expect([get(p, "c").duration, (get(p, "c") as MediaClip).fades]).toEqual([30, { in: 10, out: 0 }]);
    },
  },
  {
    name: "splitClips all tracks: through the transition's frames removes it, the locked track is skipped",
    run: (s, id) => exec(s, splitClips(s.getState(), clipsToSplit(s.getState(), 105, { kind: "all" }, { linked: true }), 105, id)?.command),
    then: (p) => {
      expect(transitionAt(p, { left: "a", right: "b" })).toBeNull();
      expect(mediaClip(p, "a").transitionOut).toBeUndefined();
    },
  },
  // --- delete.ts, gaps.ts, liftExtract.ts
  { name: "deleteClips: the linked partner goes too", run: (s) => exec(s, deleteClips(s.getState(), ["c"], { linked: true })), then: (p) => expect([p.clips.c, p.clips.ca]).toEqual([undefined, undefined]) },
  { name: "deleteClips: the group goes together", run: (s) => exec(s, deleteClips(s.getState(), ["t"], { linked: true })), then: (p) => expect([p.clips.t, p.clips.im]).toEqual([undefined, undefined]) },
  {
    name: "deleteClips: a clip grouped with a locked clip goes alone; the transition goes with its clip",
    run: (s) => exec(s, deleteClips(s.getState(), ["a"], { linked: true })),
    then: (p) => {
      expect([p.clips.a, p.clips.aa]).toEqual([undefined, undefined]);
      expect([mediaClip(p, "b").transitionIn, mediaClip(p, "ab").transitionIn]).toEqual([undefined, undefined]);
    },
  },
  { name: "rippleDelete: the span closes on unlocked tracks", run: (s) => exec(s, rippleDelete(s.getState(), ["c"], { linked: true })?.command), then: (p) => expect([p.clips.ca, get(p, "im").start]).toEqual([undefined, 300]) },
  { name: "closeGap", run: (s) => exec(s, closeGap(s.getState(), { trackId: "v1", start: 200, end: 260 }).command), then: (p) => expect(get(p, "c").start).toBe(200) },
  { name: "gapAtPlayhead + closeGap", run: (s) => exec(s, closeGap(s.getState(), gapAtPlayhead(s.getState(), 230) ?? { trackId: "v1", start: 0, end: 0 }).command) },
  { name: "compactGaps: targeted unlocked tracks", run: (s) => exec(s, compactGaps(s.getState()).command) },
  { name: "liftRange", run: (s, id) => exec(s, liftRange(s.getState(), { start: 280, end: 300 }, id)), then: (p) => expect(get(p, "c").duration).toBe(20) },
  {
    name: "Extract (lift + closeExtracted in one transaction)",
    run: (s, id) =>
      s.transaction("Extract", () => {
        const range = { start: 280, end: 300 };
        const tracks = rangeTracks(s.getState());
        exec(s, liftRange(s.getState(), range, id, tracks));
        exec(s, closeExtracted(s.getState(), range, tracks).command);
      }),
  },
  // --- links.ts
  { name: "toggleLink unlinks a pair", run: (s, id) => { const r = toggleLink(s.getState(), ["c"], id); if (r.kind !== "refused") s.dispatch(r.command); }, then: (p) => expect([get(p, "c").linkGroup, get(p, "ca").linkGroup]).toEqual([undefined, undefined]) },
  { name: "toggleLink: the partner of a locked clip unlinks alone", run: (s, id) => { const r = toggleLink(s.getState(), ["lka"], id); if (r.kind !== "refused") s.dispatch(r.command); }, then: (p) => expect([get(p, "lka").linkGroup, get(p, "lk").linkGroup]).toEqual([undefined, "LK"]) },
  { name: "toggleLink links a picture and a sound", run: (s, id) => { const r = toggleLink(s.getState(), ["s", "mu"], id); if (r.kind !== "refused") s.dispatch(r.command); }, then: (p) => expect(get(p, "s").linkGroup).toBe(get(p, "mu").linkGroup) },
  { name: "groupClips: the locked member stays out", run: (s, id) => exec(s, groupClips(s.getState(), ["s", "a"], id)), then: (p) => expect(get(p, "lk").group).toBe("G1") },
  { name: "ungroupClips", run: (s) => exec(s, ungroupClips(s.getState(), ["t"])), then: (p) => expect([get(p, "t").group, get(p, "im").group]).toEqual([undefined, undefined]) },
  // --- tracks.ts, arrange.ts
  { name: "setTrackFlag: unlock the locked track", run: (s) => exec(s, setTrackFlag(s.getState(), ["v2"], "locked", false)) },
  { name: "setTrackFlag: lock, target, mute, solo, hide", run: (s) => exec(s, setTrackFlag(s.getState(), ["v1", "v3"], "hidden", true)) },
  { name: "muteOthers", run: (s) => exec(s, muteOthers(s.getState(), "a1")) },
  { name: "lockAll", run: (s) => exec(s, lockAll(s.getState())) },
  { name: "reorderTrack: the locked track's place changes, its clips do not", run: (s) => exec(s, reorderTrack(s.getState(), "v2", 0)) },
  { name: "addTrackNear", run: (s, id) => exec(s, addTrackNear(s.getState(), "video", "v2", "above", id())) },
  { name: "deleteTracks refuses the locked track", changes: false, run: (s) => exec(s, deleteTracks(s.getState(), ["v2", "v3"]).command) },
  { name: "deleteTracks: lone partners lose their group", run: (s) => exec(s, deleteTracks(s.getState(), ["v3"]).command), then: (p) => expect(get(p, "im").group).toBeUndefined() },
  { name: "deleteEmptyTracks: nothing empty", changes: false, run: (s) => exec(s, deleteEmptyTracks(s.getState())) },
  { name: "arrangeLayers: forward past the locked track", run: (s, id) => exec(s, arrangeLayers(s.getState(), ["c"], "forward", id)), then: (p) => expect(get(p, "c").trackId).not.toBe("v2") },
  // --- keyframes.ts
  { name: "setStopwatch on (transform) at the playhead", run: (s) => exec(s, setStopwatch(s.getState(), ["a", "lk", "s"], "transform", true, 40)) },
  { name: "setStopwatch off keeps the look at the playhead", run: (s) => exec(s, setStopwatch(s.getState(), ["c"], "transform", false, 285)), then: (p) => expect(mediaClip(p, "c").transform.x).toBe(50) },
  { name: "toggleKeyAt", run: (s) => exec(s, toggleKeyAt(s.getState(), ["c", "lk"], "transform", 300)) },
  { name: "addKeyAt (volume)", run: (s) => exec(s, addKeyAt(s.getState(), "ca", "volume", 60)) },
  { name: "deleteKeys", run: (s) => exec(s, deleteKeys(s.getState(), "ca", "volume", [40])) },
  { name: "moveKeys stays inside the clip", run: (s) => exec(s, moveKeys(s.getState(), "c", "transform", [50], 500)), then: (p) => expect(mediaClip(p, "c").keyframes?.["transform.x"]?.map((key) => key.frame)).toEqual([0, 99]) },
  { name: "setKeysEase", run: (s) => exec(s, setKeysEase(s.getState(), new Map([["c", [0]], ["lk", [0]]]), "transform", "overshoot")) },
  {
    name: "copyKeys + pasteKeys onto another layer",
    run: (s) => {
      const keys = copyKeys(get(s.getState(), "c"), "transform", [0, 50]);
      exec(s, keys && pasteKeys(s.getState(), ["s", "lk"], keys, 130));
    },
    then: (p) => expect((get(p, "s") as Clip & { keyframes?: Keyframes }).keyframes?.["transform.x"]?.map((key) => key.frame)).toEqual([10]),
  },
  // --- transitions.ts, fades.ts
  {
    name: "addTransition with the linked crossfade (at a cut a trim makes, one transaction)",
    run: (s, id) =>
      s.transaction("Transition", () => {
        exec(s, trimEdge(s.getState(), "b", "out", 60, { ripple: false, linked: true }).command);
        exec(s, addTransition(s.getState(), { left: "b", right: "c" }, "dipToBlack", { linked: true, newId: id })?.command);
      }),
    then: (p) => {
      expect(transitionAt(p, { left: "b", right: "c" })).toMatchObject({ kind: "dipToBlack", before: 7, after: 8 });
      expect(transitionAt(p, { left: "ab", right: "ca" })).toMatchObject({ kind: "crossDissolve", before: 7, after: 8 });
    },
  },
  { name: "addTransition at a cut that has one: kind only", run: (s, id) => exec(s, addTransition(s.getState(), { left: "a", right: "b" }, "dipToWhite", { linked: true, newId: id })?.command), then: (p) => expect([transitionAt(p, { left: "a", right: "b" })?.kind, transitionAt(p, { left: "aa", right: "ab" })?.kind]).toEqual(["dipToWhite", "crossDissolve"]) },
  { name: "updateTransition sides", run: (s) => exec(s, updateTransition(s.getState(), { left: "a", right: "b" }, { before: 4, after: 20 }, { linked: true })), then: (p) => expect(transitionAt(p, { left: "aa", right: "ab" })).toMatchObject({ before: 4, after: 20 }) },
  { name: "removeTransitions with the linked crossfade", run: (s) => exec(s, removeTransitions(s.getState(), [{ left: "a", right: "b" }], { linked: true })), then: (p) => expect([transitionAt(p, { left: "a", right: "b" }), transitionAt(p, { left: "aa", right: "ab" })]).toEqual([null, null]) },
  {
    name: "dragTransitionEdge + updateTransition (the timeline's commit)",
    run: (s) => {
      const drag = dragTransitionEdge(s.getState(), { left: "a", right: "b" }, "end", 5, true);
      if (drag) exec(s, updateTransition(s.getState(), { left: "a", right: "b" }, { before: drag.before, after: drag.after }, { linked: false }));
    },
    then: (p) => expect(transitionAt(p, { left: "a", right: "b" })).toMatchObject({ before: 10, after: 15 }),
  },
  { name: "setFades skips the locked clip", run: (s) => exec(s, setFades(s.getState(), "in", new Map([["a", 12], ["lk", 12]]), "Fade in")), then: (p) => expect(mediaClip(p, "a").fades.in).toBe(12) },
  { name: "quickFade: linked partners fade too", run: (s) => exec(s, quickFade(s.getState(), ["a"], "out")), then: (p) => expect([mediaClip(p, "a").fades.out, mediaClip(p, "aa").fades.out]).toEqual([15, 15]) },
  { name: "presetFade", run: (s) => exec(s, presetFade(s.getState(), ["s", "t", "lk"], "out", 1)) },
  { name: "dragFade: one clip, clamped by its other fade", run: (s) => exec(s, dragFade(s.getState(), "c", "in", 500)), then: (p) => expect(mediaClip(p, "c").fades).toEqual({ in: 90, out: 10 }) },
  // --- speed.ts, freeze.ts
  {
    name: "setSpeeds 2x linked: partners and keys follow",
    run: (s) => exec(s, setSpeeds(s.getState(), ["c"], 2, { link: true, ripple: false, linked: true }).command),
    then: (p) => {
      expect([get(p, "c").duration, get(p, "ca").duration]).toEqual([50, 50]);
      expect(mediaClip(p, "c").keyframes?.["transform.x"]?.map((key) => key.frame)).toEqual([0, 25]);
      expect(volumeKeys(mediaClip(p, "ca")).map((key) => key.frame)).toEqual([0, 20, 45]);
    },
  },
  { name: "setSpeeds ripple: what follows shifts", run: (s) => exec(s, setSpeeds(s.getState(), ["a"], 0.5, { link: true, ripple: true, linked: true }).command) },
  { name: "setSpeedDurations", run: (s) => exec(s, setSpeedDurations(s.getState(), ["c"], 80, { link: true, ripple: false, linked: true }).command), then: (p) => expect([get(p, "c").duration, get(p, "ca").duration]).toEqual([80, 80]) },
  {
    name: "freezeFrame: split with the partners, everything after ripples, the locked track stays",
    run: (s, id) => {
      const result = freezeFrame(s.getState(), 300, ["c"], id);
      if (typeof result === "object") s.dispatch(result.command);
    },
    then: (p) => expect([get(p, "c").duration, get(p, "ca").duration, get(p, "im").start]).toEqual([40, 40, 460]),
  },
  {
    name: "punchZoom: the right piece scales, its keys too",
    run: (s, id) => {
      const result = punchZoom(s.getState(), 300, ["c"], 1.2, id, { linked: true, animated: true });
      if (typeof result === "object") s.dispatch(result.command);
    },
  },
  // --- volume.ts, silence.ts
  { name: "setGains at the playhead keys the keyed clip", run: (s) => exec(s, setGains(s.getState(), new Map([["ca", -3], ["lka", -3], ["mu", 100]]), { at: 300 })), then: (p) => expect(mediaClip(p, "mu").volume.gainDb).toBe(12) },
  { name: "setMuted", run: (s) => exec(s, setMuted(s.getState(), ["aa", "lka"], true)) },
  { name: "toggleMuted", run: (s) => exec(s, toggleMuted(s.getState(), ["ca", "mu"])) },
  {
    name: "normalizeClips: gains to -1 dBFS, keys shifted on a keyed clip",
    run: (s) => exec(s, normalizeClips(s.getState(), ["mu", "ca", "lka"], () => halfScalePeaks).command),
    then: (p, before) => {
      expect(mediaClip(p, "mu").volume.gainDb).toBeCloseTo(-1 - 20 * Math.log10(64 / 127), 6);
      expect(volumeKeys(mediaClip(p, "ca"))[0]?.value).toBeGreaterThan(volumeKeys(mediaClip(before, "ca"))[0]?.value ?? 0);
    },
  },
  { name: "bandEdit gain", run: (s) => exec(s, bandEdit(s.getState(), "mu", { kind: "gain", gainDb: -20 })) },
  { name: "bandEdit keys: one key in time and value", run: (s) => exec(s, bandEdit(s.getState(), "ca", { kind: "keys", frames: [40], deltaDb: 6, deltaFrames: 10 })), then: (p) => expect(volumeKeys(mediaClip(p, "ca"))[1]).toEqual(linear(50, -6)) },
  { name: "autoDuck: the music dips under the voices above it", run: (s) => exec(s, autoDuck(s.getState(), ["mu"], { depthDb: 12, rampFrames: 10 }).command), then: (p) => expect(volumeKeys(mediaClip(p, "mu")).length).toBeGreaterThan(0) },
  { name: "detachAudio: the pair unlinks", run: (s, id) => exec(s, detachAudio(s.getState(), ["c"], id).command), then: (p) => expect([get(p, "c").linkGroup, get(p, "ca").linkGroup]).toEqual([undefined, undefined]) },
  { name: "detachAudio skips a video on a locked track", changes: false, run: (s, id) => exec(s, detachAudio(s.getState(), ["lk"], id).command) },
  {
    name: "Remove silence (silencePlan + cutSilences + closeSilences): the pair stays in sync",
    run: (s, id) =>
      s.transaction("Remove silence", () => {
        const p = s.getState();
        const plan = silencePlan(p, silenceTargets(p, ["c"]), () => [{ start: 300, end: 310 }]);
        const cut = cutSilences(s.getState(), plan.groups, id);
        exec(s, cut.command);
        exec(s, closeSilences(s.getState(), cut.gaps).command);
      }),
    then: (p) => {
      expect([get(p, "c").duration, get(p, "ca").duration]).toEqual([40, 40]);
      for (const clip of Object.values(p.clips)) if (clip.linkGroup !== undefined && clip.start >= 300 && clip.trackId !== "v2" && clip.trackId !== "a2") expect(linkOffset(p, clip.id)).toBe(0);
    },
  },
  { name: "silenceTargets leave out a group with a locked member", changes: false, run: (s, id) => { const p = s.getState(); const plan = silencePlan(p, silenceTargets(p, ["lka"]), () => [{ start: 60, end: 70 }]); exec(s, cutSilences(p, plan.groups, id).command); } },
  // --- clipboard.ts, duplicate.ts, pasteAttributes.ts
  {
    name: "copyClips + pasteClips: links, groups and the transition pair renamed",
    run: (s, id) => {
      const p = s.getState();
      const payload = copyClips(p, ["a", "b"], "a", { linked: true });
      const result = payload ? pasteClips(p, payload, { at: 600, mode: "overwrite", newId: id }) : null;
      if (result?.kind === "ok") s.dispatch(result.command);
    },
    then: (p, before) => {
      const copies = Object.values(p.clips).filter((clip) => !before.clips[clip.id]) as MediaClip[];
      expect(copies).toHaveLength(4);
      const transition = copies.find((clip) => clip.kind === "video" && clip.transitionOut)?.transitionOut;
      expect(transition?.id).not.toBe("T1");
      expect(copies.every((clip) => clip.group === undefined)).toBe(true);
    },
  },
  { name: "pasteClips insert: unlocked tracks open", run: (s, id) => { const p = s.getState(); const payload = copyClips(p, ["s"], "s", { linked: true }); const r = payload ? pasteClips(p, payload, { at: 250, mode: "insert", newId: id }) : null; if (r?.kind === "ok") s.dispatch(r.command); }, then: (p) => expect(get(p, "c").start).toBe(320) },
  {
    name: "pasteClips from another project at 25 fps: frames converted, media resolved or offline (resolveMedia, payloadAtFrameRate)",
    run: (s, id) => {
      const other = randomProject(random(7), { id: "other", fps: { num: 25, den: 1 }, idPrefix: "o", locks: "none" });
      const clip = Object.values(other.clips).find((candidate) => candidate.kind === "video" && candidate.linkGroup !== undefined) as Clip;
      const payload = copyClips(other, [clip.id], clip.id, { linked: true });
      const result = payload ? pasteClips(s.getState(), payload, { at: 700, mode: "overwrite", newId: id }) : null;
      if (result?.kind === "ok") s.dispatch(result.command);
    },
    then: (p, before) => expect(Object.keys(p.media).length).toBeGreaterThan(Object.keys(before.media).length),
  },
  { name: "Cut (copyClips + deleteClips as clipboard.cut)", run: (s) => { const command = deleteClips(s.getState(), ["c"], { linked: true }); if (command) s.dispatch({ ...command, id: "clipboard.cut", label: "Cut" }); } },
  { name: "duplicateClips: after the selection, links and transitions renamed", run: (s, id) => exec(s, duplicateClips(s.getState(), [...withPartners(s.getState(), "a"), ...withPartners(s.getState(), "b")], id)?.command), then: (p, before) => expect(Object.keys(p.clips).length - Object.keys(before.clips).length).toBe(4) },
  { name: "duplicateLayers: above, +20 px, never linked", run: (s, id) => exec(s, duplicateLayers(s.getState(), ["c", "lk"], id)?.command), then: (p, before) => expect(Object.values(p.clips).filter((clip) => !before.clips[clip.id]).map((clip) => clip.linkGroup)).toEqual([undefined]) },
  {
    name: "pasteAttributes + pastedSpeed (one transaction)",
    run: (s) =>
      s.transaction("Paste attributes", () => {
        const p = s.getState();
        const payload = copyClips(p, ["c"], "c", { linked: true });
        if (!payload) return;
        const groups = new Set(["transform", "opacity", "fades", "keyframes", "audio", "speed"] as const);
        exec(s, pasteAttributes(p, payload, ["a", "lk", "s"], groups));
        const speed = pastedSpeed(payload, groups);
        if (speed !== null) exec(s, setSpeeds(s.getState(), attributeTargets(s.getState(), ["a", "lk", "s"], "speed"), speed, { link: true, ripple: false, linked: true }).command);
      }),
    then: (p) => expect(mediaClip(p, "a").keyframes?.["transform.x"]).toEqual(C_KEYS["transform.x"]),
  },
  // --- solid.ts, text.ts, textAnim.ts
  { name: "addSolid", run: (s, id) => exec(s, addSolid(s.getState(), 200, id).command) },
  { name: "setSolids: shape, fill, size, radius", run: (s) => exec(s, setSolids(s.getState(), new Map([["s", { shape: "line", fill: { from: { r: 1, g: 0, b: 0, a: 1 }, to: { r: 0, g: 0, b: 1, a: 1 } }, size: { w: 400.6, h: 3 }, cornerRadius: 9000 }]]), { label: "Solid" })), then: (p) => expect(get(p, "s")).toMatchObject({ shape: "line", size: { w: 401, h: 3 }, cornerRadius: 8192 }) },
  { name: "setTexts keeps the anchored point", run: (s) => exec(s, setTexts(s.getState(), new Map([["t", { text: textContent("Hello\nworld") }]]), { label: "Text" })) },
  { name: "addTextClip", run: (s, id) => exec(s, addTextClip(s.getState(), 50, 40, id, { value: "New" }).command) },
  { name: "addTitle matching the clip under the playhead", run: (s, id) => exec(s, addTitle(s.getState(), { kind: "subtitle", playhead: 280, matchClip: true, below: "t" }, id).command), then: (p, before) => expect(Object.values(p.clips).find((clip) => !before.clips[clip.id])?.duration).toBe(80) },
  {
    name: "applyPreset",
    run: (s) => {
      const preset = starterPresets()[2] as TextPreset;
      const look = presetLook(preset, s.getState().settings);
      exec(s, applyPreset(s.getState(), ["t"], { presetId: preset.id, style: look.style, box: look.box, position: look.position }, "Apply preset"));
    },
  },
  { name: "linkPreset", run: (s) => exec(s, linkPreset(s.getState(), "t", "p1", "Save preset")) },
  { name: "setTextAnims", run: (s) => exec(s, setTextAnims(s.getState(), new Map([["t", { animIn: { id: "fade", duration: 10 }, animOut: null }]]), { label: "Animation" })) },
  // --- captions.ts
  { name: "addCaptionTrack: one per project", changes: false, run: (s, id) => exec(s, addCaptionTrack(s.getState(), id())) },
  { name: "addCueAt: after the cue under the playhead", run: (s, id) => exec(s, addCueAt(s.getState(), 150, id)?.command) },
  { name: "setCueText", run: (s) => exec(s, setCueText(s.getState(), "q1", "edited")) },
  { name: "splitCue", run: (s, id) => exec(s, splitCue(s.getState(), "q1", "one two", 3, id)?.command) },
  { name: "mergeWithPrevious", run: (s) => exec(s, mergeWithPrevious(s.getState(), "q2")?.command), then: (p) => expect(get(p, "q1").duration).toBe(120) },
  { name: "importCues replaces the cues", run: (s, id) => exec(s, importCues(s.getState(), [{ startUs: 0, endUs: 1_000_000, text: "A" }, { startUs: 500_000, endUs: 2_000_000, text: "B" }], id)?.command) },
  { name: "replaceCuesInRange", run: (s, id) => exec(s, replaceCuesInRange(s.getState(), { start: 50, end: 130 }, [{ start: 70, duration: 20, text: "new" }], id)?.command) },
  { name: "cue move stops at the cues that stay", run: (s, id) => move(s, applyMoveRequest(s.getState(), { clipIds: ["q3"], primary: "q3", deltaFrames: -200, laneDelta: NO_LANE_DELTA, mode: "overwrite", duplicate: false }, id)), then: (p) => expect(get(p, "q3").start).toBe(120) },
  { name: "cue trim never pushes", run: (s) => exec(s, trimEdge(s.getState(), "q1", "out", 30, { ripple: true }).command), changes: false },
  { name: "setCaptionStyle", run: (s) => exec(s, setCaptionStyle(s.getState(), "cc", { ...captionStyleOf(s.getState(), "cc"), position: "top" }, { label: "Caption style" })) },
  { name: "clearCues", run: (s) => exec(s, clearCues(s.getState())) },
  // --- raw, media, marker and project commands
  { name: "updateTrack (raw)", run: (s) => s.dispatch(updateTrack("v3", { name: "Titles" })) },
  { name: "addClip (raw) into a free span", run: (s) => s.dispatch(addClip(makeSolidClip({ id: "raw", trackId: "v3", start: 200, duration: 30 }))) },
  { name: "removeClips (raw)", run: (s) => s.dispatch(removeClips(["s"])) },
  { name: "updateClip (raw)", run: (s) => s.dispatch(updateClip("s", { name: "Card", color: "teal" })) },
  { name: "removeTrack (raw) of an unlocked track", run: (s) => s.dispatch(removeTrack("v3")) },
  { name: "addTrack (raw) at the default place", run: (s) => s.dispatch(addTrack({ ...makeTrack("v9"), targeted: true })) },
  { name: "addMedia", run: (s) => s.dispatch(addMedia([makeMedia("m2", "audio", 5_000_000)])) },
  { name: "removeMedia keep: clips stay offline", op: "media.removeKeep", run: (s) => s.dispatch(removeMedia(["m"], "keep")), then: (p) => expect(p.clips.lk).toBeDefined() },
  { name: "removeMedia delete: clips go on every track, the locked one too (Batch 41)", op: "media.removeDelete", lockedChanges: true, run: (s) => s.dispatch(removeMedia(["m"], "delete")), then: (p) => expect([p.clips.lk, p.clips.c, p.clips.im]).toEqual([undefined, undefined, expect.anything()]) },
  { name: "relinkMedia", run: (s) => s.dispatch(relinkMedia([{ id: "m", fields: { file: { relPath: "media/new.mp4" }, size: 10, durationUs: 120_000_000 } }])) },
  { name: "addBin", run: (s, id) => s.dispatch(addBin({ id: id(), name: "Music" })) },
  { name: "renameBin", run: (s) => s.dispatch(renameBin("bin1", "B-roll")) },
  { name: "removeBin", run: (s) => s.dispatch(removeBin("bin1")), then: (p) => expect(p.media.m?.binId).toBeUndefined() },
  { name: "setMediaBin", run: (s) => s.dispatch(setMediaBin(["mus", "img"], "bin1")) },
  { name: "renameMedia", run: (s) => s.dispatch(renameMedia("m", "Interview.mp4")) },
  { name: "addMarker", run: (s, id) => s.dispatch(addMarker({ id: id(), frame: 10, color: "blue", label: "" })) },
  { name: "updateMarker", run: (s) => s.dispatch(updateMarker("k1", { frame: 400 })) },
  { name: "removeMarker", run: (s) => s.dispatch(removeMarker("k1")) },
  { name: "renameProject", run: (s) => s.dispatch(renameProject("Matrix")) },
  { name: "setResolution (Keep)", run: (s) => s.dispatch(setResolution(1920, 1080)) },
  { name: "adaptResolution (Adapt layout): locked layers follow too (spec §15)", lockedChanges: true, run: (s) => s.dispatch(adaptResolution(s.getState(), 1920, 1080)) },
  { name: "setFrameRate: every frame converts, locked clips too (spec §15)", lockedChanges: true, run: (s) => s.dispatch(setFrameRate({ num: 60, den: 1 })), then: (p) => expect([get(p, "lk").start, transitionAt(p, { left: "a", right: "b" })?.before]).toEqual([100, 20]) },
  { name: "setBackground", run: (s) => s.dispatch(setBackground({ r: 0.1, g: 0.1, b: 0.1, a: 1 })) },
];

beforeAll(() => setupFuzzKit());

describe("the edit matrix (spec §6.19)", () => {
  it("starts from a valid document with every case in it", () => {
    const p = fixture();
    expect(validateProject(p)).toEqual([]);
    expect(documentChecks(null, p, "start")).toEqual([]);
    expect(transitionAt(p, { left: "a", right: "b" })).toEqual(T1);
    expect(selectionPartners(p, "a", true).sort()).toEqual(["aa"]);
    expect(selectionPartners(p, "lka", true)).toEqual([]);
  });

  it.each(ROWS)("$name", (row) => {
    const original = fixture();
    let n = 0;
    const newId = () => `n${++n}`;
    const store = new DocumentStore(structuredClone(original), { session: createSessionStore(), newId, validate: true });
    const before = store.getState();
    row.run(store, newId);
    const after = store.getState();
    expect(after !== before, "the document changed").toBe(row.changes ?? true);
    expect(validateProject(after)).toEqual([]);
    expect(documentChecks(before, after, row.op ?? (row.lockedChanges ? "project.exempt" : row.name))).toEqual([]);
    if (!row.lockedChanges) for (const id of LOCKED) expect(after.clips[id], `locked clip ${id}`).toBe(before.clips[id]);
    row.then?.(after, before);
    if (after === before) return;
    expect(store.undo()).toBe(true);
    expect(store.getState()).toStrictEqual(original);
    expect(store.undo()).toBe(false);
    store.redo();
    expect(store.getState()).toStrictEqual(structuredClone(after));
  });

  it("setTrackHeights is session state: applied with amend, no undo step, kept by undo", () => {
    const store = new DocumentStore(fixture(), { session: createSessionStore(), validate: true });
    store.dispatch(setTrackFlag(store.getState(), ["v1"], "muted", true) as Command);
    store.amend(setTrackHeights(store.getState(), ["v2", "v1"], "L") as Command);
    expect(store.getState().tracks.map((track) => track.height)).toEqual(["L", "L", "M", "S", "M", "M"]);
    store.undo();
    expect(store.getState().tracks.map((track) => [track.muted, track.height])[0]).toEqual([false, "L"]);
    expect(store.getState().clips.lk).toEqual(fixture().clips.lk);
  });
});
