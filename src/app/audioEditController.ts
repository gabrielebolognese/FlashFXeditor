// Audio edit actions (spec §11 Audio section, §14, §17; Batch 37), registered in the CommandRegistry (the
// command palette lists them from Batch 40): Mute (the quick row, the Audio section, the clip menu),
// Normalize, Auto-duck music (the Audio section, the clip menu and an audio track's menu) and Detach
// audio. Each edit is one command built by timeline/edit/volume.ts.
// - They act on the audio clips the Audio section edits (the selected ones and those linked to selected
//   video clips); Auto-duck on a selected audio track takes its clips; Detach on the selected video clips.
// - Normalize reads the waveform peaks (loaded for the timeline) and refines the loudest buckets from the
//   decoded samples when they are in memory (a few thousand samples at most, no decode).
import { segmentAt, segmentStartSeconds } from "../audio/decode/segments.js";
import type { ClipId, MediaId, Project } from "../core/document/types.js";
import { selectClips, selectedTrackIds } from "../core/store/selection.js";
import { setSelection } from "../core/store/sessionStore.js";
import { audioTargets, autoDuck, detachAudio, isAudioClip, normalizeClips, toggleMuted, type ExactPeak } from "../timeline/edit/volume.js";
import { showToast } from "../ui/toasts.js";
import { decodedAudio } from "./audioController.js";
import { clipVisuals, loadPeaks } from "./mediaController.js";
import { actions, appSettings, documentStore, sessionStore } from "./services.js";

const newId = () => crypto.randomUUID();

/** The selected clips (none for a track selection). */
function selectedClipIds(): ClipId[] {
  const selection = sessionStore.selection.getState();
  return selection.kind === "clips" ? [...selection.clipIds] : [];
}

/** The audio clips the audio actions edit: the Audio section's (clips), or every clip of the selected audio tracks. */
function targets(project: Project): ClipId[] {
  const selection = sessionStore.selection.getState();
  if (selection.kind === "track") {
    const tracks = new Set(selectedTrackIds(selection));
    return project.tracks.filter((track) => tracks.has(track.id) && track.kind === "audio" && !track.locked).flatMap((track) => track.clipIds.filter((id) => isAudioClip(project.clips[id])));
  }
  return audioTargets(project, selectedClipIds());
}

function toggleMute(): void {
  const project = documentStore.getState();
  const command = toggleMuted(project, targets(project));
  if (command) documentStore.dispatch(command);
}

/** The exact peak of sample frames [from, to) (at the peaks' rate) from the decoded audio in memory, or null. */
const exactPeak: ExactPeak = (mediaId: MediaId, from: number, to: number) => {
  const peaks = clipVisuals.peaks(mediaId);
  const layout = decodedAudio.layout(mediaId);
  if (!peaks || !layout) return null;
  let peak = 0;
  let s = from / peaks.sampleRate;
  const end = to / peaks.sampleRate;
  while (s < end) {
    const index = segmentAt(layout, s);
    const buffer = decodedAudio.segment(mediaId, index);
    if (!buffer) return null;
    const start = segmentStartSeconds(layout, index);
    const i0 = Math.max(0, Math.floor((s - start) * buffer.sampleRate));
    const i1 = Math.min(buffer.length, Math.ceil((end - start) * buffer.sampleRate));
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const data = buffer.getChannelData(c);
      for (let i = i0; i < i1; i++) {
        const value = Math.abs(data[i] as number);
        if (value > peak) peak = value;
      }
    }
    if (i1 >= buffer.length) s = start + buffer.duration;
    else break;
  }
  return peak;
};

function normalize(): void {
  const project = documentStore.getState();
  const ids = targets(project);
  if (ids.length === 0) return;
  const result = normalizeClips(project, ids, (mediaId) => clipVisuals.peaks(mediaId), exactPeak);
  if (result.command) documentStore.dispatch(result.command);
  if (result.missing.length > 0) {
    // The peaks of these media load first (the timeline draws them too).
    loadPeaks(result.missing.map((id) => (project.clips[id] as { mediaId: MediaId }).mediaId));
    showToast({ tone: "info", message: "The waveform is still loading", detail: "Normalize again in a moment: it needs the clip's peaks." });
  } else if (!result.command && result.silent.length > 0) showToast({ tone: "info", message: "Nothing to normalize", detail: "The clip is silent." });
}

function duck(): void {
  const project = documentStore.getState();
  const { duckDepthDb, duckRampFrames } = appSettings.getState();
  const result = autoDuck(project, targets(project), { depthDb: duckDepthDb, rampFrames: duckRampFrames });
  if (result.command) documentStore.dispatch(result.command);
  else showToast({ tone: "info", message: "No voice to duck under", detail: "Auto-duck lowers a music clip where audio clips play on the tracks above it." });
}

function detach(): void {
  const project = documentStore.getState();
  const result = detachAudio(project, selectedClipIds(), newId);
  if (!result.command) return;
  documentStore.dispatch(result.command);
  // The detached sound is what the next edit works on.
  if (result.audio.length > 0) setSelection(sessionStore, selectClips(result.audio, result.audio[0] ?? null));
}

/** Registers the audio edit actions. Returns a stop function. */
export function installAudioEditController(): () => void {
  const stops = [actions.register("clip.mute", toggleMute), actions.register("audio.normalize", normalize), actions.register("audio.autoDuck", duck), actions.register("audio.detach", detach)];
  return () => {
    for (const stop of stops) stop();
  };
}
