// What an export of a frame range needs besides the document (Batch 43): the media its video tracks
// show there (files the export worker decodes, SVGs the main thread rasterizes) and the text it
// draws (the fonts the worker loads before its first frame). Transition handles count: a clip next
// to a cut plays into its handle.
import { extendedEnd, extendedStart } from "../core/document/transitions.js";
import type { Frame, MediaId, Project, TextStyle, Track } from "../core/document/types.js";
import { defaultCaptionStyle, effectiveCaptionStyle } from "../text/captions.js";

export interface ExportNeeds {
  /** Media of video and image clips on video tracks in the range, in track order. */
  media: MediaId[];
  /** The styles and texts of the text clips and caption cues in the range (a cue in its own style, spec §20.3). */
  texts: { style: TextStyle; text: string }[];
}

export function exportNeeds(project: Project, range: { start: Frame; end: Frame }): ExportNeeds {
  const media = new Set<MediaId>();
  const texts: { style: TextStyle; text: string }[] = [];
  const seen = new Set<string>();
  // `window`: the frames of `tracks` that show (the project's range, or a compound's window of its sequence).
  const scan = (tracks: readonly Track[], window: { start: Frame; end: Frame }): void => {
    for (const track of tracks) {
      if (track.kind === "audio") continue;
      const captionStyle = track.kind === "caption" ? (project.captionTracks[track.id]?.style ?? defaultCaptionStyle(project.settings)) : undefined;
      for (const id of track.clipIds) {
        const clip = project.clips[id];
        if (!clip || extendedEnd(clip) <= window.start || extendedStart(clip) >= window.end) continue;
        if ((clip.kind === "video" || clip.kind === "image") && track.kind === "video") media.add(clip.mediaId);
        else if (clip.kind === "text") texts.push({ style: clip.style, text: clip.text.value });
        else if (clip.kind === "caption" && captionStyle) texts.push({ style: effectiveCaptionStyle(captionStyle, clip.styleOverride).text, text: clip.text });
        else if (clip.kind === "compound" && track.kind === "video") {
          // The sequence frames the compound shows in the window (every instance and window once).
          const from = Math.max(window.start, clip.start) - clip.start + clip.offset;
          const to = Math.min(window.end, clip.start + clip.duration) - clip.start + clip.offset;
          const key = `${clip.sequenceId}:${from}:${to}`;
          const sequence = project.sequences[clip.sequenceId];
          if (!sequence || seen.has(key) || seen.size > 4096) continue;
          seen.add(key);
          scan(sequence.tracks, { start: from, end: to });
        }
      }
    }
  };
  scan(project.tracks, range);
  return { media: [...media], texts };
}
