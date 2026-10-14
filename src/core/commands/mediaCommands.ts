// Media commands (spec §9.1, §12): one `media.add` per import batch, removal, rename. The files in
// media/ are not touched here: copying happens before `media.add`, and removal keeps the file (the
// optional file deletion comes with Batch 41).
import { isMediaClip, type MediaId, type MediaItem, type Project } from "../document/types.js";
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

/** Removes media no clip uses; unknown ids are ignored. */
export function removeMedia(ids: readonly MediaId[]): Command {
  return {
    id: "media.remove",
    label: ids.length === 1 ? "Remove media" : `Remove ${ids.length} media files`,
    affects: ["media"],
    run(draft) {
      const counts = mediaUseCounts(draft as Project);
      const used = ids.filter((id) => (counts.get(id) ?? 0) > 0);
      // TODO(batch 41): "Remove from project" keeps offline clips; "Remove and delete clips" removes them.
      if (used.length > 0) throw new Error(`media.remove: ${used.join(", ")} still used by clips`);
      for (const id of ids) delete draft.media[id];
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
