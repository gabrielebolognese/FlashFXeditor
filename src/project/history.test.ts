import { describe, expect, it } from "vitest";
import { backupName, backupsToDelete, backupSortKey, backupStamp, rotateHistory } from "./history.js";
import { createMemoryDir } from "./memoryFs.js";

const at = (iso: string) => new Date(iso);

describe("backup names", () => {
  it("formats project-YYYYMMDD-HHMMSS.json in UTC", () => {
    expect(backupStamp(at("2026-03-05T07:08:09.999Z"))).toBe("20260305-070809");
    expect(backupName(at("2026-03-05T07:08:09Z"), new Set())).toBe("project-20260305-070809.json");
  });

  it("adds a counter for saves within the same second", () => {
    const existing = new Set(["project-20260305-070809.json", "project-20260305-070809-2.json"]);
    expect(backupName(at("2026-03-05T07:08:09Z"), existing)).toBe("project-20260305-070809-3.json");
  });

  it("sorts suffixed names after the plain one of the same second, and ignores other files", () => {
    expect(backupSortKey("project-20260305-070809.json")! < backupSortKey("project-20260305-070809-2.json")!).toBe(true);
    expect(backupSortKey("project-20260305-070809-10.json")! > backupSortKey("project-20260305-070809-9.json")!).toBe(true);
    expect(backupSortKey("notes.txt")).toBeNull();
    expect(backupSortKey("project-2026-03-05.json")).toBeNull();
  });
});

describe("rotation", () => {
  it("deletes the oldest backups beyond the limit and nothing else", () => {
    const names = ["readme.md", "project-20260101-000003.json", "project-20260101-000001.json", "project-20260101-000002.json", "project-20260101-000001-2.json"];
    expect(backupsToDelete(names, 2)).toEqual(["project-20260101-000001.json", "project-20260101-000001-2.json"]);
    expect(backupsToDelete(names, 20)).toEqual([]);
  });

  it("rotates a history folder to 20 files", async () => {
    const root = createMemoryDir();
    const history = (await root.dir("history", { create: true }))!;
    for (let i = 0; i < 25; i++) await history.writeText(`project-20260101-0000${String(i).padStart(2, "0")}.json`, "{}");
    await history.writeText("keep-me.txt", "");
    const deleted = await rotateHistory(history);
    expect(deleted).toHaveLength(5);
    expect(deleted[0]).toBe("project-20260101-000000.json");
    expect([...history.files.keys()].filter((n) => n.startsWith("project-"))).toHaveLength(20);
    expect(history.files.has("keep-me.txt")).toBe(true);
    expect(history.files.has("project-20260101-000024.json")).toBe(true);
  });
});
