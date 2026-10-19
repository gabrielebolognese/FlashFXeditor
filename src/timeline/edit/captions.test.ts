import { describe, expect, it } from "vitest";
import { addCaptionTrack as withCaptionTrack, makeCaptionClip, makeMedia, makeMediaClip, makeProject, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { CaptionClip, CaptionStyleOverride, Clip, Project } from "../../core/document/types.js";
import type { Command as Cmd } from "../../core/commands/command.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createSessionStore } from "../../core/store/sessionStore.js";
import { defaultCaptionStyle, evenWords, hasOwnStyle, overrideWithout, wordRanges } from "../../text/captions.js";
import { cuesFromWords, wordsFromChunks, type TimedWord } from "../../text/transcript.js";
import { formatSubtitles, parseSrt } from "../../text/subtitles.js";
import {
  addCaptionTrack,
  addCueAt,
  captionTrackOf,
  clampCueDelta,
  clearCues,
  cueMoveRange,
  cuesFromSubtitles,
  cuesInRange,
  cuesOf,
  cueStyleOf,
  exportCues,
  importCues,
  mergeWithPrevious,
  moveCaption,
  replaceCuesInRange,
  resetCueStyles,
  setCaptionStyle,
  setCueStyles,
  setCueText,
  sizeCaption,
  splitCue,
  transcribedCues,
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

  it("exports the cues of a range cut to it and timed from its start (the Export tab's in/out)", () => {
    const p = project([
      [0, 30, "a"],
      [40, 30, "b"],
      [90, 30, "c"],
      [150, 30, "d"],
    ]);
    const us = (frames: number) => Math.round((frames * 1_000_000) / 30);
    expect(exportCues(p, { start: 50, end: 100 })).toEqual([
      { startUs: 0, endUs: us(20), text: "b" },
      { startUs: us(40), endUs: us(50), text: "c" },
    ]);
    expect(exportCues(p, { start: 30, end: 40 })).toEqual([]);
    expect(exportCues(p).map((c) => c.text)).toEqual(["a", "b", "c", "d"]);
    expect(exportCues(p, { start: 0, end: 1000 })).toEqual(exportCues(p));
  });
});

describe("transcription", () => {
  const FPS30 = { num: 30, den: 1 };
  const words = (list: [string, number, number][]) => list.map(([text, s0, s1]) => ({ text, startUs: s0 * 1e6, endUs: s1 * 1e6 }));

  it("puts transcribed cues (µs from the range start) on the frame grid inside the range", () => {
    const cues = [
      { startUs: 500_000, endUs: 1_500_000, text: "Hello world", words: words([["Hello", 0.5, 0.9], ["world", 0.9, 1.5]]) },
      { startUs: 1_800_000, endUs: 3_000_000, text: "past the end", words: words([["past", 1.8, 2.2], ["the", 2.2, 2.4], ["end", 2.6, 3]]) },
      { startUs: 4_000_000, endUs: 4_500_000, text: "after" },
    ];
    // The range is frames [30, 100): 1 s to 3.33 s.
    expect(transcribedCues(cues, { start: 30, end: 100 }, FPS30)).toEqual([
      { start: 45, duration: 30, text: "Hello world", words: [{ text: "Hello", start: 0, end: 12 }, { text: "world", start: 12, end: 30 }] },
      // Cut at the range end with its words (the last word starts after the cut).
      { start: 84, duration: 16, text: "past the end", words: [{ text: "past", start: 0, end: 12 }, { text: "the", start: 12, end: 16 }] },
    ]);
  });

  it("never puts two transcribed cues on one frame: the later one moves to the next frame with its words", () => {
    const cues = [
      { startUs: 1_000_000, endUs: 1_000_001, text: "Yes.", words: words([["Yes.", 1, 1.1]]) },
      { startUs: 1_000_000, endUs: 2_000_000, text: "Okay let's go", words: words([["Okay", 1, 1.3], ["let's", 1.3, 1.5], ["go", 1.5, 2]]) },
    ];
    expect(transcribedCues(cues, { start: 0, end: 300 }, FPS30)).toEqual([
      { start: 30, duration: 1, text: "Yes.", words: [{ text: "Yes.", start: 0, end: 1 }] },
      { start: 31, duration: 29, text: "Okay let's go", words: [{ text: "Okay", start: 0, end: 8 }, { text: "let's", start: 8, end: 14 }, { text: "go", start: 14, end: 29 }] },
    ]);
    // Three on one frame: one frame apart.
    const same = [0, 1, 2].map((i) => ({ startUs: 1_000_000, endUs: 1_000_000 + i, text: `c${i}` }));
    expect(transcribedCues(same, { start: 0, end: 300 }, FPS30).map((cue) => [cue.start, cue.duration, cue.text])).toEqual([
      [30, 1, "c0"],
      [31, 1, "c1"],
      [32, 1, "c2"],
    ]);
    // From Whisper's chunks: "Yes." of zero length joins the next cue, every word keeps its timing.
    const chunks = [
      { text: " Yes.", timestamp: [1, 1] as const },
      { text: " Okay", timestamp: [1, 1.3] as const },
      { text: " let's", timestamp: [1.3, 1.5] as const },
      { text: " go.", timestamp: [1.5, 1.9] as const },
    ];
    const placed = transcribedCues(cuesFromWords(wordsFromChunks(chunks, 10e6), { maxLines: 2, durationUs: 10e6 }), { start: 0, end: 300 }, FPS30);
    expect(placed.map((cue) => cue.text)).toEqual(["Yes. Okay let's go."]);
    expect(placed[0]?.words?.map((word) => word.text)).toEqual(["Yes.", "Okay", "let's", "go."]);
  });

  it("creates the caption track when missing, in one undo step", () => {
    const p = makeProject();
    p.tracks.push(makeTrack("v1"), makeTrack("a1", "audio"));
    const result = replaceCuesInRange(p, { start: 0, end: 300 }, [{ start: 10, duration: 20, text: "One" }, { start: 40, duration: 20, text: "Two" }], ids());
    expect(result).toMatchObject({ count: 2, replaced: 0 });
    const after = run(p, result?.command);
    // Above the video tracks (the array runs bottom video track first).
    expect(after.tracks.map((t) => t.kind)).toEqual(["video", "caption", "audio"]);
    expect(spans(after)).toEqual([[10, 20, "One"], [40, 20, "Two"]]);
    expect(after.captionTracks[captionTrackOf(after)?.id ?? ""]?.style).toEqual(defaultCaptionStyle(p.settings));
  });

  it("replaces only the cues overlapping the range and keeps the track in time order", () => {
    const p = project([[0, 20, "before"], [40, 30, "inside"], [85, 10, "edge"], [100, 20, "after"]]);
    expect(cuesInRange(p, { start: 30, end: 90 }).map((c) => c.text)).toEqual(["inside", "edge"]);
    const result = replaceCuesInRange(p, { start: 30, end: 90 }, [{ start: 30, duration: 25, text: "new one" }, { start: 60, duration: 30, text: "new two" }], ids());
    expect(result).toMatchObject({ count: 2, replaced: 2 });
    const after = run(p, result?.command);
    expect(spans(after)).toEqual([[0, 20, "before"], [30, 25, "new one"], [60, 30, "new two"], [100, 20, "after"]]);
    expect(after.tracks.find((t) => t.kind === "caption")?.clipIds).toEqual(cuesOf(after).map((c) => c.id));
  });

  it("does nothing on a locked track or without cues", () => {
    const p = project([[0, 20]]);
    expect(replaceCuesInRange(p, { start: 0, end: 90 }, [], ids())).toBeNull();
    const locked = { ...p, tracks: p.tracks.map((t) => (t.kind === "caption" ? { ...t, locked: true } : t)) };
    expect(replaceCuesInRange(locked, { start: 0, end: 90 }, [{ start: 0, duration: 10, text: "x" }], ids())).toBeNull();
  });

  it("gives every placed cue word timings its words can be found by (the highlight draws each of them)", () => {
    const text = "Welcome to the editor. Today we are going to make a short video about cooking pasta at home, with a generous pinch of salt and some fresh parsley.";
    const spoken: TimedWord[] = text.split(" ").map((word, i) => ({ text: word, startUs: 300_000 + i * 350_000, endUs: 300_000 + (i + 1) * 350_000 }));
    const range = { start: 60, end: 60 + 30 * 20 };
    const cues = transcribedCues(cuesFromWords(spoken, { maxLines: 2, durationUs: 20e6 }), range, FPS30);
    const after = run(project(), replaceCuesInRange(project(), range, cues, ids())?.command);
    const placed = cuesOf(after);
    expect(placed.length).toBeGreaterThan(2);
    expect(placed.flatMap((c) => c.words ?? []).map((w) => w.text)).toEqual(text.split(" "));
    for (const c of placed) {
      expect(c.start).toBeGreaterThanOrEqual(range.start);
      expect(c.start + c.duration).toBeLessThanOrEqual(range.end);
      expect(wordRanges(c.text, c.words ?? []).every((r) => r !== null)).toBe(true);
      for (const w of c.words ?? []) expect(Number.isInteger(w.start) && Number.isInteger(w.end) && w.start < w.end && w.end <= c.duration).toBe(true);
    }
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

  it("never drops the clips copied with cues before frame 0 (Batch 47 fuzz)", () => {
    // Copies of q1 and q3 with a clip at frame 5, dropped 5 frames earlier: the nearest free spot for
    // the cues (10 frames earlier) would put the clip's copy at -5; the next one (10 frames later) fits.
    const base = project([
      [50, 10],
      [100, 40],
      [200, 10],
    ]);
    const p = withClips(base, [makeMediaClip(base, { id: "v", trackId: "v1", start: 5, duration: 20, mediaId: "m" })]);
    expect(clampCueDelta(p, ["q1", "q3", "v"], -5, true)).toBe(10);
    const moved = moveClips(p, ["q1", "q3", "v"], -5, new Map(), "overwrite", { newId: ids(), duplicate: true });
    if (moved.kind !== "ok") throw new Error("expected a copy");
    const next = run(p, moved.command);
    expect([...moved.placed.values()].map((id) => next.clips[id]?.start)).toEqual([60, 210, 15]);
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

describe("styles per cue (spec §20.3)", () => {
  const BIG: CaptionStyleOverride = { text: { fontSize: 96, fill: { r: 1, g: 0.8, b: 0, a: 1 } }, position: "custom", x: 0, y: -600 };
  const styled = (): Project => {
    const p = project([
      [0, 60, "one two"],
      [60, 30, "three"],
      [90, 30, "four"],
    ]);
    p.clips.q1 = { ...cue(p, "q1"), styleOverride: structuredClone(BIG), presetId: "pr" };
    return p;
  };

  it("sets the own styles of several cues in one undo step, the others keeping the track style", () => {
    const p = project([
      [0, 30],
      [30, 30],
      [60, 30],
    ]);
    const next = run(
      p,
      setCueStyles(
        p,
        new Map([
          ["q1", { styleOverride: BIG }],
          ["q2", { styleOverride: BIG, presetId: "pr" }],
        ]),
        { label: "Change font size" },
      ),
    );
    expect(cue(next, "q1").styleOverride).toEqual(BIG);
    expect(cue(next, "q2")).toMatchObject({ styleOverride: BIG, presetId: "pr" });
    expect(cue(next, "q3").styleOverride).toBeUndefined();
    expect(cueStyleOf(next, cue(next, "q3"))).toBe(next.captionTracks.cc!.style);
    expect(cueStyleOf(next, cue(next, "q1")).text.fontSize).toBe(96);
    // Nothing to change, an empty override, a locked track: no command.
    expect(setCueStyles(next, new Map([["q1", { styleOverride: BIG }]]), { label: "x" })).toBeNull();
    expect(setCueStyles(p, new Map([["q1", { styleOverride: { text: {} } }]]), { label: "x" })).toBeNull();
    const locked = structuredClone(next);
    locked.tracks.find((t) => t.id === "cc")!.locked = true;
    expect(setCueStyles(locked, new Map([["q3", { styleOverride: BIG }]]), { label: "x" })).toBeNull();
  });

  it("Reset to track style clears the overrides and preset links of the cues", () => {
    const p = styled();
    const reset = resetCueStyles(p, ["q1", "q2"]);
    expect(reset?.id).toBe("caption.resetStyle");
    const next = run(p, reset);
    expect(cue(next, "q1")).not.toHaveProperty("styleOverride");
    expect(cue(next, "q1")).not.toHaveProperty("presetId");
    expect(resetCueStyles(next, ["q1"])).toBeNull();
  });

  it("a preset link goes with the cue's last override (the rows' resets, an All cues drag)", () => {
    const p = styled();
    // A row's reset keeps the link while a field of the cue's own is left...
    const partial = run(p, setCueStyles(p, new Map([["q1", { styleOverride: overrideWithout(BIG, ["text.fontSize"]), presetId: "pr" }]]), { label: "Reset size" }));
    expect(cue(partial, "q1")).toMatchObject({ styleOverride: { text: { fill: BIG.text?.fill } }, presetId: "pr" });
    expect(hasOwnStyle(cue(partial, "q1"))).toBe(true);
    // ...and drops it with the last one: the cue looks like the track and has no style of its own.
    const none = run(partial, setCueStyles(partial, new Map([["q1", { styleOverride: overrideWithout(cue(partial, "q1").styleOverride, ["text.fill", "position", "x", "y"]), presetId: "pr" }]]), { label: "Reset" }));
    expect(cue(none, "q1")).not.toHaveProperty("styleOverride");
    expect(cue(none, "q1")).not.toHaveProperty("presetId");
    expect(hasOwnStyle(cue(none, "q1"))).toBe(false);
    expect(resetCueStyles(none, ["q1"])).toBeNull();
    // An All cues drag that takes the cue's last own values drops the link too.
    const placed = styled();
    placed.clips.q1 = { ...cue(placed, "q1"), styleOverride: { position: "custom", x: 0, y: -600 } };
    const all = run(placed, moveCaption(placed, "q1", "all", { x: 0, y: -500 }));
    expect(cue(all, "q1")).not.toHaveProperty("styleOverride");
    expect(cue(all, "q1")).not.toHaveProperty("presetId");
    // A link alone (a cue saved before this was fixed) is no style of the cue's; Reset still clears it.
    const lone = styled();
    lone.clips.q2 = { ...cue(lone, "q2"), presetId: "pr" };
    expect(hasOwnStyle(cue(lone, "q2"))).toBe(false);
    expect(cue(run(lone, resetCueStyles(lone, ["q2"])), "q2")).not.toHaveProperty("presetId");
  });

  it("splitting a styled cue keeps the style on both halves (cue list and timeline); merging keeps the first cue's", () => {
    const p = styled();
    const atCaret = splitCue(p, "q1", "one two", 3, ids());
    const listed = run(p, atCaret?.command);
    expect(cue(listed, "q1")).toMatchObject({ styleOverride: BIG, presetId: "pr" });
    expect(cue(listed, atCaret!.rightId)).toMatchObject({ styleOverride: BIG, presetId: "pr" });
    const razor = splitClips(p, ["q1"], 30, ids());
    const cut = run(p, razor?.command);
    expect(cue(cut, "q1").styleOverride).toEqual(BIG);
    expect(cue(cut, "n1")).toMatchObject({ styleOverride: BIG, presetId: "pr" });
    // q2 (no style) into q1 keeps q1's; q1's style is gone when q1 merges into nothing styled before it.
    const merged = run(p, mergeWithPrevious(p, "q2")?.command);
    expect(cue(merged, "q1")).toMatchObject({ text: "one two three", styleOverride: BIG });
    const second = run(merged, mergeWithPrevious(merged, "q3")?.command);
    expect(cue(second, "q1").styleOverride).toEqual(BIG);
    const p2 = styled();
    p2.clips.q2 = { ...cue(p2, "q2"), styleOverride: { maxLines: 1 } };
    expect(cue(run(p2, mergeWithPrevious(p2, "q2")?.command), "q1").styleOverride).toEqual(BIG);
  });

  it("moving, trimming and copying carry the style", () => {
    const p = styled();
    p.clips.q3 = { ...cue(p, "q3"), styleOverride: { maxLines: 1 } };
    const moved = moveClips(p, ["q3"], 30, new Map(), "overwrite", { newId: ids() });
    if (moved.kind !== "ok") throw new Error("expected a move");
    expect(cue(run(p, moved.command), "q3")).toMatchObject({ start: 120, styleOverride: { maxLines: 1 } });
    const trimmed = run(p, trimEdge(p, "q1", "out", -20, { ripple: false }).command);
    expect(cue(trimmed, "q1")).toMatchObject({ duration: 40, styleOverride: BIG });
    const copies = moveClips(p, ["q1"], 200, new Map(), "overwrite", { newId: ids(), duplicate: true });
    if (copies.kind !== "ok") throw new Error("expected a copy");
    const copied = run(p, copies.command);
    expect(cue(copied, [...copies.placed.values()][0] as string)).toMatchObject({ styleOverride: BIG, presetId: "pr" });
  });

  it("a canvas move is a Custom position of the cue (Selected) or of the track, the cue then following it (All cues)", () => {
    const p = styled();
    const own = run(p, moveCaption(p, "q2", "selected", { x: 12.4, y: -700 }));
    expect(cue(own, "q2").styleOverride).toEqual({ position: "custom", x: 12, y: -700 });
    expect(own.captionTracks).toEqual(p.captionTracks);
    const all = run(p, moveCaption(p, "q1", "all", { x: 0, y: -500 }));
    expect(all.captionTracks.cc!.style).toMatchObject({ position: "custom", x: 0, y: -500 });
    // q1's own position goes (the dragged caption follows the track); its size and color stay.
    expect(cue(all, "q1").styleOverride).toEqual({ text: BIG.text });
    expect(cue(all, "q1").presetId).toBe("pr");
  });

  it("a corner drag sizes the cue's font (Selected) or the track's (All cues)", () => {
    const p = styled();
    const own = run(p, sizeCaption(p, "q2", "selected", 120));
    expect(cue(own, "q2").styleOverride).toEqual({ text: { fontSize: 120 } });
    const ownMore = run(p, sizeCaption(p, "q1", "selected", 40));
    expect(cue(ownMore, "q1").styleOverride?.text).toEqual({ ...BIG.text, fontSize: 40 });
    const all = run(p, sizeCaption(p, "q1", "all", 50));
    expect(all.captionTracks.cc!.style.text.fontSize).toBe(50);
    expect(cue(all, "q1").styleOverride?.text).toEqual({ fill: BIG.text?.fill });
    expect(sizeCaption(p, "q2", "all", p.captionTracks.cc!.style.text.fontSize)).toBeNull();
  });
});

describe("caption nudges (spec §7.3, §20.3)", () => {
  it("coalesce into one undo step, on the cue's own style or the track's", () => {
    let time = 0;
    const p = project([[0, 30]]);
    const doc = new DocumentStore(p, { session: createSessionStore(), validate: true, now: () => time });
    doc.dispatch(moveCaption(doc.getState(), "q1", "selected", { x: 1, y: -100 }, true) as Cmd);
    time += 50;
    doc.dispatch(moveCaption(doc.getState(), "q1", "selected", { x: 2, y: -100 }, true) as Cmd);
    expect(cue(doc.getState(), "q1").styleOverride).toEqual({ position: "custom", x: 2, y: -100 });
    expect(doc.history.getState().undoLabel).toBe("Nudge caption");
    doc.undo();
    expect(doc.getState()).toEqual(p);
    const all = moveCaption(p, "q1", "all", { x: 0, y: -10 }, true);
    expect(all).toMatchObject({ label: "Nudge captions", coalesceKey: "canvas.nudgeCaption" });
  });
});
