// The document record of a probed media file (spec §9.1). Pure: shared by the importer and by `normalize` (Batch 55).
import type { MediaItem } from "../core/document/types.js";
import type { ProbeResult } from "./probe/types.js";

/**
 * The document record of a probed, copied (or linked) file. Analysis that applies to the kind starts
 * pending (§9.1): thumbnails for video, peaks for anything with audio.
 */
export function mediaItemFrom(probe: ProbeResult, fields: { id: string; name: string; file: MediaItem["file"]; addedAt: string; size?: number }): MediaItem {
  const item: MediaItem = {
    id: fields.id,
    kind: probe.kind,
    name: fields.name,
    file: { ...fields.file },
    durationUs: probe.durationUs,
    hasAudio: probe.hasAudio,
    analysis: { thumbs: probe.kind === "video" ? "pending" : "none", peaks: probe.hasAudio ? "pending" : "none" },
    addedAt: fields.addedAt,
  };
  if (fields.size !== undefined) item.size = fields.size;
  if (probe.width !== undefined) item.width = probe.width;
  if (probe.height !== undefined) item.height = probe.height;
  if (probe.rotation !== undefined && probe.kind === "video") item.rotation = probe.rotation;
  if (probe.fps) item.fps = { ...probe.fps };
  if (probe.codec) item.codec = probe.codec;
  if (probe.audioCodec) item.audioCodec = probe.audioCodec;
  return item;
}
