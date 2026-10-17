// Audio wiring (spec §8, §14): the decoded-audio cache, the playback graph (built on the clock's
// AudioContext once it runs), the audio scheduler the playback engine drives, the master meter view,
// the monitoring volume and mute (app settings, never the export), the media files of the open
// project, and the cleanup of media that leave it. Framework-free; the preview chrome only mounts
// the meter and calls the volume functions. The audio scrub (Batch 37, spec §8): with the toolbar's
// Audio scrub on, each frame a ruler scrub or a frame step shows plays a grain (`scrubGrain`), at most
// one per animation frame, never while playing.
import { AudioMixer, type AudioGraphContext } from "../audio/AudioMixer.js";
import { DecodedAudio } from "../audio/decode/DecodedAudio.js";
import { MeterView } from "../audio/MeterView.js";
import { AudioScheduler } from "../audio/scheduler/AudioScheduler.js";
import { AudioScrubber } from "../audio/scrub/AudioScrubber.js";
import type { Frame, MediaId } from "../core/document/types.js";
import type { FsDir } from "../project/fs.js";
import { peaksPath, resolveFile, writeFileAt } from "../project/mediaFiles.js";
import type { PeaksJobDeps } from "../media/PeaksJobs.js";
import { actions, appSettings, audioClock, documentStore, scheduler, sessionStore, themeBridge, workerPool } from "./services.js";

interface OpenProject {
  dir: FsDir;
  isWritable: () => boolean;
}

let open: OpenProject | null = null;
let stopProject: (() => void) | null = null;
let decodeContext: OfflineAudioContext | null = null;

/** The source file of a media item in the open project (copy mode). TODO(batch 41): file handles. */
async function mediaFile(mediaId: MediaId): Promise<File | null> {
  const item = documentStore.getState().media[mediaId];
  if (!open || !item || !("relPath" in item.file)) return null;
  return resolveFile(open.dir, item.file.relPath);
}

/** Decoded audio by media and segment (512 MB LRU). */
export const decodedAudio = new DecodedAudio({
  workers: workerPool,
  document: documentStore,
  file: mediaFile,
  // An OfflineAudioContext decodes without a user gesture, at the project rate (spec §14: 48 kHz).
  decodeFile: (bytes) => (decodeContext ??= new OfflineAudioContext(1, 1, 48_000)).decodeAudioData(bytes),
  createBuffer: (options) => new AudioBuffer(options),
});

let mixer: AudioMixer | null = null;

/** The graph on the clock's running AudioContext (created on first use, rebuilt for a new context). */
function currentMixer(): AudioMixer | null {
  const ctx = audioClock.context as unknown as (AudioGraphContext & { state: string }) | null;
  if (!ctx || ctx.state !== "running") return null;
  if (mixer?.context !== ctx) {
    mixer?.dispose();
    mixer = new AudioMixer(ctx);
    const { monitorVolumeDb, monitorMuted } = appSettings.getState();
    mixer.setMonitor(monitorVolumeDb, monitorMuted);
  }
  return mixer;
}

/** Plays the timeline's audio clips; driven by the playback engine (spec §8). */
export const audioScheduler = new AudioScheduler({ clock: audioClock, mixer: currentMixer, document: documentStore, audio: decodedAudio });

/** The audio scrub's grains (spec §8, Batch 37), on the same graph. */
export const audioScrubber = new AudioScrubber({ mixer: currentMixer, audio: decodedAudio });

let grainFrame: Frame | null = null;
let grainRequest = 0;

/**
 * A grain of the timeline's audio at `frame` while Audio scrub is on and nothing plays: the latest
 * frame of an animation frame is heard (scrubs coalesce).
 */
export function scrubGrain(frame: Frame): void {
  if (!sessionStore.state.getState().audioScrub || audioScheduler.active) return;
  grainFrame = frame;
  if (grainRequest !== 0) return;
  grainRequest = requestAnimationFrame(() => {
    grainRequest = 0;
    const at = grainFrame;
    grainFrame = null;
    if (at !== null && !audioScheduler.active) audioScrubber.grain(documentStore.getState(), at);
  });
}

function toggleAudioScrub(): void {
  sessionStore.state.set((state) => ({ ...state, audioScrub: !state.audioScrub }));
}

/** The stereo peak meter of the preview panel. */
export const meterView = new MeterView({
  scheduler,
  theme: themeBridge,
  meters: () => mixer?.meters ?? null,
  active: () => audioScheduler.active,
  now: () => performance.now() / 1000,
});

appSettings.select(
  (state) => state.monitorVolumeDb,
  () => applyMonitor(),
);
appSettings.select(
  (state) => state.monitorMuted,
  () => applyMonitor(),
);

function applyMonitor(volumeDb = appSettings.getState().monitorVolumeDb): void {
  mixer?.setMonitor(volumeDb, appSettings.getState().monitorMuted);
}

/** The knob while it is dragged: heard at once, stored on release (`commitMonitorVolume`). */
export function previewMonitorVolume(volumeDb: number): void {
  applyMonitor(volumeDb);
}

export function commitMonitorVolume(volumeDb: number): void {
  void appSettings.update({ monitorVolumeDb: volumeDb });
}

function toggleMonitorMute(): void {
  void appSettings.update({ monitorMuted: !appSettings.getState().monitorMuted });
}

/** What the peaks jobs read and write in the open project (cache/peaks/). */
export function peaksFiles(dir: FsDir, isWritable: () => boolean): Pick<PeaksJobDeps, "stamp" | "read" | "write"> {
  return {
    stamp: async (mediaId) => {
      const file = await mediaFile(mediaId);
      return file ? { size: file.size, lastModified: file.lastModified } : null;
    },
    read: async (mediaId) => (await resolveFile(dir, peaksPath(mediaId)))?.arrayBuffer() ?? null,
    write: async (mediaId, bytes) => {
      if (isWritable()) await writeFileAt(dir, peaksPath(mediaId), new Blob([bytes]));
    },
  };
}

/** Wires audio to a newly opened project. */
export function attachAudio(dir: FsDir, isWritable: () => boolean): void {
  detachAudio();
  open = { dir, isWritable };
  let media = documentStore.getState().media;
  stopProject = documentStore.subscribe(
    (state) => {
      for (const id of Object.keys(media) as MediaId[]) if (!Object.hasOwn(state.media, id)) decodedAudio.release(id);
      media = state.media;
    },
    { affects: ["media"] },
  );
}

/** Before the project closes: silence and free the decoded audio (P13). */
export function detachAudio(): void {
  audioScheduler.stop();
  audioScrubber.stop();
  stopProject?.();
  stopProject = null;
  open = null;
  decodedAudio.reset();
}

/** Registers the audio actions (and the dev console access). Returns a stop function. */
export function installAudioController(): () => void {
  const stops = [
    actions.register("audio.toggleMute", toggleMonitorMute),
    actions.register("toggle.audioScrub", toggleAudioScrub),
    // The meter's clip indicators (the LED row is its button).
    actions.register("audio.resetMeters", () => meterView.resetClip()),
  ];
  if (import.meta.env.DEV) {
    const editor = ((globalThis as { __editor?: Record<string, unknown> }).__editor ??= {});
    const audio: Record<string, unknown> = {
      scheduler: audioScheduler,
      scrubber: audioScrubber,
      decoded: decodedAudio,
      meter: meterView,
      get mixer() {
        return mixer;
      },
    };
    editor.audio = audio;
    // The sync and meter checks: `__editor.audio.clapTest()`, `.syncReport()`, `.toneTest({ gainDb: 6 })`.
    void import("./audioDev.js").then((dev) => Object.assign(audio, { clapTest: dev.clapTest, syncReport: dev.syncReport, toneTest: dev.toneTest }));
  }
  return () => {
    for (const stop of stops) stop();
  };
}
