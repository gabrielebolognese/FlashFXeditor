import { describe, expect, it } from "vitest";
import { makeMedia, makeProject, makeSolidClip, makeTextClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { Project } from "../../core/document/types.js";
import { validateProject } from "../../core/document/validate.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createSessionStore } from "../../core/store/sessionStore.js";
import { breakApart, makeCompound, makeUnique } from "./compound.js";
import { duplicateClips } from "./duplicate.js";
import { planSlip, planTrim, resolveTrim } from "./trim.js";

// A seeded stream (mulberry32): the same seed always runs the same operations.
function stream(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function start(): Project {
  const p = makeProject();
  p.media.m = makeMedia("m");
  p.tracks.push(makeTrack("v1"), makeTrack("v2"), makeTrack("v3"));
  return withClips(p, [
    makeSolidClip({ id: "a", trackId: "v1", start: 0, duration: 30 }),
    makeSolidClip({ id: "b", trackId: "v1", start: 30, duration: 30 }),
    makeTextClip({ id: "c", trackId: "v2", start: 10, duration: 40 }),
    makeSolidClip({ id: "d", trackId: "v3", start: 70, duration: 20 }),
  ]);
}

describe("compound fuzz (spec §21.10)", () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    it(`keeps the document valid through random make, break apart, make unique, duplicate, trim and slip, and undoes all of it (seed ${seed})`, () => {
      const random = stream(seed);
      let n = 0;
      const newId = () => `f${seed}-${++n}`;
      const initial = start();
      const doc = new DocumentStore(initial, { session: createSessionStore(), validate: true });
      let applied = 0;
      for (let step = 0; step < 60; step++) {
        const project = doc.getState();
        const clips = Object.values(project.clips).filter((clip) => project.tracks.some((track) => track.id === clip.trackId));
        if (clips.length === 0) break;
        const pick = () => clips[Math.floor(random() * clips.length)]!;
        const op = Math.floor(random() * 6);
        let command = null;
        if (op === 0) {
          const first = pick();
          const second = pick();
          command = makeCompound(project, first === second ? [first.id] : [first.id, second.id], newId)?.command ?? null;
        } else if (op === 1) {
          const compounds = clips.filter((clip) => clip.kind === "compound");
          if (compounds.length > 0) command = breakApart(project, compounds[Math.floor(random() * compounds.length)]!.id, newId);
        } else if (op === 2) {
          const compounds = clips.filter((clip) => clip.kind === "compound");
          if (compounds.length > 0) command = makeUnique(project, compounds[Math.floor(random() * compounds.length)]!.id, newId);
        } else if (op === 3) {
          const compounds = clips.filter((clip) => clip.kind === "compound");
          if (compounds.length > 0) {
            // An instance of the same sequence, placed after the original.
            command = duplicateClips(project, [compounds[Math.floor(random() * compounds.length)]!.id], newId)?.command ?? null;
          }
        } else if (op === 4) {
          const compounds = clips.filter((clip) => clip.kind === "compound");
          if (compounds.length > 0) {
            const plan = planTrim(project, [compounds[Math.floor(random() * compounds.length)]!.id], random() < 0.5 ? "in" : "out", { ripple: false, linked: false });
            const delta = Math.round(plan.lo.value + (plan.hi.value - plan.lo.value) * random());
            command = resolveTrim(plan, delta).command;
          }
        } else {
          const compounds = clips.filter((clip) => clip.kind === "compound");
          if (compounds.length > 0) {
            const plan = planSlip(project, compounds[Math.floor(random() * compounds.length)]!.id);
            const delta = Math.round(plan.lo.value + (plan.hi.value - plan.lo.value) * random());
            command = resolveTrim(plan, delta).command;
          }
        }
        if (!command) continue;
        const before = doc.getState();
        try {
          doc.dispatch(command);
        } catch {
          // A refusal (the store validates): nothing changed.
          expect(doc.getState()).toBe(before);
          continue;
        }
        applied += 1;
        expect(validateProject(doc.getState()), `seed ${seed} step ${step} op ${op}`).toEqual([]);
      }
      expect(applied).toBeGreaterThan(0);
      for (let i = 0; i < applied; i++) doc.undo();
      expect(doc.getState()).toStrictEqual(initial);
    });
  }
});
