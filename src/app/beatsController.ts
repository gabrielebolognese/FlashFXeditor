// Detect beats (spec §21.21, Batch 77): on the selected audio clips (or the audio linked to selected video)
// the source range the clip plays is read from the decoded audio (mono), the analysis worker finds the
// onsets and tempo (audio/dsp/beats.ts), and teal markers named "Beat" are added at their timeline frames,
// as one undo step. Snapping already uses markers (spec §6.13).
import { addBeatMarkers } from "../core/commands/markerCommands.js";
import type { ClipId, Marker, MediaClip, Project } from "../core/document/types.js";
import { segmentRange, segmentsIn } from "../audio/decode/segments.js";
import { beatFrames } from "../audio/dsp/beats.js";
import { audioTargets } from "../timeline/edit/volume.js";
import { showToast } from "../ui/toasts.js";
import { decodedAudio } from "./audioController.js";
import { actions, documentStore, sessionStore, workerPool } from "./services.js";

/** The marker color and label of detected beats (teal: spec §21.21). */
export const BEAT_COLOR = "teal";
export const BEAT_LABEL = "Beat";

function selectedIds(): ClipId[] {
  const selection = sessionStore.selection.getState();
  return selection.kind === "clips" ? [...selection.clipIds] : [];
}

/** The clip's source range as mono samples (seconds from the clip's `in`), or null when its audio is missing. */
async function monoSamples(project: Project, clip: MediaClip): Promise<{ samples: Float32Array<ArrayBuffer>; sampleRate: number } | null> {
  const layout = await decodedAudio.open(clip.mediaId);
  const from = clip.in / 1e6;
  const to = clip.out / 1e6;
  const sampleRate = layout.sampleRate;
  const total = Math.max(0, Math.floor((to - from) * sampleRate));
  const samples = new Float32Array(total);
  for (const index of segmentsIn(layout, from, to)) {
    const { buffer } = await decodedAudio.load(clip.mediaId, index, "background");
    const range = segmentRange(layout, index);
    // Where this segment's samples fall in [from, to), in sample frames of the source.
    const startFrame = Math.floor(from * sampleRate);
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const data = buffer.getChannelData(c);
      const first = Math.max(range.from, startFrame);
      const last = Math.min(range.to, startFrame + total);
      for (let s = first; s < last; s++) samples[s - startFrame] = (samples[s - startFrame] as number) + (data[s - range.from] as number) / buffer.numberOfChannels;
    }
  }
  void project;
  return { samples, sampleRate };
}

export async function detectBeatsOf(clipId: string): Promise<{ markers: Marker[]; bpm: number } | null> {
  const project = documentStore.getState();
  const clip = project.clips[clipId];
  if (!clip || clip.kind !== "audio") return null;
  const mono = await monoSamples(project, clip);
  if (!mono) return null;
  const { beats, bpm } = await workerPool.request("detectBeats", { samples: mono.samples.buffer, sampleRate: mono.sampleRate }, { priority: "user", transfer: [mono.samples.buffer] });
  const frames = beatFrames(beats, clip, project.settings.fps);
  return { markers: frames.map((frame) => ({ id: crypto.randomUUID(), frame, color: BEAT_COLOR, label: BEAT_LABEL })), bpm };
}

async function detectBeatsAction(): Promise<void> {
  const ids = audioTargets(documentStore.getState(), selectedIds());
  if (ids.length === 0) {
    showToast({ tone: "info", message: "Select a music clip first", detail: "Detect beats adds a marker at each beat of the selected audio clips." });
    return;
  }
  const markers: Marker[] = [];
  let bpm = 0;
  for (const id of ids) {
    try {
      const found = await detectBeatsOf(id);
      if (found) {
        markers.push(...found.markers);
        bpm = bpm || found.bpm;
      }
    } catch {
      showToast({ tone: "error", message: "Could not read the audio of a clip" });
    }
  }
  const command = addBeatMarkers(markers);
  if (!command) {
    showToast({ tone: "info", message: "No beats found" });
    return;
  }
  documentStore.dispatch(command);
  showToast({ tone: "success", message: `${markers.length} beat${markers.length === 1 ? "" : "s"} marked`, ...(bpm > 0 && { detail: `About ${bpm} BPM` }) });
}

/** Registers `audio.detectBeats`. Returns a stop function. */
export function installBeatsController(): () => void {
  return actions.register("audio.detectBeats", () => void detectBeatsAction(), { enabled: () => audioTargets(documentStore.getState(), selectedIds()).length > 0 });
}
