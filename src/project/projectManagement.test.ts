// Batch 42's project-folder pieces: history backups listed and restored, the cache measured and
// cleared, templates saved and used, recent thumbnails kept.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renameProject } from "../core/commands/projectCommands.js";
import { createStore } from "../core/store/createStore.js";
import { DocumentStore } from "../core/store/DocumentStore.js";
import { createLayoutStore } from "../core/store/layoutStore.js";
import { createSessionStore } from "../core/store/sessionStore.js";
import { addCaptionTrack, makeProject, makeTrack } from "../core/document/fixtures.js";
import { createProject as createDocument } from "../core/document/project.js";
import type { TextPreset } from "../core/document/types.js";
import { validateProject } from "../core/document/validate.js";
import { STARTER_TITLE_ID, starterPresets } from "../text/starterPresets.js";
import { createAppSettings } from "./appSettings.js";
import { INITIAL_SAVE_STATUS, type SaveStatus } from "./Autosaver.js";
import { cacheSize, clearCache, formatBytes } from "./cache.js";
import { backupTime, listBackups } from "./history.js";
import { memoryKeyValueStore } from "./kv.js";
import { HISTORY_DIR, PROJECT_FOLDERS } from "./layout.js";
import { createMemoryDir, type MemoryDir } from "./memoryFs.js";
import { createProject, openProjectFolder } from "./openProject.js";
import { readPresetFolder, projectPresetsDir } from "./presetFiles.js";
import { parseProjectFile } from "./projectFile.js";
import { projectFormat, ProjectSession } from "./ProjectSession.js";
import { RecentProjects } from "./recentProjects.js";
import { cleanTemplateName, describeTemplate, projectFromTemplate, sanitizeTemplate, TemplateStore, templateFromProject } from "./templates.js";

function deps() {
  const session = createSessionStore();
  return {
    session,
    documentStore: new DocumentStore(createDocument({ id: "placeholder", name: "Placeholder", now: "x", appVersion: "x" }), { session, validate: true }),
    layout: createLayoutStore(null),
    recent: new RecentProjects(memoryKeyValueStore()),
    settings: createAppSettings(memoryKeyValueStore()),
    saveStatus: createStore<SaveStatus>(INITIAL_SAVE_STATUS),
    appVersion: "test",
  };
}

async function newProject(): Promise<MemoryDir> {
  const dir = createMemoryDir("Reel");
  await createProject(dir, "Reel", { width: 1080, height: 1920, fps: { num: 30, den: 1 } }, { appVersion: "test" });
  return dir;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-14T10:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("history backups (spec §15 History list)", () => {
  it("lists backups newest first with their time and size, ignoring other files", async () => {
    const dir = await newProject();
    const history = (await dir.dir(HISTORY_DIR)) as MemoryDir;
    await history.writeText("project-20261014-095900.json", "{}");
    await history.writeText("project-20261014-100000.json", "{ }");
    await history.writeText("project-20261014-100000-2.json", "{  }");
    await history.writeText("notes.txt", "keep");
    const backups = await listBackups(history);
    expect(backups.map((b) => b.name)).toEqual(["project-20261014-100000-2.json", "project-20261014-100000.json", "project-20261014-095900.json"]);
    expect(backups[2]).toMatchObject({ time: Date.UTC(2026, 9, 14, 9, 59, 0), size: 2, projectName: null });
    await history.writeText("project-20261014-100100.json", JSON.stringify({ name: "Reel", meta: { modifiedAt: "2026-10-14T10:00:30.000Z" } }));
    expect((await listBackups(history))[0]).toMatchObject({ name: "project-20261014-100100.json", time: Date.UTC(2026, 9, 14, 10, 0, 30), projectName: "Reel" });
    expect(backupTime("notes.txt")).toBeNull();
  });

  it("restoring a backup switches the document, keeps the pre-restore state as the newest backup, and autosave goes on", async () => {
    const dir = await newProject();
    const d = deps();
    const s = new ProjectSession(await openProjectFolder(dir), d);
    d.documentStore.dispatch(renameProject("First"));
    await s.saveNow();
    const history = (await dir.dir(HISTORY_DIR)) as MemoryDir;
    const [oldest] = await listBackups(history); // the "Reel" project.json the first save replaced
    expect(oldest).toBeDefined();
    d.documentStore.dispatch(renameProject("Second"));
    vi.setSystemTime(new Date("2026-10-14T10:05:00.000Z"));

    const backup = parseProjectFile((await history.readFile(oldest!.name))!.text);
    expect(backup.name).toBe("Reel");
    expect(await s.restoreBackup(backup)).toBe(true);
    // The document switched (undo history cleared, as for a recovery) and was saved at once.
    expect(d.documentStore.getState().name).toBe("Reel");
    expect(d.documentStore.history.getState().canUndo).toBe(false);
    expect(parseProjectFile(dir.text("project.json")!).name).toBe("Reel");
    // The pre-restore state ("Second", saved by the flush) is the newest backup.
    const [newest] = await listBackups(history);
    expect(parseProjectFile((await history.readFile(newest!.name))!.text).name).toBe("Second");
    // Autosave resumes: the next edit reaches project.json after the delay.
    d.documentStore.dispatch(renameProject("Third"));
    await vi.advanceTimersByTimeAsync(1100);
    expect(parseProjectFile(dir.text("project.json")!).name).toBe("Third");
    await s.close();
  });

  it("does not restore in a read-only project", async () => {
    const dir = await newProject();
    dir.fs.permissions.readwrite = "denied";
    const d = deps();
    const s = new ProjectSession(await openProjectFolder(dir), d);
    expect(s.readOnly).toBe(true);
    expect(await s.restoreBackup(makeProject())).toBe(false);
    expect(d.documentStore.getState().name).toBe("Reel");
    await s.close();
  });
});

describe("cache (spec §9.7 Clear cache)", () => {
  it("measures cache/ and clears its files, keeping the folders and everything outside it", async () => {
    const dir = await newProject();
    const cache = (await dir.dir("cache")) as MemoryDir;
    const thumbs = (await cache.dir("thumbs")) as MemoryDir;
    const sheet = (await thumbs.dir("m1", { create: true })) as MemoryDir;
    await sheet.writeFile("0-0.webp", new Blob([new Uint8Array(1500)]));
    await sheet.writeText("index.json", "{}");
    await ((await cache.dir("peaks")) as MemoryDir).writeFile("m1.bin", new Blob([new Uint8Array(500)]));
    await ((await cache.dir("proxies")) as MemoryDir).writeFile("m1.mp4", new Blob([new Uint8Array(3000)]));
    await ((await dir.dir("media")) as MemoryDir).writeFile("clip.mp4", new Blob([new Uint8Array(9)]));
    expect(await cacheSize(dir)).toEqual({ bytes: 5002, files: 4 });

    expect(await clearCache(dir)).toBe(4);
    expect(await cacheSize(dir)).toEqual({ bytes: 0, files: 0 });
    const tree = dir.tree();
    for (const folder of PROJECT_FOLDERS) expect(tree).toContain(`${folder}/`);
    expect(tree).toContain("media/clip.mp4");
    expect(tree).toContain("project.json");
  });

  it("formats sizes as file managers do", () => {
    expect([formatBytes(0), formatBytes(1), formatBytes(999), formatBytes(820_000), formatBytes(12_400_000), formatBytes(1_234_000_000)]).toEqual(["0 bytes", "1 byte", "999 bytes", "820 KB", "12.4 MB", "1.2 GB"]);
  });
});

describe("templates (spec §15)", () => {
  const preset = (): TextPreset => ({ ...(starterPresets().find((p) => p.id === STARTER_TITLE_ID) as TextPreset), id: "local-1", name: "Brand title" });

  function source() {
    let project = makeProject();
    project.settings = { ...project.settings, width: 1080, height: 1350, fps: { num: 25, den: 1 }, background: { r: 0.1, g: 0.2, b: 0.3, a: 1 } };
    project.tracks = [{ ...makeTrack("v1"), name: "Base" }, { ...makeTrack("v2"), name: "Overlay", locked: true }, { ...makeTrack("a1", "audio"), name: "Music", muted: true, height: "S" }];
    project = addCaptionTrack(project);
    (project.captionTracks.cc as { style: { maxLines: number } }).style.maxLines = 1;
    return project;
  }

  it("keeps settings, track layout, caption style and presets, never media or clips", () => {
    const template = templateFromProject(source(), [preset()], { id: "t1", name: "  Brand  reel ", now: "2026-10-14T10:00:00.000Z" });
    expect(template.name).toBe("Brand reel");
    expect(template.settings).toEqual({ width: 1080, height: 1350, fps: { num: 25, den: 1 }, background: { r: 0.1, g: 0.2, b: 0.3, a: 1 } });
    expect(template.tracks.map((t) => [t.kind, t.name, t.locked, t.muted, t.height])).toEqual([
      ["video", "Base", false, false, "M"],
      ["video", "Overlay", true, false, "M"],
      ["caption", "CC", false, false, "S"],
      ["audio", "Music", false, true, "S"],
    ]);
    expect(template.tracks[2]?.captionStyle?.maxLines).toBe(1);
    expect(describeTemplate(template, (fps) => String(fps.num / fps.den))).toBe("1080×1350 · 25 fps · 4 tracks · 1 preset");
    expect(JSON.stringify(template)).not.toContain("media/");

    let n = 0;
    const made = projectFromTemplate(template, createDocument({ id: "p2", name: "New", now: "x", appVersion: "x" }), () => `n${++n}`);
    expect(validateProject(made)).toEqual([]);
    expect(made.tracks.map((t) => [t.id, t.name])).toEqual([["n1", "Base"], ["n2", "Overlay"], ["n3", "CC"], ["n4", "Music"]]);
    expect(made.captionTracks.n3?.style.maxLines).toBe(1);
    expect(made.settings.background).toEqual({ r: 0.1, g: 0.2, b: 0.3, a: 1 });
    expect(Object.keys(made.clips)).toEqual([]);
  });

  it("New from template: the folder gets the tracks and the presets in presets/text/", async () => {
    const template = templateFromProject(source(), [preset()], { id: "t1", name: "Brand", now: "2026-10-14T10:00:00.000Z" });
    const dir = createMemoryDir("From template");
    const opened = await createProject(dir, "From template", { width: 720, height: 1280, fps: { num: 30, den: 1 } }, { appVersion: "test", template });
    expect(opened.project.settings).toMatchObject({ width: 720, height: 1280, fps: { num: 30, den: 1 }, background: { r: 0.1, g: 0.2, b: 0.3, a: 1 } });
    expect(opened.project.tracks.map((t) => t.name)).toEqual(["Base", "Overlay", "CC", "Music"]);
    const presets = await readPresetFolder((await projectPresetsDir(dir, false))!, "now");
    expect(presets.presets.map((p) => p.name)).toEqual(["Brand title"]);
    expect(parseProjectFile(dir.text("project.json")!).tracks).toHaveLength(4);
  });

  it("stores templates in IndexedDB newest first, replaces one of the same name, drops broken ones on load", async () => {
    const kv = memoryKeyValueStore();
    const store = new TemplateStore(kv);
    const a = templateFromProject(source(), [], { id: "a", name: "Reels", now: "1" });
    const b = templateFromProject(source(), [], { id: "b", name: "Shorts", now: "2" });
    await store.save(a);
    await store.save(b);
    await store.save({ ...a, id: "a2", name: "reels" });
    expect(store.list.getState().map((t) => t.id)).toEqual(["a2", "b"]);
    kv.data.set("templates.v1", [...(kv.data.get("templates.v1") as unknown[]), { id: "x", name: "Broken", settings: { width: -3 }, tracks: [] }, "junk"]);
    const reloaded = new TemplateStore(kv);
    await reloaded.load("now");
    expect(reloaded.list.getState().map((t) => t.id)).toEqual(["a2", "b"]);
    await reloaded.remove("a2");
    expect(reloaded.find("a2")).toBeNull();
    expect(sanitizeTemplate({ ...b, tracks: [{ ...b.tracks[0], kind: "nope" }] }, "now")).toBeNull();
    expect(cleanTemplateName("   ")).toBeNull();
  });

  it("a template saved by 1.0.0 (a caption style without x) loads, makes a valid project and survives the next save", async () => {
    const old = structuredClone(templateFromProject(source(), [], { id: "old", name: "From 1.0", now: "1" })) as unknown as { tracks: { captionStyle?: Record<string, unknown> }[] };
    const caption = old.tracks.find((track) => track.captionStyle)!;
    delete caption.captionStyle!.x;
    const kv = memoryKeyValueStore();
    kv.data.set("templates.v1", [old]);
    const store = new TemplateStore(kv);
    await store.load("now");
    const loaded = store.find("old");
    expect(loaded?.tracks.find((track) => track.kind === "caption")?.captionStyle).toMatchObject({ x: 0, maxLines: 1 });
    let n = 0;
    const made = projectFromTemplate(loaded!, createDocument({ id: "p3", name: "New", now: "x", appVersion: "x" }), () => `n${++n}`);
    expect(validateProject(made)).toEqual([]);
    expect(made.captionTracks.n3?.style).toMatchObject({ x: 0, position: "bottom", maxLines: 1 });
    await store.save(templateFromProject(source(), [], { id: "new", name: "Other", now: "2" }));
    const reloaded = new TemplateStore(kv);
    await reloaded.load("now");
    expect(reloaded.list.getState().map((t) => t.id)).toEqual(["new", "old"]);
  });
});

describe("recent projects (Batch 42 thumbnails)", () => {
  it("keeps the thumbnail and format across touches, and older entries load without them", async () => {
    const kv = memoryKeyValueStore();
    const recent = new RecentProjects(kv);
    const handle = { folder: "a" };
    await recent.touch({ id: "a", name: "A", pathHint: "a", modified: "m", handle, format: "1080×1920 · 30 fps" });
    const thumb = new Blob([new Uint8Array(4)], { type: "image/webp" });
    await recent.update("a", { thumbnail: thumb });
    await recent.touch({ id: "a", name: "A", pathHint: "a", modified: "m2", handle });
    expect(recent.list.getState()[0]).toMatchObject({ thumbnail: thumb, format: "1080×1920 · 30 fps", modified: "m2" });
    kv.data.set("recent-projects.v1", [{ id: "b", name: "B", pathHint: "b", modified: "m", handle, thumbnail: null }]);
    await recent.load();
    expect(recent.list.getState()[0]).toMatchObject({ id: "b", thumbnail: null, format: "" });
    expect(projectFormat(makeProject())).toBe("1080×1920 · 30 fps");
  });
});
