// Dev command: fills the open project with generated clips for the timeline stress checks (spec
// P14: 500 clips on 8 tracks). Solid clips on new video tracks; when the project has media with
// sound, two of the tracks are audio tracks using it. One undo step.
import { addTrack } from "../core/commands/basicCommands.js";
import type { Command } from "../core/commands/command.js";
import { emptyTrack, nextTrackName } from "../core/document/project.js";
import { frameToUs, usToFrameFloor } from "../core/document/time.js";
import type { Clip, MediaItem, Project, Track } from "../core/document/types.js";
import type { DocumentStore } from "../core/store/DocumentStore.js";

const IDENTITY = { x: 0, y: 0, scale: 1, rotation: 0, anchor: { x: 0.5, y: 0.5 }, flipH: false, flipV: false };

/** Deterministic pseudo-random sequence (so two runs give the same layout). */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function bulkAddClips(clips: readonly Clip[]): Command {
  return {
    id: "dev.generateClips",
    label: `Generate ${clips.length} test clips`,
    affects: ["clips", "timeline"],
    run(draft) {
      for (const clip of clips) {
        draft.clips[clip.id] = structuredClone(clip);
        draft.tracks.find((track) => track.id === clip.trackId)?.clipIds.push(clip.id);
      }
    },
  };
}

export function generateTestClips(store: DocumentStore, options: { clips?: number; tracks?: number } = {}): void {
  const count = options.clips ?? 500;
  const trackCount = options.tracks ?? 8;
  const project: Project = store.getState();
  const { fps } = project.settings;
  const sound = Object.values(project.media).find((media: MediaItem) => (media.kind === "audio" || (media.kind === "video" && media.hasAudio)) && media.durationUs > 0);
  const audioTracks = sound ? Math.min(2, trackCount - 1) : 0;
  const random = lcg(count * 31 + trackCount);

  const tracks: Track[] = [];
  for (let i = 0; i < trackCount; i++) {
    const kind = i < trackCount - audioTracks ? "video" : "audio";
    tracks.push(emptyTrack(crypto.randomUUID(), kind, nextTrackName([...project.tracks, ...tracks], kind)));
  }

  const clips: Clip[] = [];
  const cursors = tracks.map(() => 0);
  for (let i = 0; i < count; i++) {
    const t = i % trackCount;
    const track = tracks[t] as Track;
    const gap = random() < 0.3 ? Math.floor(random() * 60) : 0;
    const start = (cursors[t] as number) + gap;
    let duration = 15 + Math.floor(random() * 135);
    const base = { id: crypto.randomUUID(), trackId: track.id, name: `Test ${i + 1}`, start, enabled: true };
    if (track.kind === "audio" && sound) {
      duration = Math.max(1, Math.min(duration, usToFrameFloor(sound.durationUs, fps)));
      clips.push({
        ...base,
        kind: "audio",
        duration,
        mediaId: sound.id,
        in: 0,
        out: Math.min(sound.durationUs, frameToUs(duration, fps)),
        speed: 1,
        transform: IDENTITY,
        opacity: 1,
        crop: { left: 0, top: 0, right: 0, bottom: 0 },
        volume: { gainDb: 0, muted: false },
        fades: { in: 0, out: 0 },
      });
    } else {
      clips.push({ ...base, kind: "solid", duration, fill: { r: 1, g: 1, b: 1, a: 1 }, shape: "rect", size: { w: 1080, h: 1920 }, cornerRadius: 0, transform: IDENTITY, opacity: 1 });
    }
    cursors[t] = start + duration;
  }

  store.transaction(`Generate ${count} test clips`, () => {
    for (const track of tracks) store.dispatch(addTrack(track));
    store.dispatch(bulkAddClips(clips));
  });
}
