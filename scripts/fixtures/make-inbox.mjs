// Writes fixtures/interop/inbox/: two folders as a user would watch them, with the four cases of the project
// inbox (docs/INTEROP.md, "The project inbox"):
//   tutorials/handstand/project/  a card.json with every field and a poster, never opened        -> Not reviewed
//   tutorials/plain/              no card.json                                                     -> Not reviewed
//   reels/reviewed/               opened since it was generated (review.json names the card's id)  -> Reviewed
//   reels/rebuilt/                built again after it was opened (the ids differ)                 -> Not reviewed, updated
//   autopilot/                    a generator's root folder, watched as it is:
//     exports/flashfx-1/project/                       3 levels down, in a folder named exports -> listed
//     exports/flashfx-1/project.edited-2026-11-10/     the backup of an edited project           -> Edited copy
//     channels/flashfx/runs/r1/s15-project/project/    a working copy, 6 levels down             -> not listed
// Each project is a sparse one (solids only) run through `normalize`, as a generator would. The poster needs
// ffmpeg; without it an existing poster.jpg is kept. Run: node scripts/fixtures/make-inbox.mjs
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const base = join(root, "fixtures", "interop", "inbox");
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

function project(dir, id, name, color) {
  const sparse = {
    schemaVersion: 4,
    id,
    name,
    meta: { createdAt: "2026-11-11T17:00:00.000Z", modifiedAt: "2026-11-11T17:00:00.000Z", appVersion: "1.2.0", generator: { name: "interop-fixture", version: "1", source: "scripts/fixtures/make-inbox.mjs" } },
    settings: { width: 1080, height: 1920, fps: { num: 30, den: 1 } },
    tracks: [{ id: "v1", kind: "video" }],
    clips: { bar: { id: "bar", kind: "solid", trackId: "v1", start: 0, duration: 90, fill: color, size: { w: 700, h: 700 } } },
  };
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "project.json"), json(sparse));
  const run = spawnSync(process.execPath, [join(root, "scripts", "cli", "run.mjs"), "normalize", dir, "--write"], { cwd: root, stdio: "inherit" });
  if (run.status !== 0) process.exit(run.status ?? 1);
  return createHash("sha256").update(readFileSync(join(dir, "project.json"))).digest("hex");
}

const poster = existsSync(join(base, "tutorials", "handstand", "project", "poster.jpg")) ? readFileSync(join(base, "tutorials", "handstand", "project", "poster.jpg")) : null;
rmSync(base, { recursive: true, force: true });

// Every field of card/1, and one field this version does not know (ignored).
const full = join(base, "tutorials", "handstand", "project");
const fullId = project(full, "inbox-handstand", "Handstand push-up", { r: 0.85, g: 0.65, b: 0.13 });
writeFileSync(
  join(full, "card.json"),
  json({
    schema: "card/1",
    title: "Your first handstand push-up",
    kind: "tutorial",
    generator: "calisthenics-editor",
    generationId: fullId,
    generatedAt: "2026-11-11T17:53:53Z",
    durationSec: 3,
    format: "1080x1920 30 fps",
    poster: "poster.jpg",
    video: "../2026-11-11.mp4",
    checks: [
      { name: "validate", ok: true },
      { name: "duration", ok: false },
    ],
    notes: ["2 pauses just over the limit at 33.9 s and 39.1 s", "The outro has no music"],
    futureField: { anything: true },
  }),
);
const made = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "gradients=s=540x960:c0=0x0e1b2e:c1=0xd9a521:x0=0:y0=0:x1=540:y1=960", "-frames:v", "1", "-q:v", "5", join(full, "poster.jpg")]);
if (made.status !== 0) {
  if (!poster) throw new Error("ffmpeg is needed to make poster.jpg the first time");
  writeFileSync(join(full, "poster.jpg"), poster);
}

project(join(base, "tutorials", "plain"), "inbox-plain", "No card here", { r: 0.2, g: 0.5, b: 0.9 });

const reviewed = join(base, "reels", "reviewed");
const reviewedId = project(reviewed, "inbox-reviewed", "Reviewed reel", { r: 0.24, g: 0.75, b: 0.48 });
writeFileSync(join(reviewed, "card.json"), json({ schema: "card/1", title: "Morning routine", kind: "reel", generator: "reels-pipeline", generationId: reviewedId, generatedAt: "2026-11-10T08:00:00Z", durationSec: 3, checks: [{ name: "validate", ok: true }] }));
writeFileSync(join(reviewed, "review.json"), json({ schema: "review/1", firstOpenedAt: "2026-11-10T09:00:00.000Z", lastOpenedAt: "2026-11-10T09:30:00.000Z", reviewedGenerationId: reviewedId }));

const rebuilt = join(base, "reels", "rebuilt");
const rebuiltId = project(rebuilt, "inbox-rebuilt", "Rebuilt reel", { r: 0.9, g: 0.33, b: 0.35 });
writeFileSync(join(rebuilt, "card.json"), json({ schema: "card/1", title: "Pull-up progressions", kind: "reel", generator: "reels-pipeline", generationId: rebuiltId, generatedAt: "2026-11-11T12:00:00Z", durationSec: 3, notes: ["Rebuilt with the new intro"] }));
writeFileSync(join(rebuilt, "review.json"), json({ schema: "review/1", firstOpenedAt: "2026-11-10T09:00:00.000Z", lastOpenedAt: "2026-11-10T09:30:00.000Z", reviewedGenerationId: "0".repeat(64) }));

const autopilot = join(base, "autopilot");
const reel = join(autopilot, "exports", "flashfx-1", "project");
const reelId = project(reel, "inbox-flashfx-1", "FlashFX 1", { r: 0.55, g: 0.36, b: 0.96 });
writeFileSync(join(reel, "card.json"), json({ schema: "card/1", title: "Glow text in 20 seconds", kind: "FlashFX reel", generator: "reels-autopilot", generationId: reelId, generatedAt: "2026-11-11T15:00:00Z", durationSec: 3, format: "1080x1920 30 fps", video: "../flashfx-1.mp4", checks: [{ name: "validate", ok: true }], notes: [] }));
const edited = join(autopilot, "exports", "flashfx-1", "project.edited-2026-11-10");
const editedId = project(edited, "inbox-flashfx-1", "FlashFX 1", { r: 0.4, g: 0.3, b: 0.8 });
writeFileSync(join(edited, "card.json"), json({ schema: "card/1", title: "Glow text in 20 seconds", kind: "FlashFX reel", generator: "reels-autopilot", generationId: editedId, generatedAt: "2026-11-10T15:00:00Z", durationSec: 3 }));
writeFileSync(join(edited, "review.json"), json({ schema: "review/1", firstOpenedAt: "2026-11-10T16:00:00.000Z", lastOpenedAt: "2026-11-10T16:20:00.000Z", reviewedGenerationId: editedId }));
project(join(autopilot, "channels", "flashfx", "runs", "r1", "s15-project", "project"), "inbox-working-copy", "Working copy", { r: 0.3, g: 0.3, b: 0.3 });

console.log("fixtures/interop/inbox written");
