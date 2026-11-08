import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCardFixture, buildDeckFixture, DECK_GRID, deckLanding } from "./deckFixture.js";
import { animatedTransform } from "./keyframes.js";
import { validateStrict } from "./strict.js";
import type { Clip, Project, Transform } from "./types.js";
import { validateProject } from "./validate.js";

const DECK = "fixtures/interop/deck/project.json";
const CARD = "fixtures/interop/card/project.json";

// The writer only runs when asked, so a normal run never rewrites a file other tests read in parallel.
it.skipIf(!process.env.WRITE_DECK_FIXTURE)("writes the deck and card interop fixtures", () => {
  writeFileSync(DECK, `${JSON.stringify(buildDeckFixture(), null, 2)}\n`);
  writeFileSync(CARD, `${JSON.stringify(buildCardFixture(), null, 2)}\n`);
});

describe("fixtures/interop/deck and card (Batch 70)", () => {
  const read = (file: string): Project => JSON.parse(readFileSync(file, "utf8")) as Project;

  it("are the projects this build writes", () => {
    expect(read(DECK)).toEqual(JSON.parse(JSON.stringify(buildDeckFixture())));
    expect(read(CARD)).toEqual(JSON.parse(JSON.stringify(buildCardFixture())));
  });

  it("are strictly valid and the app accepts them", () => {
    for (const file of [DECK, CARD]) {
      const committed = read(file);
      expect(validateStrict(committed).errors, file).toEqual([]);
      expect(validateProject(committed), file).toEqual([]);
    }
  });

  it("flies six cards from far away, turned, into a 3 x 2 grid where their rotations and depth settle to 0", () => {
    const project = read(DECK);
    const cards = Object.values(project.clips) as (Clip & { transform: Transform })[];
    expect(cards).toHaveLength(6);
    cards.forEach((card, i) => {
      const start = animatedTransform(card, 0);
      expect(start.z ?? 0, card.id).toBeGreaterThan(1000);
      expect(Math.abs(start.rotationY ?? 0), card.id).toBeGreaterThan(90);
      expect(Math.abs(start.rotationX ?? 0), card.id).toBeGreaterThan(30);
      const mid = animatedTransform(card, deckLanding(i) - 8);
      expect(Math.abs(mid.rotationY ?? 0), card.id).toBeLessThan(Math.abs(start.rotationY ?? 0));
      for (const frame of [deckLanding(i), 59]) {
        const end = animatedTransform(card, frame);
        expect(end, `${card.id} at ${frame}`).toMatchObject({ x: DECK_GRID[i]?.x, y: DECK_GRID[i]?.y, rotation: 0, rotationX: 0, rotationY: 0, z: 0 });
      }
    });
    // The default perspective (1600 px): the document leaves it unset.
    expect(project.settings).not.toHaveProperty("perspective");
  });

  it("turns the card 60° on Y with perspective 1600", () => {
    const project = read(CARD);
    expect(project.settings.perspective).toBe(1600);
    expect((project.clips.card as Clip & { transform: Transform }).transform.rotationY).toBe(60);
  });
});
