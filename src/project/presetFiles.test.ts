import { describe, expect, it } from "vitest";
import type { TextPreset } from "../core/document/types.js";
import { formatPresetFile } from "../text/presets.js";
import { DEFAULT_TEXT_STYLE } from "../text/style.js";
import { createMemoryDir, type MemoryDir } from "./memoryFs.js";
import { PresetFolderWriter, projectPresetsDir, readPresetFolder } from "./presetFiles.js";

const NOW = "2026-10-16T10:00:00.000Z";
const LATER = "2026-10-16T11:00:00.000Z";

const preset = (id: string, patch: Partial<TextPreset> = {}): TextPreset => ({
  id,
  name: id.toUpperCase(),
  style: structuredClone(DEFAULT_TEXT_STYLE),
  box: { mode: "auto", width: 900 },
  applyPosition: false,
  tags: [],
  favorite: false,
  createdAt: NOW,
  updatedAt: NOW,
  ...patch,
});

describe("project preset folder", () => {
  it("is presets/text in the project, made only when asked", async () => {
    const root = createMemoryDir();
    expect(await projectPresetsDir(root, false)).toBeNull();
    expect(root.fs.writes).toBe(0);
    const dir = (await projectPresetsDir(root, true)) as MemoryDir;
    expect(dir.path).toBe("presets/text");
    expect(await projectPresetsDir(root, false)).toBe(dir);
  });
});

describe("PresetFolderWriter", () => {
  it("writes changed presets only and removes the ones that left", async () => {
    const root = createMemoryDir();
    const dir = (await projectPresetsDir(root, true)) as MemoryDir;
    const writer = new PresetFolderWriter(dir);
    const a = preset("a");
    const b = preset("b");
    await writer.write([a, b]);
    expect([...dir.files.keys()].sort()).toEqual(["a.json", "b.json"]);
    expect(dir.files.get("a.json")?.text).toBe(formatPresetFile(a));
    const before = root.fs.writes;
    await writer.write([a, b]);
    expect(root.fs.writes).toBe(before);
    const renamed = { ...a, name: "Renamed", updatedAt: LATER };
    await writer.write([renamed]);
    expect([...dir.files.keys()]).toEqual(["a.json"]);
    expect(JSON.parse(dir.files.get("a.json")!.text).name).toBe("Renamed");
  });

  it("does not rewrite what a read found, and keeps writing after a failure", async () => {
    const root = createMemoryDir();
    const dir = (await projectPresetsDir(root, true)) as MemoryDir;
    await dir.writeText("a.json", formatPresetFile(preset("a")));
    const writer = new PresetFolderWriter(dir);
    writer.know([preset("a")]);
    const before = root.fs.writes;
    await writer.write([preset("a")]);
    expect(root.fs.writes).toBe(before);
    root.fs.fail = (op) => op === "write";
    await expect(writer.write([preset("a"), preset("b")])).rejects.toThrow("Simulated failure");
    root.fs.fail = null;
    await writer.write([preset("a"), preset("b")]);
    expect(dir.files.has("b.json")).toBe(true);
  });
});

describe("readPresetFolder", () => {
  it("reads every preset file, skipping other files, the newer of two copies winning", async () => {
    const dir = createMemoryDir("Library");
    await dir.writeText("a.json", formatPresetFile(preset("a")));
    await dir.writeText("a-copy.json", formatPresetFile(preset("a", { name: "Newer", updatedAt: LATER })));
    await dir.writeText("b.JSON", formatPresetFile(preset("b")));
    await dir.writeText("notes.txt", "hello");
    await dir.writeText("broken.json", "{");
    await dir.writeText("other.json", JSON.stringify({ hello: "world" }));
    await dir.dir("sub", { create: true });
    const { presets, skipped } = await readPresetFolder(dir, NOW);
    expect(presets.map((p) => [p.id, p.name]).sort()).toEqual([
      ["a", "Newer"],
      ["b", "B"],
    ]);
    expect(skipped).toBe(2);
  });
});