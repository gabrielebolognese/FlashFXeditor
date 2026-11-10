import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildEveryPart, EVERY_ASSETS_FROM } from "./everyPart.js";
import { buildFullFixture, FULL_PARTS, type FullBuild } from "./fullFixture.js";
import { validateStrict } from "./strict.js";
import type { Project } from "./types.js";
import { validateProject } from "./validate.js";

const ROOT = "fixtures/interop";
const FULL = `${ROOT}/full`;

const readPart = (name: string) =>
  name === "every"
    ? { name, project: JSON.parse(JSON.stringify(buildEveryPart())) as Record<string, unknown>, assetsFrom: EVERY_ASSETS_FROM }
    : { name, project: JSON.parse(readFileSync(`${ROOT}/${name}/project.json`, "utf8")) as Record<string, unknown> };
const hashOf = (part: string, rel: string) => createHash("sha1").update(readFileSync(`${ROOT}/${part}/${rel}`)).digest("hex");
const build = (): FullBuild => buildFullFixture(FULL_PARTS.map(readPart), hashOf);

/** The frames the expected folder holds: the middle expected frame of each part, moved to the part's place. */
export function fullFrames(built: FullBuild): number[] {
  return FULL_PARTS.flatMap((name) => {
    const dir = `${ROOT}/${name}/expected`;
    const own = existsSync(dir) ? readdirSync(dir).map((f) => /-frame-(\d+)\.png$/i.exec(f)?.[1]).filter((n) => n !== undefined).map(Number).sort((a, b) => a - b) : [];
    const span = built.spans[name]!;
    if (name === "every") return [8, 25, 45, 70, 90].map((frame) => span.start + frame);
    const fpsScale = name === "lottie" ? 0.5 : 1;
    const frame = own.length > 0 ? Math.round(own[Math.floor(own.length / 2)]! * fpsScale) : Math.floor(span.duration / 2);
    return [span.start + Math.min(frame, span.duration - 1)];
  });
}

// The writer only runs when asked, so a normal run never rewrites a file other tests read in parallel.
it.skipIf(!process.env.WRITE_FULL_FIXTURE)("writes the full interop fixture", () => {
  const built = build();
  mkdirSync(FULL, { recursive: true });
  for (const asset of built.assets) {
    const to = join(FULL, asset.to);
    mkdirSync(asset.dir ? to : dirname(to), { recursive: true });
    cpSync(join(ROOT, asset.part, asset.from), to, { recursive: asset.dir });
  }
  cpSync(`${ROOT}/basic/fonts`, `${FULL}/fonts`, { recursive: true });
  writeFileSync(`${FULL}/project.json`, `${JSON.stringify(built.project, null, 2)}\n`);
  writeFileSync(`${FULL}/frames.txt`, `${fullFrames(built).join(",")}\n`);
});

describe("fixtures/interop/full (Batch 82)", () => {
  const read = (): Project => JSON.parse(readFileSync(`${FULL}/project.json`, "utf8")) as Project;

  it("is the project this build writes", () => {
    expect(read()).toEqual(JSON.parse(JSON.stringify(build().project)));
  });

  it("is strictly valid and the app accepts it", () => {
    expect(validateStrict(read()).errors).toEqual([]);
    expect(validateProject(read())).toEqual([]);
  });

  it("holds every part, each in its own span, and every media file it names exists", () => {
    const built = build();
    expect(Object.keys(built.spans)).toEqual([...FULL_PARTS]);
    const project = read();
    for (const item of Object.values(project.media)) {
      const rel = "relPath" in item.file ? item.file.relPath : "";
      expect(existsSync(join(FULL, rel)), rel).toBe(true);
    }
  });
});
