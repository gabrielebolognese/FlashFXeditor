// Writes fixtures/interop/large/: the largest project spec §21.5 promises to open fast: 40 video tracks,
// 1,000 clips and 5,000 keyframes (25 solids per track, 5 opacity keys each). A sparse project goes
// through `normalize`. The folder is tiny (no media). Run: node scripts/fixtures/make-large.mjs
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const dir = join(root, "fixtures", "interop", "large");
const TRACKS = 40;
const PER_TRACK = 25;
const LENGTH = 24;

const tracks = Array.from({ length: TRACKS }, (_, t) => ({ id: `v${t + 1}`, kind: "video" }));
const clips = {};
for (let t = 0; t < TRACKS; t++) {
  for (let i = 0; i < PER_TRACK; i++) {
    const id = `c${t + 1}-${i + 1}`;
    const hue = (t * PER_TRACK + i) / (TRACKS * PER_TRACK);
    clips[id] = {
      id,
      kind: "solid",
      trackId: `v${t + 1}`,
      // Staggered per track so several layers are on screen at every frame.
      start: i * (LENGTH + 6) + (t % 7),
      duration: LENGTH,
      fill: { r: 0.3 + 0.7 * hue, g: 0.8 - 0.5 * hue, b: 0.4 + 0.3 * Math.sin(hue * 6), a: 1 },
      size: { w: 160 + (t % 5) * 40, h: 90 + (i % 4) * 30 },
      transform: { x: ((t * 37) % 700) - 350, y: ((i * 53) % 1500) - 750 },
      opacity: 0.8,
      keyframes: {
        opacity: [0, 6, 12, 18, 23].map((frame, k) => ({ frame, value: [0, 0.8, 0.5, 0.8, 0][k], ease: "easeInOut" })),
      },
    };
  }
}
const sparse = {
  schemaVersion: 4,
  name: "Interop large",
  meta: { createdAt: "2026-11-07T08:00:00.000Z", modifiedAt: "2026-11-07T08:00:00.000Z", appVersion: "1.1.0", generator: { name: "interop-fixture", version: "1", source: "scripts/fixtures/make-large.mjs" } },
  settings: { width: 1080, height: 1920, fps: { num: 30, den: 1 } },
  tracks,
  clips,
};

rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "project.json"), JSON.stringify(sparse));
const run = spawnSync(process.execPath, [join(root, "scripts", "cli", "run.mjs"), "normalize", dir, "--write"], { cwd: root, stdio: "inherit" });
if (run.status !== 0) process.exit(run.status ?? 1);
console.log(`fixtures/interop/large written: ${TRACKS} tracks, ${TRACKS * PER_TRACK} clips, ${TRACKS * PER_TRACK * 5} keyframes`);
