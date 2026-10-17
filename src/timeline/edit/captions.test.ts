import { describe, expect, it } from "vitest";
import { addCaptionTrack as withCaptionTrack, makeCaptionClip, makeMedia, makeMediaClip, makeProject, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { CaptionClip, Clip, Project } from "../../core/document/types.js";
import type { Command as Cmd } from "../../core/commands/command.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createSessionStore } from "../../core/store/sessionStore.js";
import { defaultCaptionStyle, evenWords, wordRanges } from "../../text/captions.js";
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
  exportCues,
  importCues,
  mergeWithPrevious,
  replaceCuesInRange,
  setCaptionStyle,
  setCueText,
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
