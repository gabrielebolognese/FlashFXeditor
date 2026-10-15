import { describe, expect, it, vi } from "vitest";
import { addMedia, removeMedia } from "../core/commands/mediaCommands.js";
import { makeMedia, makeProject } from "../core/document/fixtures.js";
import type { MediaItem } from "../core/document/types.js";
import { DocumentStore } from "../core/store/DocumentStore.js";
import { createSessionStore } from "../core/store/sessionStore.js";
import { createMemoryDir, type MemoryDir } from "../project/memoryFs.js";
import { posterPath, resolveFile, writeFileAt } from "../project/mediaFiles.js";
import { PosterStore } from "./PosterStore.js";

interface FakeBitmap {
  label: string;
  close: ReturnType<typeof vi.fn>;
}

const bitmap = (label: string) => ({ label, close: vi.fn() }) as FakeBitmap;
const asBitmap = (b: FakeBitmap) => b as unknown as ImageBitmap;

function fakePool() {
  const calls: string[] = [];
  const request = vi.fn(async (method: string, params: { blob?: Blob; file?: Blob }) => {
    if (method === "decodeImage") {
      const text = await (params.blob as Blob).text();
      calls.push(`decodeImage ${text}`);
      if (text === "damaged") throw new Error("The source image could not be decoded.");
      return asBitmap(bitmap(`cached:${text}`));
    }
    const name = (params.file as File).name;
    calls.push(`poster ${name}`);
    return { bitmap: asBitmap(bitmap(`fresh:${name}`)), blob: new Blob([`webp:${name}`]) };
  });
  return { request, calls };
}

const still = (id: string): MediaItem => ({ ...makeMedia(id, "image", 0), file: { relPath: `media/${id}.png` } });

async function setup(items: MediaItem[], options: { dir?: MemoryDir; writable?: boolean; onChange?: (id: string) => void } = {}) {
  const dir = options.dir ?? createMemoryDir();
  if (!options.dir) for (const item of items) if ("relPath" in item.file) await writeFileAt(dir, item.file.relPath, new Blob(["source"]));
  const documentStore = new DocumentStore(makeProject(), { session: createSessionStore(), validate: true });
  if (items.length > 0) documentStore.dispatch(addMedia(items));
  const pool = fakePool();
  const svgPoster = vi.fn(async () => asBitmap(bitmap("svg")));
  const store = new PosterStore({ dir, pool: pool as never, isWritable: () => options.writable ?? true, svgPoster, ...(options.onChange && { onChange: options.onChange }) });
  const stop = store.attach(documentStore);
  await store.whenIdle();
  await Promise.resolve();
  return { dir, documentStore, store, pool, svgPoster, stop };
}

const label = (b: ImageBitmap | null) => (b as unknown as FakeBitmap | null)?.label ?? null;

describe("PosterStore", () => {
  it("generates posters for images only and caches them as WebP (videos show their thumbnail sheets)", async () => {
    const changed: string[] = [];
    const { dir, store, pool } = await setup([{ ...makeMedia("v", "video"), file: { relPath: "media/v.mp4" } }, still("i"), makeMedia("a", "audio")], { onChange: (id) => changed.push(id) });
    expect(store.get("v")).toBeNull();
    expect(label(store.get("i"))).toBe("fresh:i.png");
    expect(store.get("a")).toBeNull();
    expect(pool.calls).toEqual(["poster i.png"]);
    expect(changed).toEqual(["i"]);
    expect(await (await resolveFile(dir, posterPath("i")))?.text()).toBe("webp:i.png");
  });

  it("reads cached posters on reopen and regenerates missing or damaged ones", async () => {
    const first = await setup([still("v1"), still("v2"), still("v3")]);
    first.stop();
    first.store.dispose();
    const dir = first.dir;
    await dir.dir("cache").then((cache) => cache?.dir("thumbs")).then((thumbs) => thumbs?.remove("v2.poster.webp"));
    await writeFileAt(dir, posterPath("v3"), new Blob(["damaged"]));

    const again = await setup([still("v1"), still("v2"), still("v3")], { dir });
    expect(label(again.store.get("v1"))).toBe("cached:webp:v1.png");
    expect(label(again.store.get("v2"))).toBe("fresh:v2.png");
    expect(label(again.store.get("v3"))).toBe("fresh:v3.png");
    expect(again.pool.calls.filter((c) => c.startsWith("poster")).sort()).toEqual(["poster v2.png", "poster v3.png"]);
    expect(await (await resolveFile(dir, posterPath("v2")))?.text()).toBe("webp:v2.png");
  });

  it("notifies observers, closes bitmaps of removed media and restores them on undo", async () => {
    const { documentStore, store } = await setup([still("v")]);
    const seen: (string | null)[] = [];
    store.observe("v", (b) => seen.push(label(b)));
    const first = store.get("v") as unknown as FakeBitmap;
    expect(seen).toEqual(["fresh:v.png"]);

    documentStore.dispatch(removeMedia(["v"]));
    expect(first.close).toHaveBeenCalled();
    expect(store.get("v")).toBeNull();
    expect(seen).toEqual(["fresh:v.png", null]);

    documentStore.undo();
    await store.whenIdle();
    expect(label(store.get("v"))).toBe("cached:webp:v.png");
    expect(seen).toEqual(["fresh:v.png", null, "cached:webp:v.png"]);
  });

  it("does not write the cache when the project is read-only", async () => {
    const { dir, store } = await setup([still("v")], { writable: false });
    expect(label(store.get("v"))).toBe("fresh:v.png");
    expect(await resolveFile(dir, posterPath("v"))).toBeNull();
  });

  it("rasterizes SVG on the main thread and does not cache it", async () => {
    const { dir, store, svgPoster } = await setup([{ ...makeMedia("s", "image", 0), codec: "svg", file: { relPath: "media/s.svg" } }]);
    expect(label(store.get("s"))).toBe("svg");
    expect(svgPoster).toHaveBeenCalledTimes(1);
    expect(await resolveFile(dir, posterPath("s"))).toBeNull();
  });

  it("logs and skips media whose file is missing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const dir = createMemoryDir();
    const { store } = await setup([still("gone")], { dir });
    expect(store.get("gone")).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("media/gone.png is missing"));
  });

  it("dispose closes every bitmap", async () => {
    const { store } = await setup([still("a"), still("b")]);
    const bitmaps = ["a", "b"].map((id) => store.get(id) as unknown as FakeBitmap);
    store.dispose();
    for (const b of bitmaps) expect(b.close).toHaveBeenCalled();
    expect(store.get("a")).toBeNull();
  });
});
