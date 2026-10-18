// Media commands (spec §9.1, §12): one `media.add` per import batch, removal (used media keep their
// clips offline, or the clips go with them), rename, bins (Batch 41: one level, `Project.bins`, a media
// item in at most one) and relinking a missing file. The files in media/ are not touched here: copying
// happens before `media.add` / `media.relink`, and the optional file deletion of the Remove dialog
// runs after `media.remove` (app/mediaController.ts).
import { isMediaClip, type Bin, type ClipId, type MediaId, type MediaItem, type Project } from "../document/types.js";
import type { Command } from "./command.js";

export const MAX_MEDIA_NAME = 255;

/** One line, trimmed and capped; empty names become null (rejected). */
export function cleanMediaName(name: string): string | null {
  const clean = name.replace(/\s+/g, " ").trim().slice(0, MAX_MEDIA_NAME);
  return clean === "" ? null : clean;
}

/** How many clips use each media item. */
export function mediaUseCounts(project: Project): Map<MediaId, number> {
  const counts = new Map<MediaId, number>();
  for (const clip of Object.values(project.clips)) {
    if (isMediaClip(clip)) counts.set(clip.mediaId, (counts.get(clip.mediaId) ?? 0) + 1);
  }
  return counts;
}

export function addMedia(items: readonly MediaItem[]): Command {
  return {
    id: "media.add",
    label: items.length === 1 ? "Import media" : `Import ${items.length} media files`,
    affects: ["media"],
    run(draft) {
      for (const item of items) {
        if (draft.media[item.id]) throw new Error(`media.add: media ${item.id} already exists`);
        draft.media[item.id] = structuredClone(item);
      }
    },
  };
}

/** The clips that use any of `ids`. */
export function clipsOfMedia(project: Project, ids: Iterable<MediaId>): ClipId[] {
  const set = new Set(ids);
  return Object.values(project.clips)
    .filter((clip) => isMediaClip(clip) && set.has(clip.mediaId))
    .map((clip) => clip.id);
}

/**
 * Removes media (spec §12 Delete, §6.19); unknown ids are ignored. `keep` ("Remove from project"):
 * their clips stay, offline (a gray slate, no media to relink; Undo brings the media back), with their
 * transitions (an offline clip's handles are not bounded: `handleOf`). `delete`
 * ("Remove and delete clips"): their clips go too, on every track, leaving gaps (a transition shared
 * with a removed clip goes with it: `reconcileTransitions`; a partner left alone in a link group or a
 * group loses it). One undo step either way.
 */
export function removeMedia(ids: readonly MediaId[], clips: "keep" | "delete" = "keep"): Command {
  const count = ids.length === 1 ? "media" : `${ids.length} media files`;
  return {
    id: "media.remove",
    label: clips === "delete" ? `Remove ${count} and delete clips` : `Remove ${count}`,
    affects: clips === "delete" ? ["media", "clips", "timeline"] : ["media", "clips"],
    run(draft) {
      if (clips === "delete") {
        const left = { linkGroup: new Set<string>(), group: new Set<string>() };
        for (const clipId of clipsOfMedia(draft as Project, ids)) {
          const clip = draft.clips[clipId];
          if (!clip) continue;
          if (clip.linkGroup !== undefined) left.linkGroup.add(clip.linkGroup);
          if (clip.group !== undefined) left.group.add(clip.group);
          const track = draft.tracks.find((t) => t.id === clip.trackId);
          if (track) track.clipIds.splice(track.clipIds.indexOf(clipId), 1);
          delete draft.clips[clipId];
        }
        // A partner left alone in a link group or a group loses it (as when its track is deleted).
        for (const field of ["linkGroup", "group"] as const) {
          const members = new Map<string, number>();
          for (const clip of Object.values(draft.clips)) {
            const group = clip[field];
            if (group !== undefined && left[field].has(group)) members.set(group, (members.get(group) ?? 0) + 1);
          }
          for (const clip of Object.values(draft.clips)) {
            const group = clip[field];
            if (group !== undefined && members.get(group) === 1) delete clip[field];
          }
        }
      }
      for (const id of ids) delete draft.media[id];
    },
  };
}

/** The probe fields and the file a relink changes (spec §12 Relink). */
type RelinkKey = "size" | "durationUs" | "width" | "height" | "rotation" | "fps" | "hasAudio" | "codec" | "audioCodec" | "analysis" | "proxy";
export type RelinkFields = Pick<MediaItem, "file"> & { [K in RelinkKey]?: MediaItem[K] | undefined };

/**
 * Points missing media at their new files (spec §12 Relink: one file, or a folder's matches in one
 * step). Fields set to undefined are removed (a new file without a proxy yet). Unknown ids are ignored.
 */
export function relinkMedia(entries: readonly { id: MediaId; fields: RelinkFields }[]): Command {
  return {
    id: "media.relink",
    label: entries.length === 1 ? "Relink media" : `Relink ${entries.length} media files`,
    affects: ["media", "clips"],
    run(draft) {
      for (const { id, fields } of entries) {
        const media = draft.media[id];
        if (!media) continue;
        for (const [key, value] of Object.entries(structuredClone(fields))) {
          if (value === undefined) delete (media as Record<string, unknown>)[key];
          else (media as Record<string, unknown>)[key] = value;
        }
      }
    },
  };
}

export const MAX_BIN_NAME = 64;

/** One line, trimmed and capped; empty names become null (rejected). */
export function cleanBinName(name: string): string | null {
  const clean = name.replace(/\s+/g, " ").trim().slice(0, MAX_BIN_NAME);
  return clean === "" ? null : clean;
}

/** "Bin", "Bin 2", "Bin 3"...: the first that no bin has (case-insensitive). */
export function nextBinName(bins: readonly Bin[], base = "Bin"): string {
  const names = new Set(bins.map((bin) => bin.name.toLowerCase()));
  let name = base;
  for (let n = 2; names.has(name.toLowerCase()); n++) name = `${base} ${n}`;
  return name;
}

/** New bin (spec §12), at the end of the strip. */
export function addBin(bin: Bin): Command {
  const name = cleanBinName(bin.name);
  return {
    id: "media.bin.add",
    label: "New bin",
    affects: ["media"],
    run(draft) {
      if (name === null) throw new Error("media.bin.add: empty name");
      if (draft.bins.some((other) => other.id === bin.id)) throw new Error(`media.bin.add: bin ${bin.id} already exists`);
      draft.bins.push({ id: bin.id, name });
    },
  };
}

export function renameBin(id: string, name: string): Command {
  const clean = cleanBinName(name);
  return {
    id: "media.bin.rename",
    label: "Rename bin",
    affects: ["media"],
    run(draft) {
      const bin = draft.bins.find((other) => other.id === id);
      if (!bin) throw new Error(`media.bin.rename: bin ${id} does not exist`);
      if (clean !== null) bin.name = clean;
    },
  };
}

/** Deletes a bin; its media stay in the project, in no bin. */
export function removeBin(id: string): Command {
  return {
    id: "media.bin.remove",
    label: "Delete bin",
    affects: ["media"],
    run(draft) {
      const index = draft.bins.findIndex((bin) => bin.id === id);
      if (index < 0) return;
      draft.bins.splice(index, 1);
      for (const media of Object.values(draft.media)) if (media.binId === id) delete media.binId;
    },
  };
}

/** Moves media into a bin (`binId`), or out of every bin (null). */
export function setMediaBin(ids: readonly MediaId[], binId: string | null): Command {
  return {
    id: "media.setBin",
    label: binId === null ? "Remove from bin" : ids.length === 1 ? "Move media to bin" : `Move ${ids.length} media files to bin`,
    affects: ["media"],
    run(draft) {
      if (binId !== null && !draft.bins.some((bin) => bin.id === binId)) throw new Error(`media.setBin: bin ${binId} does not exist`);
      for (const id of ids) {
        const media = draft.media[id];
        if (!media) continue;
        if (binId === null) delete media.binId;
        else media.binId = binId;
      }
    },
  };
}

export function renameMedia(id: MediaId, name: string): Command {
  const clean = cleanMediaName(name);
  return {
    id: "media.rename",
    label: "Rename media",
    affects: ["media"],
    run(draft) {
      const media = draft.media[id];
      if (!media) throw new Error(`media.rename: media ${id} does not exist`);
      if (clean !== null) media.name = clean;
    },
  };
}

/**
 * A media item's proxy (spec §9.5): pending (queued or being made, with the size it will have), ready
 * (with its size), failed, or none (removed: never made again on its own). Dispatched through
 * `DocumentStore.amend`: no undo step, like the analysis status.
 */
export function setMediaProxy(id: MediaId, proxy: NonNullable<MediaItem["proxy"]>): Command {
  return {
    id: "media.proxy",
    label: "Media proxy",
    affects: ["media"],
    run(draft) {
      const media = draft.media[id];
      if (media) media.proxy = { ...proxy };
    },
  };
}

/** Analysis status of a media item (peaks, thumbnails). Dispatched through `DocumentStore.amend`: no undo step. */
export function setMediaAnalysis(id: MediaId, analysis: Partial<MediaItem["analysis"]>): Command {
  return {
    id: "media.analysis",
    label: "Media analysis",
    affects: ["media"],
    run(draft) {
      const media = draft.media[id];
      if (media) Object.assign(media.analysis, analysis);
    },
  };
}
