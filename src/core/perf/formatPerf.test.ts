import { describe, expect, it } from "vitest";
import { formatPerf, type PerfSnapshot } from "./formatPerf.js";

const MB = 1024 * 1024;

function snapshot(patch: Partial<PerfSnapshot> = {}): PerfSnapshot {
  return {
    at: 1000,
    react: { commits: 12, perSecond: 0 },
    timeline: { content: 0, contentMs: 3.21, overlay: 60, overlayMs: 0.42 },
    preview: { draws: 59.6, skipped: 0, ms: 1.05 },
    decode: { approx: [3.4, 9, 15], exact: [12, 30.6, null], requests: 240 },
    playback: { dropped: 3, frames: 600 },
    memory: { poolTextures: 12, poolBytes: 210 * MB, poolBudget: 768 * MB, gpuTextures: 40, gpuBytes: 260 * MB, textBytes: 3 * MB, audioBytes: 0, heapUsed: 85 * MB, heapTotal: 120 * MB },
    frames: { main: 0, worker: 2 },
    decoders: { sessions: 2, live: 1 },
    queues: { inFlight: { decode: 3, analysis: 0 }, decodeJobs: 1, idle: 4 },
    longTasks: { count: 2, lastSecond: 0, maxMs: 72.4, last: { start: 12_345, duration: 55 } },
    ...patch,
  };
}

describe("formatPerf", () => {
  it("writes every counter on its line", () => {
    expect(formatPerf(snapshot()).split("\n")).toEqual([
      "React 0 commits/s · 12 total",
      "timeline content 0/s 3.2 ms · overlay 60/s 0.4 ms",
      "preview 60 draws/s · 0 skipped/s · 1.1 ms",
      "decode ms p50/p95/p99: first 3 / 9 / 15 · exact 12 / 31 / - · 240 requests",
      "dropped 3 / 600 (0.50%)",
      "GPU 40 tex 260.0 MB · pool 12 tex 210.0 / 768.0 MB · text 3.0 MB · audio 0.0 MB",
      "VideoFrames open: main 0 · worker 2 · decoders 1 / 2 sessions",
      "queues: decode 3 · decode jobs 1 · idle tasks 4",
      "long tasks 2 · last second 0 · max 72 ms · last 55 ms at 12.3 s",
      "JS heap 85.0 / 120.0 MB",
    ]);
  });

  it("shows what is not known yet as dashes", () => {
    const text = formatPerf(
      snapshot({
        playback: { dropped: 0, frames: 0 },
        frames: { main: 0, worker: null },
        decoders: null,
        queues: { inFlight: {}, decodeJobs: null, idle: 0 },
        longTasks: { count: 0, lastSecond: 0, maxMs: 0, last: null },
        memory: { ...snapshot().memory, heapUsed: null, heapTotal: null },
      }),
    );
    expect(text).toContain("dropped 0 / 0\n");
    expect(text).toContain("VideoFrames open: main 0 · worker -\n");
    expect(text).toContain("queues: idle · decode jobs - · idle tasks 0");
    expect(text).toContain("long tasks 0 · last second 0 · max 0 ms\n");
    expect(text.endsWith("JS heap -")).toBe(true);
  });
});
