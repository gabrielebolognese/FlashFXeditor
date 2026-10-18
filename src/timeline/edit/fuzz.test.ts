// Property fuzzing of the edit operations (Batch 47, spec §6.19): per area, random documents and a few
// hundred random operations from fuzzKit.ts. Every dispatch validates the document (validateProject),
// `documentChecks` runs after every operation (finite numbers, locked tracks untouched, media and
// clip kinds, speed and crop ranges), and the whole run undoes back to the original document exactly
// and redoes to the final one. Follow-ups of Batches 34-42 have their own suites.
import { describe, expect, it } from "vitest";
import { setFrameRate } from "../../core/commands/projectCommands.js";
import { convertProjectFrames } from "../../core/document/fpsConvert.js";
import { keyframeIssues } from "../../core/document/keyframes.js";
import { createProject } from "../../core/document/project.js";
import { usPerFrame } from "../../core/document/time.js";
import { isFreeze, isMediaClip, type CaptionClip, type Clip, type Project, type Rational } from "../../core/document/types.js";
import { validateProject } from "../../core/document/validate.js";
import { projectFromTemplate, sanitizeTemplate, templateFromProject } from "../../project/templates.js";
import { isClipLocked, linkGroupOf } from "../model/queries.js";
import { captionTrackOf } from "./captions.js";
import { SOLID_LIMITS } from "./solid.js";
import { setTrackFlag } from "./tracks.js";
import { MAX_GAIN_DB, MIN_GAIN_DB, volumeKeys } from "./volume.js";
import {
  documentChecks,
  FUZZ_AREAS,
  FUZZ_OPS,
  fuzzRun,
  linkOffsets,
  makeFuzzStore,
  opsOf,
  pickOp,
  random,
  randomProject,
  removeSilence,
  type FuzzOp,
  type FuzzRunOptions,
  type FuzzRunResult,
} from "./fuzzKit.js";

/** Undoes every step back to the original document, then redoes them all to the final one. */
function expectUndoRedo(result: FuzzRunResult, exactSteps = true): void {
  const { store, original, final } = result;
  let undone = 0;
  while (store.undo()) undone++;
  if (exactSteps) expect(undone).toBe(result.changed);
  expect(store.getState()).toStrictEqual(original);
  while (store.redo());
  expect(store.getState()).toStrictEqual(final);
}

/** A fuzz run, then the undo/redo round trip; the run must have changed the document. */
function property(options: FuzzRunOptions): FuzzRunResult {
  const result = fuzzRun(options);
  expect(result.changed).toBeGreaterThan(options.steps / 5);
  expectUndoRedo(result, options.undo === undefined);
  return result;
}

const changedClips = (before: Project, after: Project): Clip[] => Object.values(after.clips).filter((clip) => before.clips[clip.id] !== clip);

const BASICS = ["move.overwrite", "move.insert", "move.nudge", "trim.edge", "trim.roll", "split.clips", "delete.clips", "delete.ripple", "clipboard.duplicate"];
const named = (...names: string[]): FuzzOp[] => FUZZ_OPS.filter((candidate) => names.includes(candidate.name));

describe("solid edits (Batch 34 follow-up)", { timeout: 30_000 }, () => {
  const ops = [...opsOf("solids"), ...named("props.transform", "props.nudge", "props.quick", "props.opacity", "keys.stopwatch", "keys.value", ...BASICS)];
  for (const seed of [341, 342]) {
    it(`shape, fill, size, radius and size handles keep solids valid and whole px (seed ${seed})`, () => {
      property({
        seed,
        steps: 400,
        ops,
        check: (before, after) =>
          changedClips(before, after).flatMap((clip) => {
            if (clip.kind !== "solid") return [];
            const { w, h } = clip.size;
            const px = (value: number, limits: { min: number; max: number }) => Number.isInteger(value) && value >= limits.min && value <= limits.max;
            return px(w, SOLID_LIMITS.size) && px(h, SOLID_LIMITS.size) && px(clip.cornerRadius, SOLID_LIMITS.radius) ? [] : [`solid ${clip.id}: size ${w}x${h}, radius ${clip.cornerRadius}`];
          }),
      });
    });
  }
});

describe("keyframe edits (Batch 35 follow-up)", { timeout: 30_000 }, () => {
  const ops = [...opsOf("keyframes"), ...named("trim.stretch", "trim.edge", "trim.slip", "speed.set", "speed.duration", "speed.punchZoom", "split.clips", "props.transform", "props.opacity", "audio.gain", "audio.band", "move.overwrite", "gaps.lift")];
  for (const seed of [351, 352, 353]) {
    it(`stopwatch, add, move, delete, ease, split, speed and stretch keep keyframeIssues empty (seed ${seed})`, () => {
      property({
        seed,
        steps: 500,
        ops,
        check: (before, after) => changedClips(before, after).flatMap((clip) => ("keyframes" in clip && clip.keyframes ? keyframeIssues(clip.keyframes).map((issue) => `${clip.id}: ${issue}`) : [])),
      });
    });
  }
});

describe("transitions and fades (Batch 36 follow-up)", { timeout: 30_000 }, () => {
  const ops = [
    ...opsOf("transitions", "fades"),
    ...named("move.overwrite", "move.insert", "move.duplicate", "move.nudge", "trim.edge", "trim.roll", "trim.slip", "trim.slide", "trim.stretch", "split.clips", "delete.clips", "delete.ripple", "speed.set", "speed.duration", "speed.freeze", "clipboard.duplicate", "clipboard.paste", "gaps.extract"),
  ];
  for (const seed of [361, 362]) {
    it(`moves, trims, rolls, slips, slides, splits, deletes, speed and duplicates keep every transition valid (seed ${seed})`, () => {
      const result = property({ seed, steps: 600, ops });
      expect(result.names.get("transitions.add")).toBeGreaterThan(10);
    });
  }
});

describe("audio edits (Batch 37 follow-up)", { timeout: 30_000 }, () => {
  const ops = [...opsOf("audio"), ...named("keys.stopwatch", "keys.add", "keys.move", "keys.delete", "keys.value", "split.clips", "trim.edge", "trim.slip", "trim.stretch", "speed.set", "move.overwrite", "fades.set")];
  for (const seed of [371, 372]) {
    it(`gain, mute, band drags, normalize, auto-duck, detach and splits or trims of keyed audio stay valid (seed ${seed})`, () => {
      property({
        seed,
        steps: 500,
        ops,
        check: (before, after) =>
          changedClips(before, after).flatMap((clip) => {
            if (clip.kind !== "audio") return [];
            const gains = [clip.volume.gainDb, ...volumeKeys(clip).map((key) => key.value)];
            return gains.every((db) => db >= MIN_GAIN_DB && db <= MAX_GAIN_DB) ? [] : [`audio ${clip.id}: gains ${gains.join(", ")} outside ${MIN_GAIN_DB}..${MAX_GAIN_DB} dB`];
          }),
      });
    });
  }
});

describe("Remove silence (Batch 38 follow-up)", { timeout: 30_000 }, () => {
  const others = named("trim.edge", "speed.set", "keys.value", "keys.add", "fades.set", "transitions.add", "move.overwrite", "split.clips", "audio.detach", "links.toggle");
  for (const seed of [381, 382, 383]) {
    it(`random silences on linked groups with J/L cuts, speeds, keys, fades and transitions keep the document valid and the groups in sync (seed ${seed})`, () => {
      const rng = random(seed);
      const fuzz = makeFuzzStore(randomProject(rng));
      const { store, ctx } = fuzz;
      let changed = 0;
      let removals = 0;
      for (let step = 0; step < 300; step++) {
        const before = store.getState();
        let name = "silence.remove";
        let run: ReturnType<typeof removeSilence> = null;
        if (rng.chance(0.6)) {
          // One link group (or one clip) at a time: the cut's own tracks then close the same gaps. A
          // selection with more targets can close more on one of a group's tracks before it (gaps.ts:
          // each track closes its own gaps), which puts that group out of sync, as Ripple delete does.
          const sounding = Object.values(before.clips).filter((clip) => (clip.kind === "audio" || clip.kind === "video") && !isClipLocked(before, clip.id));
          if (sounding.length > 0) run = removeSilence(store, rng, ctx, linkGroupOf(before, rng.pick(sounding).id));
        } else {
          const chosen = pickOp(rng, others);
          name = chosen.name;
          chosen.run(store, rng, ctx);
        }
        const after = store.getState();
        if (after === before) continue;
        changed++;
        expect(documentChecks(before, after, name), `step ${step} ${name}`).toEqual([]);
        if (!run) continue;
        removals++;
        // Each piece of a cut group plays with its partners as the member it comes from did (the
        // module's guarantee: every track of the group closes the same gaps). Other link groups follow
        // the ripple's rules (gaps.ts): a passive clip moves by what closed before its start, a locked
        // one not at all, so they may come out of sync.
        const was = linkOffsets(before);
        const now = linkOffsets(after);
        for (const [id, pieces] of run.pieces) {
          if (!was.has(id)) continue;
          for (const piece of pieces) if (now.has(piece)) expect(now.get(piece), `step ${step}: ${piece} (from ${id}) sync offset`).toBe(was.get(id));
        }
      }
      expect(removals).toBeGreaterThan(10);
      expectUndoRedo({ ...fuzz, final: structuredClone(store.getState()), changed, areas: new Map(), names: new Map() });
    });
  }
});

describe("copy, cut, paste, paste insert, duplicate and paste attributes (Batch 39 follow-up)", { timeout: 30_000 }, () => {
  const ops = [...opsOf("clipboard"), ...named("move.overwrite", "split.clips", "transitions.add", "keys.add", "keys.value", "captions.add", "links.group", "links.toggle", "delete.clips", "fades.set", "speed.set")];
  for (const seed of [391, 393]) {
    it(`sequences with links, groups, transitions, cues, keys and other projects' payloads stay valid (seed ${seed})`, () => {
      const result = property({ seed, steps: 500, ops });
      expect((result.names.get("clipboard.paste") ?? 0) + (result.names.get("clipboard.pasteInsert") ?? 0)).toBeGreaterThan(15);
    });
  }
});

describe("bins, remove, relink (Batch 41 follow-up)", { timeout: 30_000 }, () => {
  const ops = [...opsOf("media"), ...named("move.dropMediaClips", "move.mediaDrop", "clipboard.paste", "delete.clips", "split.clips", "trim.edge", "transitions.add")];
  for (const seed of [411, 412]) {
    it(`bin, remove (keep or delete clips), relink and undo sequences keep the document valid (seed ${seed})`, () => {
      property({ seed, steps: 500, ops, undo: 0.15, redo: 0.1 });
    });
  }
});

describe("frame rates and templates (Batch 42 follow-up)", { timeout: 30_000 }, () => {
  const RATES: Rational[] = [
    { num: 24000, den: 1001 },
    { num: 24, den: 1 },
    { num: 25, den: 1 },
    { num: 30000, den: 1001 },
    { num: 50, den: 1 },
    { num: 60000, den: 1001 },
    { num: 60, den: 1 },
    { num: 120, den: 1 },
    { num: 15, den: 1 },
  ];
  /** The document's clips with the `out` of `ids` left out, and the rest of it. */
  const withoutOuts = (p: Project, ids: ReadonlySet<string>) => ({ ...p, clips: Object.values(p.clips).map((clip) => (ids.has(clip.id) ? { ...clip, out: 0 } : clip)) });
  for (const seed of [421, 422, 423, 424, 425, 426]) {
    it(`random documents stay valid at every rate, 30 -> 60 -> 30 gives them back, and their templates make valid projects (seed ${seed})`, () => {
      const run = fuzzRun({ seed, steps: 250 });
      const doc = run.final;
      // A source range more than half a frame off the 30 fps grid (valid at 30 fps: clips pasted from
      // 25 or 60 fps projects) is more than a frame off at 60 fps: fpsConvert.ts `fitSource` then
      // makes `out` follow the new duration, so those clips come back with another `out`. So does an
      // offline freeze frame (its `out` clamped to a media end no longer known).
      const fps30 = usPerFrame(doc.settings.fps);
      const offGrid = new Set(
        Object.values(doc.clips)
          .filter((clip) => isMediaClip(clip) && (isFreeze(clip) ? !doc.media[clip.mediaId] : Math.abs(clip.out - clip.in - clip.duration * clip.speed * fps30) >= (clip.speed * fps30) / 2 - 1e-6))
          .map((clip) => clip.id),
      );
      for (const fps of RATES) {
        const { store } = makeFuzzStore(doc);
        store.dispatch(setFrameRate(fps));
        expect(documentChecks(doc, store.getState(), "project.setFrameRate"), `${fps.num}/${fps.den}`).toEqual([]);
      }
      // There and back through the command (the store reconciles transitions), and through the conversion alone.
      const { store } = makeFuzzStore(doc);
      store.dispatch(setFrameRate({ num: 60, den: 1 }));
      store.dispatch(setFrameRate({ num: 30, den: 1 }));
      expect(withoutOuts(store.getState(), offGrid)).toStrictEqual(withoutOuts(doc, offGrid));
      if (offGrid.size === 0) expect(store.getState()).toStrictEqual(doc);
      const plain = structuredClone(doc);
      convertProjectFrames(plain, { num: 60, den: 1 });
      expect(validateProject(plain)).toEqual([]);
      convertProjectFrames(plain, { num: 30, den: 1 });
      expect(withoutOuts(plain, offGrid)).toStrictEqual(withoutOuts(doc, offGrid));

      let n = 0;
      const template = templateFromProject(doc, [], { id: `t${seed}`, name: doc.name, now: "2026-10-18T00:00:00.000Z" });
      const made = projectFromTemplate(template, createProject({ id: "new", name: "New", now: "now", appVersion: "test" }), () => `n${++n}`);
      expect(validateProject(made)).toEqual([]);
      expect(made.tracks.map((track) => [track.kind, track.name, track.locked])).toEqual(doc.tracks.map((track) => [track.kind, track.name, track.locked]));
      expect(sanitizeTemplate(JSON.parse(JSON.stringify(template)), "now")).toStrictEqual(template);
    });
  }
});

describe("locked tracks", { timeout: 30_000 }, () => {
  // Every operation but the lock switches (they would unlock the tracks) and Remove media's "delete
  // clips", which removes clips on every track by design (Batch 41).
  const ops = FUZZ_OPS.filter((candidate) => !["tracks.flag", "tracks.lockAll", "media.removeDelete"].includes(candidate.name));
  for (const seed of [471, 472]) {
    it(`across random operations of every area, clips on locked tracks never change (seed ${seed})`, () => {
      const rng = random(seed);
      const project = randomProject(rng, { locks: "many" });
      const locked = project.tracks.filter((track) => track.locked && track.clipIds.length > 0);
      expect(locked.length).toBeGreaterThan(0);
      const result = property({ seed, steps: 600, ops, project });
      // The locked clips are still there, the same objects as at the start (documentChecks after every step).
      for (const track of locked) {
        const now = result.final.tracks.find((candidate) => candidate.id === track.id);
        if (now?.locked) expect(now.clipIds).toEqual(track.clipIds);
      }
      expect(new Set(result.areas.keys())).toEqual(new Set(FUZZ_AREAS));
    });
  }
});

describe("captions", { timeout: 30_000 }, () => {
  const lockCaptions: FuzzOp = {
    name: "tracks.flag",
    area: "tracks",
    run(store, rng) {
      const track = captionTrackOf(store.getState());
      const command = track ? setTrackFlag(store.getState(), [track.id], "locked", rng.chance(0.5)) : null;
      if (command) store.dispatch(command);
      return command !== null;
    },
  };
  const ops = [...opsOf("captions"), lockCaptions, ...named("move.overwrite", "move.insert", "move.duplicate", "trim.edge", "split.clips", "delete.clips", "delete.ripple", "gaps.extract", "gaps.compact", "clipboard.paste", "clipboard.pasteInsert", "clipboard.cut", "speed.freeze", "tracks.addCaption")];
  for (const seed of [101, 102]) {
    it(`cue operations never overlap cues and respect a locked caption track (seed ${seed})`, () => {
      let lockedSteps = 0;
      property({
        seed,
        steps: 500,
        ops,
        projectOptions: { captions: true },
        check: (before, after, op) => {
          const issues: string[] = [];
          const track = captionTrackOf(after);
          if (!track) return issues;
          const cues = track.clipIds.map((id) => after.clips[id] as CaptionClip);
          cues.forEach((cue, i) => {
            const next = cues[i + 1];
            if (cue.kind !== "caption") issues.push(`${cue.id} on the caption track is a ${cue.kind} clip`);
            if (next && next.start < cue.start + cue.duration) issues.push(`cues ${cue.id} and ${next.id} overlap`);
          });
          const was = captionTrackOf(before);
          if (was?.locked && track.locked && op.name !== "tracks.flag") {
            lockedSteps++;
            if (track.clipIds !== was.clipIds || track.clipIds.some((id) => before.clips[id] !== after.clips[id])) issues.push(`the locked caption track changed in ${op.name}`);
          }
          return issues;
        },
      });
      expect(lockedSteps).toBeGreaterThan(0);
    });
  }
});

describe("mixed operations with undo and redo", { timeout: 30_000 }, () => {
  for (const seed of [9001, 9002]) {
    it(`interleaved undo and redo keep every invariant and undo back to the original (seed ${seed})`, () => {
      const result = property({ seed, steps: 800, undo: 0.12, redo: 0.08 });
      expect(validateProject(result.final)).toEqual([]);
    });
  }
});

describe("random documents", () => {
  it("are valid, varied and deterministic", () => {
    const a = randomProject(random(5));
    expect(validateProject(a)).toEqual([]);
    expect(documentChecks(null, a, "start")).toEqual([]);
    expect(randomProject(random(5))).toStrictEqual(a);
    const kinds = new Set<string>();
    let transitions = 0;
    let keyed = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const project = randomProject(random(seed));
      for (const clip of Object.values(project.clips)) {
        kinds.add(clip.kind);
        if ("transitionOut" in clip && clip.transitionOut) transitions++;
        if ("keyframes" in clip && clip.keyframes) keyed++;
      }
    }
    expect([...kinds].sort()).toEqual(["audio", "caption", "image", "solid", "text", "video"]);
    expect(transitions).toBeGreaterThan(5);
    expect(keyed).toBeGreaterThan(5);
  });
});

