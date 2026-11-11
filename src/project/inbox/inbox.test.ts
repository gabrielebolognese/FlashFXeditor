import { describe, expect, it } from "vitest";
import { memoryKeyValueStore } from "../kv.js";
import { createMemoryDir, MemoryDir } from "../memoryFs.js";
import { EMPTY_CARD, parseCard, parseProjectHead, scanProjectHead } from "./card.js";
import { formatDuration, relativeTime } from "./format.js";
import { findProjects, Inbox, isWaiting } from "./inbox.js";
import { resolveOpenLink, splitOpenLink } from "./links.js";
import { openedReview, parseReview, readReview, reviewStatus, writeReview, type Review } from "./review.js";
import { uniqueLabel, WatchedFolders } from "./watchedFolders.js";

const wrap = (handle: unknown) => (handle instanceof MemoryDir ? handle : null);
const projectJson = (id: string, name: string) => JSON.stringify({ schemaVersion: 24, id, name, settings: { width: 1080, height: 1920, fps: { num: 30, den: 1 } }, clips: {} });
const review = (generationId: string | null): Review => ({ schema: "review/1", firstOpenedAt: "2026-11-10T09:00:00.000Z", lastOpenedAt: "2026-11-10T09:00:00.000Z", reviewedGenerationId: generationId });

/** Creates the folder at `path` (segments joined by `/`) and writes `files` into it. */
async function put(root: MemoryDir, path: string, files: Record<string, string>): Promise<MemoryDir> {
  let dir = root;
  for (const segment of path.split("/").filter((part) => part !== "")) dir = (await dir.dir(segment, { create: true })) as MemoryDir;
  for (const [name, text] of Object.entries(files)) await dir.writeText(name, text);
  return dir;
}

async function setup(...names: string[]) {
  const kv = memoryKeyValueStore();
  const folders = new WatchedFolders(kv, wrap, (() => {
    let n = 0;
    return () => `f${++n}`;
  })());
  const roots = names.map((name) => createMemoryDir(name));
  for (const root of roots) await folders.add(root);
  let time = Date.parse("2026-11-11T18:00:00.000Z");
  const inbox = new Inbox(folders, kv, () => new Date((time += 1000)));
  return { kv, folders, roots, inbox };
}

describe("card.json", () => {
  it("reads every field", () => {
    const card = parseCard(
      JSON.stringify({
        schema: "card/1",
        title: " Your first handstand push-up ",
        kind: "tutorial",
        generator: "calisthenics-editor",
        generationId: "abc",
        generatedAt: "2026-11-11T17:53:53Z",
        durationSec: 90.2,
        format: "1080x1920 30 fps",
        poster: "poster.jpg",
        video: "../2026-11-11.mp4",
        checks: [{ name: "validate", ok: true }, { name: "duration", ok: false }],
        notes: ["2 pauses just over the limit"],
      }),
    );
    expect(card).toEqual({
      title: "Your first handstand push-up",
      kind: "tutorial",
      generator: "calisthenics-editor",
      generationId: "abc",
      generatedAt: "2026-11-11T17:53:53Z",
      durationSec: 90.2,
      format: "1080x1920 30 fps",
      poster: "poster.jpg",
      video: "../2026-11-11.mp4",
      checks: [{ name: "validate", ok: true }, { name: "duration", ok: false }],
      notes: ["2 pauses just over the limit"],
    });
  });

  it("takes a card with missing fields, ignores unknown ones and drops fields of the wrong type", () => {
    expect(parseCard("{}")).toEqual(EMPTY_CARD);
    expect(parseCard(JSON.stringify({ title: "Only a title", somethingNew: [1, 2], schema: "card/9" }))).toEqual({ ...EMPTY_CARD, title: "Only a title" });
    const odd = parseCard(JSON.stringify({ title: 5, durationSec: "long", generatedAt: "yesterday", checks: [{ name: "a" }, "b", { name: "c", ok: false }], notes: ["keep", 3, ""] }));
    expect(odd).toEqual({ ...EMPTY_CARD, checks: [{ name: "c", ok: false }], notes: ["keep"] });
    expect(parseCard("not json")).toBeNull();
    expect(parseCard("[1]")).toBeNull();
  });
});

describe("the head of project.json", () => {
  it("finds id, name and settings in the first bytes without the rest", () => {
    const head = '{\n  "schemaVersion": 24,\n  "id": "p1",\n  "name": "A \\"quoted\\" name",\n  "meta": { "id": "not this one", "list": [1, {"name": "nor this"}] },\n  "settings": { "width": 1080, "height": 1920, "fps": { "num": 30000, "den": 1001 } },\n  "clips": { "c1": { "id": "c1", "na';
    expect(scanProjectHead(head)).toEqual({ id: "p1", name: 'A "quoted" name', format: "1080x1920 29.97 fps" });
  });

  it("gives up when the piece ends too early, and the whole file is read instead", () => {
    expect(scanProjectHead('{ "clips": { "c1": { "id": "c1" } }, "id": "p1", "na')).toBeNull();
    expect(parseProjectHead('{ "clips": {}, "name": "Late", "id": "p1", "settings": { "width": 720, "height": 1280, "fps": { "num": 60, "den": 1 } } }')).toEqual({ id: "p1", name: "Late", format: "720x1280 60 fps" });
    expect(parseProjectHead("broken")).toEqual({ id: null, name: null, format: null });
  });
});

describe("review status", () => {
  it("is not reviewed without a review", () => {
    expect(reviewStatus("g1", null)).toBe("new");
    expect(reviewStatus(null, null)).toBe("new");
  });

  it("is reviewed when opened since it was generated", () => {
    expect(reviewStatus("g1", review("g1"))).toBe("reviewed");
    // No card, or a card without a generationId: opened once is reviewed.
    expect(reviewStatus(null, review(null))).toBe("reviewed");
    expect(reviewStatus(null, review("old"))).toBe("reviewed");
  });

  it("is not reviewed, with the updated note, when the generator built it again after the opening", () => {
    expect(reviewStatus("g2", review("g1"))).toBe("updated");
    expect(reviewStatus("g1", review(null))).toBe("updated");
  });

  it("keeps the first opening and reads only real reviews", () => {
    const first = openedReview(null, "g1", "2026-11-11T10:00:00.000Z");
    expect(openedReview(first, "g2", "2026-11-11T12:00:00.000Z")).toEqual({ schema: "review/1", firstOpenedAt: "2026-11-11T10:00:00.000Z", lastOpenedAt: "2026-11-11T12:00:00.000Z", reviewedGenerationId: "g2" });
    expect(parseReview("{}")).toBeNull();
    expect(parseReview("nope")).toBeNull();
  });
});

describe("discovery", () => {
  it("finds project folders up to 3 levels deep and skips the listed and the hidden folders", async () => {
    const root = createMemoryDir("Videos");
    const p = { "project.json": projectJson("x", "x") };
    await put(root, "one", p);
    await put(root, "a/two/project", p);
    await put(root, "a/b/c", p);
    await put(root, "a/b/c/d", p); // inside a project: not looked at
    await put(root, "a/b/e/too-deep", p); // level 4
    for (const skipped of ["cache", "history", "media", "fonts", "luts", "node_modules", ".git", "Media"]) await put(root, `${skipped}/inside`, p);
    await put(root, "empty", { "notes.txt": "no project" });
    expect((await findProjects(root)).map((found) => found.path.join("/"))).toEqual(["a/b/c", "a/two/project", "one"]);
  });

  it("enters a folder named exports outside a project, never the exports of a project", async () => {
    const root = createMemoryDir("instagramReels");
    const p = { "project.json": projectJson("x", "x") };
    // The autopilot's exports: 3 levels down.
    await put(root, "exports/flashfx-1/project", p);
    await put(root, "exports/flashfx-1/project/exports/inner", p);
    await put(root, "exports/flashfx-1/project.edited-2026-11-10", p);
    // Its working copies: too deep.
    await put(root, "channels/flashfx/runs/r1/s15-project/project", p);
    expect((await findProjects(root)).map((found) => found.path.join("/"))).toEqual(["exports/flashfx-1/project", "exports/flashfx-1/project.edited-2026-11-10"]);
  });

  it("takes the watched folder itself when it is a project", async () => {
    const root = createMemoryDir("project");
    await put(root, "", { "project.json": projectJson("x", "x") });
    await put(root, "media/inner", { "project.json": projectJson("y", "y") });
    expect((await findProjects(root)).map((found) => found.path)).toEqual([[]]);
  });
});

describe("Inbox", () => {
  it("lists cards with their status: not reviewed first, then newest first", async () => {
    const { inbox, roots } = await setup("Calisthenics Shorts", "Reels");
    const [shorts, reels] = roots as [MemoryDir, MemoryDir];
    await put(shorts, "handstand/project", { "project.json": projectJson("p1", "Handstand"), "card.json": JSON.stringify({ title: "Your first handstand push-up", generationId: "g1", generatedAt: "2026-11-11T17:00:00Z", durationSec: 90.2, checks: [{ name: "duration", ok: false }], notes: ["look here"] }) });
    await put(shorts, "plain", { "project.json": projectJson("p2", "Plain project") });
    await put(reels, "done", { "project.json": projectJson("p3", "Done"), "card.json": JSON.stringify({ generationId: "g3", generatedAt: "2026-11-11T17:30:00Z" }), "review.json": JSON.stringify(review("g3")) });
    await put(reels, "rebuilt", { "project.json": projectJson("p4", "Rebuilt"), "card.json": JSON.stringify({ generationId: "g5", generatedAt: "2026-11-11T16:00:00Z" }), "review.json": JSON.stringify(review("g4")) });
    expect(await inbox.scan()).toEqual([]);
    const state = inbox.state.getState();
    expect(state.loaded).toBe(true);
    expect(state.folders.map((folder) => [folder.label, folder.access])).toEqual([
      ["Calisthenics Shorts", "readwrite"],
      ["Reels", "readwrite"],
    ]);
    const byTitle = Object.fromEntries(state.entries.map((entry) => [entry.title, entry]));
    expect(byTitle["Your first handstand push-up"]).toMatchObject({ status: "new", folderLabel: "Calisthenics Shorts", path: "handstand/project", projectId: "p1", durationSec: 90.2, format: "1080x1920 30 fps", failedChecks: 1 });
    // Without a card: the name of project.json.
    expect(byTitle["Plain project"]).toMatchObject({ status: "new", card: null, poster: null });
    expect(byTitle["Done"]?.status).toBe("reviewed");
    expect(byTitle["Rebuilt"]?.status).toBe("updated");
    // "Plain project" has no card time: its project.json was written last in this test's clock, but cards sort by their own time.
    expect(state.entries.map((entry) => entry.status).slice(-1)).toEqual(["reviewed"]);
    const waiting = state.entries.filter((entry) => entry.status !== "reviewed");
    expect([...waiting].sort((a, b) => b.time - a.time).map((entry) => entry.key)).toEqual(waiting.map((entry) => entry.key));
  });

  it("shows the cards of every watched folder in one list; the same path in two folders is two cards with their own review", async () => {
    const { inbox, roots } = await setup("instagramReels", "reels-ch4", "reels-ch3");
    const [main, ch4, ch3] = roots as [MemoryDir, MemoryDir, MemoryDir];
    // The worktrees export the same project (same id, same generation) under the same relative path.
    const files = { "project.json": projectJson("same-id", "FlashFX 1"), "card.json": JSON.stringify({ title: "FlashFX 1", kind: "FlashFX reel", generator: "reels-autopilot", generationId: "g1", generatedAt: "2026-11-11T10:00:00Z" }) };
    const a = await put(main, "exports/flashfx-1/project", files);
    const b = await put(ch4, "exports/flashfx-1/project", files);
    await put(ch3, "exports/logs-2/project", { "project.json": projectJson("other", "Logs 2"), "card.json": JSON.stringify({ kind: "logs.of.gabryy reel", generationId: "g9", generatedAt: "2026-11-11T12:00:00Z" }) });
    await inbox.scan();
    const list = () => inbox.state.getState().entries.map((entry) => `${entry.folderLabel}:${entry.path}:${entry.status}`);
    expect(list()).toEqual(["reels-ch3:exports/logs-2/project:new", "instagramReels:exports/flashfx-1/project:new", "reels-ch4:exports/flashfx-1/project:new"]);
    expect(new Set(inbox.state.getState().entries.map((entry) => entry.key)).size).toBe(3);
    // Opening one reviews that one only.
    await inbox.markOpened(a, "same-id");
    await inbox.scan();
    expect(list()).toEqual(["reels-ch3:exports/logs-2/project:new", "reels-ch4:exports/flashfx-1/project:new", "instagramReels:exports/flashfx-1/project:reviewed"]);
    expect(b.files.has("review.json")).toBe(false);
    // Also when neither folder can be written: the records of this browser are per card.
    main.fs.permissions.readwrite = "denied";
    ch4.fs.permissions.readwrite = "denied";

    await inbox.setReviewed(inbox.state.getState().entries.find((entry) => entry.folderLabel === "instagramReels")!, false);
    await inbox.markOpened(b, "same-id");
    await inbox.scan();
    expect(list()).toEqual(["reels-ch3:exports/logs-2/project:new", "instagramReels:exports/flashfx-1/project:new", "reels-ch4:exports/flashfx-1/project:reviewed"]);
  });

  it("lists an edited copy, never as waiting for a look", async () => {
    const { inbox, roots } = await setup("instagramReels");
    const root = roots[0] as MemoryDir;
    await put(root, "exports/flashfx-1/project", { "project.json": projectJson("p", "FlashFX 1"), "card.json": JSON.stringify({ generationId: "g2", generatedAt: "2026-11-11T10:00:00Z" }) });
    await inbox.scan();
    // The autopilot rebuilds and keeps what the user had edited next to it.
    await put(root, "exports/flashfx-1/project.edited-2026-11-11", { "project.json": projectJson("p", "FlashFX 1"), "card.json": JSON.stringify({ generationId: "g1", generatedAt: "2026-11-11T12:00:00Z" }) });
    // Not announced as a new project.
    expect(await inbox.scan()).toEqual([]);
    const entries = inbox.state.getState().entries;
    expect(entries.map((entry) => [entry.path, entry.edited, entry.status])).toEqual([
      ["exports/flashfx-1/project", false, "new"],
      ["exports/flashfx-1/project.edited-2026-11-11", true, "new"],
    ]);
    expect(entries.filter(isWaiting).map((entry) => entry.path)).toEqual(["exports/flashfx-1/project"]);
  });

  it("drops a project that left the disk and reports one that appears later", async () => {
    const { inbox, roots } = await setup("Videos");
    const root = roots[0] as MemoryDir;
    await put(root, "a", { "project.json": projectJson("a", "A") });
    await inbox.scan();
    expect(inbox.state.getState().entries.map((entry) => entry.title)).toEqual(["A"]);
    root.dirs.delete("a");
    await put(root, "b", { "project.json": projectJson("b", "B"), "card.json": JSON.stringify({ title: "New one", generationId: "g1" }) });
    expect((await inbox.scan()).map((entry) => entry.title)).toEqual(["New one"]);
    expect(inbox.state.getState().entries.map((entry) => entry.title)).toEqual(["New one"]);
    // Nothing changed: nothing new.
    expect(await inbox.scan()).toEqual([]);
  });

  it("reads a file again only when it changed", async () => {
    const { inbox, roots } = await setup("Videos");
    const dir = await put(roots[0] as MemoryDir, "a", { "project.json": projectJson("a", "A"), "card.json": JSON.stringify({ title: "First" }) });
    await inbox.scan();
    const first = inbox.state.getState().entries[0];
    await inbox.scan();
    expect(inbox.state.getState().entries[0]?.card).toBe(first?.card);
    await dir.writeText("card.json", JSON.stringify({ title: "Second" }));
    await inbox.scan();
    expect(inbox.state.getState().entries[0]?.title).toBe("Second");
  });

  it("shows a folder without permission as needing a reconnect, and its cards after one click", async () => {
    const { inbox, roots } = await setup("Videos", "Reels");
    const [videos, reels] = roots as [MemoryDir, MemoryDir];
    await put(videos, "a", { "project.json": projectJson("a", "A") });
    await put(reels, "b", { "project.json": projectJson("b", "B") });
    await inbox.scan();
    // After a restart the browser forgets the permission of one folder.
    reels.fs.permissions.read = "prompt";
    reels.fs.permissions.readwrite = "prompt";
    await inbox.scan();
    expect(inbox.state.getState().folders.map((folder) => folder.access)).toEqual(["readwrite", "reconnect"]);
    expect(inbox.state.getState().entries.map((entry) => entry.title)).toEqual(["A"]);
    // The scan never asks.
    expect(reels.fs.requests).toEqual([]);
    reels.fs.answers = { readwrite: "granted" };
    expect(await inbox.reconnect(inbox.state.getState().folders[1]?.id ?? "")).toBe(true);
    expect(reels.fs.requests).toEqual(["readwrite"]);
    expect(inbox.state.getState().folders.map((folder) => folder.access)).toEqual(["readwrite", "readwrite"]);
    expect(inbox.state.getState().entries.map((entry) => entry.title).sort()).toEqual(["A", "B"]);
    // A refused request leaves the button.
    reels.fs.permissions.read = "prompt";
    reels.fs.permissions.readwrite = "prompt";
    reels.fs.answers = { readwrite: "denied", read: "denied" };
    expect(await inbox.reconnect(inbox.state.getState().folders[1]?.id ?? "")).toBe(false);
    expect(inbox.state.getState().folders[1]?.access).toBe("reconnect");
  });

  it("does not call the cards of a reconnected folder new", async () => {
    const { inbox, roots } = await setup("Videos");
    const root = roots[0] as MemoryDir;
    await put(root, "a", { "project.json": projectJson("a", "A") });
    await inbox.scan();
    root.fs.permissions.read = "prompt";
    root.fs.permissions.readwrite = "prompt";
    await inbox.scan();
    root.fs.permissions.read = "granted";
    root.fs.permissions.readwrite = "granted";
    expect(await inbox.scan()).toEqual([]);
  });

  it("marks an opened project reviewed by writing review.json: a temporary file, then the replace", async () => {
    const { inbox, roots } = await setup("Videos");
    const root = roots[0] as MemoryDir;
    const dir = await put(root, "a", { "project.json": projectJson("a", "A"), "card.json": JSON.stringify({ generationId: "g1" }) });
    await inbox.scan();
    const before = dir.files.get("project.json");
    root.fs.log.length = 0;
    await inbox.markOpened(dir, "a");
    expect(root.fs.log).toEqual(["write a/review.json.tmp", "write a/review.json"]);
    expect([...dir.files.keys()].sort()).toEqual(["card.json", "project.json", "review.json"]);
    expect(dir.files.get("project.json")).toBe(before);
    expect(await readReview(dir)).toMatchObject({ schema: "review/1", reviewedGenerationId: "g1" });
    await inbox.scan();
    expect(inbox.state.getState().entries[0]?.status).toBe("reviewed");
    // The generator builds it again: not reviewed, updated, and reported as new.
    await dir.writeText("card.json", JSON.stringify({ generationId: "g2" }));
    expect((await inbox.scan()).map((entry) => entry.status)).toEqual(["updated"]);
    const first = (await readReview(dir))?.firstOpenedAt;
    await inbox.markOpened(dir, "a");
    await inbox.scan();
    expect(inbox.state.getState().entries[0]?.status).toBe("reviewed");
    expect((await readReview(dir))?.firstOpenedAt).toBe(first);
  });

  it("keeps the old review.json when the replace fails", async () => {
    const dir = createMemoryDir("a");
    await writeReview(dir, review("g1"));
    dir.fs.fail = (op, path) => op === "write" && path === "review.json";
    await expect(writeReview(dir, review("g2"))).rejects.toThrow();
    expect((await readReview(dir))?.reviewedGenerationId).toBe("g1");
  });

  it("keeps the record in the browser, by project id and generation, when the folder is read only", async () => {
    const { inbox, roots, kv } = await setup("Videos");
    const root = roots[0] as MemoryDir;
    const dir = await put(root, "a", { "project.json": projectJson("a", "A"), "card.json": JSON.stringify({ generationId: "g1" }) });
    root.fs.permissions.readwrite = "denied";
    await inbox.scan();
    expect(inbox.state.getState().folders[0]?.access).toBe("read");
    await inbox.markOpened(dir, "a");
    expect(dir.files.has("review.json")).toBe(false);
    expect(dir.files.has("review.json.tmp")).toBe(false);
    const stored = kv.data.get("inbox-state.v1") as { reviews: Record<string, Review | null> };
    expect(stored.reviews["f1/a|a|g1"]).toMatchObject({ reviewedGenerationId: "g1" });
    await inbox.scan();
    expect(inbox.state.getState().entries[0]?.status).toBe("reviewed");
    // Another session of the browser reads the same record.
    const again = new Inbox((await setupFolders(kv)).folders, kv);
    await again.scan();
    expect(again.state.getState().entries[0]?.status).toBe("reviewed");
    // A new generation has no record: not reviewed again.
    root.fs.permissions.readwrite = "granted";
    await dir.writeText("card.json", JSON.stringify({ generationId: "g2" }));
    root.fs.permissions.readwrite = "denied";
    await inbox.scan();
    expect(inbox.state.getState().entries[0]?.status).toBe("new");
    // Writable again: the record moves into the folder.
    root.fs.permissions.readwrite = "granted";
    await inbox.markOpened(dir, "a");
    expect(dir.files.has("review.json")).toBe(true);
    expect((kv.data.get("inbox-state.v1") as { reviews: Record<string, unknown> }).reviews["f1/a|a|g2"]).toBeUndefined();
  });

  it("marks as reviewed and as not reviewed from the menu, also in a read-only folder", async () => {
    const { inbox, roots } = await setup("Videos");
    const root = roots[0] as MemoryDir;
    const dir = await put(root, "a", { "project.json": projectJson("a", "A") });
    await inbox.scan();
    const entry = () => inbox.state.getState().entries[0]!;
    await inbox.setReviewed(entry(), true);
    expect(entry().status).toBe("reviewed");
    expect(dir.files.has("review.json")).toBe(true);
    await inbox.setReviewed(entry(), false);
    expect(entry().status).toBe("new");
    expect(dir.files.has("review.json")).toBe(false);
    await inbox.setReviewed(entry(), true);
    root.fs.permissions.readwrite = "denied";
    await inbox.setReviewed(entry(), false);
    expect(dir.files.has("review.json")).toBe(true);
    expect(entry().status).toBe("new");
    await inbox.setReviewed(entry(), true);
    expect(entry().status).toBe("reviewed");
  });

  it("hides a removed card until the generator writes a new generation, and deletes nothing", async () => {
    const { inbox, roots, kv } = await setup("Videos");
    const root = roots[0] as MemoryDir;
    const dir = await put(root, "a", { "project.json": projectJson("a", "A"), "card.json": JSON.stringify({ generationId: "g1" }) });
    await inbox.scan();
    root.fs.log.length = 0;
    await inbox.hide(inbox.state.getState().entries[0]!);
    expect(inbox.state.getState().entries).toEqual([]);
    expect(root.fs.log).toEqual([]);
    await inbox.scan();
    expect(inbox.state.getState().entries).toEqual([]);
    const again = new Inbox((await setupFolders(kv)).folders, kv);
    await again.scan();
    expect(again.state.getState().entries).toEqual([]);
    await dir.writeText("card.json", JSON.stringify({ generationId: "g2" }));
    expect((await inbox.scan()).length).toBe(1);
    expect(inbox.state.getState().entries.length).toBe(1);
  });
});

/** The watched folders another session reads from the same store. */
async function setupFolders(kv: ReturnType<typeof memoryKeyValueStore>) {
  const folders = new WatchedFolders(kv, wrap);
  await folders.load();
  return { folders };
}

describe("WatchedFolders", () => {
  it("turns the single projects folder into the first watched folder", async () => {
    const kv = memoryKeyValueStore();
    const old = createMemoryDir("Calisthenics Shorts");
    await kv.set("projects-folder.v1", old);
    const folders = new WatchedFolders(kv, wrap, () => "first");
    await folders.load();
    expect(folders.list.getState()).toEqual([{ id: "first", label: "Calisthenics Shorts", name: "Calisthenics Shorts" }]);
    expect(folders.folders()[0]?.dir).toBe(old);
    // Once: the list is stored, a removed folder does not come back.
    await folders.remove("first");
    const next = new WatchedFolders(kv, wrap);
    await next.load();
    expect(next.list.getState()).toEqual([]);
  });

  it("starts empty with nothing stored, and keeps added folders across loads", async () => {
    const kv = memoryKeyValueStore();
    const folders = new WatchedFolders(kv, wrap);
    await folders.load();
    expect(folders.list.getState()).toEqual([]);
    const a = createMemoryDir("Videos");
    const b = createMemoryDir("Videos");
    await folders.add(a);
    await folders.add(b);
    // The same folder again is not added twice.
    await folders.add(a);
    expect(folders.list.getState().map((folder) => folder.label)).toEqual(["Videos", "Videos 2"]);
    const next = new WatchedFolders(kv, wrap);
    await next.load();
    expect(next.folders().map((folder) => folder.dir)).toEqual([a, b]);
  });

  it("renames with a clean, unique label; an empty label is the folder name", async () => {
    const kv = memoryKeyValueStore();
    const folders = new WatchedFolders(kv, wrap);
    const first = await folders.add(createMemoryDir("Videos"));
    const second = await folders.add(createMemoryDir("Reels"));
    await folders.rename(second.id, "videos");
    await folders.rename(first.id, "Shorts: daily/new");
    // "videos" is taken by the first folder (case ignored) until that one is renamed.
    expect(folders.list.getState().map((folder) => folder.label)).toEqual(["Shorts daily new", "videos 2"]);
    await folders.rename(second.id, "  ");
    expect(folders.list.getState()[1]?.label).toBe("Reels");
    expect(uniqueLabel("A", ["a", "A 2"])).toBe("A 3");
  });
});

describe("open links with several folders", () => {
  async function folders() {
    const { folders, roots } = await setup("Calisthenics Shorts", "Reels");
    const [shorts, reels] = roots as [MemoryDir, MemoryDir];
    await put(shorts, "handstand/project", { "project.json": projectJson("p1", "one") });
    await put(reels, "handstand/project", { "project.json": projectJson("p2", "two") });
    await put(reels, "monday", { "project.json": projectJson("p3", "three") });
    await put(reels, "empty", {});
    return { list: folders.folders(), shorts, reels };
  }

  it("tries the path in each folder in order and opens the first match", async () => {
    const { list, shorts, reels } = await folders();
    const first = await resolveOpenLink(list, "handstand/project");
    expect(first.kind === "found" && first.dir).toBe(await (await shorts.dir("handstand"))?.dir("project"));
    const second = await resolveOpenLink(list, "monday");
    expect(second.kind === "found" && second.dir).toBe(await reels.dir("monday"));
    expect(second.kind === "found" && second.folder.label).toBe("Reels");
  });

  it("opens in the named folder with <label>:<path>", async () => {
    const { list, reels } = await folders();
    expect(splitOpenLink("reels:handstand/project", ["Calisthenics Shorts", "Reels"])).toEqual({ label: "Reels", path: "handstand/project" });
    expect(splitOpenLink("other:handstand", ["Reels"])).toEqual({ label: null, path: "other:handstand" });
    const found = await resolveOpenLink(list, "Reels:handstand/project");
    expect(found.kind === "found" && found.dir).toBe(await (await reels.dir("handstand"))?.dir("project"));
    expect(await resolveOpenLink(list, "Calisthenics Shorts:monday")).toMatchObject({ kind: "missing", reason: "missing", path: "monday" });
  });

  it("says what is missing, and which folders need a click first", async () => {
    const { list, shorts, reels } = await folders();
    expect(await resolveOpenLink([], "monday")).toEqual({ kind: "noFolders" });
    expect(await resolveOpenLink(list, "nowhere")).toMatchObject({ kind: "missing", reason: "missing" });
    expect(await resolveOpenLink(list, "empty")).toMatchObject({ kind: "missing", reason: "noProject" });
    reels.fs.permissions.read = "prompt";
    reels.fs.permissions.readwrite = "prompt";
    // Found in a folder that can be read: no click needed.
    expect((await resolveOpenLink(list, "handstand/project")).kind).toBe("found");
    const locked = await resolveOpenLink(list, "monday");
    expect(locked.kind === "needsAccess" && locked.folders.map((folder) => folder.label)).toEqual(["Reels"]);
    expect(reels.fs.requests).toEqual([]);
    // The start screen's button: the click asks, then the project is found.
    reels.fs.answers = { readwrite: "granted" };
    expect((await resolveOpenLink(list, "monday", { request: true })).kind).toBe("found");
    expect(shorts.fs.requests).toEqual([]);
  });
});

describe("card words", () => {
  it("says how long ago and how long", () => {
    const now = Date.parse("2026-11-11T18:00:00Z");
    expect(relativeTime(now - 20_000, now)).toBe("just now");
    expect(relativeTime(now - 5 * 60_000, now)).toBe("5 min ago");
    expect(relativeTime(now - 2 * 3_600_000, now)).toBe("2 h ago");
    expect(relativeTime(now - 3 * 86_400_000, now)).toBe("3 d ago");
    expect(relativeTime(now + 5_000, now)).toBe("just now");
    expect(formatDuration(90.2)).toBe("1:30");
    expect(formatDuration(45)).toBe("0:45");
    expect(formatDuration(3725)).toBe("1:02:05");
  });
});
