// Dev commands: fill the open project with generated clips for the timeline stress checks (spec
// P14: 500 clips on 8 tracks; on new video tracks clips of the project's first video at spread in
// points (filmstrips, Batch 17), else solid clips; when the project has media with sound, two of the
// tracks are audio tracks using it) and for the playback checks (a cut every second on V1, Batch 09).
// One undo step each.
import { addTrack, removeClips } from "../core/commands/basicCommands.js";
import type { Command } from "../core/commands/command.js";
import { emptyTrack, nextTrackName } from "../core/document/project.js";
import { frameToUs, secondsToFrames, usToFrameFloor } from "../core/document/time.js";
import type { Clip, Frame, MediaItem, Project, Track } from "../core/document/types.js";
import type { DocumentStore } from "../core/store/DocumentStore.js";
import { defaultTransform } from "../timeline/edit/insertMedia.js";

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
  const picture = Object.values(project.media).find((media: MediaItem) => media.kind === "video" && usToFrameFloor(media.durationUs, fps) >= 1);
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
    } else if (picture) {
      const frames = usToFrameFloor(picture.durationUs, fps);
      duration = Math.min(duration, frames);
      const from = Math.floor(random() * (frames - duration + 1));
      clips.push({
        ...base,
        kind: "video",
        duration,
        mediaId: picture.id,
        in: frameToUs(from, fps),
        out: frameToUs(from + duration, fps),
        speed: 1,
        transform: defaultTransform(picture, project.settings),
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

/**
 * Dev command for the playback checks (Batch 09 acceptance 1): replaces the clips of the first video
 * track with `clips` cuts of `seconds` each, cycling through the project's videos and taking each
 * one's next unused stretch (every source is read forward, from the start again once used up), at
 * the default Fit. One undo step. Returns the number of clips made.
 */
export function generateCutTimeline(store: DocumentStore, options: { clips?: number; seconds?: number } = {}): number {
  const project: Project = store.getState();
  const { fps } = project.settings;
  const length = Math.max(1, secondsToFrames(options.seconds ?? 1, fps));
  const track = project.tracks.find((candidate) => candidate.kind === "video");
  const videos = Object.values(project.media).filter((media) => media.kind === "video" && usToFrameFloor(media.durationUs, fps) >= length);
  if (!track || videos.length === 0) return 0;
  const used = new Map<string, Frame>();
  const clips: Clip[] = [];
  for (let i = 0; i < (options.clips ?? 60); i++) {
    const media = videos[i % videos.length] as MediaItem;
    let from = used.get(media.id) ?? 0;
    if (from + length > usToFrameFloor(media.durationUs, fps)) from = 0;
    used.set(media.id, from + length);
    clips.push({
      id: crypto.randomUUID(),
      kind: "video",
      trackId: track.id,
      name: media.name,
      start: i * length,
      duration: length,
      enabled: true,
      mediaId: media.id,
      in: frameToUs(from, fps),
      out: frameToUs(from + length, fps),
      speed: 1,
      transform: defaultTransform(media, project.settings),
      opacity: 1,
      crop: { left: 0, top: 0, right: 0, bottom: 0 },
      volume: { gainDb: 0, muted: false },
      fades: { in: 0, out: 0 },
    });
  }
  store.transaction(`Generate ${clips.length} cuts`, () => {
    if (track.clipIds.length > 0) store.dispatch(removeClips(track.clipIds));
    store.dispatch(bulkAddClips(clips));
  });
  return clips.length;
}
