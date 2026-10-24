import { describe, expect, it } from "vitest";
import { ACCEPTED_EXTENSIONS, classifyFile, extensionOf, IMAGE_PICKER_TYPES, PICKER_TYPES } from "./mediaKinds.js";

describe("classifyFile", () => {
  it("accepts the §9.1 types by extension, in any case", () => {
    expect(classifyFile("IMG_0001.MOV", "video/quicktime")).toMatchObject({ container: "mp4" });
    expect(classifyFile("clip.mp4", "")).toMatchObject({ container: "mp4", mime: "video/mp4" });
    expect(classifyFile("voice.m4a", "")).toMatchObject({ container: "mp4", mime: "audio/mp4" });
    expect(classifyFile("song.mp3", "audio/mpeg")).toEqual({ container: "audio", mime: "audio/mpeg", audioCodec: "mp3" });
    expect(classifyFile("take.wav", "")).toMatchObject({ container: "audio", audioCodec: "pcm" });
    expect(classifyFile("photo.JPEG", "")).toMatchObject({ container: "image", mime: "image/jpeg" });
    expect(classifyFile("anim.gif", "")).toMatchObject({ container: "image" });
    expect(classifyFile("logo.svg", "")).toMatchObject({ container: "svg" });
    expect(classifyFile("Screen Recording.WEBM", "")).toEqual({ container: "webm", mime: "video/webm" });
    expect(ACCEPTED_EXTENSIONS).toHaveLength(15);
  });

  it("refuses unknown types, Matroska by name and documents", () => {
    expect(classifyFile("movie.mkv", "video/x-matroska")).toBeNull();
    expect(classifyFile("notes.txt", "text/plain")).toBeNull();
    expect(classifyFile("archive.mp4.zip", "")).toBeNull();
    expect(classifyFile("README", "")).toBeNull();
  });

  it("refuses extensions named like Object.prototype members", () => {
    for (const ext of ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf"]) {
      expect(classifyFile(`clip.${ext}`, "")).toBeNull();
    }
    expect(classifyFile("constructor", "constructor")).toBeNull();
  });

  it("uses the MIME type for files without an extension (pasted images)", () => {
    expect(classifyFile("image", "image/png")).toMatchObject({ container: "image", mime: "image/png" });
    expect(classifyFile("blob", "text/html")).toBeNull();
  });

  it("reads extensions", () => {
    expect(extensionOf("a.b.MP4")).toBe("mp4");
    expect(extensionOf(".hidden")).toBe("");
    expect(extensionOf("none")).toBe("");
  });
});

describe("PICKER_TYPES", () => {
  const extensions = (type: { accept: Record<string, string[]> }) => Object.values(type.accept).flat();

  it("opens on every accepted type (images and MP3s show without switching the type list)", () => {
    const first = PICKER_TYPES[0] ?? { description: "", accept: {} };
    expect(first.description).toBe("All media");
    expect(extensions(first).sort()).toEqual([...ACCEPTED_EXTENSIONS].sort());
  });

  it("keeps one narrowing type per kind that together cover every accepted type", () => {
    expect(PICKER_TYPES.slice(1).map((type) => type.description)).toEqual(["Video", "Audio", "Images"]);
    expect(PICKER_TYPES.slice(1).flatMap(extensions).sort()).toEqual([...ACCEPTED_EXTENSIONS].sort());
    expect(IMAGE_PICKER_TYPES.map((type) => type.description)).toEqual(["Images"]);
  });
});
