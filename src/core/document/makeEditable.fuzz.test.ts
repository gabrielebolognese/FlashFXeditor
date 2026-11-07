// Property check for Make editable (spec §21.5, extends Batch 47's property tests): on random projects, with the
// fuzz kit's unknown-kind stand-ins plus solids turned into convertible stand-ins (some with a head trim),
// `convertAll` converts exactly the convertible ones, keeps the others byte for byte, never breaks the
// document invariants and never moves a clip.
import { describe, expect, it } from "vitest";
import { random, randomProject } from "../../timeline/edit/fuzzKit.js";
import { convertAll, standIns } from "./makeEditable.js";
import type { Clip, Project } from "./types.js";
import { validateProject } from "./validate.js";

const idHash = (id: string): number => [...id].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 11);

function withConvertibleSolids(project: Project): { project: Project; ids: string[] } {
  const ids: string[] = [];
  const clips = Object.fromEntries(
    Object.entries(project.clips).map(([id, clip]) => {
      if (clip.kind !== "solid" || clip.fallbackOf !== undefined) return [id, clip];
      const hash = idHash(id);
      const headTrim = hash % 3 === 0 ? 1 + (hash % Math.max(1, clip.duration - 1)) : 0;
      // A head trim reaches back before the stand-in's start: only when there is room.
      if (headTrim > clip.start) return [id, clip];
      ids.push(id);
      const data = { kind: "solid", fill: { r: (hash % 10) / 10, g: 0.4, b: 0.6 }, size: { w: 100 + (hash % 300), h: 100 + (hash % 200) }, opacity: 0.5 };
      return [id, { ...clip, fallbackOf: { kind: "solid", reason: "fuzz", schemaVersion: 4, ...(headTrim > 0 && { headTrim }), data } } as Clip];
    }),
  );
  return { project: { ...project, clips }, ids };
}

describe("convertAll on random projects", () => {
  for (const seed of [11, 12, 13, 14, 15]) {
    it(`seed ${seed}: converts the convertible stand-ins, keeps the rest and the invariants`, () => {
      const base = randomProject(random(seed), { id: `p${seed}`, idPrefix: `s${seed}_`, locks: "none", captions: true });
      const { project, ids } = withConvertibleSolids(base);
      const before = standIns(project).length;
      const result = convertAll(project, { now: "2026-11-07T08:00:00.000Z", appVersion: "test" });
      expect(result.converted.sort()).toEqual([...ids].sort());
      expect(standIns(result.project).length).toBe(before - ids.length);
      for (const entry of result.remaining) expect(entry.reason).toContain("no \"lottie\" clip");
      expect(validateProject(result.project)).toEqual(validateProject(project));
      for (const [id, clip] of Object.entries(project.clips)) {
        const now = result.project.clips[id] as Clip;
        expect(now.trackId).toBe(clip.trackId);
        if (ids.includes(id)) {
          expect(now.fallbackOf).toBeUndefined();
          // Never moved: the stand-in's own frames are the native clip's.
          expect([now.start, now.duration]).toEqual([clip.start, clip.duration]);
        } else expect(now).toBe(clip);
      }
    });
  }
});

describe("the random projects exercise the conversion", () => {
  it("hold convertible solids in several seeds", () => {
    const counts = [11, 12, 13, 14, 15].map((seed) => withConvertibleSolids(randomProject(random(seed), { id: `p${seed}`, idPrefix: `s${seed}_`, locks: "none", captions: true })).ids.length);
    expect(counts.filter((n) => n > 0).length).toBeGreaterThanOrEqual(2);
  });
});
