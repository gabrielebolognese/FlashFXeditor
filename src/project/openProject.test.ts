import { describe, expect, it, vi } from "vitest";
import { makeProject, makeTrack } from "../core/document/fixtures.js";
import { createMemoryDir, type MemoryDir } from "./memoryFs.js";
import { createProject, openProjectFolder, ProjectOpenError } from "./openProject.js";
import { ensureAccess } from "./permissions.js";
import { parseProjectFile, serializeProject } from "./projectFile.js";
import { parseSessionFile } from "./sessionFile.js";

const OPTIONS = { appVersion: "test", now: new Date("2026-10-14T10:00:00.000Z") };
const SETTINGS = { width: 1080, height: 1920, fps: { num: 30, den: 1 } };

async function newProjectDir(): Promise<MemoryDir> {
  let ids = 0;
  const dir = createMemoryDir("Summer Reel");
  await createProject(dir, "Summer reel", SETTINGS, { ...OPTIONS, newId: () => `id-${++ids}` });
  dir.fs.log.length = 0;
  return dir;
}

const failure = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error as ProjectOpenError;
  }
  throw new Error("expected a failure");
};

describe("createProject", () => {
  it("creates project.json, session.json and the §9.7 folders", async () => {
    const dir = createMemoryDir("Summer Reel");
    let ids = 0;
    const opened = await createProject(dir, "  Summer reel ", { width: 1080, height: 1350, fps: { num: 30000, den: 1001 } }, { ...OPTIONS, newId: () => `id-${++ids}` });
    expect(dir.tree()).toEqual([
      "cache/",
      "cache/export-temp/",
      "cache/index/",
      "cache/peaks/",
      "cache/proxies/",
      "cache/text/",
      "cache/thumbs/",
      "exports/",
      "history/",
      "media/",
      "presets/",
      "presets/text/",
      "project.json",
      "session.json",
    ]);
    // project.json is written last: a folder with it is complete.
    expect(dir.fs.log.at(-1)).toBe("write project.json");
    const saved = parseProjectFile(dir.text("project.json")!);
    expect(saved).toEqual(opened.project);
    expect(saved).toMatchObject({ id: "id-1", name: "Summer reel", settings: { width: 1080, height: 1350, fps: { num: 30000, den: 1001 } } });
    expect(saved.tracks.map((t) => [t.name, t.kind])).toEqual([
      ["V1", "video"],
      ["A1", "audio"],
    ]);
    expect(parseSessionFile(dir.text("session.json")!)).toEqual(opened.session);
    expect(opened).toMatchObject({ access: "readwrite", recovery: null });
  });

  it("falls back to the folder name for an empty name", async () => {
    const opened = await createProject(createMemoryDir("Clip Folder"), "   ", SETTINGS, OPTIONS);
    expect(opened.project.name).toBe("Clip Folder");
  });

  it("refuses a folder that already holds a project, writing nothing", async () => {
    const dir = await newProjectDir();
    const error = await failure(createProject(dir, "Other", SETTINGS, OPTIONS));
    expect(error).toBeInstanceOf(ProjectOpenError);
    expect(error.reason).toBe("exists");
    expect(dir.fs.writes).toBe(0);
  });

  it("refuses without write permission, writing nothing", async () => {
    const dir = createMemoryDir();
    dir.fs.permissions.readwrite = "denied";
    expect((await failure(createProject(dir, "X", SETTINGS, OPTIONS))).reason).toBe("permission");
    expect(dir.fs.writes).toBe(0);
  });
});

describe("openProjectFolder", () => {
  it("opens what createProject wrote", async () => {
    const dir = await newProjectDir();
    const opened = await openProjectFolder(dir);
    expect(opened.project.name).toBe("Summer reel");
    expect(opened.access).toBe("readwrite");
    expect(opened.recovery).toBeNull();
    // The layout is complete already: opening writes nothing.
    expect(dir.fs.writes).toBe(0);
  });

  it("recreates missing folders when writable", async () => {
    const dir = await newProjectDir();
    dir.dirs.delete("cache");
    await openProjectFolder(dir);
    expect(dir.tree()).toContain("cache/peaks/");
  });

  it("fails on a folder without project.json", async () => {
    const error = await failure(openProjectFolder(createMemoryDir("Random")));
    expect(error.reason).toBe("missing");
    expect(error.message).toContain("Random");
  });

  it("fails on an invalid project.json with its issues", async () => {
    const dir = createMemoryDir();
    const project = makeProject();
    project.tracks.push(makeTrack("t", "video", ["ghost"]));
    await dir.writeText("project.json", serializeProject(project, { now: "x", appVersion: "y" }));
    const error = await failure(openProjectFolder(dir));
    expect(error.reason).toBe("invalid");
    expect(error.issues.join()).toContain("ghost");
  });

  it("uses default session state when session.json is missing or broken", async () => {
    const dir = await newProjectDir();
    await dir.writeText("session.json", "{ broken");
    expect((await openProjectFolder(dir)).session.state.playhead).toBe(0);
    dir.files.delete("session.json");
    expect((await openProjectFolder(dir)).session.selection.kind).toBe("none");
  });

  describe("permission denied", () => {
    it("opens read-only with zero writes when write access is denied", async () => {
      const dir = await newProjectDir();
      dir.files.set("project.json.tmp", { text: "stale", lastModified: 1 }); // would be cleaned up if writable
      dir.dirs.delete("cache"); // would be recreated if writable
      dir.fs.permissions.readwrite = "prompt";
      dir.fs.answers.readwrite = "denied";
      const opened = await openProjectFolder(dir);
      expect(opened.access).toBe("read");
      expect(dir.fs.requests).toEqual(["readwrite"]);
      expect(dir.fs.writes).toBe(0);
      expect(dir.files.has("project.json.tmp")).toBe(true);
    });

    it("fails with reason 'permission' when even reading is denied", async () => {
      const dir = await newProjectDir();
      dir.fs.permissions.readwrite = "prompt";
      dir.fs.permissions.read = "prompt";
      dir.fs.answers = { readwrite: "denied", read: "denied" };
      expect((await failure(openProjectFolder(dir))).reason).toBe("permission");
      expect(dir.fs.requests).toEqual(["readwrite", "read"]);
    });
  });

  describe("crash recovery", () => {
    async function withTmp(mutate: (dir: MemoryDir) => void | Promise<void>) {
      const dir = await newProjectDir();
      await mutate(dir);
      dir.fs.log.length = 0;
      return { dir, opened: await openProjectFolder(dir) };
    }

    const renamedText = (dir: MemoryDir, name: string) => {
      const project = parseProjectFile(dir.text("project.json")!);
      return serializeProject({ ...project, name }, { now: "2026-10-14T10:05:00.000Z", appVersion: "test" });
    };

    it("offers a newer, valid, different tmp", async () => {
      const { opened } = await withTmp((dir) => dir.writeText("project.json.tmp", renamedText(dir, "Unsaved name")));
      expect(opened.recovery?.project.name).toBe("Unsaved name");
      expect(opened.recovery!.modified).toBeGreaterThan(opened.recovery!.savedModified!);
    });

    it("ignores and deletes a tmp older than project.json", async () => {
      const { dir, opened } = await withTmp(async (d) => {
        await d.writeText("project.json.tmp", renamedText(d, "Old"));
        await d.writeText("project.json", d.text("project.json")!);
      });
      expect(opened.recovery).toBeNull();
      expect(dir.files.has("project.json.tmp")).toBe(false);
    });

    it("ignores a tmp identical to project.json (crash after the real write)", async () => {
      const { opened } = await withTmp((d) => d.writeText("project.json.tmp", d.text("project.json")!));
      expect(opened.recovery).toBeNull();
    });

    it("ignores an invalid tmp (crash during the tmp write)", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const { dir, opened } = await withTmp((d) => d.writeText("project.json.tmp", '{"schemaVersion":1,"na'));
      expect(opened.recovery).toBeNull();
      expect(dir.fs.log).toEqual(["remove project.json.tmp"]);
    });
  });
});

describe("ensureAccess", () => {
  it("returns readwrite without prompting when already granted", async () => {
    const dir = createMemoryDir();
    expect(await ensureAccess(dir, { request: true })).toBe("readwrite");
    expect(dir.fs.requests).toEqual([]);
  });

  it("prompts for readwrite when the browser would ask", async () => {
    const dir = createMemoryDir();
    dir.fs.permissions.readwrite = "prompt";
    dir.fs.answers.readwrite = "granted";
    expect(await ensureAccess(dir, { request: true })).toBe("readwrite");
  });

  it("only checks with request: false", async () => {
    const dir = createMemoryDir();
    dir.fs.permissions.readwrite = "prompt";
    dir.fs.permissions.read = "prompt";
    expect(await ensureAccess(dir, { request: false })).toBe("none");
    expect(dir.fs.requests).toEqual([]);
  });

  it("re-asks a denied permission only on retry", async () => {
    const dir = createMemoryDir();
    dir.fs.permissions.readwrite = "denied";
    dir.fs.answers.readwrite = "granted";
    expect(await ensureAccess(dir, { request: true })).toBe("read");
    expect(dir.fs.requests).toEqual([]);
    expect(await ensureAccess(dir, { request: true, retry: true })).toBe("readwrite");
    expect(dir.fs.requests).toEqual(["readwrite"]);
  });

  it("does not re-ask a denied permission and treats a throwing request (no user gesture) as not granted", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const dir = createMemoryDir();
    dir.fs.permissions.readwrite = "denied";
    dir.fs.permissions.read = "prompt";
    dir.requestPermission = () => Promise.reject(new DOMException("User activation is required", "SecurityError"));
    expect(await ensureAccess(dir, { request: true })).toBe("none");
  });
});
