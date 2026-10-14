import { describe, expect, it } from "vitest";
import { makeMedia } from "../../core/document/fixtures.js";
import type { MediaItem } from "../../core/document/types.js";
import { clickSelection, codecLabel, durationBadge, EMPTY_MEDIA_SELECTION, metaLabel, pruneSelection, resolutionLabel, sortMedia } from "./mediaList.js";

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
