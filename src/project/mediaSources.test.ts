import { describe, expect, it } from "vitest";
import { addMedia, relinkMedia, removeMedia } from "../core/commands/mediaCommands.js";
import { makeMedia, makeProject } from "../core/document/fixtures.js";
import type { MediaId, MediaItem } from "../core/document/types.js";
import { createStore } from "../core/store/createStore.js";
import { DocumentStore } from "../core/store/DocumentStore.js";
import { createSessionStore } from "../core/store/sessionStore.js";
import type { PermissionStatus } from "./fs.js";
import { memoryKeyValueStore } from "./kv.js";
import { createMemoryDir } from "./memoryFs.js";
import { handleStoreKey, MediaSources, sameContent, sameFile, type FileHandleLike, type MediaStatus } from "./mediaSources.js";
import { listFolderFiles, matchFolderFiles, relinkNames, type DirHandleLike, type FolderFile } from "./relink.js";

/** A linked file: `gone` once the file was moved (NotFoundError), its permission settable. */
class FakeFileHandle implements FileHandleLike {
  readonly kind = "file" as const;
  gone = false;
  permission: PermissionStatus = "granted";
  /** What a request grants; null: it throws (no user activation). */
  grant: PermissionStatus | null = "granted";
  requests = 0;

  constructor(
    readonly name: string,
    private readonly bytes = 10,
  ) {}

  async getFile(): Promise<File> {
    if (this.gone) throw new DOMException("moved", "NotFoundError");
    if (this.permission !== "granted") throw new DOMException("no access", "NotAllowedError");
    return new File([new Uint8Array(this.bytes)], this.name);
  }

  async queryPermission(): Promise<PermissionStatus> {
    return this.permission;
  }

  async requestPermission(): Promise<PermissionStatus> {
    this.requests += 1;
    if (this.grant === null) throw new DOMException("needs a gesture", "SecurityError");
    this.permission = this.grant;
    return this.permission;
  }
}

class FakeDirHandle implements DirHandleLike {
  readonly kind = "directory" as const;

  constructor(
    readonly name: string,
    private readonly entries: (FakeDirHandle | FakeFileHandle)[],
  ) {}

  async *values(): AsyncIterable<FakeDirHandle | FakeFileHandle> {
    yield* this.entries;
  }
}

const linked = (id: string, handleKey: string, pathHint: string, fields: Partial<MediaItem> = {}): MediaItem => ({ ...makeMedia(id), file: { handleKey, pathHint }, ...fields });

async function setup(media: Record<MediaId, MediaItem>) {
  const dir = createMemoryDir();
  const kv = memoryKeyValueStore();
  const status = createStore<ReadonlyMap<MediaId, MediaStatus>>(new Map());
  const updates: number[] = [];
  status.subscribe((state) => updates.push(state.size));
  const sources = new MediaSources({ dir, kv, media: () => media, status });
  return { dir, kv, status, sources, updates, statusOf: () => Object.fromEntries(status.getState()) };
}

describe("MediaSources", () => {
  it("resolves copied files in the project folder and linked files through their stored handles", async () => {
    const handle = new FakeFileHandle("clip.mp4", 42);
    const t = await setup({ a: makeMedia("a"), b: linked("b", "hb", "Shoot/clip.mp4") });
    const media = await t.dir.dir("media", { create: true });
    await media?.writeFile("a.mp4", new Blob([new Uint8Array(7)]));
    await t.sources.storeHandle("hb", handle);
    expect(t.kv.data.get(handleStoreKey("hb"))).toBe(handle);
    expect((await t.sources.file("a"))?.size).toBe(7);
    expect((await t.sources.file("b"))?.size).toBe(42);
    expect(await t.sources.file("nope")).toBeNull();
    expect(t.statusOf()).toEqual({});
    expect(t.updates).toEqual([]);
  });

  it("finds offline media on open: deleted copies, moved or unknown linked files, an empty key, no permission", async () => {
    const moved = new FakeFileHandle("moved.mp4");
    moved.gone = true;
    const locked = new FakeFileHandle("locked.mp4");
    locked.permission = "prompt";
    const t = await setup({
      copied: makeMedia("copied"),
      moved: linked("moved", "hm", "moved.mp4"),
      unknown: linked("unknown", "hu", "unknown.mp4"),
      pasted: linked("pasted", "", "media/pasted.mp4"),
      locked: linked("locked", "hl", "locked.mp4"),
    });
    await t.sources.storeHandle("hm", moved);
    await t.sources.storeHandle("hl", locked);
    await t.sources.checkAll();
    expect(t.statusOf()).toEqual({ copied: "missing", moved: "missing", unknown: "missing", pasted: "missing", locked: "permission" });
    expect(t.updates).toEqual([5]);
    expect(t.sources.waitingForAccess()).toEqual(["locked"]);
  });

  it("asks for access in a gesture; a request that throws leaves the media waiting", async () => {
    const h1 = new FakeFileHandle("one.mp4");
    const h2 = new FakeFileHandle("two.mp4");
    h1.permission = h2.permission = "prompt";
    const t = await setup({ one: linked("one", "h1", "one.mp4"), two: linked("two", "h2", "two.mp4") });
    await t.sources.storeHandle("h1", h1);
    await t.sources.storeHandle("h2", h2);
    await t.sources.checkAll();
    h1.grant = null;
    expect(await t.sources.requestAccess()).toBe(2);
    expect(h2.requests).toBe(0);
    h1.grant = "granted";
    expect(await t.sources.requestAccess()).toBe(0);
    expect(t.statusOf()).toEqual({});
    expect((await t.sources.file("two"))?.name).toBe("two.mp4");
  });

  it("marks a file that disappears while open; failed (undecodable) stays until a reset", async () => {
    const handle = new FakeFileHandle("a.mp4");
    const t = await setup({ a: linked("a", "ha", "a.mp4"), b: makeMedia("b") });
    await t.sources.storeHandle("ha", handle);
    expect(await t.sources.file("a")).not.toBeNull();
    handle.gone = true;
    expect(await t.sources.file("a")).toBeNull();
    expect(t.statusOf()).toEqual({ a: "missing" });
    handle.gone = false;
    await t.sources.file("a");
    expect(t.statusOf()).toEqual({});
    t.sources.markFailed("a");
    t.sources.markFailed("zzz");
    await t.sources.file("a");
    expect(t.statusOf()).toEqual({ a: "failed" });
    // A missing file stays missing when the preview reports its failure.
    await t.sources.check(["a"]);
    handle.gone = true;
    await t.sources.file("a");
    t.sources.markFailed("a");
    expect(t.statusOf()).toEqual({ a: "missing" });
    handle.gone = false;
    await t.sources.check(["a"]);
    expect(t.statusOf()).toEqual({});
    t.sources.markFailed("a");
    t.sources.forget(["a"]);
    expect(t.statusOf()).toEqual({});
  });
});

describe("MediaSources following the document (Batch 41 fixes)", () => {
  async function follow(items: MediaItem[]) {
    const store = new DocumentStore(makeProject(), { session: createSessionStore(), validate: true });
    store.dispatch(addMedia(items));
    const kv = memoryKeyValueStore();
    const status = createStore<ReadonlyMap<MediaId, MediaStatus>>(new Map());
    const sources = new MediaSources({ dir: createMemoryDir(), kv, media: () => store.getState().media, status });
    const stop = sources.attach(store);
    await sources.checkAll();
    return { store, sources, status, stop, statusOf: () => Object.fromEntries(status.getState()) };
  }

  it("checks a relink, its undo and its redo again (the status follows the file the record names)", async () => {
    const moved = new FakeFileHandle("clip.mp4");
    moved.gone = true;
    const found = new FakeFileHandle("clip.mp4");
    const t = await follow([]);
    await t.sources.storeHandle("old", moved);
    await t.sources.storeHandle("new", found);
    t.store.dispatch(addMedia([linked("m", "old", "Shoot/clip.mp4")]));
    await t.sources.whenChecked();
    expect(t.statusOf()).toEqual({ m: "missing" });
    t.store.dispatch(relinkMedia([{ id: "m", fields: { file: { handleKey: "new", pathHint: "Moved/clip.mp4" } } }]));
    await t.sources.whenChecked();
    expect(t.statusOf()).toEqual({});
    t.store.undo();
    await t.sources.whenChecked();
    expect(t.statusOf()).toEqual({ m: "missing" });
    t.store.redo();
    await t.sources.whenChecked();
    expect(t.statusOf()).toEqual({});
    // Undo and redo at once: the last file wins, whatever order the lookups finish in.
    t.store.undo();
    t.store.redo();
    await t.sources.whenChecked();
    expect(t.statusOf()).toEqual({});
    t.store.undo();
    t.store.redo();
    t.store.undo();
    await t.sources.whenChecked();
    expect(t.statusOf()).toEqual({ m: "missing" });
    t.stop();
  });

  it("drops the status of a removed media at once, and checks it again when an undo brings it back", async () => {
    const t = await follow([makeMedia("gone"), makeMedia("other", "image")]);
    expect(t.statusOf()).toEqual({ gone: "missing", other: "missing" });
    t.store.dispatch(removeMedia(["gone"], "keep"));
    expect(t.statusOf()).toEqual({ other: "missing" });
    t.store.undo();
    await t.sources.whenChecked();
    expect(t.statusOf()).toEqual({ gone: "missing", other: "missing" });
    t.stop();
  });

  it("tells files and contents apart", () => {
    expect(sameFile({ relPath: "media/a.mp4" }, { relPath: "media/a.mp4" })).toBe(true);
    expect(sameFile({ relPath: "media/a.mp4" }, { handleKey: "media/a.mp4", pathHint: "a.mp4" })).toBe(false);
    expect(sameFile({ handleKey: "k", pathHint: "a.mp4" }, { handleKey: "k", pathHint: "b.mp4" })).toBe(true);
    const item = { durationUs: 10, width: 4, height: 2, size: 100 };
    expect(sameContent(item, { ...item })).toBe(true);
    expect(sameContent(item, { ...item, size: undefined })).toBe(true);
    expect(sameContent(item, { ...item, size: 101 })).toBe(false);
    expect(sameContent(item, { ...item, durationUs: 11 })).toBe(false);
    expect(sameContent(item, { ...item, height: 3 })).toBe(false);
  });
});

describe("relink a folder", () => {
  const folder = () => {
    const files = {
      clip: new FakeFileHandle("Clip.MP4", 100),
      clipSmall: new FakeFileHandle("clip.mp4", 50),
      other: new FakeFileHandle("Interview.mov", 70),
      twinA: new FakeFileHandle("take.mp4", 5),
      twinB: new FakeFileHandle("take.mp4", 6),
    };
    const root = new FakeDirHandle("Footage", [files.clip, new FakeDirHandle("day 2", [files.clipSmall, files.other, new FakeDirHandle("a", [files.twinA])]), new FakeDirHandle("b", [files.twinB])]);
    return { root, files };
  };
  const sizeOf = async (file: FolderFile) => (await file.handle.getFile()).size;

  it("lists every file under the folder with its path, up to a limit", async () => {
    const { root } = folder();
    const { files, truncated } = await listFolderFiles(root);
    expect(files.map((file) => file.path)).toEqual(["Footage/Clip.MP4", "Footage/day 2/clip.mp4", "Footage/day 2/Interview.mov", "Footage/day 2/a/take.mp4", "Footage/b/take.mp4"]);
    expect(truncated).toBe(false);
    expect((await listFolderFiles(root, 2)).truncated).toBe(true);
  });

  it("matches by file name (own path first, then the panel name) and by size when the item has one", async () => {
    const { root, files } = folder();
    const list = (await listFolderFiles(root)).files;
    const items: MediaItem[] = [
      { ...makeMedia("sized"), name: "Clip.mp4", file: { relPath: "media/clip (2).mp4" }, size: 50 },
      { ...makeMedia("renamed"), name: "Opening shot", file: { handleKey: "", pathHint: "old/Interview.mov" } },
      { ...makeMedia("twin"), name: "take.mp4" },
      { ...makeMedia("wrongSize"), name: "Interview.mov", size: 1 },
      { ...makeMedia("unsized"), name: "clip.mp4", file: { relPath: "media/clip.mp4" } },
    ];
    expect(relinkNames(items[0] as MediaItem)).toEqual(["clip (2).mp4", "clip.mp4"]);
    const matches = await matchFolderFiles(items, list, sizeOf);
    expect(matches.get("sized")?.handle).toBe(files.clipSmall);
    expect(matches.get("renamed")?.handle).toBe(files.other);
    // Two files named take.mp4 and no size to tell them apart: no match.
    expect(matches.has("twin")).toBe(false);
    expect(matches.has("wrongSize")).toBe(false);
    // clip.mp4 by name: Clip.MP4 is the one left (clip.mp4 went to "sized").
    expect(matches.get("unsized")?.handle).toBe(files.clip);
  });
});
