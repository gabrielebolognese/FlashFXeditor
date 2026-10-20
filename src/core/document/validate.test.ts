import { describe, expect, it } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeSolidClip, makeTrack, withClips } from "./fixtures.js";
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

  it("reports out <= in and missing media", () => {
    const project = valid();
    const clip = mediaClip(project, "c1");
    clip.out = clip.in;
    clip.mediaId = "nope";
    const issues = validateProject(project).join("\n");
    expect(issues).toContain("out 0 <= in 0");
    expect(issues).toContain("media nope does not exist");
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
    project.captionTracks.v1 = {};
    expect(validateProject(project).join()).toContain("captionTracks entry v1");
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
      expect.stringContaining("stored under key key"),
    ]);
  });
});
