// fixtures/interop/inbox/ (scripts/fixtures/make-inbox.mjs): the evidence of the manifest keys
// `interop.projectInbox`, `interop.cardFile` and `interop.reviewFile`. The two folders are watched as a user
// would watch them and the inbox must show the four cases: a card with every field, a project without a card,
// a reviewed project and a project built again after its review.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { memoryKeyValueStore } from "../kv.js";
import { createMemoryDir, MemoryDir } from "../memoryFs.js";
import { parseCard } from "./card.js";
import { Inbox, isWaiting } from "./inbox.js";
import { resolveOpenLink } from "./links.js";
import { WatchedFolders } from "./watchedFolders.js";

const base = join(process.cwd(), "fixtures", "interop", "inbox");

async function load(disk: string, dir: MemoryDir): Promise<MemoryDir> {
  for (const entry of readdirSync(disk, { withFileTypes: true })) {
    const path = join(disk, entry.name);
    if (entry.isDirectory()) await load(path, (await dir.dir(entry.name, { create: true })) as MemoryDir);
    else if (/\.(json|md|txt)$/.test(entry.name)) await dir.writeText(entry.name, readFileSync(path, "utf8"));
    else await dir.writeFile(entry.name, new Blob([readFileSync(path)]));
  }
  return dir;
}

async function watched() {
  const kv = memoryKeyValueStore();
  const folders = new WatchedFolders(kv, (handle) => (handle instanceof MemoryDir ? handle : null));
  await folders.add(await load(join(base, "tutorials"), createMemoryDir("tutorials")));
  await folders.add(await load(join(base, "reels"), createMemoryDir("reels")));
  await folders.add(await load(join(base, "autopilot"), createMemoryDir("autopilot")));
  return { folders, inbox: new Inbox(folders, kv) };
}

describe("fixtures/interop/inbox", () => {
  it("shows the four cases", async () => {
    const { inbox } = await watched();
    await inbox.scan();
    const entries = Object.fromEntries(inbox.state.getState().entries.map((entry) => [`${entry.folderLabel}:${entry.path}`, entry]));
    // The working copy under autopilot/channels (6 levels down) is not listed.
    expect(Object.keys(entries).sort()).toEqual(["autopilot:exports/flashfx-1/project", "autopilot:exports/flashfx-1/project.edited-2026-11-10", "reels:rebuilt", "reels:reviewed", "tutorials:handstand/project", "tutorials:plain"]);
    // A generator's root: its projects sit in a folder named exports; the backup of an edited project is an edited copy.
    expect(entries["autopilot:exports/flashfx-1/project"]).toMatchObject({ status: "new", edited: false, title: "Glow text in 20 seconds" });
    expect(entries["autopilot:exports/flashfx-1/project"]?.card).toMatchObject({ kind: "FlashFX reel", generator: "reels-autopilot" });
    expect(entries["autopilot:exports/flashfx-1/project.edited-2026-11-10"]).toMatchObject({ edited: true });
    expect(inbox.state.getState().entries.filter(isWaiting).map((entry) => entry.path).sort()).toEqual(["exports/flashfx-1/project", "handstand/project", "plain", "rebuilt"]);

    const full = entries["tutorials:handstand/project"]!;
    expect(full).toMatchObject({ status: "new", title: "Your first handstand push-up", projectId: "inbox-handstand", durationSec: 3, format: "1080x1920 30 fps", failedChecks: 1 });
    expect(full.card).toMatchObject({ kind: "tutorial", generator: "calisthenics-editor", generatedAt: "2026-11-11T17:53:53Z", poster: "poster.jpg", video: "../2026-11-11.mp4" });
    expect(full.card?.checks).toEqual([
      { name: "validate", ok: true },
      { name: "duration", ok: false },
    ]);
    expect(full.card?.notes).toHaveLength(2);
    expect(full.poster?.size).toBeGreaterThan(1000);

    expect(entries["tutorials:plain"]).toMatchObject({ status: "new", title: "No card here", card: null, poster: null, format: "1080x1920 30 fps" });
    expect(entries["reels:reviewed"]).toMatchObject({ status: "reviewed", title: "Morning routine" });
    expect(entries["reels:rebuilt"]).toMatchObject({ status: "updated", title: "Pull-up progressions" });
    // Not reviewed first.
    expect(inbox.state.getState().entries.slice(0, 4).every(isWaiting)).toBe(true);
  });

  it("names the project.json a card was generated from", () => {
    for (const path of ["tutorials/handstand/project", "reels/reviewed", "reels/rebuilt", "autopilot/exports/flashfx-1/project"]) {
      const card = parseCard(readFileSync(join(base, path, "card.json"), "utf8"));
      // Line endings may differ per checkout: the id is the hash of the file as the generator wrote it (LF).
      const text = readFileSync(join(base, path, "project.json"), "utf8").replace(/\r\n/g, "\n");
      expect(card?.generationId).toBe(createHash("sha256").update(text).digest("hex"));
    }
  });

  it("opens by link in either folder", async () => {
    const { folders } = await watched();
    expect((await resolveOpenLink(folders.folders(), "handstand/project")).kind).toBe("found");
    expect((await resolveOpenLink(folders.folders(), "reels:rebuilt")).kind).toBe("found");
    expect((await resolveOpenLink(folders.folders(), "exports/flashfx-1/project")).kind).toBe("found");
  });
});
