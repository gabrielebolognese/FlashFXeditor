import { describe, expect, it } from "vitest";
import { ACCEPTED_EXTENSIONS, classifyFile, extensionOf } from "./mediaKinds.js";

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
    expect(ACCEPTED_EXTENSIONS).toHaveLength(14);
  });

  it("refuses unknown types, WebM and documents", () => {
    expect(classifyFile("movie.webm", "video/webm")).toBeNull();
    expect(classifyFile("notes.txt", "text/plain")).toBeNull();
    expect(classifyFile("archive.mp4.zip", "")).toBeNull();
    expect(classifyFile("README", "")).toBeNull();
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
