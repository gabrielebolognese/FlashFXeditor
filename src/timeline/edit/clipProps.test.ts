import { describe, expect, it } from "vitest";
import type { Command } from "../../core/commands/command.js";
import { makeMedia, makeMediaClip, makeProject, makeSolidClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import { frameToUs } from "../../core/document/time.js";
import type { Clip, MediaClip, Project } from "../../core/document/types.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createSessionStore } from "../../core/store/sessionStore.js";
import { clipTime, retimeClips, retimeDelta, setEnabled, setOpacities } from "./clipProps.js";

const fps = makeProject().settings.fps;
/** 10 s of media at 30 fps: 300 frames. */
const MEDIA_US = 10_000_000;

function clip(id: string, trackId: string, start: number, duration: number, inFrames = 0, extra: Partial<MediaClip> = {}): MediaClip {
  const base = makeMediaClip(makeProject(), { id, trackId, start, duration, mediaId: "m", kind: trackId.startsWith("a") ? "audio" : "video" });
  return { ...base, in: frameToUs(inFrames, fps), out: frameToUs(inFrames + duration, fps), ...extra };
}

function project(clips: Clip[]): Project {
  const p = makeProject();
  p.media.m = makeMedia("m", "video", MEDIA_US);
  p.tracks.push(makeTrack("v1"), makeTrack("v2"), makeTrack("v3"), makeTrack("a1", "audio"));
  return withClips(p, clips);
}

function store(p: Project): DocumentStore {
  return new DocumentStore(p, { session: createSessionStore(), validate: true });
}

function run(p: Project, command: Command | null): DocumentStore {
  if (!command) throw new Error("expected a command");
  const s = store(p);
  s.dispatch(command);
  return s;
}

const span = (p: Project, id: string) => [p.clips[id]?.start, p.clips[id]?.duration];

describe("setOpacities (spec §11 Opacity)", () => {
  it("sets each clip's opacity in one undo step (composite only), clamped to 0..1", () => {
    const p = project([clip("a", "v1", 0, 30), clip("b", "v2", 0, 30, 0, { opacity: 0.5 }), clip("c", "v3", 0, 30, 0, { opacity: 0.25 })]);
    const command = setOpacities(p, new Map([["a", 0.4], ["b", 0.4], ["c", 7]]), { label: "Change opacity" });
    expect(command?.affects).toEqual(["composite"]);
    const s = run(p, command);
    expect(["a", "b", "c"].map((id) => (s.getState().clips[id] as MediaClip).opacity)).toEqual([0.4, 0.4, 1]);
    s.undo();
    expect(["a", "b", "c"].map((id) => (s.getState().clips[id] as MediaClip).opacity)).toEqual([1, 0.5, 0.25]);
  });

  it("skips audio clips, locked tracks, gone clips, unchanged values and NaN; null when nothing changes", () => {
    const p = project([clip("a", "v1", 0, 30), clip("s", "a1", 0, 30)]);
    expect(setOpacities(p, new Map([["a", 1], ["s", 0.5], ["gone", 0.5], ["a", Number.NaN]]), { label: "x" })).toBeNull();
    const locked = structuredClone(p);
    (locked.tracks[0] as { locked: boolean }).locked = true;
    expect(setOpacities(locked, new Map([["a", 0.5]]), { label: "x" })).toBeNull();
    const solid = withClips(p, [makeSolidClip({ id: "q", trackId: "v2", start: 0, duration: 5 })]);
    expect(setOpacities(solid, new Map([["q", 0.5]]), { label: "x", coalesceKey: "k" })).toMatchObject({ id: "clip.opacity", coalesceKey: "k" });
  });
});

describe("setEnabled (spec §11 Clip, §6.16 Enable/Disable)", () => {
  it("disables and enables clips in one step each, skipping locked and unchanged ones", () => {
    const p = project([clip("a", "v1", 0, 30), clip("b", "a1", 0, 30)]);
    const s = run(p, setEnabled(p, ["a", "b", "a"], false));
    expect([s.getState().clips.a?.enabled, s.getState().clips.b?.enabled]).toEqual([false, false]);
    expect(s.history.getState().undoLabel).toBe("Disable clips");
    expect(setEnabled(s.getState(), ["a"], false)).toBeNull();
    s.dispatch(setEnabled(s.getState(), ["a"], true)!);
    expect(s.history.getState().undoLabel).toBe("Enable clip");
    const locked = structuredClone(p);
    (locked.tracks[0] as { locked: boolean }).locked = true;
    expect(setEnabled(locked, ["a"], false)).toBeNull();
  });
});

describe("retimeClips (spec §11 Clip timecodes: trims without ripple)", () => {
  it("End trims the out point, clamped by the next clip and the media end", () => {
    const p = project([clip("a", "v1", 0, 100), clip("b", "v1", 150, 50)]);
    const shorter = retimeClips(p, ["a"], "end", 70, { linked: true });
    expect(shorter.limit).toBeNull();
    expect(span(run(p, shorter.command).getState(), "a")).toEqual([0, 70]);
    const blocked = retimeClips(p, ["a"], "end", 400, { linked: true });
    expect(blocked.limit?.reason).toBe("neighbor");
    expect(span(run(p, blocked.command).getState(), "a")).toEqual([0, 150]);
    const alone = project([clip("a", "v1", 0, 30, 250)]);
    const media = retimeClips(alone, ["a"], "end", 400, { linked: true });
    expect(media.limit?.reason).toBe("mediaEnd");
    expect(span(run(alone, media.command).getState(), "a")).toEqual([0, 50]);
  });

  it("Start trims the in point (the end stays), Duration the out point (the start stays); one undo step", () => {
    const p = project([clip("a", "v1", 30, 60, 30)]);
    const s = run(p, retimeClips(p, ["a"], "start", 50, { linked: true }).command);
    expect(span(s.getState(), "a")).toEqual([50, 40]);
    expect((s.getState().clips.a as MediaClip).in).toBe(frameToUs(50, fps));
    s.dispatch(retimeClips(s.getState(), ["a"], "duration", 10, { linked: true }).command!);
    expect(span(s.getState(), "a")).toEqual([50, 10]);
    expect(s.history.getState().undoLabel).toBe("Trim clip");
    // Before the media start: clamped at the first frame (20 frames in, so 20 frames earlier at most).
    const head = project([clip("a", "v1", 30, 60, 20)]);
    const early = retimeClips(head, ["a"], "start", 0, { linked: true });
    expect(early.limit?.reason).toBe("mediaStart");
    expect(span(run(head, early.command).getState(), "a")).toEqual([10, 80]);
  });

  it("source in / out move the in / out point by the source time at the clip's speed", () => {
    const p = project([clip("a", "v1", 100, 50, 20)]);
    expect(clipTime(p.clips.a as Clip, "sourceIn")).toBe(frameToUs(20, fps));
    expect(retimeDelta(p.clips.a as Clip, "sourceIn", frameToUs(30, fps), fps)).toEqual({ edge: "in", delta: 10 });
    const s = run(p, retimeClips(p, ["a"], "sourceIn", frameToUs(30, fps), { linked: true }).command);
    expect(span(s.getState(), "a")).toEqual([110, 40]);
    const fast = project([clip("a", "v1", 100, 50, 20, { speed: 2, out: frameToUs(120, fps) })]);
    expect(retimeDelta(fast.clips.a as Clip, "sourceOut", frameToUs(100, fps), fps)).toEqual({ edge: "out", delta: -10 });
    expect(clipTime(makeSolidClip({ id: "q", trackId: "v1", start: 0, duration: 5 }), "sourceIn")).toBeNull();
  });

  it("applies to each selected clip; linked partners trim with them; several clips are one step", () => {
    const p = project([clip("a", "v1", 0, 100, 0, { linkGroup: "L" }), clip("x", "a1", 0, 100, 0, { linkGroup: "L" }), clip("c", "v2", 20, 40, 0)]);
    const result = retimeClips(p, ["a", "x", "c"], "end", 80, { linked: true });
    const s = run(p, result.command);
    expect([span(s.getState(), "a"), span(s.getState(), "x"), span(s.getState(), "c")]).toEqual([
      [0, 80],
      [0, 80],
      [20, 60],
    ]);
    expect(s.history.getState().undoLabel).toBe("Trim clips");
    s.undo();
    expect(span(s.getState(), "a")).toEqual([0, 100]);
    // Linked selection off: the partner stays.
    const apart = run(p, retimeClips(p, ["a"], "end", 80, { linked: false }).command);
    expect(span(apart.getState(), "x")).toEqual([0, 100]);
    expect(retimeClips(p, ["a"], "end", 100, { linked: true }).command).toBeNull();
  });
});
