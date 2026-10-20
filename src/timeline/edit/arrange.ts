// Bring forward / Send backward (spec §7.2 canvas menu): the layer order is the video track order
// (§6.12), so a layer goes up or down by moving its clip to the adjacent video track, creating one if
// needed. The adjacent track takes it when it is unlocked, visible (not hidden or muted: the clip
// would leave the composite) and free over the clip's span; otherwise a new video track is inserted
// just past that track (or past the top / bottom one), so the layer does pass the one in its way.
// Several clips go one by one, the one furthest in the direction first, so they never collide. The
// clips keep their time, links and groups. One command `clip.arrange`, one undo step.
import type { Draft } from "immer";
import type { Command } from "../../core/commands/command.js";
import { emptyTrack, nextTrackName } from "../../core/document/project.js";
import type { ClipId, Project, Track } from "../../core/document/types.js";

export type ArrangeDirection = "forward" | "backward";

function spanFree(draft: Draft<Project>, track: Draft<Track>, start: number, end: number): boolean {
  for (const id of track.clipIds) {
    const other = draft.clips[id];
    if (other && other.start < end && other.start + other.duration > start) return false;
  }
  return true;
}

/** Moves the video clips `ids` one layer forward or backward; null when none of them can move (gone, locked, not on a video track). */
export function arrangeLayers(project: Project, ids: readonly ClipId[], direction: ArrangeDirection, newId: () => string): Command | null {
  const trackAt = new Map(project.tracks.map((track, index) => [track.id, { track, index }]));
  const clips = [...new Set(ids)]
    .map((id) => project.clips[id])
    .filter((clip) => clip !== undefined)
    .filter((clip) => {
      const at = trackAt.get(clip.trackId);
      return at !== undefined && at.track.kind === "video" && !at.track.locked;
    });
  if (clips.length === 0) return null;
  const sign = direction === "forward" ? 1 : -1;
  const indexOf = (trackId: string) => trackAt.get(trackId)?.index ?? 0;
  // The clip furthest in the direction moves first.
  const order = clips.sort((a, b) => sign * (indexOf(b.trackId) - indexOf(a.trackId))).map((clip) => clip.id);
  const many = order.length > 1;
  return {
    id: "clip.arrange",
    label: direction === "forward" ? (many ? "Bring layers forward" : "Bring layer forward") : many ? "Send layers backward" : "Send layer backward",
    affects: ["tracks", "clips", "timeline", "composite"],
    run(draft) {
      for (const id of order) {
        const clip = draft.clips[id];
        if (!clip) continue;
        const video = draft.tracks.filter((track) => track.kind === "video");
        const lane = video.findIndex((track) => track.id === clip.trackId);
        const source = video[lane];
        if (!source) continue;
        const neighbour = video[lane + sign];
        let target: Draft<Track> | undefined = neighbour;
        if (!neighbour || neighbour.locked || neighbour.hidden || neighbour.muted || !spanFree(draft, neighbour, clip.start, clip.start + clip.duration)) {
          // A new video track just past the neighbour (past the source at the top or bottom).
          const at = draft.tracks.indexOf(neighbour ?? source) + (direction === "forward" ? 1 : 0);
          draft.tracks.splice(at, 0, emptyTrack(newId(), "video", nextTrackName(draft.tracks, "video")));
          target = draft.tracks[at];
        }
        if (!target) continue;
        source.clipIds.splice(source.clipIds.indexOf(id), 1);
        // Sorted by start (the target has no clip over the span).
        const after = target.clipIds.findIndex((other) => (draft.clips[other]?.start ?? 0) > clip.start);
        target.clipIds.splice(after === -1 ? target.clipIds.length : after, 0, id);
        clip.trackId = target.id;
      }
    },
  };
}
