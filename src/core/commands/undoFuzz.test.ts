// 1,000 random raw operations, validated after every step, then undone back to the original
// document and redone to the final one.
import { describe, expect, it } from "vitest";
import { gapAt, neighbors, trackEnd, trackGaps } from "../../timeline/model/queries.js";
import { makeMedia, makeMediaClip, makeProject, makeSolidClip, makeTrack } from "../document/fixtures.js";
import { frameToUs } from "../document/time.js";
import { isMediaClip, type Clip, type Project, type Track } from "../document/types.js";
import { validateProject } from "../document/validate.js";
import { DocumentStore } from "../store/DocumentStore.js";
import { createSessionStore } from "../store/sessionStore.js";
import { addClip, addTrack, removeClips, removeTrack, updateClip } from "./basicCommands.js";
import type { Command } from "./command.js";

/** Deterministic PRNG (mulberry32). */
function random(seed: number) {
  let state = seed;
  const next = () => {
    state = (state + 1831565813) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  const pick = <T>(items: readonly T[]): T => items[int(0, items.length - 1)] as T;
  return { next, int, pick };
}

type Rng = ReturnType<typeof random>;

/** A free start for `duration` frames on `track`: inside a large enough gap or after the last clip. */
function freeStart(rng: Rng, project: Project, track: Track, duration: number): number {
  const gaps = trackGaps(project, track.id).filter((gap) => gap.end - gap.start >= duration);
  if (gaps.length > 0 && rng.next() < 0.5) {
    const gap = rng.pick(gaps);
    return rng.int(gap.start, gap.end - duration);
  }
  return trackEnd(project, track.id) + rng.int(0, 30);
}

function newClip(rng: Rng, project: Project, track: Track, id: string): Clip {
  const duration = rng.int(1, 90);
  const start = freeStart(rng, project, track, duration);
  if (track.kind === "video" && rng.next() < 0.3) return makeSolidClip({ id, trackId: track.id, start, duration });
  return makeMediaClip(project, { id, trackId: track.id, start, duration, mediaId: "m1", kind: track.kind === "audio" ? "audio" : "video" });
}

function updateOp(rng: Rng, project: Project, clip: Clip): Command {
  const roll = rng.next();
  if (roll < 0.25) return updateClip(clip.id, { name: `n${rng.int(0, 1e6)}` });
  if (roll < 0.4) return updateClip(clip.id, { enabled: !clip.enabled });
  if (roll < 0.7) {
    // Move: to a free spot on a compatible track (possibly the same one).
    const kind = project.tracks.find((t) => t.id === clip.trackId)?.kind;
    const target = rng.pick(project.tracks.filter((t) => t.kind === kind));
    return updateClip(clip.id, { trackId: target.id, start: freeStart(rng, project, target, clip.duration) });
  }
  // Trim the tail: anywhere from 1 frame up to the next clip.
  const next = neighbors(project, clip.id).next;
  const duration = rng.int(1, next ? next.start - clip.start : clip.duration + 60);
  if (!isMediaClip(clip)) return updateClip(clip.id, { duration });
  return updateClip(clip.id, { duration, out: clip.in + frameToUs(duration, project.settings.fps) });
}

function randomOp(rng: Rng, project: Project, n: number): Command {
  const tracks = project.tracks;
  const clipIds = Object.keys(project.clips);
  const roll = rng.next();
  if (tracks.length < 2 || (roll < 0.06 && tracks.length < 8)) return addTrack(makeTrack(`t${n}`, rng.next() < 0.6 ? "video" : "audio"));
  if (roll < 0.09 && tracks.length > 2) return removeTrack(rng.pick(tracks).id);
  if (roll < 0.5 || clipIds.length === 0) return addClip(newClip(rng, project, rng.pick(tracks), `k${n}`));
  if (roll < 0.62) return removeClips([rng.pick(clipIds), rng.pick(clipIds)]);
  return updateOp(rng, project, project.clips[rng.pick(clipIds)] as Clip);
}

function setup() {
  const project = makeProject();
  project.media.m1 = makeMedia("m1");
  project.tracks.push(makeTrack("v1"), makeTrack("a1", "audio"));
  const original = structuredClone(project);
  const store = new DocumentStore(project, { session: createSessionStore(), validate: true });
  return { store, original };
}

describe("undo/redo fuzz", () => {
  for (const seed of [1, 7, 2026]) {
    it(`undoes 1,000 random raw operations back to the original document (seed ${seed})`, () => {
      const rng = random(seed);
      const { store, original } = setup();
      let steps = 0;
      for (let n = 0; n < 1000; n++) {
        const before = store.getState();
        store.dispatch(randomOp(rng, before, n)); // dev validation throws on any broken invariant
        if (store.getState() !== before) steps++;
      }
      const final = structuredClone(store.getState());
      expect(Object.keys(final.clips).length).toBeGreaterThan(20);

      let undone = 0;
      while (store.undo()) {
        undone++;
        if (undone % 50 === 0) expect(validateProject(store.getState())).toEqual([]);
      }
      expect(undone).toBe(steps);
      expect(store.getState()).toStrictEqual(original);

      while (store.redo());
      expect(store.getState()).toStrictEqual(final);
    });
  }

  it("keeps invariants while operations, undos and redos interleave", () => {
    const rng = random(99);
    const { store, original } = setup();
    for (let n = 0; n < 1000; n++) {
      const roll = rng.next();
      if (roll < 0.15) store.undo();
      else if (roll < 0.25) store.redo();
      else store.dispatch(randomOp(rng, store.getState(), n));
    }
    expect(validateProject(store.getState())).toEqual([]);
    while (store.undo());
    expect(store.getState()).toStrictEqual(original);
  });

  it("fixture sanity: gapAt agrees with clip placement", () => {
    const { store } = setup();
    const rng = random(3);
    for (let n = 0; n < 200; n++) store.dispatch(randomOp(rng, store.getState(), n));
    const project = store.getState();
    for (const track of project.tracks) {
      for (const gap of trackGaps(project, track.id)) expect(gapAt(project, track.id, gap.start)).toEqual(gap);
    }
  });
});
