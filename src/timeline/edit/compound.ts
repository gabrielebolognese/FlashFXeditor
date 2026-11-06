// Compound clips (spec §21.10, Batch 62): the pure edits behind Make compound, Break apart and Make
// unique. Each is one command (one undo step) built from the project it is asked about.
// - Make compound: the selected clips (video, image, text, solid, audio and compound clips on unlocked
//   project tracks) move into a new sequence the size of the project. The sequence starts at the
//   earliest start (inner frame 0), keeps one inner track per project track the clips came from, in
//   their order, and one compound clip takes their place on the lowest video track they used.
// - Break apart: the inner clips go back onto project tracks at their absolute times. Only for a
//   compound with no transform, opacity, fades, keys or volume change whose sequence is the project's
//   size; the other instances of its sequence keep it (the clips are copied), the last one takes the
//   clips (and the sequence goes).
// - Make unique: the instance gets a copy of its sequence.
import type { Draft } from "immer";
import type { Command } from "../../core/commands/command.js";
import { emptyTrack, nextTrackName } from "../../core/document/project.js";
import { IDENTITY_TRANSFORM } from "../../core/document/placement.js";
import { hostSequenceOf, instancesOf, nestingProblem, scopeDepth, sequenceHeight } from "../../core/document/sequences.js";
import { MAX_COMPOUND_DEPTH, isMediaClip, type Clip, type ClipId, type CompoundClip, type Frame, type Project, type Sequence, type SequenceId, type Track, type TrackId, type Transform } from "../../core/document/types.js";
import { isClipLocked } from "../model/queries.js";
import { copyClips } from "./duplicate.js";
import { regroup, withField } from "./move.js";

export interface CompoundResult {
  command: Command;
  /** The compound clip made, and its sequence. */
  compoundId: ClipId;
  sequenceId: SequenceId;
}

const VISUAL = new Set(["video", "image", "lottie", "text", "solid", "compound", "shape"]);

/** True when two transforms place a layer the same way. */
function isIdentityTransform(t: Transform): boolean {
  const id = IDENTITY_TRANSFORM;
  return t.x === id.x && t.y === id.y && t.scale === id.scale && (t.scaleY ?? t.scale) === t.scale && t.rotation === id.rotation && t.anchor.x === id.anchor.x && t.anchor.y === id.anchor.y && !t.flipH && !t.flipV;
}

/** The clips of `ids` Make compound takes: on unlocked project tracks, not cues, once each, in track and start order. */
export function compoundable(project: Project, ids: Iterable<ClipId>): Clip[] {
  const order = new Map(project.tracks.map((track, index) => [track.id, index]));
  const clips: Clip[] = [];
  for (const id of new Set(ids)) {
    const clip = project.clips[id];
    if (!clip || clip.kind === "caption" || !order.has(clip.trackId) || isClipLocked(project, id)) continue;
    clips.push(clip);
  }
  return clips.sort((a, b) => (order.get(a.trackId) ?? 0) - (order.get(b.trackId) ?? 0) || a.start - b.start);
}

interface MakePlan {
  clips: Clip[];
  tracks: Track[];
  host: Track;
  start: Frame;
  end: Frame;
}

/** Why Make compound cannot take `ids` (shown as the disabled reason), or the plan. */
function planMake(project: Project, ids: Iterable<ClipId>): MakePlan | string {
  const clips = compoundable(project, ids);
  if (clips.length === 0) return "Select clips on the video or audio tracks first";
  if (!clips.some((clip) => VISUAL.has(clip.kind))) return "Select at least one picture, text, shape or compound";
  const tracks = project.tracks.filter((track) => clips.some((clip) => clip.trackId === track.id));
  const host = tracks.find((track) => track.kind === "video");
  if (!host) return "Select at least one picture, text, shape or compound";
  const start = Math.min(...clips.map((clip) => clip.start));
  const end = Math.max(...clips.map((clip) => clip.start + clip.duration));
  const taken = new Set(clips.map((clip) => clip.id));
  for (const id of host.clipIds) {
    const other = project.clips[id];
    if (other && !taken.has(id) && other.start < end && other.start + other.duration > start) return `Other clips on ${host.name} sit between the selected ones`;
  }
  // A parent and its children cannot be split by the compound's edge (a parent is in its own sequence only).
  for (const key in project.clips) {
    const other = project.clips[key] as Clip;
    if (other.parentId !== undefined && taken.has(other.id) !== taken.has(other.parentId) && project.clips[other.parentId]) return "A layer and the layers that follow it must be in the compound together";
    // Likewise a clip and its track matte (spec §21.17: the matte is in the clip's sequence).
    if (other.matte && taken.has(other.id) !== taken.has(other.matte.clipId) && project.clips[other.matte.clipId]) return "A clip and its track matte must be in the compound together";
  }
  const memo = new Map<SequenceId, number>();
  const inner = Math.max(0, ...clips.filter((clip): clip is CompoundClip => clip.kind === "compound").map((clip) => 1 + sequenceHeight(project, clip.sequenceId, memo)));
  // Inside an open compound (a sequence view), the new level sits under the levels above that sequence.
  const hostScope = hostSequenceOf(project);
  if (scopeDepth(project, hostScope) + 1 + inner > MAX_COMPOUND_DEPTH) return `Compounds nest at most ${MAX_COMPOUND_DEPTH} levels`;
  return { clips, tracks, host, start, end };
}

/** Why Make compound is disabled for `ids`, or null when it works. */
export function makeCompoundProblem(project: Project, ids: Iterable<ClipId>): string | null {
  const plan = planMake(project, ids);
  return typeof plan === "string" ? plan : null;
}

/** The next free name "Compound N" among the sequences. */
function nextSequenceName(project: Project, base = "Compound"): string {
  const names = new Set(Object.values(project.sequences).map((sequence) => sequence.name));
  let n = Object.keys(project.sequences).length + 1;
  while (names.has(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}

/** New link-group and group ids for clips moved together: kept when the whole group moves, renamed when part of it does, dropped when one does. */
function movedGroups(project: Project, clips: readonly Clip[], field: "linkGroup" | "group", newId: () => string): Map<string, string | undefined> {
  const inSelection = regroup(clips, field, newId);
  const total = new Map<string, number>();
  for (const other of Object.values(project.clips)) {
    const value = other[field];
    if (value !== undefined) total.set(value, (total.get(value) ?? 0) + 1);
  }
  const taken = new Map<string, number>();
  for (const clip of clips) {
    const value = clip[field];
    if (value !== undefined) taken.set(value, (taken.get(value) ?? 0) + 1);
  }
  const map = new Map<string, string | undefined>();
  for (const [value, count] of taken) map.set(value, count === total.get(value) ? value : inSelection.get(value));
  return map;
}

/**
 * Make compound (spec §21.10) of `ids`: null when `makeCompoundProblem` has a reason. The new inner
 * tracks, the sequence and the compound clip get ids from `newId`.
 */
export function makeCompound(project: Project, ids: Iterable<ClipId>, newId: () => string): CompoundResult | null {
  const plan = planMake(project, ids);
  if (typeof plan === "string") return null;
  const { clips, tracks, host, start, end } = plan;
  const sequenceId = newId();
  const compoundId = newId();
  const innerTracks = new Map<TrackId, TrackId>(tracks.map((track) => [track.id, newId()]));
  const links = movedGroups(project, clips, "linkGroup", newId);
  const groups = movedGroups(project, clips, "group", newId);
  const outs = new Set<string>();
  const ins = new Set<string>();
  for (const clip of clips) {
    if (!isMediaClip(clip)) continue;
    if (clip.transitionOut) outs.add(clip.transitionOut.id);
    if (clip.transitionIn) ins.add(clip.transitionIn.id);
  }
  const kept = new Set([...outs].filter((id) => ins.has(id)));
  const moved = clips.map((clip) => {
    let next = { ...structuredClone(clip), trackId: innerTracks.get(clip.trackId) as TrackId, start: clip.start - start } as Clip;
    next = withField(next, "linkGroup", clip.linkGroup !== undefined ? links.get(clip.linkGroup) : undefined);
    next = withField(next, "group", clip.group !== undefined ? groups.get(clip.group) : undefined);
    if (isMediaClip(next)) {
      for (const side of ["transitionIn", "transitionOut"] as const) {
        const transition = next[side];
        if (transition && !kept.has(transition.id)) delete next[side];
      }
    }
    return next;
  });
  const name = nextSequenceName(project);
  const sequence: Sequence = {
    id: sequenceId,
    name,
    size: { w: project.settings.width, h: project.settings.height },
    duration: end - start,
    background: null,
    tracks: tracks.map((track) => ({ ...emptyTrack(innerTracks.get(track.id) as TrackId, track.kind, track.name), clipIds: moved.filter((clip) => clip.trackId === innerTracks.get(track.id)).map((clip) => clip.id) })),
  };
  const compound = newCompoundClip({ id: compoundId, trackId: host.id, name, start, duration: end - start, sequenceId });
  const removed = new Set(clips.map((clip) => clip.id));
  return {
    compoundId,
    sequenceId,
    command: {
      id: "clip.makeCompound",
      label: "Make compound",
      affects: ["tracks", "clips", "timeline", "composite", "audio"],
      run(draft) {
        for (const track of draft.tracks) {
          if (track.clipIds.some((id) => removed.has(id))) track.clipIds = track.clipIds.filter((id) => !removed.has(id));
        }
        for (const id of removed) delete draft.clips[id];
        for (const clip of moved) draft.clips[clip.id] = structuredClone(clip) as Draft<Clip>;
        draft.clips[compound.id] = structuredClone(compound) as Draft<Clip>;
        const hostTrack = draft.tracks.find((track) => track.id === host.id);
        if (!hostTrack) throw new Error(`clip.makeCompound: track ${host.id} does not exist`);
        const at = hostTrack.clipIds.findIndex((other) => (draft.clips[other]?.start ?? 0) > compound.start);
        hostTrack.clipIds.splice(at === -1 ? hostTrack.clipIds.length : at, 0, compound.id);
        draft.sequences[sequenceId] = structuredClone(sequence) as Draft<Sequence>;
      },
    },
  };
}

// --- Break apart --------------------------------------------------------------------------------------

/** What a compound has that Break apart could not give back (the reason), or null. */
function bakedLook(clip: CompoundClip): string | null {
  const parts: string[] = [];
  if (!isIdentityTransform(clip.transform)) parts.push("a transform");
  if (clip.opacity !== 1) parts.push("an opacity");
  if (clip.fades.in > 0 || clip.fades.out > 0) parts.push("fades");
  if (clip.keyframes && Object.keys(clip.keyframes).length > 0) parts.push("keyframes");
  if (clip.volume.gainDb !== 0 || clip.volume.muted) parts.push("a volume change");
  return parts.length === 0 ? null : `Break apart needs a compound with no transform, opacity, fades or keyframes: this one has ${parts.join(", ")}`;
}

interface BreakPlan {
  clip: CompoundClip;
  sequence: Sequence;
  /** The inner clips that stay in view, with their absolute start. */
  shown: { clip: Clip; start: Frame; innerTrack: Track }[];
  /** The inner clips the trimmed window left out. */
  outside: ClipId[];
  shared: boolean;
}

function planBreak(project: Project, clipId: ClipId): BreakPlan | string {
  const clip = project.clips[clipId];
  if (clip?.kind !== "compound") return "Select a compound clip";
  if (isClipLocked(project, clipId)) return "The track is locked";
  const sequence = project.sequences[clip.sequenceId];
  if (!sequence) return "Its sequence is missing";
  const look = bakedLook(clip);
  if (look) return look;
  if (clip.params && Object.keys(clip.params).length > 0) return "Break apart needs an instance without template values: reset them first";
  if (sequence.size.w !== project.settings.width || sequence.size.h !== project.settings.height) return "Break apart needs a sequence the size of the project";
  const from = clip.offset;
  const to = clip.offset + clip.duration;
  const shown: BreakPlan["shown"] = [];
  const outside: ClipId[] = [];
  for (const innerTrack of sequence.tracks) {
    for (const id of innerTrack.clipIds) {
      const inner = project.clips[id];
      if (!inner) continue;
      const end = inner.start + inner.duration;
      if (end <= from || inner.start >= to) outside.push(id);
      else if (inner.start < from || end > to) return "Break apart needs the whole sequence: this compound is trimmed through a clip";
      else shown.push({ clip: inner, start: clip.start + inner.start - from, innerTrack });
    }
  }
  return { clip, sequence, shown, outside, shared: instancesOf(project, clip.sequenceId).length > 1 };
}

/** Why Break apart is disabled for the clip (the reason shown), or null when it works. */
export function breakApartProblem(project: Project, clipId: ClipId): string | null {
  const plan = planBreak(project, clipId);
  return typeof plan === "string" ? plan : null;
}

interface Target {
  innerTrackId: TrackId;
  /** An existing project track, or a track to create (inserted after `after`, or at the end of the audio tracks). */
  existing: TrackId | null;
  create: { id: TrackId; kind: Track["kind"]; flags: Pick<Track, "hidden" | "muted" | "solo"> } | null;
  after: TrackId | null;
}

/** Whether the clips at `spans` fit on `track` apart from the compound `ignore` and the spans already `taken` there. */
function fits(project: Project, track: Track, spans: readonly (readonly [Frame, Frame])[], ignore: ClipId, taken: readonly (readonly [Frame, Frame])[]): boolean {
  if (track.locked || track.hidden || track.muted || track.solo) return false;
  const overlaps = (a: readonly [Frame, Frame], b: readonly [Frame, Frame]) => a[0] < b[1] && b[0] < a[1];
  for (const span of spans) {
    if (taken.some((other) => overlaps(span, other))) return false;
    for (const id of track.clipIds) {
      const other = project.clips[id];
      if (other && id !== ignore && overlaps(span, [other.start, other.start + other.duration])) return false;
    }
  }
  return true;
}

/** Break apart (spec §21.10) of the compound `clipId`: null when `breakApartProblem` has a reason. */
export function breakApart(project: Project, clipId: ClipId, newId: () => string): Command | null {
  const plan = planBreak(project, clipId);
  if (typeof plan === "string") return null;
  const { clip, sequence, shown, outside, shared } = plan;
  const video = project.tracks.filter((track) => track.kind === "video");
  const audio = project.tracks.filter((track) => track.kind === "audio");
  const spansOf = (innerTrack: Track) => shown.filter((entry) => entry.innerTrack === innerTrack).map((entry) => [entry.start, entry.start + entry.clip.duration] as const);
  const targets: Target[] = [];
  let lastVideo = clip.trackId;
  let firstVideo = true;
  const usedAudio: TrackId[] = [];
  for (const innerTrack of sequence.tracks) {
    const spans = spansOf(innerTrack);
    if (spans.length === 0) continue;
    const flags = { hidden: innerTrack.hidden, muted: innerTrack.muted, solo: innerTrack.solo };
    const plain = !flags.hidden && !flags.muted && !flags.solo;
    if (innerTrack.kind === "video") {
      const index = video.findIndex((track) => track.id === lastVideo);
      const candidate = firstVideo ? video[index] : video[index + 1];
      firstVideo = false;
      if (plain && candidate && fits(project, candidate, spans, clip.id, [])) {
        targets.push({ innerTrackId: innerTrack.id, existing: candidate.id, create: null, after: null });
        lastVideo = candidate.id;
      } else {
        const id = newId();
        targets.push({ innerTrackId: innerTrack.id, existing: null, create: { id, kind: "video", flags }, after: lastVideo });
        lastVideo = id;
      }
    } else {
      const candidate = plain ? audio.find((track) => !usedAudio.includes(track.id) && fits(project, track, spans, clip.id, [])) : undefined;
      if (candidate) {
        usedAudio.push(candidate.id);
        targets.push({ innerTrackId: innerTrack.id, existing: candidate.id, create: null, after: null });
      } else {
        targets.push({ innerTrackId: innerTrack.id, existing: null, create: { id: newId(), kind: "audio", flags }, after: null });
      }
    }
  }
  const placed: Clip[] = shown.map((entry) => ({ ...structuredClone(entry.clip), start: entry.start }) as Clip);
  if (shared) {
    const copies = copyClips(placed, newId, { links: true, transitions: true });
    copies.forEach((copy, i) => {
      placed[i] = { ...copy, start: (placed[i] as Clip).start } as Clip;
    });
  }
  const targetOf = new Map(targets.map((target) => [target.innerTrackId, target]));
  const innerOf = placed.map((_, i) => (shown[i] as BreakPlan["shown"][number]).innerTrack.id);
  return {
    id: "clip.breakApart",
    label: "Break apart",
    affects: ["tracks", "clips", "timeline", "composite", "audio"],
    run(draft) {
      const trackIds = new Map<TrackId, TrackId>();
      for (const target of targets) {
        if (target.existing !== null) {
          trackIds.set(target.innerTrackId, target.existing);
          continue;
        }
        const create = target.create as NonNullable<Target["create"]>;
        const track = { ...emptyTrack(create.id, create.kind, nextTrackName(draft.tracks, create.kind)), ...create.flags };
        if (create.kind === "video") {
          const at = draft.tracks.findIndex((other) => other.id === target.after);
          draft.tracks.splice(at === -1 ? 0 : at + 1, 0, track);
        } else {
          draft.tracks.push(track);
        }
        trackIds.set(target.innerTrackId, create.id);
      }
      // The compound goes first, then the sequence's own clips (all of them when this instance was the last).
      const host = draft.tracks.find((track) => track.id === clip.trackId);
      if (host) host.clipIds = host.clipIds.filter((id) => id !== clip.id);
      delete draft.clips[clip.id];
      if (!shared) {
        for (const innerTrack of sequence.tracks) for (const id of innerTrack.clipIds) delete draft.clips[id];
        delete draft.sequences[sequence.id];
      }
      void outside;
      placed.forEach((made, i) => {
        const targetId = trackIds.get(innerOf[i] as TrackId);
        const track = draft.tracks.find((other) => other.id === targetId);
        if (!track || !targetOf.has(innerOf[i] as TrackId)) throw new Error(`clip.breakApart: no track for ${made.id}`);
        draft.clips[made.id] = { ...structuredClone(made), trackId: track.id } as Draft<Clip>;
        const at = track.clipIds.findIndex((other) => (draft.clips[other]?.start ?? 0) > made.start);
        track.clipIds.splice(at === -1 ? track.clipIds.length : at, 0, made.id);
      });
    },
  };
}

// --- Make unique ----------------------------------------------------------------------------------------

/** Why Make unique is disabled (the sequence has no other instance), or null. */
export function makeUniqueProblem(project: Project, clipId: ClipId): string | null {
  const clip = project.clips[clipId];
  if (clip?.kind !== "compound") return "Select a compound clip";
  if (isClipLocked(project, clipId)) return "The track is locked";
  if (!project.sequences[clip.sequenceId]) return "Its sequence is missing";
  return instancesOf(project, clip.sequenceId).length > 1 ? null : "This compound is not shared with any other clip";
}

/** Make unique (spec §21.10): the instance `clipId` gets its own copy of its sequence. Null when disabled. */
export function makeUnique(project: Project, clipId: ClipId, newId: () => string): Command | null {
  if (makeUniqueProblem(project, clipId) !== null) return null;
  const clip = project.clips[clipId] as CompoundClip;
  const source = project.sequences[clip.sequenceId] as Sequence;
  const innerClips = source.tracks.flatMap((track) => track.clipIds.map((id) => project.clips[id])).filter((inner): inner is Clip => inner !== undefined);
  const copies = copyClips(innerClips, newId, { links: true, transitions: true });
  const trackIds = new Map<TrackId, TrackId>(source.tracks.map((track) => [track.id, newId()]));
  const sequenceId = newId();
  const byOld = new Map(innerClips.map((inner, i) => [inner.id, copies[i] as Clip]));
  const made = copies.map((copy, i) => ({ ...copy, trackId: trackIds.get((innerClips[i] as Clip).trackId) as TrackId }) as Clip);
  const sequence: Sequence = {
    ...structuredClone(source),
    id: sequenceId,
    name: `${source.name} copy`,
    tracks: source.tracks.map((track) => ({ ...structuredClone(track), id: trackIds.get(track.id) as TrackId, clipIds: track.clipIds.map((id) => (byOld.get(id) as Clip).id) })),
  };
  // The copy's template parameters point at the copied clips (a target whose clip is gone stays as it is: it dangles).
  if (sequence.params) for (const param of sequence.params) for (const target of param.targets) target.clipId = byOld.get(target.clipId)?.id ?? target.clipId;
  return {
    id: "clip.makeUnique",
    label: "Make unique",
    affects: ["clips", "timeline", "composite", "audio"],
    run(draft) {
      for (const copy of made) draft.clips[copy.id] = structuredClone(copy) as Draft<Clip>;
      draft.sequences[sequenceId] = structuredClone(sequence) as Draft<Sequence>;
      const target = draft.clips[clipId];
      if (target?.kind !== "compound") throw new Error(`clip.makeUnique: ${clipId} is not a compound clip`);
      target.sequenceId = sequenceId;
    },
  };
}

/** A compound clip showing the sequence from its first frame, untransformed (Make compound, a drop from the Compounds bin). */
export function newCompoundClip(fields: { id: ClipId; trackId: TrackId; name: string; start: Frame; duration: Frame; sequenceId: SequenceId; offset?: Frame }): CompoundClip {
  return {
    kind: "compound",
    enabled: true,
    offset: 0,
    transform: structuredClone(IDENTITY_TRANSFORM),
    opacity: 1,
    fades: { in: 0, out: 0 },
    volume: { gainDb: 0, muted: false },
    ...fields,
  };
}

/** Whether a compound clip showing `target` can be added to `host` (a sequence id or null: the project); the reason otherwise. */
export function canPlaceCompound(project: Project, host: SequenceId | null, target: SequenceId): string | null {
  return nestingProblem(project, host, target);
}
