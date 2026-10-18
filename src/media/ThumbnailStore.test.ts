import { describe, expect, it, vi } from "vitest";
import { addMedia, removeMedia, setMediaProxy } from "../core/commands/mediaCommands.js";
import { makeMedia, makeProject } from "../core/document/fixtures.js";
import type { MediaItem, Project } from "../core/document/types.js";
import { IdleQueue } from "../core/scheduler/IdleQueue.js";
import { DocumentStore } from "../core/store/DocumentStore.js";
import { createSessionStore } from "../core/store/sessionStore.js";
import { thumbIndexPath, thumbSheetPath } from "../project/mediaFiles.js";
import type { ThumbSheetParams } from "./decode/thumbSheet.js";
import { ThumbnailStore, type ThumbnailDeps } from "./ThumbnailStore.js";

/** A 10 s 1080p30 video: LOD0 1 sheet, LOD1 2 sheets, LOD2 4 sheets (284 x 160 thumbnails). */
const video = (id: string, fields: Partial<MediaItem> = {}): MediaItem => ({
  ...makeMedia(id, "video", 10_000_000),
  width: 1920,
  height: 1080,
  fps: { num: 30, den: 1 },
  analysis: { thumbs: "pending", peaks: "none" },
  ...fields,
});

interface FakeBitmap {
  width: number;
  height: number;
  close: ReturnType<typeof vi.fn>;
}

const bitmap = (width: number, height: number): FakeBitmap => ({ width, height, close: vi.fn() });

function abortable<T>(signal: AbortSignal | undefined, value: () => T, hold?: Promise<void>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    signal?.addEventListener("abort", () => reject(new DOMException("cancelled", "AbortError")));
    void (hold ?? Promise.resolve()).then(() => {
      if (!signal?.aborted) resolve(value());
    });
  });
}

function setup(options: { project?: Project; files?: Map<string, Blob>; maxSheets?: number; fail?: string; preview?: ThumbnailDeps["preview"]; now?: () => number } = {}) {
  const slices: ((deadline: { timeRemaining(): number }) => void)[] = [];
  const idle = new IdleQueue(
    (cb) => slices.push(cb),
    () => undefined,
  );
  const documentStore = new DocumentStore(options.project ?? makeProject(), { session: createSessionStore(), validate: true });
  const files = options.files ?? new Map<string, Blob>();
  const made: { mediaId: string; times: number[]; source: string; file: string }[] = [];
  const bitmaps: FakeBitmap[] = [];
  let hold: Promise<void> | undefined;
  const signals: AbortSignal[] = [];
  const request = vi.fn((method: string, params: unknown, opts: { signal?: AbortSignal } = {}) => {
    if (opts.signal) signals.push(opts.signal);
    if (method === "thumbSheet") {
      const p = params as ThumbSheetParams;
      if (options.fail) return Promise.reject(Object.assign(new Error("no decoder"), { name: options.fail }));
      return abortable(
        opts.signal,
        () => {
          made.push({ mediaId: p.mediaId, times: p.timesUs, source: p.source, file: p.file.name });
          const b = bitmap(Math.min(4, p.timesUs.length) * p.width, Math.ceil(p.timesUs.length / 4) * p.height);
          bitmaps.push(b);
          return { bitmap: b, blob: new Blob([`sheet ${p.timesUs[0]}`]) };
        },
        hold,
      );
    }
    if (method === "decodeSheet") {
      return abortable(opts.signal, () => {
        const b = bitmap(4 * 284, 4 * 160);
        bitmaps.push(b);
        return b;
      });
    }
    if (method === "closeThumbs") return Promise.resolve(null);
    return Promise.reject(new Error(method));
  });
  const source = new File(["video bytes"], "v.mp4", { lastModified: 7 });
  const proxy = new File(["proxy bytes"], "v.proxy.mp4", { lastModified: 9 });
  /** Media whose proxy file exists. */
  const proxyFiles = new Set<string>();
  const arrivals = vi.fn();
  const deps: ThumbnailDeps = {
    idle,
    document: documentStore,
    workers: { request } as unknown as ThumbnailDeps["workers"],
    files: {
      source: async (id, lod) => (!documentStore.getState().media[id] ? null : lod === "full" ? source : proxyFiles.has(id) ? proxy : null),
      sampleIndex: async () => null,
      read: async (path) => files.get(path) ?? null,
      write: vi.fn(async (path: string, data: Blob) => void files.set(path, data)),
    },
    onArrival: arrivals,
    ...(options.maxSheets !== undefined && { maxSheets: options.maxSheets }),
    ...(options.preview && { preview: options.preview }),
    ...(options.now && { now: options.now }),
  };
  const store = new ThumbnailStore(deps);
  const sync = () => store.sync(documentStore.getState().media);
  const stop = documentStore.subscribe(sync, { affects: ["media"] });
  sync();
  /** Runs idle slices and the async work they start until the store is idle (or `max` rounds pass: a held sheet). */
  const settle = async (max = 40) => {
    for (let i = 0; i < max; i++) {
      const ran = slices.length > 0;
      slices.splice(0).forEach((cb) => cb({ timeRemaining: () => 50 }));
      let idle = false;
      void store.whenIdle().then(() => (idle = true));
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (!ran && idle && slices.length === 0) return;
    }
  };
  const holdSheets = () => {
    let release = () => {};
    hold = new Promise<void>((resolve) => (release = resolve));
    return () => {
      hold = undefined;
      release();
    };
  };
  return { store, documentStore, files, made, bitmaps, request, deps, settle, idle, arrivals, signals, holdSheets, stop, proxyFiles };
}

const methods = (request: ReturnType<typeof vi.fn>) => request.mock.calls.map(([method]) => method as string);

// Generous: the async file and worker fakes take many macrotasks when the whole suite loads the CPU.
describe("ThumbnailStore", { timeout: 20_000 }, () => {
  it("makes LOD0 then LOD1 after import, writes the sheets and the index, then marks the video ready with no undo step", async () => {
    const t = setup();
    t.documentStore.dispatch(addMedia([video("v")]));
    await t.settle();
    expect(t.made.map((m) => m.times[0])).toEqual([0, 0, 8_000_000]);
    expect(t.made[0]?.times).toEqual([0, 2_000_000, 4_000_000, 6_000_000, 8_000_000]);
    expect([...t.files.keys()].sort()).toEqual([thumbIndexPath("v"), thumbSheetPath("v", 0, 0), thumbSheetPath("v", 1, 0), thumbSheetPath("v", 1, 1)].sort());
    const index = JSON.parse(await (t.files.get(thumbIndexPath("v")) as Blob).text());
    expect(index.levels.map((l: { sheets: number[] }) => l.sheets)).toEqual([[0], [0, 1], []]);
    expect(t.documentStore.getState().media.v?.analysis.thumbs).toBe("ready");
    t.documentStore.undo();
    expect(t.documentStore.history.getState().canUndo).toBe(false);
    // Nobody showed them: written and closed.
    expect(t.bitmaps.every((b) => b.close.mock.calls.length === 1)).toBe(true);
    expect(t.store.stats).toMatchObject({ decoded: 3, cached: 0, resident: 0 });
  });

  it("reopens from the cached sheets with no decode", async () => {
    const first = setup();
    first.documentStore.dispatch(addMedia([video("v")]));
    await first.settle();
    const project = makeProject();
    project.media.v = { ...video("v"), analysis: { thumbs: "ready", peaks: "none" } };
    const t = setup({ project, files: first.files });
    await t.settle();
    t.store.want([{ mediaId: "v", level: 1, sheet: 1 }]);
    await t.settle();
    expect(methods(t.request)).toEqual(["decodeSheet"]);
    expect(t.store.sheet("v", 1, 1)).not.toBeNull();
    expect(t.store.stats).toMatchObject({ decoded: 0, cached: 1, resident: 1 });
    expect(t.arrivals).toHaveBeenCalledTimes(1);
  });

  it("makes LOD2 only for the sheets the timeline shows, those before the eager levels", async () => {
    const t = setup();
    t.documentStore.dispatch(addMedia([video("v")]));
    t.store.want([{ mediaId: "v", level: 2, sheet: 1 }]);
    await t.settle();
    expect(t.made).toHaveLength(4);
    expect(t.made[0]?.times).toHaveLength(16);
    expect(t.made[0]?.times[0]).toBe(16 * 166_667);
    expect(t.store.sheet("v", 2, 1)).not.toBeNull();
    expect(t.store.sheet("v", 1, 0)).toBeNull();
  });

  it("loads a hover-scrubbed card's sheet first and keeps it in memory (spec §12)", async () => {
    const t = setup();
    t.documentStore.dispatch(addMedia([video("v")]));
    t.store.hover({ mediaId: "v", level: 1, sheet: 1 });
    await t.settle();
    // LOD1 sheet 1 holds the thumbnails from 16 x 0.5 s on; it was made before the eager LOD0.
    expect(t.made[0]?.times[0]).toBe(8_000_000);
    expect(t.made).toHaveLength(3);
    expect(t.store.sheet("v", 1, 1)).not.toBeNull();
    // Eager sheets nobody shows are written and closed.
    expect(t.store.sheet("v", 1, 0)).toBeNull();
    t.store.hover(null);
    t.store.want([]);
    expect(t.store.sheet("v", 1, 1)).not.toBeNull();
  });

  it("cancels the running sheet when the queue pauses and makes it again after", async () => {
    const t = setup();
    const release = t.holdSheets();
    t.documentStore.dispatch(addMedia([video("v")]));
    await t.settle(10);
    expect(t.signals).toHaveLength(1);
    t.idle.pause("playback");
    expect(t.signals[0]?.aborted).toBe(true);
    release();
    await t.settle(10);
    expect(t.made).toHaveLength(0);
    t.idle.resume("playback");
    await t.settle();
    expect(t.made).toHaveLength(3);
  });

  it("keeps what the timeline shows and evicts (closing) the least recently used rest", async () => {
    const t = setup({ maxSheets: 2 });
    t.documentStore.dispatch(addMedia([video("v")]));
    await t.settle();
    const keys = [0, 1, 2].map((sheet) => ({ mediaId: "v", level: 2 as const, sheet }));
    t.store.want(keys);
    await t.settle();
    expect(keys.every((k) => t.store.sheet(k.mediaId, k.level, k.sheet) !== null)).toBe(true);
    const first = t.store.sheet("v", 2, 0) as unknown as FakeBitmap;
    t.store.want([{ mediaId: "v", level: 2, sheet: 3 }]);
    await t.settle();
    expect(t.store.stats.resident).toBe(2);
    expect(t.store.sheet("v", 2, 0)).toBeNull();
    expect(first.close).toHaveBeenCalled();
    expect(t.store.sheet("v", 2, 3)).not.toBeNull();
  });

  it("gives media cards the first thumbnail and takes it away with the media", async () => {
    const t = setup();
    const images: unknown[] = [];
    t.store.observeCard("v", (image) => images.push(image && { sx: image.sx, sy: image.sy, sw: image.sw, sh: image.sh }));
    t.documentStore.dispatch(addMedia([video("v")]));
    await t.settle();
    expect(images).toEqual([{ sx: 0, sy: 0, sw: 284, sh: 160 }]);
    const sheet = t.store.sheet("v", 0, 0) as unknown as FakeBitmap;
    expect(sheet.close).not.toHaveBeenCalled();
    t.documentStore.dispatch(removeMedia(["v"]));
    expect(images.at(-1)).toBeNull();
    expect(sheet.close).toHaveBeenCalled();
    expect(methods(t.request)).toContain("closeThumbs");
  });

  it("makes a sheet again when the index lists it but its file is gone", async () => {
    const first = setup();
    first.documentStore.dispatch(addMedia([video("v")]));
    await first.settle();
    first.files.delete(thumbSheetPath("v", 1, 0));
    const project = makeProject();
    project.media.v = video("v");
    const t = setup({ project, files: first.files });
    t.store.want([{ mediaId: "v", level: 1, sheet: 0 }]);
    await t.settle();
    expect(methods(t.request)).toEqual(["thumbSheet"]);
    expect(t.files.has(thumbSheetPath("v", 1, 0))).toBe(true);
  });

  it("gives up on a video it cannot decode for the session, without looping", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const t = setup({ fail: "UnsupportedCodecError" });
    t.documentStore.dispatch(addMedia([video("v")]));
    t.store.want([{ mediaId: "v", level: 2, sheet: 0 }]);
    await t.settle();
    expect(methods(t.request)).toEqual(["thumbSheet"]);
    expect(t.store.stats.failed).toBe(1);
    expect(t.documentStore.getState().media.v?.analysis.thumbs).toBe("pending");
    await t.store.whenIdle();
  });

  it("has no layout for stills and audio", () => {
    const t = setup();
    t.documentStore.dispatch(addMedia([makeMedia("i", "image"), makeMedia("a", "audio"), video("v")]));
    expect(t.store.layout("i")).toBeNull();
    expect(t.store.layout("a")).toBeNull();
    expect(t.store.layout("v")?.width).toBe(284);
  });

  it("decodes a sheet only once the preview is quiet, and cancels it when the preview decodes a frame", async () => {
    let clock = 0;
    const decodeListeners: (() => void)[] = [];
    const preview = { decodesInFlight: 1, onDecodeRequest: (listener: () => void) => (decodeListeners.push(listener), () => undefined) };
    const t = setup({ preview, now: () => clock });
    const until = async (condition: () => boolean) => {
      for (let i = 0; i < 100 && !condition(); i++) {
        await t.settle(5);
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    };
    t.documentStore.dispatch(addMedia([video("v")]));
    await t.settle(10);
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(methods(t.request)).not.toContain("thumbSheet");
    // The preview's frame arrived: decodes wait PREVIEW_QUIET_MS after its last request.
    preview.decodesInFlight = 0;
    const release = t.holdSheets();
    await until(() => t.signals.length > 0);
    expect(t.signals).toHaveLength(1);
    clock = 1000;
    decodeListeners.forEach((listener) => listener());
    expect(t.signals[0]?.aborted).toBe(true);
    release();
    await t.settle(10);
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(t.signals).toHaveLength(1);
    clock = 1300;
    await until(() => t.made.length === 3);
    expect(t.made).toHaveLength(3);
  });

  it("makes the sheets again from the proxy once it is ready, the shown ones staying until replaced (spec §9.6)", async () => {
    const t = setup();
    t.documentStore.dispatch(addMedia([video("v")]));
    t.store.want([{ mediaId: "v", level: 0, sheet: 0 }]);
    await t.settle();
    expect(t.made.map((m) => m.source)).toEqual(["full", "full", "full"]);
    const shown = t.store.sheet("v", 0, 0);
    expect(shown).not.toBeNull();
    t.proxyFiles.add("v");
    t.documentStore.amend(setMediaProxy("v", { relPath: "cache/proxies/v.mp4", width: 960, height: 540, status: "ready" }));
    // Until the new sheet arrives the old one shows.
    expect(t.store.sheet("v", 0, 0)).toBe(shown);
    await t.settle();
    expect(t.made.slice(3).map((m) => [m.source, m.file, m.times[0]])).toEqual([
      ["proxy", "v.proxy.mp4", 0],
      ["proxy", "v.proxy.mp4", 0],
      ["proxy", "v.proxy.mp4", 8_000_000],
    ]);
    expect(t.store.sheet("v", 0, 0)).not.toBe(shown);
    const index = JSON.parse(await (t.files.get(thumbIndexPath("v")) as Blob).text());
    expect(index.source).toBe("proxy");
    expect(t.documentStore.getState().media.v?.analysis.thumbs).toBe("ready");
  });

  it("decodes from the source when the proxy file is missing", async () => {
    const t = setup();
    t.documentStore.dispatch(addMedia([video("v", { proxy: { relPath: "cache/proxies/v.mp4", width: 960, height: 540, status: "ready" } })]));
    await t.settle();
    expect(t.made.map((m) => m.source)).toEqual(["full", "full", "full"]);
    expect(t.documentStore.getState().media.v?.analysis.thumbs).toBe("ready");
  });

  it("Regenerate thumbnails makes the eager sheets again, ignoring the cached ones", async () => {
    const t = setup();
    t.documentStore.dispatch(addMedia([video("v")]));
    await t.settle();
    expect(t.made).toHaveLength(3);
    t.store.regenerate("v");
    await t.settle();
    expect(t.made).toHaveLength(6);
    expect(methods(t.request)).not.toContain("decodeSheet");
  });

  it("drops the sheets of a file replaced by other content at once and makes them again without the cache", async () => {
    const t = setup();
    const images: unknown[] = [];
    t.store.observeCard("v", (image) => images.push(image && image.sw));
    t.documentStore.dispatch(addMedia([video("v")]));
    await t.settle();
    const sheet = t.store.sheet("v", 0, 0) as unknown as FakeBitmap;
    t.store.replace("v");
    t.store.replace("nope");
    expect(sheet.close).toHaveBeenCalled();
    expect(t.store.sheet("v", 0, 0)).toBeNull();
    expect(images).toEqual([284, null]);
    await t.settle();
    expect(t.made).toHaveLength(6);
    expect(methods(t.request)).not.toContain("decodeSheet");
    expect(images.at(-1)).toBe(284);
  });
});
