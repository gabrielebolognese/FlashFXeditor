// Writes fixtures/interop/standins/: baked stand-ins for the Make editable checks (spec §21.5, Batch 56).
// A sparse project (solids only, no media) goes through `normalize`, so the file is what a generator
// would get from the CLI. Stand-ins: a solid whose data is a sparse solid written at schema 3, one whose
// data names a clip kind this editor does not have, and a stand-in split in two (the right half carries
// `headTrim`). Run: node scripts/fixtures/make-standins.mjs
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const dir = join(root, "fixtures", "interop", "standins");

const standIn = (id, trackId, start, duration, kind, reason, schemaVersion, data, extra = {}) => ({
  id,
  kind: "solid",
  trackId,
  start,
  duration,
  fill: { r: 0.5, g: 0.5, b: 0.5, a: 1 },
  size: { w: 300, h: 300 },
  color: "orange",
  fallbackOf: { kind, reason, schemaVersion, data, ...extra },
});

// What the generator described: a rounded bar that fades in over 10 frames (sparse: no transform, no radius default).
const BAR = { kind: "solid", shape: "roundedRect", fill: { r: 0.9, g: 0.2, b: 0.2 }, size: { w: 600, h: 160 }, cornerRadius: 40, opacity: 0.8 };
const SPLIT = { kind: "solid", fill: { r: 0.1, g: 0.5, b: 0.9 }, size: { w: 500, h: 500 }, opacity: 0.7 };

const sparse = {
  schemaVersion: 4,
  name: "Interop stand-ins",
  meta: { createdAt: "2026-11-07T08:00:00.000Z", modifiedAt: "2026-11-07T08:00:00.000Z", appVersion: "1.1.0", generator: { name: "interop-fixture", version: "1", source: "scripts/fixtures/make-standins.mjs" } },
  settings: { width: 1080, height: 1920, fps: { num: 30, den: 1 } },
  tracks: [
    { id: "v1", kind: "video" },
    { id: "v2", kind: "video" },
  ],
  clips: {
    "b-solid": standIn("b-solid", "v1", 10, 40, "solid", "Sparse solid written for schema 3", 3, BAR),
    "b-unknown": standIn("b-unknown", "v1", 60, 30, "lottie", "A Lottie animation baked to a solid", 4, { kind: "lottie", src: "anim/logo.json" }),
    "b-split-a": standIn("b-split-a", "v2", 0, 24, "solid", "A solid baked, split at frame 24", 4, SPLIT),
    "b-split-b": standIn("b-split-b", "v2", 24, 36, "solid", "A solid baked, split at frame 24", 4, SPLIT, { headTrim: 24 }),
  },
};

rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "project.json"), `${JSON.stringify(sparse, null, 2)}\n`);
const run = spawnSync(process.execPath, [join(root, "scripts", "cli", "run.mjs"), "normalize", dir, "--write"], { cwd: root, stdio: "inherit" });
if (run.status !== 0) process.exit(run.status ?? 1);
writeFileSync(join(dir, "FALLBACKS.md"), "# Baked layers\n\n- b-solid: a sparse solid (schema 3), can be made editable\n- b-unknown: a Lottie animation, stays baked until the editor supports Lottie\n- b-split-a, b-split-b: one baked solid split at frame 24\n");
writeFileSync(join(dir, "OPEN.txt"), "Open this folder in Shorts Editor (Open project). Baked layers have a `baked` badge.\n");
console.log("fixtures/interop/standins written");
