import { describe, expect, it } from "vitest";
import type { Command } from "../../core/commands/command.js";
import { random, randomProject } from "./fuzzKit.js";
import { makeMedia, makeMediaClip, makeProject, makeSolidClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { MediaClip, Project } from "../../core/document/types.js";
import { validateProject } from "../../core/document/validate.js";
import { lottieClips, setColorOverrides, setLottieLoop, withFrom, withoutRow, withTo } from "./lottie.js";

const red = { r: 1, g: 0, b: 0, a: 1 };
const blue = { r: 0, g: 0, b: 1, a: 1 };
const green = { r: 0, g: 1, b: 0, a: 1 };

function doc(): Project {
  const p = makeProject();
  p.media.l1 = { ...makeMedia("l1", "lottie", 2_000_000), width: 200, height: 200, hasAudio: false };
  p.tracks = [makeTrack("v1"), makeTrack("v2")];
  return withClips(p, [
    makeMediaClip(p, { id: "a", trackId: "v1", start: 0, duration: 30, mediaId: "l1", kind: "lottie" }),
    makeMediaClip(p, { id: "b", trackId: "v1", start: 30, duration: 30, mediaId: "l1", kind: "lottie" }),
    makeSolidClip({ id: "s", trackId: "v2", start: 0, duration: 30 }),
  ]);
}

const run = (p: Project, command: Command | null): Project => {
  expect(command).not.toBeNull();
  const next = structuredClone(p);
  command?.run(next as never, { playhead: 0 } as never);
  expect(validateProject(next)).toEqual([]);
  return next;
};
const clip = (p: Project, id: string) => p.clips[id] as MediaClip;

describe("Lottie edits (spec §21.23, Batch 79)", () => {
  it("picks only the Lottie clips", () => {
    expect(lottieClips(doc(), ["a", "s", "missing", "b"]).map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("turns Loop on and off for the selected clips; off removes the field; nothing to change is no command", () => {
    const p = doc();
    const on = run(p, setLottieLoop(p, ["a", "b", "s"], true));
    expect([clip(on, "a").loop, clip(on, "b").loop]).toEqual([true, true]);
    expect(setLottieLoop(on, ["a", "b"], true)).toBeNull();
    const off = run(on, setLottieLoop(on, ["a"], false));
    expect("loop" in clip(off, "a")).toBe(false);
    expect(clip(off, "b").loop).toBe(true);
    expect(setLottieLoop(p, ["s"], true)).toBeNull();
  });

  it("sets, changes and clears color overrides over every selected clip", () => {
    const p = doc();
    const first = run(p, setColorOverrides(p, ["a", "b"], [{ from: red, to: blue }]));
    expect(clip(first, "a").colorOverrides).toEqual([{ from: red, to: blue }]);
    expect(clip(first, "b").colorOverrides).toEqual([{ from: red, to: blue }]);
    expect(setColorOverrides(first, ["a", "b"], [{ from: red, to: blue }])).toBeNull();
    const second = run(first, setColorOverrides(first, ["a"], withTo([{ from: red, to: blue }], 0, green)));
    expect(clip(second, "a").colorOverrides?.[0]?.to).toEqual(green);
    expect(clip(second, "b").colorOverrides?.[0]?.to).toEqual(blue);
    const cleared = run(second, setColorOverrides(second, ["a", "b"], []));
    expect("colorOverrides" in clip(cleared, "a")).toBe(false);
  });

  it("coalesces the edits of one color picker drag", () => {
    const p = doc();
    const one = setColorOverrides(p, ["a"], [{ from: red, to: blue }]);
    const two = setColorOverrides(p, ["a"], [{ from: red, to: green }]);
    expect(one?.coalesceKey).toBeDefined();
    expect(one?.coalesceKey).toBe(two?.coalesceKey);
  });

  it("does not touch a locked clip", () => {
    const p = doc();
    (p.tracks[0] as { locked: boolean }).locked = true;
    expect(setLottieLoop(p, ["a"], true)).toBeNull();
    expect(setColorOverrides(p, ["a"], [{ from: red, to: blue }])).toBeNull();
  });

  it("edits one row of a list", () => {
    const list = [
      { from: red, to: blue },
      { from: green, to: red },
    ];
    expect(withTo(list, 1, blue)[1]).toEqual({ from: green, to: blue });
    expect(withFrom(list, 0, green)[0]).toEqual({ from: green, to: blue });
    expect(withoutRow(list, 0)).toEqual([list[1]]);
  });
});

describe("Lottie edits on random projects (extends the Batch 47 property tests)", () => {
  for (const seed of [31, 32, 33]) {
    it(`seed ${seed}: random loop and color edits keep the document valid`, () => {
      const rng = random(seed);
      let p = structuredClone(randomProject(rng, { id: `p${seed}`, idPrefix: `l${seed}_`, locks: "none", captions: false }));
      const track = p.tracks.find((t) => t.kind === "video") as Project["tracks"][number];
      p.media.lot = { ...makeMedia("lot", "lottie", 2_000_000), width: 200, height: 200, hasAudio: false };
      const ids: string[] = [];
      for (let i = 0; i < 4; i++) {
        const id = `lot-${seed}-${i}`;
        ids.push(id);
        p = withClips(p, [makeMediaClip(p, { id, trackId: track.id, start: 100000 + i * 40, duration: 30, mediaId: "lot", kind: "lottie" })]);
      }
      const before = validateProject(p);
      for (let step = 0; step < 40; step++) {
        const pick = ids.filter(() => rng.chance(0.5));
        const rows = Array.from({ length: rng.int(0, 3) }, () => ({ from: { r: rng.int(0, 255) / 255, g: 0.5, b: 0, a: 1 }, to: { r: 0, g: rng.int(0, 255) / 255, b: 1, a: 1 } }));
        const command = rng.chance(0.5) ? setLottieLoop(p, pick, rng.chance(0.5)) : setColorOverrides(p, pick, rows);
        if (command) p = run(p, command);
      }
      expect(validateProject(p)).toEqual(before);
    });
  }
});
