// The dev performance overlay's text (Batch 45): one snapshot of the app's counters (gathered by
// app/perfMonitor.ts) as a few short lines. Pure, so it is unit tested.

export interface PerfSnapshot {
  /** performance.now() of the snapshot. */
  at: number;
  react: { commits: number; perSecond: number };
  /** Draws per second and the last draw's ms. */
  timeline: { content: number; contentMs: number; overlay: number; overlayMs: number };
  preview: { draws: number; skipped: number; ms: number };
  /** ms to the first frame shown and to the exact frame (p50, p95, p99 of the last 128 requests). */
  decode: { approx: readonly (number | null)[]; exact: readonly (number | null)[]; requests: number };
  playback: { dropped: number; frames: number };
  memory: {
    poolTextures: number;
    poolBytes: number;
    poolBudget: number;
    gpuTextures: number;
    gpuBytes: number;
    textBytes: number;
    audioBytes: number;
    /** performance.memory (Chrome), null elsewhere. */
    heapUsed: number | null;
    heapTotal: number | null;
  };
  /** Open VideoFrames; the worker's are null while its counters are not fetched. */
  frames: { main: number; worker: number | null };
  decoders: { sessions: number; live: number } | null;
  /** Requests in flight per worker kind, the decode worker's waiting jobs, idle tasks queued. */
  queues: { inFlight: Readonly<Partial<Record<string, number>>>; decodeJobs: number | null; idle: number };
  longTasks: { count: number; lastSecond: number; maxMs: number; last: { start: number; duration: number } | null };
}

const mb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1);
const ms = (value: number | null | undefined) => (value === null || value === undefined ? "-" : String(Math.round(value)));
const rate = (value: number) => String(Math.round(value));
const triple = (values: readonly (number | null)[]) => `${ms(values[0])} / ${ms(values[1])} / ${ms(values[2])}`;

export function formatPerf(s: PerfSnapshot): string {
  const { memory: m, longTasks: l, queues: q } = s;
  const dropRate = s.playback.frames > 0 ? ` (${((s.playback.dropped / s.playback.frames) * 100).toFixed(2)}%)` : "";
  const kinds = Object.entries(q.inFlight)
    .filter(([, count]) => (count ?? 0) > 0)
    .map(([kind, count]) => `${kind} ${count}`);
  const last = l.last ? ` · last ${Math.round(l.last.duration)} ms at ${(l.last.start / 1000).toFixed(1)} s` : "";
  const heap = m.heapUsed !== null && m.heapTotal !== null ? `JS heap ${mb(m.heapUsed)} / ${mb(m.heapTotal)} MB` : "JS heap -";
  return [
    `React ${rate(s.react.perSecond)} commits/s · ${s.react.commits} total`,
    `timeline content ${rate(s.timeline.content)}/s ${s.timeline.contentMs.toFixed(1)} ms · overlay ${rate(s.timeline.overlay)}/s ${s.timeline.overlayMs.toFixed(1)} ms`,
    `preview ${rate(s.preview.draws)} draws/s · ${rate(s.preview.skipped)} skipped/s · ${s.preview.ms.toFixed(1)} ms`,
    `decode ms p50/p95/p99: first ${triple(s.decode.approx)} · exact ${triple(s.decode.exact)} · ${s.decode.requests} requests`,
    `dropped ${s.playback.dropped} / ${s.playback.frames}${dropRate}`,
    `GPU ${m.gpuTextures} tex ${mb(m.gpuBytes)} MB · pool ${m.poolTextures} tex ${mb(m.poolBytes)} / ${mb(m.poolBudget)} MB · text ${mb(m.textBytes)} MB · audio ${mb(m.audioBytes)} MB`,
    `VideoFrames open: main ${s.frames.main} · worker ${s.frames.worker ?? "-"}` + (s.decoders ? ` · decoders ${s.decoders.live} / ${s.decoders.sessions} sessions` : ""),
    `queues: ${kinds.length > 0 ? kinds.join(" · ") : "idle"} · decode jobs ${q.decodeJobs ?? "-"} · idle tasks ${q.idle}`,
    `long tasks ${l.count} · last second ${l.lastSecond} · max ${Math.round(l.maxMs)} ms${last}`,
    heap,
  ].join("\n");
}
