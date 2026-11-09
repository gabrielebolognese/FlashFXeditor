// `normalize` and the media header checks of the project CLI (spec §21.3, §21.4, Batch 55) on real folders.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeProjectFolder, projectInfo, validateProjectFolder } from "../../../scripts/cli/folder.js";
import { validateStrict } from "./strict.js";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const rel = (path: string) => join(process.cwd(), path);
const readJson = (path: string): Json => JSON.parse(readFileSync(rel(path), "utf8")) as Json;
const BASIC = "fixtures/interop/basic";
const SPARSE = "fixtures/interop/sparse";
const LIBRARY = join(process.cwd(), "public", "fonts", "library");
const NORMALIZE = { appVersion: "1.1.0", libraryDir: LIBRARY } as const;

/** A scratch copy of a fixture folder (never the committed one), without its `expected` folder. */
function scratch(source: string): string {
  const dir = mkdtempSync(join(tmpdir(), "interop-"));
  const root = rel(source);
  cpSync(root, dir, { recursive: true, filter: (path) => !path.startsWith(root + sep + "expected") });
  return dir;
}

describe("fixtures/interop/sparse and `normalize`", { timeout: 30_000 }, () => {
  const expected = readJson(`${SPARSE}/expected/project.json`);

  it("is a schema 3 project that omits what the editor can fill", () => {
    const input = readJson(`${SPARSE}/project.json`);
    expect(input.schemaVersion).toBe(3);
    expect(input.clips["c-video"]).toEqual({ id: "c-video", kind: "video", trackId: "v1", start: 0, duration: 60, mediaId: "m1" });
    expect(input.media.m1).toEqual({ id: "m1", kind: "video", file: { relPath: "media/clip.mp4" } });
    expect(validateStrict(input).errors.length).toBeGreaterThan(0);
  });

  it("normalizes to the expected project: durations, sizes, frame rates and audio read from the files, current schema, strictly valid", async () => {
    const report = await normalizeProjectFolder(rel(SPARSE), { ...NORMALIZE, write: false });
    expect(report.errors).toEqual([]);
    expect(report.project).toEqual(expected);
    expect(expected.schemaVersion).toBe(17);
    expect(expected.media.m1).toMatchObject({ durationUs: 2_000_000, width: 270, height: 480, fps: { num: 30, den: 1 }, hasAudio: true, codec: "avc1.64001f", audioCodec: "mp4a.40.2" });
    expect(expected.media.m2).toMatchObject({ durationUs: 500_000, hasAudio: true, audioCodec: "pcm" });
    expect(expected.media.m3).toMatchObject({ durationUs: 0, width: 64, height: 64, hasAudio: false });
    expect(validateStrict(expected).errors).toEqual([]);
  });

  it("records the library fonts of texts and captions; --write writes project.json, fonts.json and the font files", async () => {
    const dir = scratch(SPARSE);
    try {
      const report = await normalizeProjectFolder(dir, { ...NORMALIZE, write: true });
      expect(report.written).toBe(true);
      const manifest = JSON.parse(readFileSync(join(dir, "fonts", "fonts.json"), "utf8")) as { version: number; faces: { family: string; file: string; source: string; origin: string }[] };
      expect(manifest).toEqual(readJson(`${SPARSE}/expected/fonts/fonts.json`));
      expect(manifest.version).toBe(2);
      expect([...new Set(manifest.faces.map((face) => face.family))].sort()).toEqual(["Bebas Neue", "Inter"]);
      for (const face of manifest.faces) {
        expect(face.source).toBe("library");
        expect(readFileSync(join(dir, "fonts", face.file)).equals(readFileSync(join(LIBRARY, face.origin)))).toBe(true);
      }
      expect((JSON.parse(readFileSync(join(dir, "project.json"), "utf8")) as Json).clips["c-title"].style.fontFamily).toBe("Bebas Neue");
      expect((await validateProjectFolder(dir)).errors).toEqual([]);
      // Again: the fonts are recorded already, nothing is copied twice.
      const again = await normalizeProjectFolder(dir, { ...NORMALIZE, write: true });
      expect(again.fonts.copies).toEqual([]);
      expect(readdirSync(join(dir, "fonts")).sort()).toEqual([...manifest.faces.map((face) => face.file), "fonts.json"].sort());
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("leaves the folder alone when the result is invalid", async () => {
    const dir = scratch(SPARSE);
    try {
      const project = JSON.parse(readFileSync(join(dir, "project.json"), "utf8")) as Json;
      project.clips["c-video"].duration = 0.5;
      writeFileSync(join(dir, "project.json"), JSON.stringify(project));
      const before = readFileSync(join(dir, "project.json"), "utf8");
      const report = await normalizeProjectFolder(dir, { ...NORMALIZE, write: true });
      expect(report.errors.some((issue) => issue.path === "clips.c-video.duration")).toBe(true);
      expect(report.written).toBe(false);
      expect(readFileSync(join(dir, "project.json"), "utf8")).toBe(before);
      expect(existsSync(join(dir, "fonts"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("npm run cli -- normalize prints the expected project; exits 2 without a folder", () => {
    const cli = (...args: string[]) => spawnSync(process.execPath, [rel("scripts/cli/run.mjs"), ...args], { cwd: process.cwd(), encoding: "utf8" });
    const result = cli("normalize", SPARSE);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(expected);
    expect(cli("normalize").status).toBe(2);
  });
});

describe("media headers against their records", { timeout: 30_000 }, () => {
  const edit = async (change: (project: Json) => void) => {
    const dir = scratch(BASIC);
    try {
      const project = readJson(`${BASIC}/project.json`);
      change(project);
      writeFileSync(join(dir, "project.json"), JSON.stringify(project));
      return await validateProjectFolder(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it("a duration that differs from the file by more than a frame fails with both values", async () => {
    const report = await edit((project) => {
      project.media.m1.durationUs = 1_900_000;
    });
    const issue = report.errors.find((entry) => entry.path === "media.m1.durationUs");
    expect(report.ok).toBe(false);
    expect(issue?.message).toContain("1900000");
    expect(issue?.message).toContain("2000000");
  });

  it("a difference within a frame is a warning, and a size that differs is an error", async () => {
    const near = await edit((project) => {
      project.media.m1.durationUs = 2_020_000;
    });
    expect(near.ok).toBe(true);
    expect(near.warnings.map((issue) => issue.path)).toContain("media.m1.durationUs");
    const size = await edit((project) => {
      project.media.m1.width = 540;
    });
    expect(size.errors.map((issue) => issue.message)).toContain("width 540 differs from the file's 270");
  });

  it("a file whose header cannot be read is a warning, left for the app's repair on open", async () => {
    const dir = scratch(BASIC);
    try {
      writeFileSync(join(dir, "media", "badge.png"), "this is not a png");
      const report = await validateProjectFolder(dir);
      expect(report.ok).toBe(true);
      expect(report.warnings.find((issue) => issue.path === "media.m3.file")?.message).toContain("cannot be read");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("info shows the probed facts", async () => {
    const info = await projectInfo(rel(BASIC));
    expect(info.media.find((media) => media.id === "m1")).toMatchObject({ kind: "video", width: 270, height: 480, fps: 30, hasAudio: true, header: "ok", durationUs: 2_000_000 });
  });
});
