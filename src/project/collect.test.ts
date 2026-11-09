import { describe, expect, it } from "vitest";
import { makeMedia } from "../core/document/fixtures.js";
import type { MediaItem } from "../core/document/types.js";
import { collectSummary, inProjectZip, linkedMedia, linkedSequences, zipEntryPath } from "./collect.js";

const copy = (id: string): MediaItem => ({ ...makeMedia(id, "video"), file: { relPath: `media/${id}.mp4` } });
const linked = (id: string): MediaItem => ({ ...makeMedia(id, "video"), file: { handleKey: `k-${id}`, pathHint: `${id}.mp4` } });

describe("linkedMedia", () => {
  it("is the media that live outside the project folder, sequences apart", () => {
    const sequence: MediaItem = { ...linked("s"), kind: "image", sequence: { pattern: "f_%05d.png", first: 1, count: 3, fps: { num: 30, den: 1 } } as unknown as NonNullable<MediaItem["sequence"]> };
    const media = { a: copy("a"), b: linked("b"), c: linked("c"), s: sequence };
    expect(linkedMedia(media).map((m) => m.id)).toEqual(["b", "c"]);
    expect(linkedSequences(media).map((m) => m.id)).toEqual(["s"]);
    expect(linkedMedia({ a: copy("a") })).toEqual([]);
  });
});

describe("inProjectZip", () => {
  it("leaves out caches, history, exports and per-machine files, keeps the rest", () => {
    for (const path of ["cache/thumbs/a.webp", "history/1.json", "exports/out.mp4", "session.json", "project.json.tmp"]) expect(inProjectZip(path)).toBe(false);
    for (const path of ["project.json", "media/a.mp4", "fonts/fonts.json", "luts/x.cube", "cached.txt"]) expect(inProjectZip(path)).toBe(true);
  });

  it("puts every entry under one folder", () => {
    expect(zipEntryPath("My project", "media/a.mp4")).toBe("My project/media/a.mp4");
  });
});

describe("collectSummary", () => {
  it("says what happened", () => {
    expect(collectSummary(0, 0, 0)).toBe("Nothing needed copying");
    expect(collectSummary(1, 0, 0)).toBe("1 file copied into media/");
    expect(collectSummary(3, 2, 1)).toBe("3 files copied into media/ · 2 linked image sequences left as linked · 1 could not be read");
  });
});
