// The project of fixtures/interop/full (Batch 82, spec §21.1): one external project that uses every capability,
// 1080 x 1920 at 30 fps. It is not drawn by hand: it is the other interop fixtures joined one after the other
// on the timeline (a part per fixture, one second or two each, `FULL_PARTS`), so it can never fall behind them.
// - A part with the master's size and rate (1080 x 1920 at 30 fps) is merged as it is: its tracks, clips,
//   caption tracks, media and markers move in time and get a prefix on every id.
// - Any other part (smaller sizes, 60 fps Lottie) becomes a compound clip of its own sequence, scaled to fit:
//   every clip kind, effect, mask and template inside it is the fixture's own.
// Shared by the fixture test (which checks the committed project.json against this build) and the writer
// (`WRITE_FULL_FIXTURE=1 npx vitest run src/core/document/fullFixture.test.ts`), which also copies the media.
import { migrateProject } from "../../project/projectFile.js";
import { makeCompoundClip } from "./fixtures.js";
import { createProject, emptyTrack } from "./project.js";
import { SCHEMA_VERSION } from "./types.js";
import type { Clip, CompoundClip, MediaItem, Project, Sequence, Track } from "./types.js";

export const FULL_FIXTURE_SIZE = { width: 1080, height: 1920 } as const;
export const FULL_FIXTURE_FPS = 30;
/** The parts in timeline order (a folder of fixtures/interop each). */
export const FULL_PARTS = [
  "basic", "styles", "keyframes", "shapes", "captions-v2", "every", "compound", "alpha",
  "transitions", "compositing", "masks", "effects-1", "effects-2", "effects-3", "time", "audio", "templates",
  "kinetic", "spans", "rig", "svg", "card", "deck", "lottie",
] as const;
export type FullPart = (typeof FULL_PARTS)[number];

/** What the writer copies: `from` is a path in the part's folder, `to` in the full folder; `dir`: a whole folder (an image sequence). */
export interface FullAsset {
  part: string;
  from: string;
  to: string;
  dir: boolean;
}

export interface FullPartInput {
  name: string;
  /** The part's committed project.json. */
  project: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  /** The fixture folder the part's media files are in, when not its own. */
  assetsFrom?: string;
}

export interface FullBuild {
  project: Project;
  assets: FullAsset[];
  /** Where each part starts on the timeline and how long it is (frames at 30 fps). */
  spans: Record<string, { start: number; duration: number }>;
}

/** The one part whose caption track is kept, and the parts whose cues join it. */
const CAPTIONS_PART = "captions-v2";
const CAPTIONS_JOIN: ReadonlySet<string> = new Set(["every"]);
const SEQUENCE_PREFIX = "part-";

type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** The ids a part defines (tracks, clips, media, sequences, bins, markers): all get the part's prefix. */
function collectIds(project: Json): Set<string> {
  const ids = new Set<string>();
  for (const key of Object.keys(project.clips ?? {})) ids.add(key);
  for (const key of Object.keys(project.media ?? {})) ids.add(key);
  for (const key of Object.keys(project.sequences ?? {})) ids.add(key);
  for (const track of project.tracks ?? []) ids.add(track.id);
  for (const sequence of Object.values<Json>(project.sequences ?? {})) for (const track of sequence.tracks) ids.add(track.id);
  for (const bin of project.bins ?? []) ids.add(bin.id);
  for (const marker of project.markers ?? []) ids.add(marker.id);
  return ids;
}

/** Fields whose string (or array of strings, for `clipIds`) is a reference to an id. */
const REF_KEYS: ReadonlySet<string> = new Set(["clipIds", "trackId", "mediaId", "binId", "clipId", "sequenceId", "parentId"]);
/** Arrays whose entries carry an `id` of their own: tracks, bins and markers. */
const ID_LISTS: ReadonlySet<string> = new Set(["tracks", "bins", "markers"]);
/** The records keyed by id. */
const RECORD_KEYS: ReadonlySet<string> = new Set(["clips", "media", "sequences", "captionTracks"]);

/** Every reference to one of `ids` (by field, see REF_KEYS) and every record key, prefixed. */
function prefixIds(value: Json, ids: ReadonlySet<string>, prefix: string, key = "", inRecord = false, owned = false): Json {
  const pre = (id: string) => (ids.has(id) ? prefix + id : id);
  if (typeof value === "string") return REF_KEYS.has(key) ? pre(value) : value;
  if (Array.isArray(value)) return value.map((item) => prefixIds(item, ids, prefix, key, false, ID_LISTS.has(key)));
  if (value && typeof value === "object") {
    const out = Object.fromEntries(Object.entries(value).map(([k, item]) => [inRecord ? pre(k) : k, prefixIds(item, ids, prefix, inRecord ? "" : k, !inRecord && RECORD_KEYS.has(k), inRecord)]));
    // The `id` of a record entry, a track, a bin or a marker (any other `id`, a path's or an effect's, stays).
    if ((inRecord || owned) && typeof out.id === "string") out.id = pre(out.id);
    return out;
  }
  return value;
}

/** The last frame any clip on the part's own tracks reaches. */
function partEnd(project: Json): number {
  let end = 1;
  for (const track of project.tracks as Track[]) for (const id of track.clipIds) {
    const clip = project.clips[id] as Clip;
    end = Math.max(end, clip.start + clip.duration);
  }
  return end;
}

/** `contentKey(part, relPath)`: a hash of the file (the same file in several parts is copied once), or undefined. */
export function buildFullFixture(inputs: readonly FullPartInput[], contentKey: (part: string, relPath: string) => string | undefined = () => undefined): FullBuild {
  const project = createProject({ id: "c3a9f0e4-5d27-4b81-8e6a-1f94b2d70c35", name: "Interop full", now: "2026-11-10T12:00:00.000Z", appVersion: "1.2.0" });
  project.settings = { ...project.settings, ...FULL_FIXTURE_SIZE, fps: { num: FULL_FIXTURE_FPS, den: 1 }, background: { r: 0.05, g: 0.05, b: 0.07, a: 1 } };
  project.meta.generator = { name: "interop-fixture", version: "1", source: "fixtures/interop/full (Batch 82)" };

  const video: Track[] = [];
  const audio: Track[] = [];
  const wrapperTrack = emptyTrack("parts", "video", "Parts");
  const assets = new Map<string, FullAsset>();
  const spans: FullBuild["spans"] = {};
  let cursor = 0;

  for (const input of inputs) {
    const prefix = `${input.name}-`;
    const raw = migrateProject(input.project) as Json;
    const fps = raw.settings.fps.num / raw.settings.fps.den;
    // Another rate: every frame count of the part's own tracks is converted (the Lottie part has no keyframes).
    const scale = FULL_FIXTURE_FPS / fps;
    const size0 = raw.settings;
    const part = prefixIds(raw, collectIds(raw), prefix) as Json;
    if (scale !== 1) {
      const frames = (track: Track) => {
        for (const id of track.clipIds) {
          const clip = part.clips[id];
          clip.start = Math.round(clip.start * scale);
          clip.duration = Math.max(1, Math.round(clip.duration * scale));
        }
      };
      for (const track of part.tracks) frames(track);
    }
    // A media parameter holds a media id, which the prefix moved.
    for (const sequence of Object.values<Sequence>(part.sequences)) {
      for (const param of sequence.params ?? []) if (param.kind === "media" && typeof param.default === "string") param.default = prefix + param.default;
    }
    for (const clip of Object.values<Json>(part.clips)) {
      if (clip.kind !== "compound" || !clip.params) continue;
      for (const param of part.sequences[clip.sequenceId]?.params ?? []) if (param.kind === "media" && typeof clip.params[param.id] === "string") clip.params[param.id] = prefix + clip.params[param.id];
    }
    // The project-wide loudness target of a part (the audio one) becomes the master's.
    if (size0.loudness && !project.settings.loudness) project.settings.loudness = size0.loudness;
    const duration = partEnd(part);
    const size = part.settings;
    const direct = size.width === FULL_FIXTURE_SIZE.width && size.height === FULL_FIXTURE_SIZE.height && scale === 1;

    // Media: files move under `media/` (one copy of a file shared by several parts).
    for (const item of Object.values<MediaItem>(part.media)) {
      const file = item.file as { relPath: string };
      const original = file.relPath;
      const sequence = (item as Json).sequence as { dir: string } | undefined;
      const source = input.assetsFrom ?? input.name;
      const key = sequence ? undefined : contentKey(source, original);
      const base = original.split("/").pop() as string;
      const to = sequence ? `media/${input.name}/${original.slice("media/".length)}` : key ? `media/${key.slice(0, 8)}-${base}` : `media/${input.name}/${base}`;
      if (sequence) {
        const dirTo = `media/${input.name}/${sequence.dir.slice("media/".length)}`;
        assets.set(dirTo, { part: source, from: sequence.dir, to: dirTo, dir: true });
        sequence.dir = dirTo;
      } else {
        assets.set(to, { part: source, from: original, to, dir: false });
      }
      file.relPath = to;
    }
    Object.assign(project.media, part.media);
    for (const bin of part.bins) project.bins.push(bin);

    if (direct) {
      const offset = cursor;
      for (const id of Object.keys(part.clips)) part.clips[id].start += offset;
      // Inner clips of the part's own sequences keep their times (they are relative to the compound); only the part's track clips move.
      // (`start` of an inner clip was moved above too: put it back.)
      for (const sequence of Object.values<Sequence>(part.sequences)) {
        for (const track of sequence.tracks) for (const id of track.clipIds) part.clips[id].start -= offset;
      }
      // A project has one caption track at most (strict validation): only the captions part keeps its own.
      const keepCaptions = input.name === CAPTIONS_PART;
      for (const track of part.tracks as Track[]) {
        if (track.kind === "caption" && !keepCaptions) {
          const keeper = project.captionTracks[`${CAPTIONS_PART}-cc1`] ? video.find((t) => t.id === `${CAPTIONS_PART}-cc1`) : undefined;
          for (const id of track.clipIds) {
            if (keeper && CAPTIONS_JOIN.has(input.name)) {
              part.clips[id].trackId = keeper.id;
              keeper.clipIds.push(id);
            } else delete part.clips[id];
          }
          continue;
        }
        (track.kind === "audio" ? audio : video).push(track);
      }
      if (keepCaptions) Object.assign(project.captionTracks, part.captionTracks);
      for (const marker of part.markers) project.markers.push({ ...marker, frame: marker.frame + offset });
    } else {
      const sequenceId = `${SEQUENCE_PREFIX}${input.name}`;
      const sequence: Sequence = {
        id: sequenceId,
        name: input.name,
        size: { w: size.width, h: size.height },
        duration,
        background: size.background,
        tracks: part.tracks,
        ...(size.perspective !== undefined && { perspective: size.perspective }),
      };
      project.sequences[sequenceId] = sequence;
      const fit = Math.min(FULL_FIXTURE_SIZE.width / size.width, FULL_FIXTURE_SIZE.height / size.height);
      const clip: CompoundClip = {
        ...makeCompoundClip({ id: `${input.name}-compound`, trackId: wrapperTrack.id, start: cursor, duration, sequenceId }),
        name: input.name,
        transform: { x: 0, y: 0, scale: fit, rotation: 0, anchor: { x: 0.5, y: 0.5 }, flipH: false, flipV: false },
      };
      project.clips[clip.id] = clip;
      wrapperTrack.clipIds.push(clip.id);
    }
    // The part's other sequences (compounds and templates inside it) and every clip, inner ones too.
    for (const [id, sequence] of Object.entries<Sequence>(part.sequences)) project.sequences[id] = sequence;
    for (const [id, clip] of Object.entries<Clip>(part.clips)) project.clips[id] = clip;
    spans[input.name] = { start: cursor, duration };
    cursor += duration;
  }

  // Video tracks (bottom first) then audio. The parts' audio tracks come after every video track.
  project.tracks = [wrapperTrack, ...video, ...audio];
  // Caption tracks sit above the video tracks (spec §10.5): move them there.
  const captionTracks = project.tracks.filter((track) => track.kind === "caption");
  project.tracks = [...project.tracks.filter((track) => track.kind === "video"), ...captionTracks, ...project.tracks.filter((track) => track.kind === "audio")];
  project.schemaVersion = SCHEMA_VERSION;
  return { project, assets: [...assets.values()], spans };
}
