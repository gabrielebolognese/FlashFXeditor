// Linking and grouping (spec §6.12). `Mod+L` unlinks the link groups the selection touches, or links a
// selected video + audio set; `Mod+G` / `Mod+Shift+G` group and ungroup; "Move into sync" (clip context
// menu) moves an offset linked clip back into sync with its partner. Pure: each builds one command (one
// undo step). Clips on locked tracks are never changed (spec §6.12: no edits).
import type { Command } from "../../core/commands/command.js";
import type { Clip, ClipId, Project } from "../../core/document/types.js";
import { groupOf, isClipLocked, linkGroupOf, linkOffset } from "../model/queries.js";
import { moveClips, type MoveResult } from "./move.js";

export type LinkResult =
  | { kind: "link" | "unlink"; command: Command }
  /** `needsPair`: linking takes at least one audio clip and one clip of a video track, on different tracks. */
  | { kind: "refused"; reason: "nothing" | "needsPair" };

/** The clips of `ids` that exist on unlocked tracks, once each, in input order. */
function editable(project: Project, ids: Iterable<ClipId>): Clip[] {
  const clips: Clip[] = [];
  const seen = new Set<ClipId>();
  for (const id of ids) {
    const clip = project.clips[id];
    if (!clip || seen.has(id) || isClipLocked(project, id)) continue;
    seen.add(id);
    clips.push(clip);
  }
  return clips;
}

/** Sets (or with `undefined` removes) `field` on clips, as one command. */
function setField(id: string, label: string, clipIds: readonly ClipId[], field: "linkGroup" | "group", value: string | undefined): Command {
  return {
    id,
    label,
    affects: ["clips"],
    run(draft) {
      for (const clipId of clipIds) {
        const clip = draft.clips[clipId];
        if (!clip) continue;
        if (value === undefined) delete clip[field];
        else clip[field] = value;
      }
    },
  };
}

/**
 * `Mod+L` (spec §6.12: toggles link on the selection). When any selected clip is linked, every clip of
 * the link groups it touches is unlinked. Otherwise the selection is linked into one new link group: it
 * needs an audio clip and a clip of a video track (video, image, text or solid), each on its own track.
 */
export function toggleLink(project: Project, ids: Iterable<ClipId>, newId: () => string): LinkResult {
  const clips = editable(project, ids);
  if (clips.length === 0) return { kind: "refused", reason: "nothing" };
  const groups = new Set(clips.flatMap((clip) => (clip.linkGroup !== undefined ? [clip.linkGroup] : [])));
  if (groups.size > 0) {
    const members = editable(project, clips.flatMap((clip) => linkGroupOf(project, clip.id))).filter((clip) => clip.linkGroup !== undefined && groups.has(clip.linkGroup));
    return { kind: "unlink", command: setField("clip.unlink", "Unlink clips", members.map((clip) => clip.id), "linkGroup", undefined) };
  }
  const audio = clips.some((clip) => clip.kind === "audio");
  const picture = clips.some((clip) => clip.kind !== "audio" && clip.kind !== "caption");
  const tracks = new Set(clips.map((clip) => clip.trackId));
  if (!audio || !picture || clips.some((clip) => clip.kind === "caption") || tracks.size !== clips.length) return { kind: "refused", reason: "needsPair" };
  return { kind: "link", command: setField("clip.link", "Link clips", clips.map((clip) => clip.id), "linkGroup", newId()) };
}

/**
 * `Mod+G` (spec §6.12): the selected clips and the members of the groups they are in become one new
 * group. Null for fewer than two clips, or when they already are exactly one group.
 */
export function groupClips(project: Project, ids: Iterable<ClipId>, newId: () => string): Command | null {
  const members = editable(project, editable(project, ids).flatMap((clip) => groupOf(project, clip.id)));
  if (members.length < 2) return null;
  const first = members[0]?.group;
  if (first !== undefined && members.every((clip) => clip.group === first) && groupOf(project, members[0]?.id as ClipId).length === members.length) return null;
  return setField("clip.group", "Group clips", members.map((clip) => clip.id), "group", newId());
}

/** `Mod+Shift+G` (spec §6.12): every member of the groups the selected clips are in leaves its group. Null when none is grouped. */
export function ungroupClips(project: Project, ids: Iterable<ClipId>): Command | null {
  const members = editable(project, editable(project, ids).flatMap((clip) => (clip.group !== undefined ? groupOf(project, clip.id) : []))).filter((clip) => clip.group !== undefined);
  return members.length > 0 ? setField("clip.ungroup", "Ungroup clips", members.map((clip) => clip.id), "group", undefined) : null;
}

/**
 * "Move into sync" (spec §6.12, §6.19): the clip moves on its track by its sync offset (`linkOffset`),
 * so it plays in sync with its partner again; collisions overwrite as in a nudge (spec §6.8). Null when
 * it is in sync, unlinked or on a locked track (a move that would start before frame 0 stops there).
 */
export function moveIntoSync(project: Project, clipId: ClipId, newId: () => string): MoveResult | null {
  const offset = linkOffset(project, clipId);
  if (offset === 0 || isClipLocked(project, clipId)) return null;
  return moveClips(project, [clipId], -offset, new Map(), "overwrite", { newId, label: "Move into sync" });
}
