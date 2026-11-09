// Adjustment clips as commands (spec §21.20, Batch 76). Pure: they read the project and return a `Command`;
// the controller picks the frame. An adjustment applies its effects to every layer below it, so `+ Adjustment`
// puts it on top: the topmost video track when that is free over its range, else a new track above.
import { addTrack } from "../../core/commands/basicCommands.js";
import type { Command } from "../../core/commands/command.js";
import { emptyTrack, nextTrackName } from "../../core/document/project.js";
import type { AdjustmentClip, ClipId, Frame, Project, Track } from "../../core/document/types.js";
import { clipsInRange } from "../model/queries.js";
import { defaultFrames, editDefaults } from "./editDefaults.js";

/** `+ Adjustment`: an adjustment clip with no effects at the playhead (the still image length), on top of every video track. */
export function addAdjustment(project: Project, playhead: Frame, newId: () => string): { command: Command; clipId: ClipId } {
  const start = Math.max(0, Math.round(playhead));
  const length = defaultFrames(editDefaults().solidMs, project.settings.fps);
  const top = project.tracks.filter((track) => track.kind === "video").at(-1);
  const free = top && !top.locked && !top.hidden && !top.muted && clipsInRange(project, top.id, start, start + length).length === 0 ? top : null;
  const newTrack = free ? null : emptyTrack(newId(), "video", nextTrackName(project.tracks, "video"));
  const trackId = (free ?? (newTrack as Track)).id;
  const clip: AdjustmentClip = { id: newId(), trackId, kind: "adjustment", name: "Adjustment", start, duration: length, enabled: true, effects: [], opacity: 1 };
  const trackCommand = newTrack ? addTrack(newTrack) : null;
  return {
    clipId: clip.id,
    command: {
      id: "clip.addAdjustment",
      label: "Add adjustment",
      affects: ["clips", "timeline", "composite", ...(newTrack ? (["tracks"] as const) : [])],
      run(draft, ctx) {
        trackCommand?.run(draft, ctx);
        draft.clips[clip.id] = structuredClone(clip);
        const track = draft.tracks.find((candidate) => candidate.id === trackId);
        if (!track) throw new Error(`clip.addAdjustment: track ${trackId} does not exist`);
        const at = track.clipIds.findIndex((id) => (draft.clips[id]?.start ?? 0) > start);
        track.clipIds.splice(at === -1 ? track.clipIds.length : at, 0, clip.id);
      },
    },
  };
}
