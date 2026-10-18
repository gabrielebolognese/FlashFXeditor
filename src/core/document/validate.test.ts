import { describe, expect, it } from "vitest";
import { defaultCaptionStyle } from "../../text/captions.js";
import { addCaptionTrack, makeCaptionClip, makeMedia, makeMediaClip, makeProject, makeSolidClip, makeTextClip, makeTrack, withClips } from "./fixtures.js";
import { createProject } from "./project.js";
import type { Project } from "./types.js";
import { assertValid, DocumentInvariantError, validateProject } from "./validate.js";

function base(): Project {
  const project = makeProject();
  project.media.m1 = makeMedia("m1", "video", 10_000_000);
  project.tracks.push(makeTrack("v1", "video"), makeTrack("a1", "audio"));
  return project;
}

function valid(): Project {
  const project = base();
  return withClips(project, [
    makeMediaClip(project, { id: "c1", trackId: "v1", start: 0, duration: 30, mediaId: "m1" }),
    makeMediaClip(project, { id: "c2", trackId: "v1", start: 30, duration: 30, mediaId: "m1" }),
    makeMediaClip(project, { id: "c3", trackId: "a1", start: 10, duration: 30, mediaId: "m1", kind: "audio" }),
  ]);
}

function mediaClip(project: Project, id: string) {
  const clip = project.clips[id];
  if (!clip || (clip.kind !== "video" && clip.kind !== "audio")) throw new Error(`fixture ${id}`);
  return clip;
}

describe("validateProject", () => {
  it("accepts a new project and a valid document", () => {
    expect(validateProject(createProject({ id: "p", name: "P", now: "t", appVersion: "v" }))).toEqual([]);
    expect(validateProject(valid())).toEqual([]);
  });

  it("checks solids: a known shape, a positive size, a radius >= 0, a color or a two-stop gradient", () => {
    const solid = makeSolidClip({ id: "s1", trackId: "v1", start: 60, duration: 30 });
    const gradient = { ...makeSolidClip({ id: "s2", trackId: "v1", start: 90, duration: 30 }), shape: "ellipse" as const, fill: { from: { r: 1, g: 0, b: 0, a: 1 }, to: { r: 0, g: 0, b: 1, a: 0.5 } } };
    expect(validateProject(withClips(valid(), [solid, gradient]))).toEqual([]);
    const broken = { ...solid, shape: "star" as "rect", size: { w: 0, h: Number.NaN }, cornerRadius: -1, fill: { from: { r: 1, g: 0, b: 0, a: 1 } } as never };
    expect(validateProject(withClips(valid(), [broken]))).toEqual([
      expect.stringContaining('shape "star"'),
      expect.stringContaining("size 0xNaN"),
      expect.stringContaining("corner radius -1"),
      expect.stringContaining("fill must be RGBA or a gradient"),
    ]);
  });

  it("checks text clips: a string, a box width, a size, weight and line height the layout can use", () => {
    const text = makeTextClip({ id: "t1", trackId: "v1", start: 60, duration: 30, value: "Hi" });
    expect(validateProject(withClips(valid(), [text]))).toEqual([]);
    const broken = { ...text, text: { value: "Hi", box: { mode: "fixed" as const, width: 0 } }, style: { ...text.style, fontSize: 0, lineHeight: Number.NaN, fontWeight: 1200 } };
    const issues = validateProject(withClips(valid(), [broken]));
    expect(issues).toHaveLength(4);
    expect(issues[0]).toContain('clip "t1" (t1): text box width 0 must be > 0');
    expect(issues.join("\n")).toContain("font size 0 must be > 0");
    expect(issues.join("\n")).toContain("line height NaN must be > 0");
    expect(issues.join("\n")).toContain("font weight 1200 must be in 1..1000");
    // Text belongs on video tracks.
    expect(validateProject(withClips(valid(), [{ ...text, trackId: "a1" }]))).toEqual([expect.stringContaining("a text clip cannot sit on audio")]);
  });

  it("reports overlapping clips, naming the track and both clips", () => {
    const project = valid();
    project.clips.c2!.start = 29;
    const issues = validateProject(project);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('track "V1" (v1)');
    expect(issues[0]).toContain("(c2) overlaps");
    expect(issues[0]).toContain("(c1)");
  });

  it("reports unsorted clips", () => {
    const project = valid();
    project.tracks[0]!.clipIds.reverse();
    expect(validateProject(project).join()).toContain("starts earlier");
  });

  it("reports duration < 1 and non-integer frames", () => {
    const project = valid();
    project.clips.c1!.duration = 0;
    project.clips.c2!.start = 30.5;
    const issues = validateProject(project).join("\n");
    expect(issues).toContain("(c1): duration 0");
    expect(issues).toContain("(c2): start 30.5");
  });

  it("reports media in/out problems", () => {
    const project = valid();
    const clip = mediaClip(project, "c1");
    clip.out = 20_000_000;
    clip.in = -1;
    const issues = validateProject(project).join("\n");
    expect(issues).toContain("in -1 < 0");
    expect(issues).toContain("> media duration 10000000");
    expect(issues).toContain("expected duration * speed");
  });

  it("allows in/out within one frame of duration * speed", () => {
    const project = valid();
    const clip = mediaClip(project, "c1");
    clip.out += 30_000;
    expect(validateProject(project)).toEqual([]);
    clip.speed = 2;
    clip.out = clip.in + 2_000_000;
    expect(validateProject(project)).toEqual([]);
  });

  it("reports out <= in; a clip whose media was removed is an offline clip (Batch 41)", () => {
    const project = valid();
    const clip = mediaClip(project, "c1");
    clip.out = clip.in;
    const issues = validateProject(project).join("\n");
    expect(issues).toContain("out 0 <= in 0");
    // "Remove from project" keeps the clips of used media offline (spec §6.19): no media bound to check.
    const offline = valid();
    delete offline.media.m1;
    const c2 = mediaClip(offline, "c2");
    c2.in += 60_000_000;
    c2.out += 60_000_000;
    expect(validateProject(offline)).toEqual([]);
  });

  it("checks bins: unique ids, names, and media bins that exist; media sizes", () => {
    const project = valid();
    project.bins.push({ id: "b1", name: "B-roll" });
    project.media.m1!.binId = "b1";
    project.media.m1!.size = 1234;
    expect(validateProject(project)).toEqual([]);
    project.bins.push({ id: "b1", name: " " });
    project.media.m1!.binId = "b2";
    project.media.m1!.size = 1.5;
    const issues = validateProject(project).join("\n");
    expect(issues).toContain("bin b1: listed more than once");
    expect(issues).toContain("bin b1: name must be a non-empty string");
    expect(issues).toContain("bin b2 does not exist");
    expect(issues).toContain("size 1.5 must be an integer >= 0");
  });

  it("accepts the 8 label colors only", () => {
    const project = valid();
    project.clips.c1!.color = "violet";
    expect(validateProject(project)).toEqual([]);
    (project.clips.c1 as { color: string }).color = "magenta";
    expect(validateProject(project)).toEqual(['clip "c1" (c1): color "magenta" is not a label color']);
  });

  it("reports clips on the wrong track kind", () => {
    const project = withClips(base(), [makeSolidClip({ id: "s1", trackId: "a1", start: 0, duration: 5 })]);
    expect(validateProject(project).join()).toContain("a solid clip cannot sit on audio");
  });

  it("reports broken track <-> clip references", () => {
    const project = valid();
    project.tracks[0]!.clipIds.push("ghost");
    project.clips.c3!.trackId = "v1";
    project.clips.orphan = { ...project.clips.c1!, id: "orphan", start: 500 };
    const issues = validateProject(project).join("\n");
    expect(issues).toContain("lists clip ghost, which is not in clips");
    expect(issues).toContain('(c3): listed on track "A1" (a1) but points to track v1');
    expect(issues).toContain("(orphan): not listed on any track");
  });

  it("reports a clip listed twice and duplicate track ids", () => {
    const project = valid();
    project.tracks[1]!.clipIds.push("c1");
    project.tracks.push(makeTrack("a1", "audio"));
    const issues = validateProject(project).join("\n");
    expect(issues).toContain("(c1): listed more than once");
    expect(issues).toContain("duplicate track id");
  });

  it("reports a video track after an audio track", () => {
    const project = base();
    project.tracks.push(makeTrack("v2", "video"));
    expect(validateProject(project).join()).toContain("video track placed after an audio track");
  });

  it("reports caption data without a caption track", () => {
    const project = base();
    project.captionTracks.v1 = { style: defaultCaptionStyle(project.settings) };
    expect(validateProject(project).join()).toContain("captionTracks entry v1 has no caption track");
  });

  it("checks the caption track: one at most, above the video tracks, a valid style, cues with integer word frames", () => {
    const project = addCaptionTrack(base());
    const cue = makeCaptionClip({ id: "q1", trackId: "cc", start: 0, duration: 30, text: "Hi there", words: [{ text: "Hi", start: 0, end: 10 }] });
    expect(validateProject(withClips(project, [cue]))).toEqual([]);
    const twice = addCaptionTrack(project, "cc2");
    expect(validateProject(twice).join()).toContain("2 caption tracks");
    const low = structuredClone(project);
    low.tracks = [low.tracks[1]!, low.tracks[0]!, low.tracks[2]!];
    expect(validateProject(low).join()).toContain("must be above every video track");
    const style = structuredClone(project);
    style.captionTracks.cc!.style = { ...style.captionTracks.cc!.style, position: "left" as "top", maxLines: 0, highlight: { mode: "glow" as "none", color: { r: 1, g: 1, b: 1, a: 1 }, inactiveColor: { r: 1 } as never } };
    const issues = validateProject(style).join(" | ");
    expect(issues).toContain('position "left"');
    expect(issues).toContain("max lines 0");
    expect(issues).toContain('highlight mode "glow"');
    expect(issues).toContain("highlight colors must be RGBA");
    const words = validateProject(withClips(project, [{ ...cue, words: [{ text: "Hi", start: 5, end: 5 }, { text: "x", start: 0.5, end: 2 }] }]));
    expect(words).toHaveLength(2);
    expect(validateProject(withClips(project, [{ ...cue, trackId: "v1" }])).join()).toContain("a caption clip cannot sit on video");
  });

  it("assertValid throws a DocumentInvariantError listing every issue", () => {
    const project = valid();
    project.clips.c1!.duration = 0;
    expect(() => assertValid(project, 'after "Test"')).toThrow(DocumentInvariantError);
    expect(() => assertValid(project, 'after "Test"')).toThrow(/after "Test":\n {2}- clip "c1"/);
    expect(() => assertValid(valid(), "x")).not.toThrow();
  });
});

describe("media items", () => {
  it("accepts complete probed items and stills", () => {
    const project = makeProject();
    project.media.v = { ...makeMedia("v"), width: 1920, height: 1080, rotation: 90, fps: { num: 30000, den: 1001 }, codec: "hvc1.1.6.L153.90" };
    project.media.still = { ...makeMedia("still", "image", 0), width: 640, height: 480 };
    project.media.px = { ...makeMedia("px"), width: 3840, height: 2160, proxy: { relPath: "cache/proxies/px.mp4", width: 960, height: 540, status: "ready" } };
    expect(validateProject(project)).toEqual([]);
  });

  it("lets an image clip hold a still for any length, but keeps video clips inside their media", () => {
    const project = base();
    project.media.still = { ...makeMedia("still", "image", 0), width: 640, height: 480 };
    const held = withClips(project, [makeMediaClip(project, { id: "i1", trackId: "v1", start: 0, duration: 150, mediaId: "still", kind: "image" })]);
    expect(validateProject(held)).toEqual([]);
    const tooLong = withClips(project, [makeMediaClip(project, { id: "c9", trackId: "v1", start: 0, duration: 301, mediaId: "m1" })]);
    expect(validateProject(tooLong)).toEqual([expect.stringContaining("> media duration 10000000")]);
  });

  it("rejects non-integer times and sizes, odd rotations, bad rationals and escaping paths", () => {
    const project = makeProject();
    project.media.a = { ...makeMedia("a"), durationUs: 1.5 };
    project.media.b = { ...makeMedia("b"), width: 0, height: 10.5 };
    project.media.c = { ...makeMedia("c"), rotation: 45 as 90 };
    project.media.d = { ...makeMedia("d"), fps: { num: 30, den: 0 } };
    project.media.e = { ...makeMedia("e"), file: { relPath: "../outside.mp4" } };
    project.media.f = { ...makeMedia("f"), file: { relPath: "/abs.mp4" } };
    project.media.g = { ...makeMedia("g"), proxy: { relPath: "cache/proxies/g.mp4", width: 960, height: 0, status: "done" as "ready" } };
    project.media.h = { ...makeMedia("h"), proxy: { relPath: "../h.mp4", width: 960, height: 540, status: "pending" } };
    project.media.key = makeMedia("other");
    const issues = validateProject(project);
    expect(issues).toEqual([
      expect.stringContaining("durationUs 1.5"),
      expect.stringContaining("width 0"),
      expect.stringContaining("height 10.5"),
      expect.stringContaining("rotation 45"),
      expect.stringContaining("fps 30/0"),
      expect.stringContaining('relPath "../outside.mp4"'),
      expect.stringContaining('relPath "/abs.mp4"'),
      expect.stringContaining('proxy status "done"'),
      expect.stringContaining("proxy size 960x0"),
      expect.stringContaining('proxy relPath "../h.mp4"'),
      expect.stringContaining("stored under key key"),
    ]);
  });
});
