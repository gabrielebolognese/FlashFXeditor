import { describe, expect, it } from "vitest";
import { frameRateReport, setFrameRate } from "../commands/projectCommands.js";
import { DocumentStore } from "../store/DocumentStore.js";
import { createSessionStore } from "../store/sessionStore.js";
import { addCaptionTrack, makeCaptionClip, makeMedia, makeMediaClip, makeProject, makeSolidClip, makeTextClip, makeTrack, withClips } from "./fixtures.js";
import { convertProjectFrames, FrameConverter, frameRatio, isLossless } from "./fpsConvert.js";
import { frameToUs } from "./time.js";
import type { CaptionClip, Clip, MediaClip, Project, Rational, SolidClip, TextClip } from "./types.js";
import { validateProject } from "./validate.js";

const FPS_60: Rational = { num: 60, den: 1 };
const FPS_30: Rational = { num: 30, den: 1 };
const NTSC: Rational = { num: 30000, den: 1001 };

/** V1 (video, linked audio on A1, a transition), V2 (solid with keys and fades, text with animations), CC (a cue with words), two markers. */
function richProject(): Project {
  let project = makeProject();
  project.tracks = [makeTrack("v1"), makeTrack("v2"), makeTrack("a1", "audio")];
  project.media.m = makeMedia("m");
  project = addCaptionTrack(project);
  const fps = project.settings.fps;
  const a = { ...makeMediaClip(project, { id: "a", trackId: "v1", start: 0, duration: 45, mediaId: "m" }), linkGroup: "L" };
  const b: MediaClip = { ...makeMediaClip(project, { id: "b", trackId: "v1", start: 45, duration: 31, mediaId: "m" }), in: frameToUs(100, fps), out: frameToUs(131, fps) };
  const t = { id: "t", kind: "crossDissolve" as const, before: 7, after: 8 };
  a.transitionOut = { ...t };
  b.transitionIn = { ...t };
  const aAudio: MediaClip = { ...makeMediaClip(project, { id: "aa", trackId: "a1", start: 0, duration: 45, mediaId: "m", kind: "audio" }), linkGroup: "L", fades: { in: 3, out: 9 } };
  const solid: SolidClip = {
    ...makeSolidClip({ id: "s", trackId: "v2", start: 10, duration: 50 }),
    fades: { in: 5, out: 0 },
    keyframes: { opacity: [{ frame: 0, value: 0, ease: "linear" }, { frame: 13, value: 1, ease: "easeOut" }, { frame: 49, value: 0.5, ease: "hold" }] },
  };
  const text: TextClip = { ...makeTextClip({ id: "x", trackId: "v2", start: 60, duration: 90 }), animIn: { id: "wordPop", duration: 21, stagger: 3 }, animOut: { id: "fade", duration: 9 } };
  const cue: CaptionClip = makeCaptionClip({ id: "c", trackId: "cc", start: 15, duration: 40, words: [{ text: "Hello", start: 0, end: 11 }, { text: "there", start: 11, end: 40 }] });
  project = withClips(project, [a, b, aAudio, solid, text, cue]);
  project.markers = [{ id: "k1", frame: 0, color: "red", label: "" }, { id: "k2", frame: 77, color: "blue", label: "end" }];
  return project;
}

const storeFor = (project: Project) => new DocumentStore(project, { session: createSessionStore(), validate: true });

describe("frame ratio and rounding", () => {
  it("reduces the ratio of two rational rates", () => {
    expect(frameRatio(FPS_30, FPS_60)).toEqual({ num: 2, den: 1 });
    expect(frameRatio(FPS_30, NTSC)).toEqual({ num: 1000, den: 1001 });
    expect(frameRatio({ num: 24000, den: 1001 }, { num: 24, den: 1 })).toEqual({ num: 1001, den: 1000 });
  });

  it("rounds to the nearest frame, halves away from zero, and counts inexact values", () => {
    const conv = new FrameConverter(frameRatio(FPS_60, FPS_30));
    expect([conv.frame(0), conv.frame(1), conv.frame(2), conv.frame(3), conv.frame(-3)]).toEqual([0, 1, 1, 2, -2]);
    expect(conv.report.rounded).toBe(3);
    // Exact for large frames (8 h at 60 fps to 29.97).
    const ntsc = new FrameConverter(frameRatio(FPS_60, NTSC));
    expect(ntsc.frame(1_728_000)).toBe(Math.round((1_728_000 * 1000) / 2002));
  });
});

describe("convertProjectFrames (spec §15)", () => {
  it("30 to 60 fps doubles every frame value and rounds nothing", () => {
    const before = richProject();
    const after = structuredClone(before);
    const report = convertProjectFrames(after, FPS_60);
    expect(isLossless(report)).toBe(true);
    expect(after.settings.fps).toEqual(FPS_60);
    for (const id of Object.keys(before.clips)) {
      const old = before.clips[id] as Clip;
      const next = after.clips[id] as Clip;
      expect([next.start, next.duration]).toEqual([old.start * 2, old.duration * 2]);
    }
    const a = after.clips.a as MediaClip;
    const b = after.clips.b as MediaClip;
    expect(a.transitionOut).toEqual({ id: "t", kind: "crossDissolve", before: 14, after: 16 });
    expect(b.transitionIn).toEqual(a.transitionOut);
    // Same source range: the same picture plays over the same time.
    expect([b.in, b.out]).toEqual([(before.clips.b as MediaClip).in, (before.clips.b as MediaClip).out]);
    expect((after.clips.aa as MediaClip).fades).toEqual({ in: 6, out: 18 });
    const solid = after.clips.s as SolidClip;
    expect(solid.fades).toEqual({ in: 10, out: 0 });
    expect(solid.keyframes?.opacity?.map((key) => key.frame)).toEqual([0, 26, 98]);
    const text = after.clips.x as TextClip;
    expect(text.animIn).toEqual({ id: "wordPop", duration: 42, stagger: 6 });
    expect(text.animOut).toEqual({ id: "fade", duration: 18 });
    expect((after.clips.c as CaptionClip).words).toEqual([{ text: "Hello", start: 0, end: 22 }, { text: "there", start: 22, end: 80 }]);
    expect(after.markers.map((marker) => marker.frame)).toEqual([0, 154]);
    expect(validateProject(after)).toEqual([]);
  });

  it("60 to 30 fps rounds odd frames to the nearest, keeps abutting clips abutting and merges keys on one frame", () => {
    let project = makeProject();
    project.settings.fps = FPS_60;
    project.tracks = [makeTrack("v1")];
    const clips = [
      makeSolidClip({ id: "p", trackId: "v1", start: 0, duration: 3 }),
      makeSolidClip({ id: "q", trackId: "v1", start: 3, duration: 1 }),
      makeSolidClip({ id: "r", trackId: "v1", start: 4, duration: 7 }),
    ];
    (clips[2] as SolidClip).keyframes = { opacity: [{ frame: 0, value: 0, ease: "linear" }, { frame: 1, value: 0.5, ease: "linear" }, { frame: 6, value: 1, ease: "linear" }] };
    project = withClips(project, clips);
    const report = convertProjectFrames(project, FPS_30);
    const edges = ["p", "q", "r"].map((id) => [project.clips[id]?.start, project.clips[id]?.duration]);
    // p [0, 1.5) -> [0, 2); q [1.5, 2) collapses -> kept 1 frame at 2, pushing r from 2 to 3.
    expect(edges).toEqual([[0, 2], [2, 1], [3, 3]]);
    expect(report.shifted).toBe(1);
    expect(report.rounded).toBeGreaterThan(0);
    // r's keys at 60 fps 4, 5, 10 -> 2, 3 (2.5), 5, relative to the new start 3: -1, 0, 2 (none merged here).
    expect((project.clips.r as SolidClip).keyframes?.opacity?.map((key) => key.frame)).toEqual([-1, 0, 2]);
    expect(isLossless(report)).toBe(false);
    expect(validateProject(project)).toEqual([]);
  });

  it("merges keys that land on one frame, the later winning", () => {
    let project = makeProject();
    project.settings.fps = FPS_60;
    project.tracks = [makeTrack("v1")];
    const clip: SolidClip = { ...makeSolidClip({ id: "s", trackId: "v1", start: 0, duration: 20 }), keyframes: { opacity: [{ frame: 3, value: 0, ease: "linear" }, { frame: 4, value: 1, ease: "hold" }] } };
    project = withClips(project, [clip]);
    const report = convertProjectFrames(project, FPS_30);
    expect((project.clips.s as SolidClip).keyframes?.opacity).toEqual([{ frame: 2, value: 1, ease: "hold" }]);
    expect(report.merged).toBe(1);
  });

  it("30 to 29.97 keeps media clips valid against their source (§5.1 within one frame)", () => {
    const project = richProject();
    const report = convertProjectFrames(project, NTSC);
    expect(isLossless(report)).toBe(false);
    expect(validateProject(project)).toEqual([]);
    const b = project.clips.b as MediaClip;
    expect(b.start + b.duration).toBe((project.clips.a as MediaClip).start + (project.clips.a as MediaClip).duration + b.duration);
  });

  it("random timelines stay valid at every rate, and 30 -> 60 -> 30 gives the same document back", { timeout: 30_000 }, () => {
    let seed = 42;
    const random = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    const rates: Rational[] = [{ num: 24000, den: 1001 }, { num: 24, den: 1 }, { num: 25, den: 1 }, NTSC, FPS_30, { num: 50, den: 1 }, { num: 60000, den: 1001 }, FPS_60];
    for (let run = 0; run < 40; run++) {
      let project = makeProject();
      project.media.m = makeMedia("m");
      project.tracks = [makeTrack("v1"), makeTrack("v2"), makeTrack("a1", "audio")];
      const clips: Clip[] = [];
      for (const trackId of ["v1", "v2", "a1"]) {
        let at = Math.floor(random() * 5);
        for (let i = 0; i < 8; i++) {
          const duration = 1 + Math.floor(random() * 40);
          const id = `${trackId}-${i}`;
          if (trackId === "v2") {
            const solid: SolidClip = { ...makeSolidClip({ id, trackId, start: at, duration }), fades: { in: Math.floor(random() * duration), out: 0 } };
            if (random() < 0.6) solid.keyframes = { opacity: [{ frame: 0, value: 0, ease: "linear" }, { frame: Math.floor(random() * duration) + 1, value: 1, ease: "linear" }] };
            clips.push(solid);
          } else {
            const kind = trackId === "a1" ? "audio" : "video";
            const inFrames = Math.floor(random() * 300);
            const fps = project.settings.fps;
            clips.push({ ...makeMediaClip(project, { id, trackId, start: at, duration, mediaId: "m", kind }), in: frameToUs(inFrames, fps), out: frameToUs(inFrames + duration, fps) });
          }
          at += duration + (random() < 0.5 ? 0 : Math.floor(random() * 10));
        }
      }
      project = withClips(project, clips);
      const to = rates[run % rates.length] as Rational;
      const converted = structuredClone(project);
      convertProjectFrames(converted, to);
      expect(validateProject(converted), `run ${run} to ${to.num}/${to.den}`).toEqual([]);
      const there = structuredClone(project);
      convertProjectFrames(there, FPS_60);
      convertProjectFrames(there, FPS_30);
      expect(there).toEqual(project);
    }
  });
});

describe("project.setFrameRate", () => {
  it("converts in one undo step; undo reverts every frame value", () => {
    const original = richProject();
    const store = storeFor(original);
    expect(isLossless(frameRateReport(store.getState(), FPS_60))).toBe(true);
    store.dispatch(setFrameRate(FPS_60));
    expect(store.getState().settings.fps).toEqual(FPS_60);
    expect(store.getState().clips.x?.duration).toBe(180);
    expect(store.history.getState().undoLabel).toBe("Change frame rate");
    store.undo();
    expect(store.getState()).toEqual(original);
    store.redo();
    expect(store.getState().clips.b?.start).toBe(90);
  });

  it("reports a lossy conversion before it is made", () => {
    const store = storeFor(richProject());
    const report = frameRateReport(store.getState(), { num: 24, den: 1 });
    expect(report.rounded).toBeGreaterThan(0);
    // Computing the report changes nothing.
    expect(store.getState().settings.fps).toEqual(FPS_30);
    expect(store.history.getState().canUndo).toBe(false);
  });

  it("keeps a freeze frame on the media's last frame inside the media at a lower rate (Batch 47 fuzz)", () => {
    // Held 10 ms before the end of the media: one frame later is the media's end at 30 fps (freeze.ts
    // clamps it there), and past it at 15 or 24 fps.
    let project = makeProject();
    project.media.m = makeMedia("m", "video", 10_000_000);
    project.tracks = [makeTrack("v1")];
    const freeze: MediaClip = { ...makeMediaClip(project, { id: "f", trackId: "v1", start: 0, duration: 60, mediaId: "m" }), speed: 0, in: 9_990_000, out: 10_000_000 };
    project = withClips(project, [freeze]);
    expect(validateProject(project)).toEqual([]);
    for (const to of [{ num: 15, den: 1 }, { num: 24, den: 1 }, FPS_60]) {
      const store = storeFor(project);
      store.dispatch(setFrameRate(to));
      expect(store.getState().clips.f).toMatchObject({ speed: 0, in: 9_990_000, out: 10_000_000 });
    }
  });
});
