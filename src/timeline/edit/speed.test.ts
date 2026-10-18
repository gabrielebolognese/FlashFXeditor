import { describe, expect, it } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeTrack, withClips } from "../../core/document/fixtures.js";
import { framesToSourceUs, frameToUs, usPerFrame } from "../../core/document/time.js";
import { isMediaClip, type Clip, type MediaClip, type Project, type Track } from "../../core/document/types.js";
import { validateProject } from "../../core/document/validate.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createSessionStore } from "../../core/store/sessionStore.js";
import { linkOffset } from "../model/queries.js";
import { random, type Rng } from "./fuzzKit.js";
import { setSpeedDurations, setSpeeds, type SpeedOptions, type SpeedResult } from "./speed.js";
import { maxDurationFrames, rateStretch, trimEdge } from "./trim.js";

const fps = makeProject().settings.fps;
/** 20 s of media at 30 fps: 600 frames. */
const MEDIA_US = 20_000_000;
/** 10 s of media: 300 frames, so a clip from 0 at 1x lasting 300 frames ends on the media end. */
const SHORT_US = 10_000_000;

function clip(id: string, trackId: string, start: number, duration: number, inFrames = 0, extra: Partial<MediaClip> = {}): MediaClip {
  const base = makeMediaClip(makeProject(), { id, trackId, start, duration, mediaId: "m", kind: trackId.startsWith("a") ? "audio" : "video" });
  return { ...base, in: frameToUs(inFrames, fps), out: frameToUs(inFrames + duration, fps), ...extra };
}

function project(clips: Clip[], tracks: Track[] = [makeTrack("v1"), makeTrack("v2"), makeTrack("a1", "audio")]): Project {
  const p = makeProject();
  p.media.m = makeMedia("m", "video", MEDIA_US);
  p.tracks.push(...tracks);
  return withClips(p, clips);
}

function shortMedia(p: Project): Project {
  return { ...p, media: { ...p.media, m: makeMedia("m", "video", SHORT_US) } };
}

const LINKED: SpeedOptions = { link: true, ripple: true, linked: true };
const NO_RIPPLE: SpeedOptions = { link: true, ripple: false, linked: true };

/** Dispatches the result's command through a validating store (one undo step); returns the new document and the store. */
function commit(p: Project, result: SpeedResult) {
  if (!result.command) throw new Error("expected a command");
  const doc = new DocumentStore(p, { session: createSessionStore(), validate: true });
  doc.dispatch(result.command);
  expect(doc.history.getState().undoLabel).toBe(result.command.label);
  return { next: doc.getState(), doc };
}

const get = (p: Project, id: string) => p.clips[id] as MediaClip;
const span = (p: Project, id: string) => [get(p, id).start, get(p, id).duration];

describe("setSpeeds", () => {
  it("2x on a 10 s clip: 5 s, the source range kept, the speed exact; the linked sound follows (acceptance 1)", () => {
    const p = project([clip("v", "v1", 0, 300, 0, { linkGroup: "g" }), clip("a", "a1", 0, 300, 0, { linkGroup: "g" })]);
    const { next, doc } = commit(p, setSpeeds(p, ["v"], 2, LINKED));
    for (const id of ["v", "a"]) {
      expect(span(next, id)).toEqual([0, 150]);
      expect(get(next, id).speed).toBe(2);
      expect([get(next, id).in, get(next, id).out]).toEqual([0, frameToUs(300, fps)]);
    }
    expect(doc.history.getState().undoLabel).toBe("Change speed");
    doc.undo();
    expect(doc.getState()).toEqual(p);
  });

  it("ripples later clips on every unlocked track when the option is on, leaves the gap when it is off (acceptance 1)", () => {
    const tracks = [makeTrack("v1"), makeTrack("v2"), { ...makeTrack("v3"), locked: true }, makeTrack("a1", "audio")];
    const p = project([clip("a", "v1", 0, 300), clip("b", "v1", 300, 60, 300), clip("t", "v2", 320, 30, 0), clip("s", "a1", 400, 30), clip("l", "v3", 300, 30)], tracks);
    const rippled = commit(p, setSpeeds(p, ["a"], 2, LINKED)).next;
    expect(span(rippled, "a")).toEqual([0, 150]);
    expect(span(rippled, "b")).toEqual([150, 60]);
    expect(span(rippled, "t")).toEqual([170, 30]);
    expect(span(rippled, "s")).toEqual([250, 30]);
    // Locked tracks never move.
    expect(span(rippled, "l")).toEqual([300, 30]);
    const kept = commit(p, setSpeeds(p, ["a"], 2, NO_RIPPLE)).next;
    expect(span(kept, "a")).toEqual([0, 150]);
    expect(span(kept, "b")).toEqual([300, 60]);
  });

  it("slower with ripple pushes later clips; without it the clip stops at the next one, keeping the speed", () => {
    const p = project([clip("a", "v1", 0, 300), clip("b", "v1", 400, 60, 300)]);
    const pushed = commit(p, setSpeeds(p, ["a"], 0.5, LINKED)).next;
    expect(span(pushed, "a")).toEqual([0, 600]);
    expect(span(pushed, "b")).toEqual([700, 60]);
    const blocked = setSpeeds(p, ["a"], 0.5, NO_RIPPLE);
    expect(blocked.limit).toMatchObject({ reason: "neighbor", clipId: "a" });
    const next = commit(p, blocked).next;
    expect(span(next, "a")).toEqual([0, 400]);
    expect(get(next, "a").speed).toBe(0.5);
    // The out point comes in: 400 frames at 0.5x play 200 source frames.
    expect(get(next, "a").out).toBe(framesToSourceUs(400, 0.5, fps));
    expect(span(next, "b")).toEqual([400, 60]);
  });

  it("a ripple to the left stops where another track would overlap, leaving a gap", () => {
    // The V2 clip spans the edit point; the one after it can only move back 20 frames.
    const p = project([clip("a", "v1", 0, 300), clip("b", "v1", 300, 60, 300), clip("bed", "v2", 0, 280), clip("t", "v2", 300, 30)]);
    const result = setSpeeds(p, ["a"], 2, LINKED);
    expect(result.limit).toMatchObject({ reason: "ripple", clipId: "t" });
    const next = commit(p, result).next;
    expect(span(next, "a")).toEqual([0, 150]);
    expect(span(next, "b")).toEqual([280, 60]);
    expect(span(next, "t")).toEqual([280, 30]);
  });

  it("unlinked: the duration stays and the source range follows; media shorter than asked is clamped and warned (spec §6.19)", () => {
    const options: SpeedOptions = { link: false, ripple: true, linked: true };
    const p = project([clip("a", "v1", 0, 100, 0), clip("b", "v1", 100, 100, 400), clip("c", "v1", 200, 30)]);
    const slower = commit(p, setSpeeds(p, ["a"], 0.5, options)).next;
    expect(span(slower, "a")).toEqual([0, 100]);
    expect(get(slower, "a").out).toBe(framesToSourceUs(100, 0.5, fps));
    // b starts 400 frames in: at 4x only 50 frames of media are left for its 100 frames.
    const result = setSpeeds(p, ["b"], 4, options);
    expect(result.limit).toMatchObject({ reason: "mediaEnd", clipId: "b" });
    const next = commit(p, result).next;
    expect(span(next, "b")).toEqual([100, 50]);
    expect(get(next, "b").out).toBe(MEDIA_US);
    expect(span(next, "c")).toEqual([150, 30]);
  });

  it("clamps to 0.25x..4x, scales keyframes, clamps fades and skips locked clips, freeze frames and stills", () => {
    const tracks = [makeTrack("v1"), { ...makeTrack("v2"), locked: true }];
    const p = project(
      [clip("a", "v1", 0, 300, 0, { keyframes: { opacity: [{ frame: 0, value: 1, ease: "linear" }, { frame: 200, value: 0, ease: "linear" }] }, fades: { in: 10, out: 250 } }), clip("l", "v2", 0, 300), clip("f", "v1", 300, 60, 0, { speed: 0, out: frameToUs(1, fps) })],
      tracks,
    );
    const next = commit(p, setSpeeds(p, ["a", "l", "f"], 8, LINKED)).next;
    expect(get(next, "a").speed).toBe(4);
    expect(span(next, "a")).toEqual([0, 75]);
    expect(get(next, "a").keyframes?.opacity?.map((key) => key.frame)).toEqual([0, 50]);
    // The two fades fit the new duration together (Batch 50), in proportion.
    expect(get(next, "a").fades).toEqual({ in: 3, out: 72 });
    expect(get(next, "l").speed).toBe(1);
    expect(get(next, "f").speed).toBe(0);
    // The freeze rippled with the faster clip.
    expect(span(next, "f")).toEqual([75, 60]);
    expect(setSpeeds(p, ["l", "f"], 2, LINKED).command).toBeNull();
    expect(setSpeeds(p, ["a"], 1, LINKED).command).toBeNull();
  });

  it("an arrow step adds to each clip's own speed; selected partners change once even with Linked selection off", () => {
    const p = project([clip("v", "v1", 0, 300, 0, { linkGroup: "g" }), clip("a", "a1", 0, 300, 0, { linkGroup: "g" }), clip("w", "v2", 0, 300, 0, { speed: 1.5, out: frameToUs(450, fps), duration: 300 })]);
    const options: SpeedOptions = { link: true, ripple: true, linked: false };
    const next = commit(p, setSpeeds(p, ["v", "a", "w"], (c) => c.speed + 0.5, options)).next;
    expect([get(next, "v").speed, get(next, "a").speed, get(next, "w").speed]).toEqual([1.5, 1.5, 2]);
    expect([get(next, "v").duration, get(next, "a").duration, get(next, "w").duration]).toEqual([200, 200, 225]);
    // Linked selection off and the sound not selected: the video changes alone.
    const alone = commit(p, setSpeeds(p, ["v"], 2, options)).next;
    expect([get(alone, "v").speed, get(alone, "a").speed]).toEqual([2, 1]);
  });
});

describe("setSpeeds with partners that differ", () => {
  it("a speed set with Linked selection off, then changed with it on: each partner keeps its own source range (on the media end)", () => {
    const p = shortMedia(project([clip("v", "v1", 0, 300, 0, { linkGroup: "g" }), clip("a", "a1", 0, 300, 0, { linkGroup: "g" })]));
    const alone = commit(p, setSpeeds(p, ["v"], 2, { link: true, ripple: true, linked: false })).next;
    expect([span(alone, "v"), span(alone, "a")]).toEqual([
      [0, 150],
      [0, 300],
    ]);
    const result = setSpeeds(alone, ["v"], 4, LINKED);
    expect(result.limit).toBeNull();
    const next = commit(alone, result).next;
    expect(validateProject(next)).toEqual([]);
    for (const id of ["v", "a"]) {
      expect(span(next, id)).toEqual([0, 75]);
      expect(get(next, id).speed).toBe(4);
      expect([get(next, id).in, get(next, id).out]).toEqual([0, SHORT_US]);
    }
  });

  it("an L cut: each side keeps its source range, and what follows moves up by the smaller shortening, in sync", () => {
    // A's picture plays 0-8 s; its sound runs on to the media end (10 s) under B, whose sound starts at 300.
    const p = shortMedia(
      project([clip("A", "v1", 0, 240, 0, { linkGroup: "g" }), clip("a", "a1", 0, 300, 0, { linkGroup: "g" }), clip("B", "v1", 240, 60, 0, { linkGroup: "h" }), clip("b", "a1", 300, 60, 60, { linkGroup: "h" })]),
    );
    const result = setSpeeds(p, ["A"], 2, LINKED);
    expect(result.limit).toBeNull();
    const next = commit(p, result).next;
    expect(validateProject(next)).toEqual([]);
    expect([span(next, "A"), get(next, "A").in, get(next, "A").out]).toEqual([[0, 120], 0, frameToUs(240, fps)]);
    expect([span(next, "a"), get(next, "a").in, get(next, "a").out]).toEqual([[0, 150], 0, SHORT_US]);
    // The L cut lasts 30 frames at 2x; B and its sound move up 120 frames together.
    expect([span(next, "B"), span(next, "b")]).toEqual([
      [120, 60],
      [180, 60],
    ]);
    for (const id of ["A", "B"]) expect(linkOffset(next, id)).toBe(0);
  });

  it("a J cut: each side keeps its start and source range, so the pair shows a sync offset", () => {
    // The sound leads the picture by 30 frames (1 s of source).
    const p = project([clip("A", "v1", 30, 300, 30, { linkGroup: "g" }), clip("a", "a1", 0, 330, 0, { linkGroup: "g" })]);
    expect(linkOffset(p, "A")).toBe(0);
    const next = commit(p, setSpeeds(p, ["A"], 2, LINKED)).next;
    expect(validateProject(next)).toEqual([]);
    expect([span(next, "A"), get(next, "A").in, get(next, "A").out]).toEqual([[30, 150], frameToUs(30, fps), frameToUs(330, fps)]);
    expect([span(next, "a"), get(next, "a").in, get(next, "a").out]).toEqual([[0, 165], 0, frameToUs(330, fps)]);
    expect(linkOffset(next, "A")).toBe(15);
  });

  it("unlinked: each partner keeps its duration within its own media; one that runs out is clamped and warned (spec §6.19)", () => {
    const options: SpeedOptions = { link: false, ripple: true, linked: true };
    // The video already plays 10 s at 2x in 150 frames (Linked selection was off); its sound plays them at 1x.
    const p = project([clip("v", "v1", 0, 150, 0, { linkGroup: "g", speed: 2, out: frameToUs(300, fps) }), clip("a", "a1", 0, 300, 0, { linkGroup: "g" }), clip("c", "a1", 300, 30)]);
    const result = setSpeeds(p, ["v"], 3, options);
    expect(result.limit).toMatchObject({ reason: "mediaEnd", clipId: "a" });
    const next = commit(p, result).next;
    expect(validateProject(next)).toEqual([]);
    expect([span(next, "v"), get(next, "v").out]).toEqual([[0, 150], frameToUs(450, fps)]);
    // 20 s of media hold 200 frames at 3x.
    expect([span(next, "a"), get(next, "a").out]).toEqual([[0, 200], MEDIA_US]);
    // The video kept its duration, so nothing moves up.
    expect(span(next, "c")).toEqual([300, 30]);
  });
});

describe("setSpeeds on the media's last frames", () => {
  /** A linked Change duration and a Rate stretch of each edge after the speed change: all valid (§5.2). */
  function expectStretchable(p: Project, id: string, frames: number) {
    for (const duration of [frames, frames + 1, frames + 3, 2 * frames]) {
      const result = setSpeedDurations(p, [id], duration, LINKED);
      if (result.command) expect(validateProject(commit(p, result).next)).toEqual([]);
    }
    for (const [edge, delta] of [["out", 1], ["out", 3], ["in", -1]] as const) {
      const result = rateStretch(p, id, edge, delta, { linked: true });
      if (result.command) expect(validateProject(commit(p, result).next)).toEqual([]);
    }
  }

  it("a clip with less than one frame of media left at the new speed keeps its speed and warns; its partner changes", () => {
    // v plays the media's last frame (299); its sound plays all 300 frames.
    const p = shortMedia(project([clip("v", "v1", 299, 1, 299, { linkGroup: "g" }), clip("a", "a1", 0, 300, 0, { linkGroup: "g" })]));
    const result = setSpeeds(p, ["v"], 2, LINKED);
    expect(result.limit).toMatchObject({ reason: "mediaEnd", clipId: "v" });
    const next = commit(p, result).next;
    expect(validateProject(next)).toEqual([]);
    expect([span(next, "v"), get(next, "v").speed, get(next, "v").in, get(next, "v").out]).toEqual([[299, 1], 1, frameToUs(299, fps), SHORT_US]);
    expect([span(next, "a"), get(next, "a").speed, get(next, "a").out]).toEqual([[0, 150], 2, SHORT_US]);
    expectStretchable(next, "v", 1);
    // Alone, nothing changes: no command, the warning only.
    const alone = setSpeeds(shortMedia(project([clip("w", "v1", 0, 1, 299)])), ["w"], 2, LINKED);
    expect(alone.command).toBeNull();
    expect(alone.limit).toMatchObject({ reason: "mediaEnd", clipId: "w" });
  });

  it("unlinked: a clip on the media's last 2 frames keeps its speed at 4x and becomes 1 frame at 2x, `out` exact", () => {
    const options: SpeedOptions = { link: false, ripple: true, linked: true };
    const p = shortMedia(project([clip("v", "v1", 0, 2, 298)]));
    const fast = setSpeeds(p, ["v"], 4, options);
    expect(fast.command).toBeNull();
    expect(fast.limit).toMatchObject({ reason: "mediaEnd", clipId: "v" });
    expectStretchable(p, "v", 2);
    const result = setSpeeds(p, ["v"], 2, options);
    expect(result.limit).toMatchObject({ reason: "mediaEnd", clipId: "v" });
    const next = commit(p, result).next;
    expect([span(next, "v"), get(next, "v").speed, get(next, "v").out]).toEqual([[0, 1], 2, frameToUs(298, fps) + framesToSourceUs(1, 2, fps)]);
    expect(get(next, "v").out).toBeLessThanOrEqual(SHORT_US);
    expectStretchable(next, "v", 1);
  });

  it("linked: a clip shorter than one frame at the new speed rounds up only when the media has that frame", () => {
    // 3 source frames left after `in`; the clip plays 2 of them. At 3x one frame needs all 3.
    const p = shortMedia(project([clip("v", "v1", 0, 2, 297)]));
    const next = commit(p, setSpeeds(p, ["v"], 3, LINKED)).next;
    expect([span(next, "v"), get(next, "v").out]).toEqual([[0, 1], frameToUs(297, fps) + framesToSourceUs(1, 3, fps)]);
    expectStretchable(next, "v", 1);
    // At 4x it does not fit: the speed stays.
    expect(setSpeeds(p, ["v"], 4, LINKED).limit).toMatchObject({ reason: "mediaEnd", clipId: "v" });
  });
});

/**
 * Two video and two audio tracks (one maybe locked) of clips at various speeds, sources and gaps over
 * 10 s of media (some on its last frames), a few freeze frames, and link groups of a video clip with one
 * or two sounds that start, end and play at their own speed: partners that differ.
 */
function randomProject(rng: Rng): Project {
  const tracks = [makeTrack("v1"), makeTrack("v2"), makeTrack("a1", "audio"), makeTrack("a2", "audio")];
  if (rng.next() < 0.2) (tracks[rng.int(0, 3)] as Track).locked = true;
  const clips: MediaClip[] = [];
  for (const track of tracks) {
    let cursor = rng.int(0, 30);
    for (let k = rng.int(1, 4); k > 0; k--) {
      const id = `${track.id}-${k}`;
      // A quarter of the clips start on the media's last 5 frames, where a faster speed may not fit one frame.
      const inFrames = rng.next() < 0.25 ? rng.int(295, 299) : rng.int(0, 250);
      let next: MediaClip;
      if (track.kind === "video" && rng.next() < 0.15) {
        next = clip(id, track.id, cursor, rng.int(1, 90), inFrames, { speed: 0, out: frameToUs(inFrames + 1, fps) });
      } else {
        const room = (speed: number) => maxDurationFrames(clip(id, track.id, cursor, 1, inFrames, { speed }), SHORT_US, fps);
        let speed = rng.pick([0.5, 1, 1, 1, 1.5, 2, 3]);
        // 1x always fits the media's last frame.
        if (room(speed) === 0) speed = 1;
        const duration = rng.int(1, room(speed));
        // `out` follows `in` exactly, as every edit leaves it.
        next = clip(id, track.id, cursor, duration, inFrames, { speed, out: frameToUs(inFrames, fps) + framesToSourceUs(duration, speed, fps) });
      }
      clips.push(next);
      cursor += next.duration + rng.pick([0, 0, rng.int(1, 40)]);
    }
  }
  const linked = new Set<string>();
  for (const video of clips.filter((c) => c.kind === "video" && c.speed > 0)) {
    if (rng.next() < 0.4) continue;
    for (const trackId of ["a1", "a2"]) {
      const sounds = clips.filter((c) => c.trackId === trackId && !linked.has(c.id));
      if (sounds.length === 0 || (trackId === "a2" && rng.next() < 0.7)) continue;
      const sound = rng.pick(sounds);
      linked.add(sound.id);
      linked.add(video.id);
      sound.linkGroup = video.linkGroup = `g-${video.id}`;
    }
  }
  return shortMedia(project(clips, tracks));
}

// ~1 s alone, several times that in the full parallel run on a loaded machine: an explicit timeout.
describe("speed changes on random documents", { timeout: 30_000 }, () => {
  it("leave a valid document, also after later rate stretches and in-point trims; retimed clips keep `in` (linked with ripple, `out` too) and their start; undo restores", () => {
    const rng = random(27);
    let commands = 0;
    for (let round = 0; round < 300; round++) {
      const p = randomProject(rng);
      expect(validateProject(p)).toEqual([]);
      const ids = Object.keys(p.clips);
      // A validating store: an invalid document throws on dispatch and on undo (`validateProject`, once per step).
      const doc = new DocumentStore(p, { session: createSessionStore(), validate: true });
      for (let step = 0; step < 12; step++) {
        const before = doc.getState();
        const picked = rng.next() < 0.3 ? [rng.pick(ids), rng.pick(ids)] : [rng.pick(ids)];
        const options: SpeedOptions = { link: rng.next() < 0.7, ripple: rng.next() < 0.6, linked: rng.next() < 0.7 };
        const op = rng.next();
        const speeds = op < 0.55;
        const arrow = rng.pick([-0.1, 0.1]);
        const value = rng.pick([0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 8]);
        const target = picked[0] as string;
        // The Rate stretch tool and in-point trims after speed changes (a stretch to a slower speed narrows the §5.2 tolerance).
        const result = speeds
          ? setSpeeds(before, picked, rng.next() < 0.8 ? value : (c) => c.speed + arrow, options)
          : op < 0.75
            ? setSpeedDurations(before, picked, rng.int(1, 400), options)
            : op < 0.9
              ? rateStretch(before, target, rng.pick(["in", "out"] as const), rng.int(-40, 40), { linked: options.linked })
              : trimEdge(before, target, "in", rng.int(-20, 20), { ripple: options.ripple, linked: options.linked });
        if (!result.command) continue;
        doc.dispatch(result.command);
        commands++;
        const after = doc.getState();
        if (!speeds) continue;
        for (const id of ids) {
          const was = before.clips[id] as Clip;
          const now = after.clips[id] as Clip;
          if (!isMediaClip(was) || !isMediaClip(now) || was.speed === now.speed) continue;
          expect(now.in).toBe(was.in);
          // Linked with ripple, the source range stays: `out` moves by less than one source frame (the rounding).
          if (options.link && options.ripple) expect(Math.abs(now.out - was.out)).toBeLessThanOrEqual(usPerFrame(fps) * now.speed);
          // With two groups, the earlier one's ripple moves the later one.
          if (picked.length === 1) expect(now.start).toBe(was.start);
        }
      }
      while (doc.undo());
      expect(doc.getState()).toEqual(p);
    }
    expect(commands).toBeGreaterThan(2000);
  });
});

describe("setSpeedDurations", () => {
  it("linked: a rate stretch of the out point (speed from the new duration), rippled", () => {
    const p = project([clip("v", "v1", 0, 300, 0, { linkGroup: "g" }), clip("a", "a1", 0, 300, 0, { linkGroup: "g" }), clip("b", "v1", 300, 30, 300)]);
    const { next, doc } = commit(p, setSpeedDurations(p, ["v"], 150, LINKED));
    expect(span(next, "v")).toEqual([0, 150]);
    expect([get(next, "v").speed, get(next, "a").speed]).toEqual([2, 2]);
    expect(span(next, "b")).toEqual([150, 30]);
    expect(doc.history.getState().undoLabel).toBe("Change duration");
  });

  it("stops at 4x and at the next clip without ripple", () => {
    const p = project([clip("v", "v1", 0, 300), clip("b", "v1", 400, 30, 300)]);
    const fast = setSpeedDurations(p, ["v"], 10, LINKED);
    expect(fast.limit?.reason).toBe("maxSpeed");
    expect(span(commit(p, fast).next, "v")).toEqual([0, 75]);
    const long = setSpeedDurations(p, ["v"], 900, NO_RIPPLE);
    expect(long.limit?.reason).toBe("neighbor");
    expect(span(commit(p, long).next, "v")).toEqual([0, 400]);
  });

  it("unlinked and for freeze frames: a trim of the out point (no media bound for a freeze)", () => {
    const options: SpeedOptions = { link: false, ripple: true, linked: true };
    const p = project([clip("v", "v1", 0, 100), clip("f", "v1", 100, 60, 0, { speed: 0, in: frameToUs(50, fps), out: frameToUs(51, fps) }), clip("b", "v1", 160, 30)]);
    const trimmed = commit(p, setSpeedDurations(p, ["v"], 50, options)).next;
    expect(span(trimmed, "v")).toEqual([0, 50]);
    expect(get(trimmed, "v").speed).toBe(1);
    expect(span(trimmed, "f")).toEqual([50, 60]);
    const held = commit(p, setSpeedDurations(p, ["f"], 6000, LINKED)).next;
    expect(span(held, "f")).toEqual([100, 6000]);
    expect([get(held, "f").in, get(held, "f").out, get(held, "f").speed]).toEqual([frameToUs(50, fps), frameToUs(51, fps), 0]);
    expect(span(held, "b")).toEqual([6100, 30]);
  });
});
