import { describe, expect, it } from "vitest";
import { makeMedia } from "../../core/document/fixtures.js";
import type { MediaItem } from "../../core/document/types.js";
import { baseName, binCounts, clickSelection, codecLabel, durationBadge, EMPTY_MEDIA_SELECTION, mediaMatcher, mediaPath, metaLabel, pruneSelection, resolutionLabel, revealQuery, searchPath, searchText, shownBin, shownSelection, sortMedia, type MediaQuery } from "./mediaList.js";

const item = (id: string, fields: Partial<MediaItem> = {}): MediaItem => ({ ...makeMedia(id), name: id, ...fields });

describe("sortMedia", () => {
  const a = item("clip 10", { kind: "video", durationUs: 5, addedAt: "2026-01-03", width: 1920, height: 1080, fps: { num: 60, den: 1 }, codec: "hvc1.1" });
  const b = item("Clip 9", { kind: "audio", durationUs: 50, addedAt: "2026-01-01", audioCodec: "mp4a.40.2" });
  const c = item("beach", { kind: "image", durationUs: 0, addedAt: "2026-01-02", width: 640, height: 480, codec: "png", hasAudio: false });
  const names = (items: MediaItem[]) => items.map((m) => m.name);

  it("sorts by name with numbers in order and case ignored", () => {
    expect(names(sortMedia([a, b, c], "name", false))).toEqual(["beach", "Clip 9", "clip 10"]);
    expect(names(sortMedia([a, b, c], "name", true))).toEqual(["clip 10", "Clip 9", "beach"]);
  });

  it("sorts by date, duration, kind, resolution, fps and usage", () => {
    expect(names(sortMedia([a, b, c], "date", false))).toEqual(["Clip 9", "beach", "clip 10"]);
    expect(names(sortMedia([a, b, c], "duration", true))).toEqual(["Clip 9", "clip 10", "beach"]);
    expect(names(sortMedia([a, b, c], "kind", false))).toEqual(["clip 10", "Clip 9", "beach"]);
    expect(names(sortMedia([a, b, c], "resolution", true))).toEqual(["clip 10", "beach", "Clip 9"]);
    expect(names(sortMedia([a, b, c], "fps", true))).toEqual(["clip 10", "beach", "Clip 9"]);
    expect(names(sortMedia([a, b, c], "used", true, new Map([["beach", 2]])))).toEqual(["beach", "Clip 9", "clip 10"]);
  });

  it("breaks ties by name, ascending even when descending", () => {
    const x = item("x", { durationUs: 1 });
    const y = item("y", { durationUs: 1 });
    expect(names(sortMedia([y, x], "duration", true))).toEqual(["x", "y"]);
  });
});

describe("clickSelection", () => {
  const order = ["a", "b", "c", "d", "e"];
  const ids = (s: { ids: ReadonlySet<string> }) => [...s.ids].sort();

  it("selects one on a plain click, toggles with Mod, spans with Shift", () => {
    let s = clickSelection(EMPTY_MEDIA_SELECTION, "b", { toggle: false, range: false }, order);
    expect(ids(s)).toEqual(["b"]);
    s = clickSelection(s, "d", { toggle: false, range: true }, order);
    expect(ids(s)).toEqual(["b", "c", "d"]);
    expect(s.anchor).toBe("b");
    s = clickSelection(s, "a", { toggle: false, range: true }, order);
    expect(ids(s)).toEqual(["a", "b"]);
    s = clickSelection(s, "e", { toggle: true, range: false }, order);
    expect(ids(s)).toEqual(["a", "b", "e"]);
    expect(s.anchor).toBe("e");
    s = clickSelection(s, "a", { toggle: true, range: false }, order);
    expect(ids(s)).toEqual(["b", "e"]);
    s = clickSelection(s, "c", { toggle: true, range: true }, order);
    // Mod+click moved the anchor to "a" (even when deselecting), so the span is a..c.
    expect(ids(s)).toEqual(["a", "b", "c", "e"]);
  });

  it("treats Shift without an anchor as a plain click", () => {
    expect(ids(clickSelection(EMPTY_MEDIA_SELECTION, "c", { toggle: false, range: true }, order))).toEqual(["c"]);
  });

  it("prunes ids that no longer exist", () => {
    const s = { ids: new Set(["a", "b"]), anchor: "b" };
    expect(pruneSelection(s, () => true)).toBe(s);
    expect(pruneSelection(s, (id) => id === "a")).toEqual({ ids: new Set(["a"]), anchor: null });
  });
});

describe("labels", () => {
  it("names codecs", () => {
    expect(codecLabel("hvc1.1.6.L153.90")).toBe("HEVC");
    expect(codecLabel("avc1.64001f")).toBe("H.264");
    expect(codecLabel("mp4a.40.2")).toBe("AAC");
    expect(codecLabel("mp3")).toBe("MP3");
    expect(codecLabel("png")).toBe("PNG");
    expect(codecLabel(undefined)).toBe("");
  });

  it("shows the resolution as displayed, and meta rows per kind", () => {
    const iphone = item("v", { kind: "video", width: 1920, height: 1080, rotation: 90, fps: { num: 30000, den: 1001 } });
    expect(resolutionLabel(iphone)).toBe("1080×1920");
    expect(metaLabel(iphone)).toBe("1080×1920 · 29.97 fps");
    expect(metaLabel(item("a", { kind: "audio", audioCodec: "mp3" }))).toBe("MP3");
    expect(metaLabel(item("i", { kind: "image", codec: "png", width: 640, height: 480 }))).toBe("PNG · 640×480");
  });

  it("gives stills no duration badge", () => {
    expect(durationBadge(item("i", { kind: "image", durationUs: 0 }))).toBe("");
    expect(durationBadge(item("g", { kind: "image", durationUs: 2_400_000 }))).toBe("00:02");
    expect(durationBadge(item("v", { durationUs: 61_000_000 }))).toBe("01:01");
  });
});

describe("bins, filter chips and search (Batch 41)", () => {
  const v1 = item("Beach day.mp4", { kind: "video", binId: "b1" });
  const v2 = item("Interview A.mov", { kind: "video", file: { handleKey: "h2", pathHint: "Shoot/Interview A.mov" } });
  const a1 = item("Café music.mp3", { kind: "audio", binId: "b2" });
  const i1 = item("logo.png", { kind: "image", binId: "b1" });
  const all = [v1, v2, a1, i1];
  const uses = new Map([[v1.id, 2], [a1.id, 1]]);
  const query = (fields: Partial<MediaQuery> = {}): MediaQuery => ({ bin: "all", filters: { kinds: [], unused: false }, search: "", ...fields });
  const shown = (fields: Partial<MediaQuery>) => all.filter(mediaMatcher(query(fields), uses)).map((m) => m.name);

  it("shows a virtual bin by kind, a bin by its media", () => {
    expect(shown({})).toEqual(["Beach day.mp4", "Interview A.mov", "Café music.mp3", "logo.png"]);
    expect(shown({ bin: "video" })).toEqual(["Beach day.mp4", "Interview A.mov"]);
    expect(shown({ bin: "image" })).toEqual(["logo.png"]);
    expect(shown({ bin: "b1" })).toEqual(["Beach day.mp4", "logo.png"]);
    expect(shown({ bin: "gone" })).toEqual([]);
    expect(shownBin("gone", [{ id: "b1", name: "B" }])).toBe("all");
    expect(shownBin("b1", [{ id: "b1", name: "B" }])).toBe("b1");
    expect(shownBin("audio", [])).toBe("audio");
  });

  it("combines kind chips (any of them) with Unused and the bin", () => {
    expect(shown({ filters: { kinds: ["audio", "image"], unused: false } })).toEqual(["Café music.mp3", "logo.png"]);
    expect(shown({ filters: { kinds: [], unused: true } })).toEqual(["Interview A.mov", "logo.png"]);
    expect(shown({ bin: "b1", filters: { kinds: ["video"], unused: true } })).toEqual([]);
  });

  it("searches every word in the name or the file's name (a linked file's folders too), ignoring case and accents", () => {
    expect(shown({ search: "  BEACH " })).toEqual(["Beach day.mp4"]);
    expect(shown({ search: "cafe" })).toEqual(["Café music.mp3"]);
    expect(shown({ search: "shoot interview" })).toEqual(["Interview A.mov"]);
    // The project's media/ folder holds every copy: it matches none of them.
    expect(shown({ search: "media/" })).toEqual([]);
    expect(shown({ search: "dia" })).toEqual([]);
    expect(shown({ search: "beach logo" })).toEqual([]);
    expect(searchText("Ünïcödé")).toBe("unicode");
    // A renamed copy is found by its file's name.
    const renamed = item("Opening", { file: { relPath: "media/drone_0042.mp4" } });
    expect(mediaMatcher(query({ search: "drone 0042" }), uses)(renamed)).toBe(true);
    expect(mediaMatcher(query({ search: "media" }), uses)(renamed)).toBe(false);
    expect(searchPath(renamed)).toBe("drone_0042.mp4");
    expect(searchPath(v2)).toBe("Shoot/Interview A.mov");
  });

  it("keeps the selection to what the tab shows", () => {
    const media = Object.fromEntries(all.map((m) => [m.id, m]));
    const selection = { ids: new Set([v1.id, v2.id, a1.id]), anchor: v1.id };
    const unused = mediaMatcher(query({ filters: { kinds: [], unused: true } }), uses);
    expect(shownSelection(selection, media, unused)).toEqual({ ids: new Set([v2.id]), anchor: null });
    const everything = mediaMatcher(query(), uses);
    expect(shownSelection(selection, media, everything)).toBe(selection);
    expect(shownSelection({ ids: new Set(["gone"]), anchor: "gone" }, media, everything)).toEqual(EMPTY_MEDIA_SELECTION);
  });

  it("reveals a hidden media: the search and chips cleared, then its bin (or All)", () => {
    const hidden = query({ bin: "b2", filters: { kinds: ["audio"], unused: true }, search: "cafe" });
    expect(revealQuery(a1, query({ bin: "b2", search: "cafe" }), uses)).toEqual(query({ bin: "b2", search: "cafe" }));
    expect(revealQuery(a1, hidden, uses)).toEqual(query({ bin: "b2" }));
    expect(revealQuery(v1, hidden, uses)).toEqual(query({ bin: "b1" }));
    expect(revealQuery(v2, hidden, uses)).toEqual(query({ bin: "all" }));
    expect(revealQuery(v2, query({ bin: "video", search: "zzz" }), uses)).toEqual(query({ bin: "video" }));
  });

  it("counts the media of every chip; paths and file names", () => {
    expect(Object.fromEntries(binCounts(all))).toEqual({ all: 4, video: 2, audio: 1, image: 1, b1: 2, b2: 1 });
    expect(mediaPath(v2)).toBe("Shoot/Interview A.mov");
    expect(mediaPath(v1)).toBe("media/Beach day.mp4.mp4");
    expect(baseName("Shoot/Interview A.mov")).toBe("Interview A.mov");
    expect(baseName("clip.mp4")).toBe("clip.mp4");
  });

  it("narrows 2000 items quickly", () => {
    const many = Array.from({ length: 2000 }, (_, i) => item(`Take ${i} ${i % 3 === 0 ? "drone" : "ground"}.mp4`, i % 2 ? { binId: "b1" } : {}));
    const started = performance.now();
    const match = mediaMatcher(query({ search: "take 1 drone", bin: "b1" }), new Map());
    const found = many.filter(match);
    expect(performance.now() - started).toBeLessThan(200);
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((m) => m.name.includes("drone") && m.binId === "b1")).toBe(true);
  });
});
