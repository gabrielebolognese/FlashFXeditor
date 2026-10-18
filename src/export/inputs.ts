// What an export of a frame range needs besides the document (Batch 43): the media its video tracks
// show there (files the export worker decodes, SVGs the main thread rasterizes) and the text it
// draws (the fonts the worker loads before its first frame). Transition handles count: a clip next
// to a cut plays into its handle.
import { extendedEnd, extendedStart } from "../core/document/transitions.js";
import type { Frame, MediaId, Project, TextStyle } from "../core/document/types.js";

export interface ExportNeeds {
  /** Media of video and image clips on video tracks in the range, in track order. */
  media: MediaId[];
  /** The styles and texts of the text clips and caption cues in the range. */
  texts: { style: TextStyle; text: string }[];
}

export function exportNeeds(project: Project, range: { start: Frame; end: Frame }): ExportNeeds {
  const media = new Set<MediaId>();
  const texts: { style: TextStyle; text: string }[] = [];
  for (const track of project.tracks) {
    if (track.kind === "audio") continue;
    const captionStyle = track.kind === "caption" ? project.captionTracks[track.id]?.style.text : undefined;
    for (const id of track.clipIds) {
      const clip = project.clips[id];
      if (!clip || extendedEnd(clip) <= range.start || extendedStart(clip) >= range.end) continue;
      if ((clip.kind === "video" || clip.kind === "image") && track.kind === "video") media.add(clip.mediaId);
      else if (clip.kind === "text") texts.push({ style: clip.style, text: clip.text.value });
      else if (clip.kind === "caption" && captionStyle) texts.push({ style: captionStyle, text: clip.text });
    }
  }
  return { media: [...media], texts };
}
