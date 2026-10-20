import { describe, expect, it, vi } from "vitest";
import { addMedia, removeMedia } from "../core/commands/mediaCommands.js";
import { makeMedia, makeProject } from "../core/document/fixtures.js";
import type { MediaItem } from "../core/document/types.js";
import { IdleQueue } from "../core/scheduler/IdleQueue.js";
import { DocumentStore } from "../core/store/DocumentStore.js";
import { createSessionStore } from "../core/store/sessionStore.js";
import { segmentLayout } from "../audio/decode/segments.js";
import { FakeAudioBuffer } from "../audio/testAudio.js";
import { AnalysisScheduler } from "./AnalysisScheduler.js";
import { buildPeaks, peaksLevel0, readPeaksFile, writePeaksFile } from "./cache/peaks.js";
import { PeaksJobs, type PeaksJobDeps } from "./PeaksJobs.js";

const STAMP = { size: 100, lastModified: 5 };
const pending = (id: string, extra: Partial<MediaItem> = {}): MediaItem => ({ ...makeMedia(id, "audio"), analysis: { thumbs: "none", peaks: "pending" }, ...extra });

function setup(options: { segments?: number; withPcm?: boolean } = {}) {
  const slices: ((deadline: { timeRemaining(): number }) => void)[] = [];
  const idle = new IdleQueue(
    (cb) => slices.push(cb),
    () => undefined,
  );
  const documentStore = new DocumentStore(makeProject(), { session: createSessionStore(), validate: true });
  const files = new Map<string, ArrayBuffer>();
  const frames = 4096;
  const layout = { ...segmentLayout(48_000, frames * (options.segments ?? 1)), segmentFrames: frames, count: options.segments ?? 1 };
  const loads: number[] = [];
  const audio = {
    open: vi.fn(async () => layout),
    layout: vi.fn(() => layout),
    load: vi.fn(async (_id: string, segment: number) => {
      loads.push(segment);
      const buffer = new FakeAudioBuffer({ length: frames, numberOfChannels: 1, sampleRate: 48_000 });
      buffer.getChannelData(0).fill(segment === 0 ? 0.5 : -0.25);
      const pcm = options.withPcm ? [Float32Array.from(buffer.getChannelData(0))] : null;
      return { buffer: { ...buffer, copyFromChannel: (dest: Float32Array, c: number, at: number) => dest.set(buffer.getChannelData(c).subarray(at, at + dest.length)) } as unknown as AudioBuffer, pcm };
    }),
  };
  const request = vi.fn(async (method: string, params: Record<string, unknown>) => {
    if (method === "peaksLevel0") return peaksLevel0((params.channels as ArrayBuffer[]).map((b) => new Float32Array(b))).buffer;
    if (method === "peaksFile") {
      const { level0, sampleRate, frames: total, channels, stamp } = params as { level0: ArrayBuffer; sampleRate: number; frames: number; channels: number; stamp: typeof STAMP };
      return writePeaksFile(buildPeaks(new Int8Array(level0), { sampleRate, frames: total, channels }), stamp);
    }
    throw new Error(method);
  });
  const deps: PeaksJobDeps = {
    idle,
    document: documentStore,
    audio: audio as unknown as PeaksJobDeps["audio"],
    workers: { request } as unknown as PeaksJobDeps["workers"],
    stamp: async (id) => (documentStore.getState().media[id] ? STAMP : null),
    read: async (id) => files.get(id) ?? null,
    write: vi.fn(async (id: string, bytes: ArrayBuffer) => void files.set(id, bytes)),
    yieldToMain: async () => undefined,
  };
  const jobs = new PeaksJobs(deps);
  const scheduler = new AnalysisScheduler(idle, jobs);
  scheduler.attach(documentStore);
  /** Runs idle slices and the async work they start until nothing is left. */
  const settle = async () => {
    for (let i = 0; i < 20; i++) {
      slices.splice(0).forEach((cb) => cb({ timeRemaining: () => 50 }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  };
  return { documentStore, jobs, files, audio, request, loads, deps, settle, idle };
}

describe("PeaksJobs", () => {
  it("builds and writes the peaks of every audio-bearing media after import, then marks them ready with no undo step", async () => {
    const t = setup();
    t.documentStore.dispatch(addMedia([pending("a"), { ...pending("v"), kind: "video", hasAudio: true }, { ...pending("silent"), kind: "video", hasAudio: false, analysis: { thumbs: "pending", peaks: "none" } }]));
    await t.settle();
    expect([...t.files.keys()]).toEqual(["a", "v"]);
    const peaks = readPeaksFile(t.files.get("a") as ArrayBuffer, STAMP);
    expect(peaks).toMatchObject({ sampleRate: 48_000, frames: 4096, channels: 1 });
    expect([...(peaks?.levels.at(-1) ?? [])]).toEqual([63, 64]);
    const { media } = t.documentStore.getState();
    expect(media.a?.analysis.peaks).toBe("ready");
    expect(media.v?.analysis.peaks).toBe("ready");
    expect(media.silent?.analysis.peaks).toBe("none");
    // One undo step: the import.
    t.documentStore.undo();
    expect(t.documentStore.history.getState().canUndo).toBe(false);
  });

  it("reuses a valid peaks file on reopen without decoding", async () => {
    const t = setup();
    t.files.set("a", writePeaksFile(buildPeaks(peaksLevel0([new Float32Array(256)]), { sampleRate: 48_000, frames: 256, channels: 1 }), STAMP));
    t.documentStore.dispatch(addMedia([pending("a")]));
    await t.settle();
    expect(t.audio.load).not.toHaveBeenCalled();
    expect(t.deps.write).not.toHaveBeenCalled();
    expect(t.documentStore.getState().media.a?.analysis.peaks).toBe("ready");
  });

  it("rebuilds a missing file of media already marked ready (the cache is disposable)", async () => {
    const t = setup();
    t.documentStore.dispatch(addMedia([{ ...pending("a"), analysis: { thumbs: "none", peaks: "ready" } }]));
    await t.settle();
    expect(t.files.has("a")).toBe(true);
  });

  it("decodes long media segment by segment, transferring the worker's PCM when there is one", async () => {
    const t = setup({ segments: 3, withPcm: true });
    t.documentStore.dispatch(addMedia([pending("a")]));
    await t.settle();
    expect(t.loads).toEqual([0, 1, 2]);
    const levels = t.request.mock.calls.filter(([method]) => method === "peaksLevel0");
    expect(levels).toHaveLength(3);
    const peaks = readPeaksFile(t.files.get("a") as ArrayBuffer, STAMP);
    expect(peaks?.frames).toBe(3 * 4096);
    expect([...(peaks?.levels.at(-1) ?? [])]).toEqual([-32, 64]);
  });

  it("runs one job at a time from idle callbacks and skips media removed meanwhile", async () => {
    const t = setup();
    t.documentStore.dispatch(addMedia([pending("a"), pending("b")]));
    expect(t.jobs.waiting).toEqual(["a", "b"]);
    t.documentStore.dispatch(removeMedia(["b"]));
    await t.settle();
    expect([...t.files.keys()]).toEqual(["a"]);
  });

  it("marks media ready again when a redo brings back its pending record", async () => {
    const t = setup();
    t.documentStore.dispatch(addMedia([pending("a")]));
    await t.settle();
    t.documentStore.undo();
    t.documentStore.redo();
    expect(t.documentStore.getState().media.a?.analysis.peaks).toBe("ready");
    expect(t.audio.load).toHaveBeenCalledTimes(1);
  });
});
