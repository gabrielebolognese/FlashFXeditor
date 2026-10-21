import { describe, expect, it } from "vitest";
import { makeMedia } from "../../core/document/fixtures.js";
import type { MediaClip } from "../../core/document/types.js";
import { defaultTransform, mediaClips, mediaLanes, naturalDuration, sourceSpan } from "./insertMedia.js";

const FPS = { num: 30, den: 1 };
const SETTINGS = { width: 1080, height: 1920, fps: FPS };

function counter(prefix = "n") {
  let n = 0;
  return () => `${prefix}${++n}`;
}

describe("naturalDuration", () => {
  it("uses the whole frames of the media, 5 s for stills, and refuses empty media", () => {
    expect(naturalDuration(makeMedia("a", "video", 10_000_000), FPS)).toBe(300);
    expect(naturalDuration(makeMedia("a", "video", 10_020_000), FPS)).toBe(300);
    expect(naturalDuration(makeMedia("a", "video", 10_000), FPS)).toBe(1);
    expect(naturalDuration(makeMedia("a", "image", 0), FPS)).toBe(150);
    expect(naturalDuration(makeMedia("a", "image", 0), { num: 24, den: 1 })).toBe(120);
    expect(naturalDuration(makeMedia("a", "video", 0), FPS)).toBeNull();
  });

  it("takes the source range (spec §12): I at 2 s and O at 5 s give 3 s; an open end is the media's", () => {
    const video = makeMedia("a", "video", 10_000_000);
    expect(naturalDuration(video, FPS, { inUs: 2_000_000, outUs: 5_000_000 })).toBe(90);
    expect(naturalDuration(video, FPS, { inUs: 8_000_000, outUs: null })).toBe(60);
    expect(naturalDuration(video, FPS, { inUs: null, outUs: 1_000_000 })).toBe(30);
    // Stills have no range.
    expect(naturalDuration(makeMedia("s", "image", 0), FPS, { inUs: 0, outUs: 1_000_000 })).toBe(150);
  });
});

describe("sourceSpan", () => {
  it("clamps the range into the media and falls back to all of it when it is empty", () => {
    const video = makeMedia("a", "video", 10_000_000);
    expect(sourceSpan(video, null)).toEqual({ inUs: 0, outUs: 10_000_000 });
    expect(sourceSpan(video, { inUs: -5, outUs: 20_000_000 })).toEqual({ inUs: 0, outUs: 10_000_000 });
    expect(sourceSpan(video, { inUs: 4_000_000, outUs: 4_000_000 })).toEqual({ inUs: 0, outUs: 10_000_000 });
    expect(sourceSpan(makeMedia("e", "video", 0), null)).toBeNull();
  });
});

describe("mediaLanes", () => {
  it("puts pictures on video tracks and sound on audio tracks", () => {
    expect(mediaLanes(makeMedia("v"))).toEqual({ video: true, audio: true });
    expect(mediaLanes({ ...makeMedia("m"), hasAudio: false })).toEqual({ video: true, audio: false });
    expect(mediaLanes(makeMedia("s", "audio"))).toEqual({ video: false, audio: true });
    expect(mediaLanes(makeMedia("i", "image"))).toEqual({ video: true, audio: false });
  });
});

describe("mediaClips", () => {
  it("links a video and its audio, both over the source range", () => {
    const video = makeMedia("vid", "video", 10_000_000);
    const clips = mediaClips(video, { inUs: 2_000_000, outUs: 5_000_000 }, 12, { video: "v1", audio: "a1" }, SETTINGS, counter())!;
    const [picture, sound] = clips as [MediaClip, MediaClip];
    expect(picture).toMatchObject({ kind: "video", trackId: "v1", start: 12, duration: 90, in: 2_000_000, out: 5_000_000, speed: 1, mediaId: "vid", name: "vid.mp4", enabled: true });
    expect(sound).toMatchObject({ kind: "audio", trackId: "a1", start: 12, duration: 90, in: 2_000_000, out: 5_000_000 });
    expect(picture.linkGroup).toBeDefined();
    expect(sound.linkGroup).toBe(picture.linkGroup);
    expect(sound.transform.scale).toBe(1);
  });

  it("makes one unlinked clip for silent video, audio and stills (5 s, out = 5 s)", () => {
    const silent = mediaClips({ ...makeMedia("m", "video", 4_000_000), hasAudio: false }, null, 0, { video: "v1", audio: null }, SETTINGS, counter())!;
    expect(silent.map((c) => [c.kind, c.trackId, c.duration, c.linkGroup])).toEqual([["video", "v1", 120, undefined]]);
    const song = mediaClips(makeMedia("s", "audio", 2_500_000), null, 0, { video: null, audio: "a1" }, SETTINGS, counter())!;
    expect(song.map((c) => [c.kind, c.trackId, c.duration, c.out])).toEqual([["audio", "a1", 75, 2_500_000]]);
    const still = mediaClips(makeMedia("i", "image", 0), null, 30, { video: "v1", audio: null }, SETTINGS, counter())!;
    expect(still.map((c) => [c.kind, c.start, c.duration, c.in, c.out])).toEqual([["image", 30, 150, 0, 5_000_000]]);
  });

  it("refuses media without a duration or without the track a kind needs; takes a given transform", () => {
    expect(mediaClips(makeMedia("e", "video", 0), null, 0, { video: "v1", audio: "a1" }, SETTINGS, counter())).toBeNull();
    expect(mediaClips(makeMedia("v"), null, 0, { video: "v1", audio: null }, SETTINGS, counter())).toBeNull();
    const placed = { x: 100, y: -50, scale: 0.5, rotation: 0, anchor: { x: 0.5, y: 0.5 }, flipH: false, flipV: false };
    expect(mediaClips(makeMedia("i", "image", 0), null, 0, { video: "v1", audio: null }, SETTINGS, counter(), placed)![0]!.transform).toEqual(placed);
  });
});

describe("defaultTransform", () => {
  it("fits the media in the frame: letterboxed 16:9, upright iPhone video, same-aspect media filling it", () => {
    const frame = { width: 1080, height: 1920 };
    const landscape = { ...makeMedia("wide", "video", 1_000_000), width: 1920, height: 1080 };
    expect(defaultTransform(landscape, frame)).toEqual({ x: 0, y: 0, scale: 0.5625, rotation: 0, anchor: { x: 0.5, y: 0.5 }, flipH: false, flipV: false });
    // Coded 1920x1080 with rotation 90 shows 1080x1920: it fills the 9:16 frame at scale 1.
    expect(defaultTransform({ ...landscape, rotation: 90 }, frame).scale).toBe(1);
    expect(defaultTransform({ ...landscape, width: 2160, height: 3840 }, frame).scale).toBe(0.5);
    expect(defaultTransform({ ...landscape, width: 720, height: 1280 }, frame).scale).toBe(1.5);
    expect(defaultTransform({ ...makeMedia("logo", "image", 0), width: 400, height: 200 }, frame).scale).toBe(2.7);
    expect(defaultTransform(makeMedia("song", "audio", 1_000_000), frame).scale).toBe(1);

    const [video, audio] = mediaClips({ ...landscape, hasAudio: true }, null, 0, { video: "v1", audio: "a1" }, SETTINGS, counter()) as [MediaClip, MediaClip];
    expect(video.transform.scale).toBe(0.5625);
    expect(audio.transform.scale).toBe(1);
  });
});
