import { describe, expect, it } from "vitest";
import { addCaptionTrack as withCaptionTrack, makeCaptionClip, makeMedia, makeMediaClip, makeProject, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { CaptionClip, Clip, Project } from "../../core/document/types.js";
import type { Command as Cmd } from "../../core/commands/command.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createSessionStore } from "../../core/store/sessionStore.js";
import { defaultCaptionStyle, evenWords } from "../../text/captions.js";
import { formatSubtitles, parseSrt } from "../../text/subtitles.js";
import {
  addCaptionTrack,
  addCueAt,
  captionTrackOf,
  clampCueDelta,
  clearCues,
  cueMoveRange,
  cuesFromSubtitles,
  cuesOf,
  exportCues,
  importCues,
  mergeWithPrevious,
  setCaptionStyle,
  setCueText,
  splitCue,
} from "./captions.js";
import { moveClips, nudgeClips, sliceClip } from "./move.js";
import { splitClips } from "./split.js";
import { resolveTrim, planTrim, trimEdge } from "./trim.js";

function ids(): () => string {
  let n = 0;
  return () => `n${++n}`;
}

/** V1 and A1, a caption track `cc` with `cues` (start, duration, text). */
function project(cues: [number, number, string?][] = []): Project {
  const p = makeProject();
  p.media.m = makeMedia("m", "video", 100_000_000);
  p.tracks.push(makeTrack("v1"), makeTrack("a1", "audio"));
  return withClips(
    withCaptionTrack(p),
    cues.map(([start, duration, text], i) => makeCaptionClip({ id: `q${i + 1}`, trackId: "cc", start, duration, text: text ?? `cue ${i + 1}` })),
  );
}

function run(p: Project, command: Cmd | null | undefined): Project {
  if (!command) throw new Error("expected a command");
  const doc = new DocumentStore(p, { session: createSessionStore(), validate: true });
  doc.dispatch(command);
  expect(doc.history.getState().undoLabel).toBe(command.label);
  doc.undo();
  expect(doc.getState()).toEqual(p);
  doc.redo();
  return doc.getState();
}

const cue = (p: Project, id: string) => p.clips[id] as CaptionClip;
const spans = (p: Project) => cuesOf(p).map((c) => [c.start, c.duration, c.text]);

describe("the caption track", () => {
  it("is added once, named CC, S, above the video tracks, with the default style", () => {
    const p = makeProject();
    p.tracks.push(makeTrack("v1"), makeTrack("v2"), makeTrack("a1", "audio"));
    const next = run(p, addCaptionTrack(p, "cc"));
    expect(next.tracks.map((track) => track.id)).toEqual(["v1", "v2", "cc", "a1"]);
    expect(captionTrackOf(next)).toMatchObject({ name: "CC", kind: "caption", height: "S", targeted: true });
    expect(next.captionTracks.cc?.style).toEqual(defaultCaptionStyle(p.settings));
    expect(addCaptionTrack(next, "cc2")).toBeNull();
  });
});

describe("+ Cue at playhead", () => {
  it("adds a 2 s cue at the frame, creating the track when missing (one undo step)", () => {
    const p = makeProject();
    p.tracks.push(makeTrack("v1"));
    const result = addCueAt(p, 45, ids());
    const next = run(p, result?.command);
    expect(result?.trackId).toBe("n1");
    expect(cue(next, result?.cueId ?? "")).toMatchObject({ start: 45, duration: 60, text: "Caption", trackId: "n1" });
    expect(next.captionTracks.n1).toBeDefined();
  });

  it("goes after the cue under the playhead and stops at the next cue", () => {
    const p = project([
      [0, 30],
      [30, 20],
      [80, 100],
    ]);
    const result = addCueAt(p, 10, ids());
    const next = run(p, result?.command);
    expect(cue(next, result?.cueId ?? "")).toMatchObject({ start: 50, duration: 30 });
    expect(cuesOf(next).map((c) => c.start)).toEqual([0, 30, 50, 80]);
  });

  it("does nothing on a locked track", () => {
    const p = project();
    p.tracks.find((track) => track.id === "cc")!.locked = true;
    expect(addCueAt(p, 0, ids())).toBeNull();
  });
});

describe("cue list edits", () => {
  it("edits the text in one step, keeping the word timings", () => {
    const p = project([[0, 30, "helo world"]]);
    p.clips.q1 = { ...cue(p, "q1"), words: [{ text: "helo", start: 0, end: 10 }] };
    const next = run(p, setCueText(p, "q1", "hello world"));
    expect(cue(next, "q1")).toMatchObject({ text: "hello world", words: [{ text: "helo", start: 0, end: 10 }] });
    expect(setCueText(next, "q1", "hello world")).toBeNull();
  });

  it("splits at the caret with proportional timing, the right half after the left", () => {
    const p = project([
      [10, 100, "Hello world again"],
      [200, 10],
    ]);
    const result = splitCue(p, "q1", "Hello world again!", 11, ids());
    const next = run(p, result?.command);
    expect(result?.rightId).toBe("n1");
    expect(spans(next)).toEqual([
      [10, 65, "Hello world"],
      [75, 35, "again!"],
      [200, 10, "cue 2"],
    ]);
    expect(splitCue(project([[0, 1]]), "q1", "ab", 1, ids())).toBeNull();
  });

  it("merges a cue into the previous one, which spans to its end", () => {
    const p = project([
      [0, 20, "Hello"],
      [30, 10, "world"],
      [50, 10],
    ]);
    const result = mergeWithPrevious(p, "q2");
    const next = run(p, result?.command);
    expect(result).toMatchObject({ cueId: "q1", caret: 6 });
    expect(spans(next)).toEqual([
      [0, 40, "Hello world"],
      [50, 10, "cue 3"],
    ]);
    expect(mergeWithPrevious(p, "q1")).toBeNull();
  });

  it("clears every cue, keeping the track and its style", () => {
    const p = project([
      [0, 20],
      [30, 10],
    ]);
    const next = run(p, clearCues(p));
    expect(cuesOf(next)).toEqual([]);
    expect(Object.keys(next.clips)).toEqual([]);
    expect(next.captionTracks.cc).toBeDefined();
    expect(clearCues(next)).toBeNull();
  });

  it("sets the track style in one step (null when unchanged or locked)", () => {
    const p = project();
    const style = { ...defaultCaptionStyle(p.settings), position: "top" as const };
    const next = run(p, setCaptionStyle(p, "cc", style, { label: "Caption position" }));
    expect(next.captionTracks.cc?.style.position).toBe("top");
    expect(setCaptionStyle(next, "cc", style, { label: "x" })).toBeNull();
    expect(setCaptionStyle(next, "v1", style, { label: "x" })).toBeNull();
  });
});

describe("import and export", () => {
  it("puts cues on the frame grid, resolving overlaps", () => {
    const fps = { num: 30, den: 1 };
    const { cues, adjusted } = cuesFromSubtitles(
      [
        { startUs: 2_000_000, endUs: 3_000_000, text: "b" },
        { startUs: 0, endUs: 1_500_000, text: "a" },
        { startUs: 1_000_000, endUs: 1_200_000, text: "a2" },
        { startUs: 2_000_000, endUs: 2_500_000, text: "b2" },
        { startUs: 4_000_000, endUs: 4_000_000, text: "zero" },
      ],
      fps,
    );
    expect(cues).toEqual([
      { start: 0, duration: 30, text: "a" },
      { start: 30, duration: 6, text: "a2" },
      { start: 60, duration: 30, text: "b\nb2" },
      { start: 120, duration: 1, text: "zero" },
    ]);
    expect(adjusted).toBe(2);
  });

  it("keeps VTT word timings relative to their cue", () => {
    const { cues } = cuesFromSubtitles([{ startUs: 1_000_000, endUs: 2_000_000, text: "a b", words: [{ text: "a", startUs: 1_000_000, endUs: 1_500_000 }, { text: "b", startUs: 1_500_000, endUs: 2_000_000 }] }], { num: 30, den: 1 });
    expect(cues[0]?.words).toEqual([
      { text: "a", start: 0, end: 15 },
      { text: "b", start: 15, end: 30 },
    ]);
  });

  it("replaces the track's cues (creating it when missing) and exports an equivalent 200-cue file", () => {
    // 200 cues on the frame grid of 29.97 fps, some with two lines.
    const fps = { num: 30000, den: 1001 };
    const usPerFrame = 1_000_000 * 1001 / 30000;
    const lines: string[] = [];
    for (let i = 0; i < 200; i++) {
      const start = Math.round(i * 61 * usPerFrame / 1000) * 1000;
      const end = Math.round((i * 61 + 45) * usPerFrame / 1000) * 1000;
      const ts = (us: number) => {
        const ms = Math.round(us / 1000);
        const p2 = (n: number) => String(n).padStart(2, "0");
        return `${p2(Math.floor(ms / 3600000))}:${p2(Math.floor(ms / 60000) % 60)}:${p2(Math.floor(ms / 1000) % 60)},${String(ms % 1000).padStart(3, "0")}`;
      };
      lines.push(String(i + 1), `${ts(start)} --> ${ts(end)}`, i % 3 === 0 ? `Line ${i}\nsecond line` : `Cue number ${i}`, "");
    }
    const file = `﻿${lines.join("\r\n")}`;
    const p = makeProject();
    p.settings.fps = fps;
    p.tracks.push(makeTrack("v1"));
    const parsed = parseSrt(file);
    expect(parsed.cues).toHaveLength(200);
    const result = importCues(p, parsed.cues, ids());
    const next = run(p, result?.command);
    expect(result).toMatchObject({ count: 200, replaced: 0, adjusted: 0 });
    expect(cuesOf(next)).toHaveLength(200);
    expect(cuesOf(next)[3]).toMatchObject({ start: 183, duration: 45, text: "Line 3\nsecond line" });
    // Equivalent: the same cues on the frame grid, each time within a millisecond of the file's.
    const exported = parseSrt(formatSubtitles(exportCues(next), "srt")).cues;
    expect(exported).toHaveLength(200);
    expect(cuesFromSubtitles(exported, fps).cues).toEqual(cuesFromSubtitles(parsed.cues, fps).cues);
    exported.forEach((c, i) => {
      expect(c.text).toBe(parsed.cues[i]?.text);
      expect(Math.abs(c.startUs - (parsed.cues[i]?.startUs ?? 0))).toBeLessThanOrEqual(1000);
      expect(Math.abs(c.endUs - (parsed.cues[i]?.endUs ?? 0))).toBeLessThanOrEqual(1000);
    });
    // A second import replaces the cues.
    const again = importCues(next, parsed.cues.slice(0, 2), ids());
    expect(again).toMatchObject({ count: 2, replaced: 200 });
    expect(cuesOf(run(next, again?.command))).toHaveLength(2);
  });
});

describe("moving cues (no overlap)", () => {
  const cues: [number, number][] = [
    [0, 30],
    [40, 20],
    [100, 30],
  ];

  it("stops a moved cue at the cues that stay", () => {
    const p = project(cues);
    expect(cueMoveRange(p, ["q2"])).toEqual({ lo: -10, hi: 40 });
    expect(cueMoveRange(p, ["q1", "q2"])).toEqual({ lo: 0, hi: 40 });
    expect(cueMoveRange(p, ["q1", "q3"])).toEqual({ lo: 0, hi: 10 });
    expect(cueMoveRange(p, ["v-clip"])).toBeNull();
    const moved = moveClips(p, ["q2"], 500, new Map(), "overwrite", { newId: ids() });
    if (moved.kind !== "ok") throw new Error("expected a move");
    expect(spans(run(p, moved.command)).map(([start]) => start)).toEqual([0, 80, 100]);
    const left = nudgeClips(p, ["q2"], -50, ids());
    if (left.kind !== "ok") throw new Error("expected a nudge");
    expect(cue(run(p, left.command), "q2").start).toBe(30);
  });

  it("clamps the whole selection when cues move with other clips", () => {
    const base = project(cues);
    const p = withClips(base, [makeMediaClip(base, { id: "v", trackId: "v1", start: 40, duration: 20, mediaId: "m" })]);
    const moved = moveClips(p, ["q2", "v"], 100, new Map(), "overwrite", { newId: ids() });
    if (moved.kind !== "ok") throw new Error("expected a move");
    const next = run(p, moved.command);
    expect([cue(next, "q2").start, next.clips.v?.start]).toEqual([80, 80]);
  });

  it("puts copies (Alt-drag) in the free spot nearest the drop, never further than their length", () => {
    const p = project(cues);
    expect(clampCueDelta(p, ["q2"], 5, true)).toBe(20);
    expect(clampCueDelta(p, ["q2"], 15, true)).toBe(20);
    // The nearest spot (20) is 40 frames away from -20: more than the cue's 20.
    expect(clampCueDelta(p, ["q2"], -20, true)).toBeNull();
    expect(clampCueDelta(p, ["q2"], 100, true)).toBe(100);
    const full = project([
      [0, 30],
      [30, 30],
    ]);
    expect(clampCueDelta(full, ["q1", "q2"], 10, true)).toBe(60);
  });

  it("splits a cue's text and words with the razor; insert pushes cues like other tracks", () => {
    const p = project([[0, 90, "one two three"]]);
    p.clips.q1 = { ...cue(p, "q1"), words: evenWords("one two three", 90) };
    const split = splitClips(p, ["q1"], 45, ids());
    const next = run(p, split?.command);
    expect(spans(next)).toEqual([
      [0, 45, "one two"],
      [45, 45, "three"],
    ]);
    expect(cue(next, "n1").words).toEqual([{ text: "three", start: 6, end: 45 }]);
    expect(sliceClip(cue(p, "q1"), 0, 45, p.settings.fps)).toMatchObject({ text: "one two" });
  });
});

describe("trimming cues", () => {
  it("is always a regular trim stopped by the neighbor, re-basing the words on in trims", () => {
    const p = project([
      [0, 30],
      [40, 30],
      [100, 30],
    ]);
    p.clips.q2 = { ...cue(p, "q2"), words: [{ text: "x", start: 5, end: 10 }] };
    const plan = planTrim(p, ["q2"], "out", { ripple: true });
    expect(plan.ripple).toBe(false);
    expect(resolveTrim(plan, 100).delta).toBe(30);
    const trimmed = trimEdge(p, "q2", "in", -50, { ripple: false });
    expect(trimmed.delta).toBe(-10);
    const next = run(p, trimmed.command);
    expect(cue(next, "q2")).toMatchObject({ start: 30, duration: 40, words: [{ text: "x", start: 15, end: 20 }] });
  });
});

describe("validity", () => {
  it("never leaves overlapping cues after random moves", { timeout: 30_000 }, () => {
    let seed = 7;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    let p = project(Array.from({ length: 12 }, (_, i) => [i * 40, 20 + (i % 3) * 5] as [number, number]));
    const doc = new DocumentStore(p, { session: createSessionStore(), validate: true });
    const newId = ids();
    for (let step = 0; step < 200; step++) {
      p = doc.getState();
      const list = cuesOf(p);
      const picked = list.filter(() => random() < 0.25).map((c) => c.id);
      if (picked.length === 0) continue;
      const result = moveClips(p, picked, Math.round((random() - 0.5) * 200), new Map(), "overwrite", { newId, duplicate: list.length < 30 && random() < 0.2 });
      if (result.kind === "ok") doc.dispatch(result.command);
    }
    const final = cuesOf(doc.getState()) as Clip[];
    for (let i = 1; i < final.length; i++) expect(final[i]!.start).toBeGreaterThanOrEqual(final[i - 1]!.start + final[i - 1]!.duration);
  });
});
