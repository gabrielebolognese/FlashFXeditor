import { describe, expect, it } from "vitest";
import { detectSequences, sequenceFileNames, sequenceMediaItem, sequenceName, sequencePaths, sequenceQuestion, type NamedFile } from "./sequence.js";

const files = (folder: string, names: string[]): NamedFile<string>[] => names.map((name) => ({ item: `${folder}/${name}`, name, folder }));
const range = (from: number, to: number, pad: number, prefix = "f_", ext = "png") => Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${String(from + i).padStart(pad, "0")}.${ext}`);

describe("detectSequences", () => {
  it("finds a padded run in a folder", () => {
    const [seq] = detectSequences(files("smoke", range(1, 300, 5)));
    expect(seq).toMatchObject({ folder: "smoke", pattern: "f_%05d.png", first: 1, count: 300, leftOver: [] });
    expect(seq?.files[0]).toBe("smoke/f_00001.png");
  });

  it("finds an unpadded run (%d) and a run that starts at 0", () => {
    expect(detectSequences(files("a", range(0, 11, 0)))[0]).toMatchObject({ pattern: "f_%d.png", first: 0, count: 12 });
  });

  it("takes the longest consecutive run; the files past a gap stay images", () => {
    const [seq] = detectSequences(files("a", [...range(1, 3, 3), ...range(10, 20, 3)]));
    expect(seq).toMatchObject({ first: 10, count: 11 });
    expect(seq?.leftOver).toHaveLength(3);
  });

  it("ignores loose files, single files, other types and mixed widths", () => {
    expect(detectSequences([{ item: "x", name: "f_001.png", folder: "" }, { item: "y", name: "f_002.png", folder: "" }])).toEqual([]);
    expect(detectSequences(files("a", ["f_001.png"]))).toEqual([]);
    expect(detectSequences(files("a", range(1, 5, 3, "f_", "jpg")))).toEqual([]);
    expect(detectSequences(files("a", ["f_001.png", "f_0002.png"]))).toEqual([]);
  });

  it("keeps different prefixes and extensions apart", () => {
    const found = detectSequences(files("a", [...range(1, 3, 2, "x_"), ...range(1, 4, 2, "y_", "webp")]));
    expect(found.map((s) => s.pattern)).toEqual(["x_%02d.png", "y_%02d.webp"]);
  });
});

describe("sequence names and paths", () => {
  const sequence = { dir: "media/smoke", pattern: "f_%03d.png", first: 8, count: 3, fps: { num: 30, den: 1 } };
  it("lists file names and project paths in order", () => {
    expect(sequenceFileNames(sequence)).toEqual(["f_008.png", "f_009.png", "f_010.png"]);
    expect(sequencePaths(sequence)[2]).toBe("media/smoke/f_010.png");
  });
  it("names a sequence after its folder, else its pattern", () => {
    expect(sequenceName({ folder: "a/smoke", pattern: "f_%d.png" })).toBe("smoke");
    expect(sequenceName({ folder: "", pattern: "f_%d.png" })).toBe("f_%d.png");
  });
  it("words the question", () => {
    expect(sequenceQuestion(300, "30 fps")).toBe("Import as image sequence (300 frames) at 30 fps?");
  });
  it("builds a media record: an image with the sequence's own duration", () => {
    const item = sequenceMediaItem({ id: "m", name: "smoke", addedAt: "t", sequence, width: 64, height: 32, codec: "png" });
    expect(item).toMatchObject({ kind: "image", durationUs: 100_000, file: { relPath: "media/smoke/f_008.png" }, width: 64, hasAudio: false });
    expect(item.sequence).toBe(sequence);
  });
});
