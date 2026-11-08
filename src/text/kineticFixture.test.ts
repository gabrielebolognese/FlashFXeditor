import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ANIMATOR_PROP_PATTERN } from "../core/document/keyframes.js";
import { validateStrict } from "../core/document/strict.js";
import { validateProject } from "../core/document/validate.js";
import { TEXT_ANIM_IDS } from "../core/document/types.js";
import { buildKineticFixture, KINETIC_PRESETS } from "./kineticFixture.js";

const FILE = "fixtures/interop/kinetic/project.json";

// The writer only runs when asked, so a normal run never rewrites a file other tests read in parallel.
it.skipIf(!process.env.WRITE_KINETIC_FIXTURE)("writes the kinetic interop fixture", () => {
  writeFileSync(FILE, `${JSON.stringify(buildKineticFixture(), null, 2)}\n`);
});

describe("fixtures/interop/kinetic (Batch 68)", () => {
  const read = () => JSON.parse(readFileSync(FILE, "utf8"));

  it("is the project this build writes", () => {
    expect(read()).toEqual(JSON.parse(JSON.stringify(buildKineticFixture())));
  });

  it("is strictly valid and the app accepts it", () => {
    const committed = read();
    expect(validateStrict(committed).errors).toEqual([]);
    expect(validateProject(committed)).toEqual([]);
  });

  it("uses the counter, every animator field and every new preset", () => {
    const committed = read();
    const clips = Object.values(committed.clips) as { counter?: Record<string, unknown>; animators?: { selector: Record<string, unknown>; props: Record<string, unknown>; unit: string }[]; animIn?: { id: string }; keyframes?: Record<string, unknown> }[];
    const counter = clips.find((clip) => clip.counter)?.counter;
    expect(Object.keys(counter ?? {}).sort()).toEqual(["decimals", "ease", "from", "prefix", "separator", "suffix", "to"]);
    const props = new Set<string>();
    const selectorKeys = new Set<string>();
    const units = new Set<string>();
    const shapes = new Set<unknown>();
    const orders = new Set<unknown>();
    for (const clip of clips) for (const a of clip.animators ?? []) {
      Object.keys(a.props).forEach((p) => props.add(p));
      Object.keys(a.selector).forEach((p) => selectorKeys.add(p));
      units.add(a.unit);
      shapes.add(a.selector.shape);
      orders.add(a.selector.order);
    }
    expect([...props].sort()).toEqual(["blur", "fill", "opacity", "rotation", "scale", "tracking", "x", "y"]);
    expect([...selectorKeys].sort()).toEqual(["ease", "end", "offset", "order", "seed", "shape", "start"]);
    expect([...units].sort()).toEqual(["char", "word"]);
    expect([...orders].sort()).toEqual(["forward", "random", "reverse"]);
    expect(shapes.size).toBeGreaterThanOrEqual(3);
    const presets = new Set(clips.map((clip) => clip.animIn?.id).filter(Boolean));
    for (const id of KINETIC_PRESETS) expect(presets.has(id), id).toBe(true);
    for (const id of KINETIC_PRESETS) expect(TEXT_ANIM_IDS).toContain(id);
    const keyed = clips.flatMap((clip) => Object.keys(clip.keyframes ?? {}));
    expect(keyed.every((prop) => ANIMATOR_PROP_PATTERN.test(prop))).toBe(true);
  });
});
