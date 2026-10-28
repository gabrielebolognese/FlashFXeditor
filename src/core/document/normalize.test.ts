import { describe, expect, it } from "vitest";
import { mediaClips } from "../../timeline/edit/insertMedia.js";
import { IDENTITY_TRANSFORM } from "./placement.js";
import { DEFAULT_TEXT_BOX, DEFAULT_TEXT_STYLE } from "../../text/style.js";
import { defaultCaptionStyle } from "../../text/captions.js";
import { fillObject, normalizeProject, type NormalizeOptions } from "./normalize.js";
import { createProject, emptyTrack } from "./project.js";
import { validateStrict } from "./strict.js";
import { SCHEMA_VERSION, type MediaItem } from "./types.js";

const OPTIONS: NormalizeOptions = { now: "2026-11-07T10:00:00.000Z", appVersion: "9.9.9", folderName: "folder" };
const blank = createProject({ id: "p", name: "P", now: OPTIONS.now, appVersion: "1" });

describe("the field table's defaults are the app's own constants", () => {
  it("text style, text box, transform, settings and track", () => {
    expect(fillObject("TextStyle", {})).toEqual(DEFAULT_TEXT_STYLE);
    expect(fillObject("TextBox", {})).toEqual(DEFAULT_TEXT_BOX);
    expect(fillObject("Transform", {})).toEqual(IDENTITY_TRANSFORM);
    expect(fillObject("Settings", {})).toEqual(blank.settings);
    expect(fillObject("Track", { id: "t", kind: "video", name: "V1", clipIds: [] })).toEqual(emptyTrack("t", "video", "V1"));
  });

  it("the fields of a clip made from a media item (Fit placement aside, which is computed)", () => {
    const media: MediaItem = { id: "m", kind: "video", name: "m.mp4", file: { relPath: "media/m.mp4" }, durationUs: 2_000_000, width: 270, height: 480, hasAudio: false, analysis: { thumbs: "none", peaks: "none" }, addedAt: "x" };
    const made = mediaClips(media, null, 0, { video: "v", audio: null }, blank.settings, () => "c")?.[0];
    expect(made).toBeDefined();
    const { id, trackId, kind, name, start, duration, mediaId, in: inUs, out } = made!;
    const sparse = { id, trackId, kind, start, duration, mediaId };
    const result = normalizeProject(
      { ...blank, media: { m: { id: "m", kind: "video", file: { relPath: "media/m.mp4" } } }, tracks: [{ id: "v", kind: "video" }], clips: { c: sparse } },
      { ...OPTIONS, facts: { m: { probe: { kind: "video", durationUs: 2_000_000, width: 270, height: 480, hasAudio: false }, size: 5 } } },
    );
    expect((result.project.clips as Record<string, unknown>).c).toEqual(made);
    expect([name, inUs, out]).toEqual(["m.mp4", 0, 1_000_000 * 2]);
  });

  it("a caption track's style", () => {
    const result = normalizeProject({ ...blank, tracks: [{ id: "cc", kind: "caption" }] }, OPTIONS);
    expect((result.project.captionTracks as Record<string, { style: unknown }>).cc?.style).toEqual(defaultCaptionStyle(blank.settings));
  });
});

describe("normalizeProject", () => {
  const sparse = {
    schemaVersion: 3,
    id: "sp",
    name: "Sparse",
    tracks: [
      { id: "v1", kind: "video" },
      { id: "v2", kind: "video", name: "Overlay" },
    ],
    clips: {
      b: { id: "b", kind: "text", trackId: "v1", start: 30, duration: 30, text: { value: "Second" }, style: { fontSize: 50, shadow: { enabled: true } } },
      a: { id: "a", kind: "solid", trackId: "v1", start: 0, duration: 30, fill: { r: 1, g: 0, b: 0 }, size: { w: 10, h: 10 } },
    },
  };

  it("migrates first, fills defaults, merges nested styles field by field, names and sorts", () => {
    const { project } = normalizeProject(sparse, OPTIONS);
    expect(project.schemaVersion).toBe(SCHEMA_VERSION);
    const tracks = project.tracks as { name: string; clipIds: string[] }[];
    expect(tracks.map((track) => [track.name, track.clipIds])).toEqual([
      ["V1", ["a", "b"]],
      ["Overlay", []],
    ]);
    const text = (project.clips as Record<string, any>).b; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(text.name).toBe("Second");
    expect(text.style).toEqual({ ...DEFAULT_TEXT_STYLE, fontSize: 50, shadow: { ...DEFAULT_TEXT_STYLE.shadow, enabled: true } });
    expect(text.text.box).toEqual(DEFAULT_TEXT_BOX);
    expect((project.clips as Record<string, any>).a.fill).toEqual({ r: 1, g: 0, b: 0, a: 1 }); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(project.meta).toEqual({ createdAt: OPTIONS.now, modifiedAt: OPTIONS.now, appVersion: "9.9.9" });
    expect(validateStrict(project).errors).toEqual([]);
  });

  it("takes a missing schemaVersion as the current one and gives the project a name and id", () => {
    const { project } = normalizeProject({ tracks: [] }, OPTIONS);
    expect(project.schemaVersion).toBe(SCHEMA_VERSION);
    expect(project.name).toBe("folder");
    expect(String(project.id)).toMatch(/^project-[0-9a-f]{8}$/);
  });

  it("is idempotent: what it writes normalizes to itself", () => {
    const once = normalizeProject(sparse, OPTIONS).project;
    expect(normalizeProject(once, OPTIONS).project).toEqual(once);
  });

  it("what the input writes wins over what the file says; header facts fill the rest", () => {
    const input = { ...blank, media: { m: { id: "m", kind: "audio", name: "Mine", durationUs: 123, file: { relPath: "a.wav" } } } };
    const { project } = normalizeProject(input, { ...OPTIONS, facts: { m: { probe: { kind: "audio", durationUs: 500_000, hasAudio: true, audioCodec: "pcm", audio: { channels: 2, sampleRate: 48000 } }, size: 77 } } });
    expect((project.media as Record<string, unknown>).m).toMatchObject({ name: "Mine", durationUs: 123, hasAudio: true, audioCodec: "pcm", size: 77, analysis: { thumbs: "none", peaks: "pending" }, addedAt: OPTIONS.now });
  });

  it("an unreadable header is a note and leaves the record to the app's repair", () => {
    const input = { ...blank, media: { m: { id: "m", kind: "video", file: { relPath: "a.mp4" } } } };
    const { project, notes } = normalizeProject(input, { ...OPTIONS, facts: { m: { error: "not a readable MP4/MOV file", size: 3 } } });
    expect(notes).toEqual([{ path: "media.m.file", message: expect.stringContaining("left for the app's repair on open") }]);
    expect((project.media as Record<string, unknown>).m).toMatchObject({ durationUs: 0, hasAudio: false, size: 3 });
  });

  it("a still image gets an out point of its length, a video clip of its source span at its speed", () => {
    const input = {
      ...blank,
      media: {
        i: { id: "i", kind: "image", file: { relPath: "i.png" } },
        v: { id: "v", kind: "video", file: { relPath: "v.mp4" } },
      },
      tracks: [{ id: "t", kind: "video" }],
      clips: {
        ci: { id: "ci", kind: "image", trackId: "t", start: 0, duration: 15, mediaId: "i" },
        cv: { id: "cv", kind: "video", trackId: "t", start: 15, duration: 30, mediaId: "v", speed: 2, in: 500_000 },
      },
    };
    const facts = { i: { probe: { kind: "image", durationUs: 0, width: 10, height: 10, hasAudio: false } }, v: { probe: { kind: "video", durationUs: 9_000_000, width: 10, height: 10, hasAudio: false } } } as const;
    const clips = normalizeProject(input, { ...OPTIONS, facts }).project.clips as Record<string, { out: number }>;
    expect(clips.ci?.out).toBe(500_000);
    expect(clips.cv?.out).toBe(500_000 + 2_000_000);
  });

  it("refuses what is not a project", () => {
    expect(() => normalizeProject([], OPTIONS)).toThrow("does not hold a project object");
    expect(() => normalizeProject({ schemaVersion: 99 }, OPTIONS)).toThrow("newer version");
  });
});
