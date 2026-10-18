import { describe, expect, it } from "vitest";
import { createMemoryDir, type MemoryDir } from "../project/memoryFs.js";
import { clearExportTemp, ExportFile, saveExport, type PickedFile } from "./exportFile.js";

const bytes = (...values: number[]) => new Uint8Array(values);

async function content(dir: MemoryDir, path: string): Promise<number[]> {
  const parts = path.split("/");
  const name = parts.pop() as string;
  let at: MemoryDir | null = dir;
  for (const part of parts) at = (await at?.dir(part)) ?? null;
  const file = await at?.getFile(name);
  return file ? [...new Uint8Array(await file.arrayBuffer())] : [];
}

describe("ExportFile", () => {
  it("writes at positions in cache/export-temp/ and moves the finished file into exports/", async () => {
    const root = createMemoryDir();
    const file = await ExportFile.create(root, "job");
    expect(root.tree()).toContain("cache/export-temp/job.mp4");
    file.write(bytes(1, 2, 3, 4), 0);
    file.write(bytes(9, 9), 8);
    file.write(bytes(5, 6), 4);
    expect(file.bytes).toBe(10);
    expect(await file.finish("Short-reels-2026-10-18.mp4")).toBe("Short-reels-2026-10-18.mp4");
    expect(await content(root, "exports/Short-reels-2026-10-18.mp4")).toEqual([1, 2, 3, 4, 5, 6, 0, 0, 9, 9]);
    expect(root.tree().filter((path) => path.startsWith("cache/export-temp/"))).toEqual(["cache/export-temp/"]);
  });

  it("takes a free name next to an earlier export of the same name", async () => {
    const root = createMemoryDir();
    for (const expected of ["A.mp4", "A (2).mp4", "A (3).mp4"]) {
      const file = await ExportFile.create(root, expected);
      file.write(bytes(1), 0);
      expect(await file.finish("A.mp4")).toBe(expected);
    }
    expect(root.tree().filter((path) => path.startsWith("exports/"))).toEqual(["exports/", "exports/A (2).mp4", "exports/A (3).mp4", "exports/A.mp4"]);
  });

  it("discards: nothing in exports/, and the temp file is gone", async () => {
    const root = createMemoryDir();
    const file = await ExportFile.create(root, "job");
    file.write(bytes(1, 2), 0);
    await file.discard();
    expect(root.tree().filter((path) => path.endsWith(".mp4"))).toEqual([]);
    expect((await root.dir("exports"))?.tree() ?? []).toEqual([]);
  });

  it("keeps the first failed write: later ones are skipped, finish throws it, onError hears it", async () => {
    const root = createMemoryDir();
    const errors: unknown[] = [];
    const file = await ExportFile.create(root, "job", (error) => errors.push(error));
    let writes = 0;
    root.fs.fail = (op, path) => op === "write" && path.endsWith("job.mp4") && ++writes === 2;
    file.write(bytes(1), 0);
    file.write(bytes(2), 1);
    file.write(bytes(3), 2);
    await expect(file.finish("A.mp4")).rejects.toMatchObject({ name: "InvalidStateError" });
    expect(errors).toHaveLength(1);
    expect(writes).toBe(2);
    await file.discard();
    expect(root.tree().filter((path) => path.endsWith(".mp4"))).toEqual([]);
  });
});

describe("clearExportTemp", () => {
  it("deletes the temp files interrupted exports left", async () => {
    const root = createMemoryDir();
    const temp = await (await (await root.dir("cache", { create: true }))?.dir("export-temp", { create: true }));
    await temp?.writeFile("old.mp4", new Blob([bytes(1)]));
    await temp?.writeFile("old.mp4.crswap", new Blob([bytes(1)]));
    await clearExportTemp(root);
    expect(temp?.tree()).toEqual([]);
    await clearExportTemp(createMemoryDir());
  });
});

/** A picked file in memory: the committed content, and whether it was removed. */
function picked(name: string) {
  const state = { content: [] as number[], removed: false, aborted: false };
  const file: PickedFile = {
    name,
    async openWritable() {
      const staged: number[] = [];
      return {
        write: async (data: Uint8Array, position: number) => {
          data.forEach((value, i) => (staged[position + i] = value));
        },
        close: async () => {
          state.content = Array.from(staged, (value) => value ?? 0);
        },
        abort: async () => {
          state.aborted = true;
        },
      };
    },
    remove: async () => {
      state.removed = true;
    },
  };
  return { file, state };
}

describe("ExportFile to a picked file", () => {
  it("writes in place and commits under the picked name, touching no project folder", async () => {
    const { file, state } = picked("Final.mp4");
    const out = await ExportFile.toPicked(file);
    out.write(bytes(1, 2), 0);
    out.write(bytes(7), 3);
    expect(await out.finish("ignored.mp4")).toBe("Final.mp4");
    expect(state.content).toEqual([1, 2, 0, 7]);
    expect(state.removed).toBe(false);
  });

  it("discards by aborting the write and removing what the picker made", async () => {
    const { file, state } = picked("Final.mp4");
    const out = await ExportFile.toPicked(file);
    out.write(bytes(1), 0);
    await out.discard();
    expect(state).toMatchObject({ aborted: true, removed: true, content: [] });
  });
});

describe("saveExport", () => {
  it("writes into exports/ under a free name, or into the picked file", async () => {
    const root = createMemoryDir();
    expect(await saveExport({ root }, "frame.png", new Blob([bytes(1, 2)]))).toBe("frame.png");
    expect(await saveExport({ root }, "frame.png", new Blob([bytes(3)]))).toBe("frame (2).png");
    expect(await content(root, "exports/frame (2).png")).toEqual([3]);
    const { file, state } = picked("Mine.srt");
    expect(await saveExport({ picked: file }, "x.srt", new Blob([bytes(65, 66)]))).toBe("Mine.srt");
    expect(state.content).toEqual([65, 66]);
  });
});
