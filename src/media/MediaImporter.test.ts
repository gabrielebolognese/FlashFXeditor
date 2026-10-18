import { describe, expect, it, vi } from "vitest";
import { renameMedia } from "../core/commands/mediaCommands.js";
import { makeProject } from "../core/document/fixtures.js";
import { DocumentStore } from "../core/store/DocumentStore.js";
import { createSessionStore } from "../core/store/sessionStore.js";
import { ensureFolderLayout } from "../project/layout.js";
import { createMemoryDir } from "../project/memoryFs.js";
import { resolveFile } from "../project/mediaFiles.js";
import { createProbeFile, MediaImporter, mediaItemFrom, type ProbeFile } from "./MediaImporter.js";
import type { ProbeResult } from "./probe/types.js";
import { ProbeError } from "./probe/types.js";

const VIDEO: ProbeResult = { kind: "video", durationUs: 10_000_000, width: 1920, height: 1080, rotation: 90, fps: { num: 30, den: 1 }, hasAudio: true, codec: "hvc1.1.6.L153.90", audioCodec: "mp4a.40.2", audio: { channels: 2, sampleRate: 44100 } };
const AUDIO: ProbeResult = { kind: "audio", durationUs: 61_000_500, hasAudio: true, audioCodec: "mp3", audio: { channels: 2, sampleRate: 0 } };
const IMAGE: ProbeResult = { kind: "image", durationUs: 0, width: 640, height: 480, hasAudio: false, codec: "png" };

const fileOf = (name: string, size = 10, type = "") => new File([new Uint8Array(size)], name, { type });

async function setup(probe: ProbeFile = async (file) => (file.name.endsWith(".mp3") ? AUDIO : file.name.endsWith(".png") ? IMAGE : VIDEO)) {
  const dir = createMemoryDir();
  await ensureFolderLayout(dir);
  const documentStore = new DocumentStore(makeProject(), { session: createSessionStore(), validate: true });
  let n = 0;
  const importer = new MediaImporter({ dir, documentStore, probe, newId: () => `m${++n}`, now: () => "2026-10-14T12:00:00.000Z" });
  return { dir, documentStore, importer };
}

describe("mediaItemFrom", () => {
  it("maps the probe and starts the analysis that applies to the kind", () => {
    const fields = { id: "a", name: "IMG_0001.MOV", file: { relPath: "media/IMG_0001.MOV" }, addedAt: "t" };
    expect(mediaItemFrom(VIDEO, fields)).toEqual({
      id: "a",
      kind: "video",
      name: "IMG_0001.MOV",
      file: { relPath: "media/IMG_0001.MOV" },
      durationUs: 10_000_000,
      width: 1920,
      height: 1080,
      rotation: 90,
      fps: { num: 30, den: 1 },
      hasAudio: true,
      codec: "hvc1.1.6.L153.90",
      audioCodec: "mp4a.40.2",
      analysis: { thumbs: "pending", peaks: "pending" },
      addedAt: "t",
    });
    expect(mediaItemFrom(VIDEO, { ...fields, file: { handleKey: "a", pathHint: "Shoot/IMG_0001.MOV" }, size: 99 })).toMatchObject({ file: { handleKey: "a", pathHint: "Shoot/IMG_0001.MOV" }, size: 99 });
    expect(mediaItemFrom(AUDIO, fields).analysis).toEqual({ thumbs: "none", peaks: "pending" });
    expect(mediaItemFrom(IMAGE, fields).analysis).toEqual({ thumbs: "none", peaks: "none" });
    expect(mediaItemFrom({ ...VIDEO, hasAudio: false }, fields).analysis).toEqual({ thumbs: "pending", peaks: "none" });
  });
});

describe("MediaImporter", () => {
  it("copies every file into media/ and adds them in one undo step", async () => {
    const { dir, documentStore, importer } = await setup();
    const report = await importer.importFiles([fileOf("IMG_0001.MOV", 30), fileOf("android.mp4", 20), fileOf("logo.png", 5), fileOf("song.mp3", 7)]);
    expect(report.refused).toEqual([]);
    expect(report.bytes).toBe(62);
    const media = Object.values(documentStore.getState().media);
    expect(media.map((m) => [m.name, m.kind, "relPath" in m.file && m.file.relPath])).toEqual([
      ["IMG_0001.MOV", "video", "media/IMG_0001.MOV"],
      ["android.mp4", "video", "media/android.mp4"],
      ["logo.png", "image", "media/logo.png"],
      ["song.mp3", "audio", "media/song.mp3"],
    ]);
    expect((await resolveFile(dir, "media/IMG_0001.MOV"))?.size).toBe(30);
    expect(documentStore.history.getState().undoLabel).toBe("Import 4 media files");
    documentStore.undo();
    expect(documentStore.getState().media).toEqual({});
  });

  it("places the new items in the same undo step when asked (files dropped on the timeline, spec §6.14)", async () => {
    const { documentStore, importer } = await setup();
    const seen: string[][] = [];
    await importer.importFiles([fileOf("a.mp4"), fileOf("b.png")], {
      placeLabel: "Drop files",
      place: (items) => {
        seen.push(items.map((item) => item.name));
        // The items are in the document already, inside the transaction.
        documentStore.dispatch(renameMedia(items[0]!.id, "placed"));
      },
    });
    expect(seen).toEqual([["a.mp4", "b.png"]]);
    expect(documentStore.getState().media.m1?.name).toBe("placed");
    expect(documentStore.history.getState().undoLabel).toBe("Drop files");
    documentStore.undo();
    expect(documentStore.getState().media).toEqual({});
    expect(documentStore.history.getState().canUndo).toBe(false);
  });

  it("refuses unsupported files by name and creates nothing for them", async () => {
    const probe = vi.fn<ProbeFile>(async () => VIDEO);
    const { dir, documentStore, importer } = await setup(probe);
    const report = await importer.importFiles([fileOf("notes.txt"), fileOf("movie.webm")]);
    expect(report).toEqual({ added: [], refused: [{ name: "notes.txt", reason: "unsupported file type" }, { name: "movie.webm", reason: "unsupported file type" }], bytes: 0, linked: 0 });
    expect(probe).not.toHaveBeenCalled();
    expect(documentStore.getState().media).toEqual({});
    expect(documentStore.history.getState().canUndo).toBe(false);
    expect(dir.fs.log.filter((op) => op.startsWith("write"))).toEqual([]);
  });

  it("refuses extensions named like Object.prototype members by name and imports the rest", async () => {
    const { documentStore, importer } = await setup();
    const report = await importer.importFiles([fileOf("clip.constructor"), fileOf("clip.__proto__"), fileOf("good.mov")]);
    expect(report.refused).toEqual([
      { name: "clip.constructor", reason: "unsupported file type" },
      { name: "clip.__proto__", reason: "unsupported file type" },
    ]);
    expect(Object.values(documentStore.getState().media).map((m) => m.name)).toEqual(["good.mov"]);
  });

  it("refuses files the probe rejects, without copying them, and imports the rest", async () => {
    const { dir, documentStore, importer } = await setup(async (file) => {
      if (file.name === "broken.mp4") throw new ProbeError("Not a readable MP4/MOV file: no movie header found");
      return VIDEO;
    });
    const report = await importer.importFiles([fileOf("broken.mp4"), fileOf("good.mov")]);
    expect(report.refused).toEqual([{ name: "broken.mp4", reason: "Not a readable MP4/MOV file: no movie header found", container: "mp4" }]);
    expect(Object.values(documentStore.getState().media).map((m) => m.name)).toEqual(["good.mov"]);
    expect(await resolveFile(dir, "media/broken.mp4")).toBeNull();
  });

  it("gives duplicates unique file names, also across consecutive imports", async () => {
    const { documentStore, importer } = await setup();
    await importer.importFiles([fileOf("clip.mov"), fileOf("CLIP.mov")]);
    await importer.importFiles([fileOf("clip.mov")]);
    const paths = Object.values(documentStore.getState().media).map((m) => "relPath" in m.file && m.file.relPath);
    expect(paths).toEqual(["media/clip.mov", "media/CLIP (2).mov", "media/clip (3).mov"]);
  });

  it("runs concurrent imports one after another so names never collide", async () => {
    const { documentStore, importer } = await setup();
    await Promise.all([importer.importFiles([fileOf("a.mp4", 3)]), importer.importFiles([fileOf("a.mp4", 4)])]);
    const items = Object.values(documentStore.getState().media);
    expect(items.map((m) => "relPath" in m.file && m.file.relPath)).toEqual(["media/a.mp4", "media/a (2).mp4"]);
  });

  it("reports copy progress over the total size", async () => {
    const { importer } = await setup();
    const progress: string[] = [];
    await importer.importFiles([fileOf("a.mp4", 10), fileOf("b.mp4", 30)], { onProgress: (p) => progress.push(`${p.index}/${p.count} ${p.copiedBytes}/${p.totalBytes}`) });
    expect(progress).toEqual(["0/2 0/40", "0/2 5/40", "0/2 10/40", "1/2 10/40", "1/2 25/40", "1/2 40/40"]);
  });

  it("an aborted import removes what it copied and adds nothing", async () => {
    const { dir, documentStore, importer } = await setup();
    const controller = new AbortController();
    const run = importer.importFiles([fileOf("a.mp4", 10), fileOf("b.mp4", 10)], {
      signal: controller.signal,
      onProgress: (p) => {
        if (p.index === 1 && p.copiedBytes > 10) controller.abort();
      },
    });
    await expect(run).rejects.toMatchObject({ name: "AbortError" });
    expect(documentStore.getState().media).toEqual({});
    expect((await dir.dir("media"))?.tree()).toEqual([]);
    // The next import still runs.
    await expect(importer.importFiles([fileOf("c.mp4")])).resolves.toMatchObject({ refused: [] });
  });

  it("a failed copy refuses that file only", async () => {
    const { dir, documentStore, importer } = await setup();
    dir.fs.fail = (op, path) => op === "write" && path === "media/b.mp4";
    const report = await importer.importFiles([fileOf("a.mp4"), fileOf("b.mp4")]);
    expect(report.refused).toEqual([{ name: "b.mp4", reason: expect.stringContaining("could not copy it into media/"), container: "mp4" }]);
    expect(Object.values(documentStore.getState().media).map((m) => m.name)).toEqual(["a.mp4"]);
  });
});

describe("createProbeFile", () => {
  it("routes MP4 and images to the worker, decodeAudioData formats and SVG to the main thread", async () => {
    const request = vi.fn(async () => VIDEO);
    const decode = vi.fn(async () => ({ length: 48_000, sampleRate: 48_000, numberOfChannels: 1 }));
    const probe = createProbeFile({ request } as never, decode);
    await probe(fileOf("a.mov"), { container: "mp4", mime: "video/quicktime" });
    await probe(fileOf("a.gif"), { container: "image", mime: "image/gif" });
    expect(request.mock.calls.map((call) => (call as unknown[])[1])).toEqual([
      { file: expect.any(File), container: "mp4", type: "video/quicktime" },
      { file: expect.any(File), container: "image", type: "image/gif" },
    ]);
    await expect(probe(fileOf("a.mp3"), { container: "audio", mime: "audio/mpeg", audioCodec: "mp3" })).resolves.toMatchObject({ kind: "audio", durationUs: 1_000_000 });
    const svg = new File(['<svg xmlns="http://www.w3.org/2000/svg" width="10" height="20"/>'], "a.svg");
    await expect(probe(svg, { container: "svg", mime: "image/svg+xml" })).resolves.toMatchObject({ kind: "image", width: 10, height: 20 });
  });
});

describe("MediaImporter in reference mode (Batch 41)", () => {
  it("links files that come with a handle (stored by media id), copies the others, records sizes", async () => {
    const dir = createMemoryDir();
    await ensureFolderLayout(dir);
    const documentStore = new DocumentStore(makeProject(), { session: createSessionStore(), validate: true });
    const stored = new Map<string, unknown>();
    let n = 0;
    const importer = new MediaImporter({
      dir,
      documentStore,
      probe: async (file) => (file.name.endsWith(".png") ? IMAGE : VIDEO),
      newId: () => `m${++n}`,
      importMode: () => "reference",
      storeHandle: async (key, handle) => void stored.set(key, handle),
    });
    const clip = fileOf("clip.mp4", 40);
    const handle = { kind: "file" as const, name: "clip.mp4", getFile: async () => clip };
    const report = await importer.importFiles([{ file: clip, handle, path: "Shoot/day 1/clip.mp4" }, { file: fileOf("b.mp4", 8), handle }, fileOf("pasted.png", 5)]);
    expect(report).toMatchObject({ refused: [], bytes: 5, linked: 2 });
    const media = documentStore.getState().media;
    expect(media.m1).toMatchObject({ name: "clip.mp4", file: { handleKey: "m1", pathHint: "Shoot/day 1/clip.mp4" }, size: 40 });
    expect(media.m2?.file).toEqual({ handleKey: "m2", pathHint: "b.mp4" });
    expect(media.m3).toMatchObject({ file: { relPath: "media/pasted.png" }, size: 5 });
    expect([...stored.keys()]).toEqual(["m1", "m2"]);
    expect(await resolveFile(dir, "media/clip.mp4")).toBeNull();
  });

  it("copies in copy mode even with handles, and refuses a file whose handle cannot be kept", async () => {
    const dir = createMemoryDir();
    await ensureFolderLayout(dir);
    const documentStore = new DocumentStore(makeProject(), { session: createSessionStore(), validate: true });
    let mode: "copy" | "reference" = "copy";
    const importer = new MediaImporter({
      dir,
      documentStore,
      probe: async () => VIDEO,
      importMode: () => mode,
      storeHandle: async () => {
        throw new Error("quota");
      },
    });
    const file = fileOf("a.mp4", 3);
    const handle = { kind: "file" as const, name: "a.mp4", getFile: async () => file };
    expect(await importer.importFiles([{ file, handle }])).toMatchObject({ bytes: 3, linked: 0 });
    mode = "reference";
    const report = await importer.importFiles([{ file, handle }]);
    expect(report.refused).toEqual([{ name: "a.mp4", reason: "could not keep a link to it (quota)", container: "mp4" }]);
    expect(Object.keys(documentStore.getState().media)).toHaveLength(1);
  });
});
