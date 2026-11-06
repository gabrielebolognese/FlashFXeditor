import { readFileSync, statSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Compositor } from "../../render/compositor/Compositor.js";
import type { MediaLayer } from "../../render/compositor/drawList.js";
import { readLottie, parseLottieVariant, describeLottie } from "../../media/lottie/lottieFile.js";
import { buildLottieFixture, LOTTIE_FIXTURE_FRAMES, LOTTIE_SEGMENT } from "./lottieFixture.js";
import { validateStrict } from "./strict.js";
import type { Project } from "./types.js";
import { validateProject } from "./validate.js";

const FILE = "fixtures/interop/lottie/project.json";

// The writer only runs when asked, so a normal run never rewrites a file other tests read in parallel.
it.skipIf(!process.env.WRITE_LOTTIE_FIXTURE)("writes the lottie interop fixture", () => {
  writeFileSync(FILE, `${JSON.stringify(buildLottieFixture(), null, 2)}\n`);
});

describe("fixtures/interop/lottie (Batch 79)", () => {
  const read = (): Project => JSON.parse(readFileSync(FILE, "utf8")) as Project;
  const layersAt = (project: Project, frame: number) => new Compositor().evaluate(project, frame).layers.filter((l): l is MediaLayer => l.kind === "media");

  it("is the project this build writes", () => {
    expect(read()).toEqual(JSON.parse(JSON.stringify(buildLottieFixture())));
  });

  it("is strictly valid and the app accepts it", () => {
    expect(validateStrict(read()).errors).toEqual([]);
    expect(validateProject(read())).toEqual([]);
  });

  it("the three files total under 2 MB and the records match what the file says", async () => {
    const project = read();
    let total = 0;
    for (const item of Object.values(project.media)) {
      const path = `fixtures/interop/lottie/${"relPath" in item.file ? item.file.relPath : ""}`;
      total += statSync(path).size;
      const { json, format } = await readLottie(new Uint8Array(readFileSync(path)));
      const info = describeLottie(json, format);
      expect([item.width, item.height, item.durationUs]).toEqual([info.width, info.height, info.durationUs]);
      expect(item.size).toBe(statSync(path).size);
    }
    expect(total).toBeLessThan(2_000_000);
  });

  it("each segment draws its animation, with the colors it replaces in the variant id", () => {
    const project = read();
    const variants = LOTTIE_FIXTURE_FRAMES.map((frame) => {
      const [layer] = layersAt(project, frame);
      expect(layer?.lottie).toBe(true);
      expect(layer?.still).toBe(true);
      return parseLottieVariant(layer?.mediaId as string);
    });
    expect(variants.map((v) => v.mediaId)).toEqual(["spinner", "spinner", "bounce", "bounce", "pulse"]);
    expect(variants.map((v) => v.overrides.length)).toEqual([0, 2, 0, 1, 0]);
  });

  it("the animation time follows loop and speed", () => {
    const project = read();
    const timeAt = (frame: number) => (layersAt(project, frame)[0] as MediaLayer).timeUs;
    const frameUs = 1e6 / 60;
    expect(timeAt(20)).toBeCloseTo(20 * frameUs, -1);
    // Speed 2: segment frame 20 is animation frame 40.
    expect(timeAt(LOTTIE_SEGMENT + 20)).toBeCloseTo(40 * frameUs, -1);
  });
});
