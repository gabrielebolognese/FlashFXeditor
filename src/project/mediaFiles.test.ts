import { describe, expect, it } from "vitest";
import { ensureFolderLayout } from "./layout.js";
import { copyIntoMedia, openWritableAt, posterPath, proxyPartPath, proxyPath, removeFileAt, renameFileAt, resolveFile, safeFileName, sampleIndexPath, takenNames, uniqueName, writeFileAt } from "./mediaFiles.js";
import { createMemoryDir } from "./memoryFs.js";

describe("safeFileName", () => {
  it("replaces characters file systems refuse and keeps the extension", () => {
    expect(safeFileName('clip: "final"?.mov')).toBe("clip_ _final__.mov");
    expect(safeFileName("a/b\\c|d*e<f>.mp4")).toBe("a_b_c_d_e_f_.mp4");
    expect(safeFileName("tab\there.png")).toBe("tab_here.png");
    expect(safeFileName("trailing. . ")).toBe("trailing");
  });

  it("guards reserved and empty names and caps the length", () => {
    expect(safeFileName("CON.mp4")).toBe("_CON.mp4");
    expect(safeFileName("   .mp4")).toBe("_.mp4");
    expect(safeFileName(".hidden")).toBe("_.hidden");
    expect(safeFileName("")).toBe("_");
    const long = safeFileName(`${"x".repeat(400)}.mov`);
    expect(long).toHaveLength(180);
    expect(long.endsWith(".mov")).toBe(true);
  });
});

describe("uniqueName", () => {
  it("numbers duplicates case-insensitively and records what it hands out", () => {
    const taken = new Set(["clip.mov", "clip (2).mov"]);
    expect(uniqueName(taken, "Clip.MOV")).toBe("Clip (3).MOV");
    expect(uniqueName(taken, "clip.mov")).toBe("clip (4).mov");
    expect(uniqueName(taken, "other.png")).toBe("other.png");
    expect(uniqueName(taken, "other.png")).toBe("other (2).png");
    expect(uniqueName(taken, "README")).toBe("README");
    expect(uniqueName(taken, "README")).toBe("README (2)");
  });
});

describe("copyIntoMedia", () => {
  it("streams the file into media/ under a unique name, reporting progress", async () => {
    const root = createMemoryDir();
    await ensureFolderLayout(root);
    const media = await root.dir("media");
    await media?.writeText("clip.mov", "existing");
    const taken = await takenNames(media!);
    const progress: number[] = [];
    const relPath = await copyIntoMedia(root, new Blob(["0123456789"]), "clip.mov", taken, { onProgress: (n) => progress.push(n) });
    expect(relPath).toBe("media/clip (2).mov");
    expect(progress).toEqual([5, 10]);
    expect(await (await resolveFile(root, relPath))?.text()).toBe("0123456789");
    expect(media?.text("clip.mov")).toBe("existing");
  });

  it("leaves no file behind when the copy fails or is aborted", async () => {
    const root = createMemoryDir();
    root.fs.fail = (op, path) => op === "write" && path.startsWith("media/");
    await expect(copyIntoMedia(root, new Blob(["x"]), "a.mp4", new Set())).rejects.toThrow(/Simulated failure/);
    expect(root.tree()).toEqual(["media/"]);

    root.fs.fail = null;
    const controller = new AbortController();
    const copy = copyIntoMedia(root, new Blob(["0123456789"]), "b.mp4", new Set(), { signal: controller.signal, onProgress: () => controller.abort() });
    await expect(copy).rejects.toMatchObject({ name: "AbortError" });
    expect(root.tree()).toEqual(["media/"]);
  });
});

describe("relative paths", () => {
  it("writes, resolves and removes files below folders", async () => {
    const root = createMemoryDir();
    await writeFileAt(root, posterPath("m1"), new Blob(["webp"]));
    expect(root.tree()).toEqual(["cache/", "cache/thumbs/", "cache/thumbs/m1.poster.webp"]);
    expect(await (await resolveFile(root, "cache/thumbs/m1.poster.webp"))?.text()).toBe("webp");
    expect(await resolveFile(root, "cache/none/x.webp")).toBeNull();
    expect(await resolveFile(root, "missing.mp4")).toBeNull();
    await removeFileAt(root, "cache/thumbs/m1.poster.webp");
    expect(await resolveFile(root, "cache/thumbs/m1.poster.webp")).toBeNull();
  });
});

describe("proxy files", () => {
  it("names the proxy, its part file and its own sample index", () => {
    expect(proxyPath("m1")).toBe("cache/proxies/m1.mp4");
    expect(proxyPartPath("m1")).toBe("cache/proxies/m1.mp4.part");
    expect(sampleIndexPath("m1")).toBe("cache/index/m1.bin");
    expect(sampleIndexPath("m1", "proxy")).toBe("cache/index/m1.proxy.bin");
  });

  it("writes at positions, commits on close and renames the part file", async () => {
    const root = createMemoryDir();
    const writable = await openWritableAt(root, proxyPartPath("m1"));
    expect(root.tree()).toContain("cache/proxies/m1.mp4.part");
    await writable.write(new Uint8Array([1, 2, 3, 4]), 0);
    await writable.write(new Uint8Array([9]), 1);
    await writable.write(new Uint8Array([7, 7]), 6);
    expect((await resolveFile(root, proxyPartPath("m1")))?.size).toBe(0);
    await writable.close();
    const bytes = new Uint8Array(await ((await resolveFile(root, proxyPartPath("m1"))) as File).arrayBuffer());
    expect([...bytes]).toEqual([1, 9, 3, 4, 0, 0, 7, 7]);
    await renameFileAt(root, proxyPartPath("m1"), proxyPath("m1"));
    expect(root.tree()).toEqual(["cache/", "cache/proxies/", "cache/proxies/m1.mp4"]);
    await expect(renameFileAt(root, proxyPath("m1"), "media/m1.mp4")).rejects.toThrow("not the same folder");
  });

  it("discards an aborted write", async () => {
    const root = createMemoryDir();
    const writable = await openWritableAt(root, proxyPartPath("m1"));
    await writable.write(new Uint8Array([1, 2]), 0);
    await writable.abort();
    await expect(writable.write(new Uint8Array([3]), 2)).rejects.toMatchObject({ name: "InvalidStateError" });
    expect((await resolveFile(root, proxyPartPath("m1")))?.size).toBe(0);
  });
});
