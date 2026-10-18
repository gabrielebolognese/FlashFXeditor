// Dev benchmarks of the performance pass (spec P12-P14, Batch 45), run from the command palette or as
// `__editor.perf.bench.*` (the acceptance runs drive them over CDP). Each resolves with a JSON-able
// report (the commands print it on the console and sum it up in a toast):
// - timeline: 500 clips on 8 tracks (one undo step), then synthetic input on the timeline's canvas:
//   Ctrl+wheel zoom sweeps, wheel scrolling, a clip drag (undone) and 3 s of playback; per phase the
//   rAF frame times, content and overlay redraws, preview draws, React commits and long tasks.
// - scrub: the longest video clip fitted to the view, a ruler drag sweeping it in 600 frames, then
//   jumps within one held drag (the pointer moves to a random point and stays): ms to the first frame
//   shown and to the exact frame while scrubbing (P8: exact within 50 ms on proxy), and the decode
//   time of the full-quality frame Auto quality asks for once the scrub has rested 300 ms (§7.5).
// - export: a 60 s range (the whole timeline when shorter) with the chosen preset into exports/; the
//   wall time against the range's duration (P14: under 2x realtime).
// - startup: reloads with `?bench=startup`; the marks of App.tsx give navigation to interactive (P12).
//   The dev server serves unbundled modules: measure the build (`vite preview`) for P12.
// - memory: the counters with the project open, then 3 s after closing it (P13).
import { fpsToNumber, secondsToFrames } from "../core/document/time.js";
import type { PerfSnapshot } from "../core/perf/formatPerf.js";
import { frameSummary, percentiles } from "../core/perf/perfMath.js";
import { contentEnd } from "../timeline/model/queries.js";
import { currentRequest, enqueueExport, exportQueue } from "./exportController.js";
import { perfMonitor } from "./perfMonitor.js";
import { frameService, playbackEngine, previewView } from "./previewController.js";
import { closeProject, currentSession } from "./projectController.js";
import { documentStore, sessionStore } from "./services.js";
import { timelineView } from "./timelineController.js";
import { generateTestClips } from "./timelineDev.js";

const nextFrame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const round = (value: number | null) => (value === null ? null : Math.round(value * 10) / 10);
const max = (values: readonly number[]) => values.reduce((a, b) => Math.max(a, b), 0);

async function frames(count: number): Promise<void> {
  for (let i = 0; i < count; i++) await nextFrame();
}

export interface PhaseResult {
  phase: string;
  frames: number;
  fps: number;
  maxFrameMs: number;
  p95FrameMs: number | null;
  /** Frames longer than 1.5 vsyncs. */
  missedFrames: number;
  contentDraws: number;
  contentMaxMs: number;
  overlayDraws: number;
  overlayMaxMs: number;
  previewDraws: number;
  previewMaxMs: number;
  reactCommits: number;
  longTasks: number;
  maxTaskMs: number;
}

/** Records frame times, redraws, commits and long tasks while `run` drives the app. */
async function measure(phase: string, run: () => Promise<void>): Promise<PhaseResult> {
  const t = timelineView.stats;
  const p = previewView.stats;
  const intervals: number[] = [];
  const content: number[] = [];
  const overlay: number[] = [];
  const preview: number[] = [];
  const commits = perfMonitor.reactCommits;
  const first = { content: t.contentDraws, overlay: t.overlayDraws, preview: p.renders };
  let seen = { ...first };
  let previous = await nextFrame();
  const from = performance.now();
  let running = true;
  const loop = (async () => {
    while (running) {
      const now = await nextFrame();
      intervals.push(now - previous);
      previous = now;
      if (t.contentDraws !== seen.content) content.push(t.contentMs);
      if (t.overlayDraws !== seen.overlay) overlay.push(t.overlayMs);
      if (p.renders !== seen.preview) preview.push(p.ms);
      seen = { content: t.contentDraws, overlay: t.overlayDraws, preview: p.renders };
    }
  })();
  try {
    await run();
  } finally {
    running = false;
    await loop;
  }
  const summary = frameSummary(intervals);
  perfMonitor.flushLongTasks();
  const tasks = perfMonitor.longTasks.since(from);
  return {
    phase,
    frames: summary.frames,
    fps: Math.round(summary.fps * 10) / 10,
    maxFrameMs: Math.round(summary.maxMs * 10) / 10,
    p95FrameMs: round(summary.p95Ms),
    missedFrames: summary.missed,
    contentDraws: t.contentDraws - first.content,
    contentMaxMs: Math.round(max(content) * 10) / 10,
    overlayDraws: t.overlayDraws - first.overlay,
    overlayMaxMs: Math.round(max(overlay) * 10) / 10,
    previewDraws: p.renders - first.preview,
    previewMaxMs: Math.round(max(preview) * 10) / 10,
    reactCommits: perfMonitor.reactCommits - commits,
    longTasks: tasks.length,
    maxTaskMs: Math.round(max(tasks.map((task) => task.duration))),
  };
}

const POINTER_ID = 4545;

/**
 * Synthetic pointer and wheel events on the timeline's canvas, in canvas CSS px. Synthetic pointers
 * are not active pointers (capture would throw), so capture is stubbed on the element meanwhile.
 */
class SyntheticInput {
  private readonly rect: DOMRect;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.rect = canvas.getBoundingClientRect();
    Object.assign(canvas, { setPointerCapture: () => undefined, releasePointerCapture: () => undefined, hasPointerCapture: () => false });
  }

  dispose(): void {
    for (const name of ["setPointerCapture", "releasePointerCapture", "hasPointerCapture"]) Reflect.deleteProperty(this.canvas, name);
  }

  pointer(type: "pointerdown" | "pointermove" | "pointerup", x: number, y: number, pressed: boolean): void {
    const init = { bubbles: true, cancelable: true, composed: true, pointerId: POINTER_ID, pointerType: "mouse", isPrimary: true, clientX: this.rect.left + x, clientY: this.rect.top + y };
    this.canvas.dispatchEvent(new PointerEvent(type, { ...init, button: type === "pointermove" ? -1 : 0, buttons: pressed ? 1 : 0 }));
  }

  wheel(x: number, y: number, deltaX: number, deltaY: number, ctrlKey = false): void {
    this.canvas.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, clientX: this.rect.left + x, clientY: this.rect.top + y, deltaX, deltaY, deltaMode: 0, ctrlKey }));
  }
}

function requireTimeline(): HTMLCanvasElement {
  if (!currentSession()) throw new Error("Open a project first");
  const canvas = timelineView.element;
  if (!canvas) throw new Error("The timeline is not shown");
  return canvas;
}

function setTimelineView(pxPerFrame: number, scrollFrame: number, scrollY = 0): void {
  sessionStore.state.set((state) => ({ ...state, timeline: { ...state.timeline, pxPerFrame, scrollFrame, scrollY } }));
}

export async function benchTimeline(): Promise<{ clips: number; tracks: number; phases: PhaseResult[] }> {
  const canvas = requireTimeline();
  playbackEngine.pause();
  generateTestClips(documentStore, { clips: 500, tracks: 8 });
  timelineView.fit();
  await frames(30);
  const input = new SyntheticInput(canvas);
  const phases: PhaseResult[] = [];
  try {
    const { area } = timelineView.geometry();
    const x = area.x + area.width / 2;
    const y = area.y + Math.min(area.height / 2, 80);
    phases.push(
      await measure("zoom (Ctrl+wheel)", async () => {
        for (let i = 0; i < 120; i++) {
          input.wheel(x, y, 0, i % 60 < 30 ? -60 : 60, true);
          await nextFrame();
        }
      }),
    );
    setTimelineView(4, 0);
    await frames(10);
    phases.push(
      await measure("scroll (wheel)", async () => {
        for (let i = 0; i < 180; i++) {
          input.wheel(x, y, i < 120 ? 40 : -60, 0);
          await nextFrame();
        }
        for (let i = 0; i < 60; i++) {
          input.wheel(x, y, 0, i < 30 ? 30 : -30);
          await nextFrame();
        }
      }),
    );
    setTimelineView(4, 0);
    await frames(10);
    const drag = draggableClip();
    if (drag) {
      phases.push(
        await measure("clip drag", async () => {
          input.pointer("pointerdown", drag.x, drag.y, true);
          for (let i = 1; i <= 90; i++) {
            input.pointer("pointermove", drag.x + i * 3, drag.y, true);
            await nextFrame();
          }
          input.pointer("pointerup", drag.x + 270, drag.y, false);
          await frames(5);
        }),
      );
      documentStore.undo();
    }
    sessionStore.state.set((state) => ({ ...state, playhead: 0 }));
    await frames(10);
    phases.push(
      await measure("playback 3 s", async () => {
        playbackEngine.toggle();
        await sleep(3000);
        playbackEngine.pause();
      }),
    );
  } finally {
    input.dispose();
  }
  const project = documentStore.getState();
  return { clips: Object.keys(project.clips).length, tracks: project.tracks.length, phases };
}

/** A press point in the body of a visible clip on the topmost video track, away from its edges, fade handles and label. */
function draggableClip(): { x: number; y: number } | null {
  const project = documentStore.getState();
  const geometry = timelineView.geometry();
  const { from, to } = geometry.visibleFrames;
  for (const track of project.tracks) {
    if (track.kind !== "video" || track.locked) continue;
    const row = geometry.rowOf(track.id);
    if (!row || row.y < geometry.area.y || row.y + row.height > geometry.area.y + geometry.area.height) continue;
    for (const id of track.clipIds) {
      const clip = project.clips[id];
      if (!clip || clip.start < from || clip.start + clip.duration > to) continue;
      const left = geometry.frameToX(clip.start);
      const right = geometry.frameToX(clip.start + clip.duration);
      if (right - left < 60) continue;
      return { x: Math.round((left + right) / 2), y: Math.round(row.y + row.height * 0.7) };
    }
  }
  return null;
}

interface LatencyStats {
  count: number;
  p50: number | null;
  p95: number | null;
  p99: number | null;
  max: number | null;
}

function latencyStats(samples: readonly number[]): LatencyStats {
  const [p50 = null, p95 = null, p99 = null] = percentiles(samples, [50, 95, 99]);
  return { count: samples.length, p50: round(p50), p95: round(p95), p99: round(p99), max: samples.length > 0 ? round(max(samples)) : null };
}

export async function benchScrub(options: { steps?: number; jumps?: number } = {}) {
  const canvas = requireTimeline();
  playbackEngine.pause();
  const project = documentStore.getState();
  const clip = Object.values(project.clips)
    .filter((candidate) => candidate.kind === "video")
    .sort((a, b) => b.duration - a.duration)[0];
  if (!clip || clip.kind !== "video") throw new Error("The timeline has no video clip");
  const media = project.media[clip.mediaId];
  timelineView.zoomToFrames(clip.start, clip.start + clip.duration);
  await frames(30);
  const geometry = timelineView.geometry();
  // Clear of the edges' auto-scroll bands (a held drag there scrolls the view past the clip).
  const margin = 40;
  const left = Math.max(geometry.area.x + margin, geometry.frameToX(clip.start) + 1);
  const right = Math.min(geometry.area.x + geometry.area.width - margin, geometry.frameToX(clip.start + clip.duration) - 1);
  // Above the markers band and below the in/out handles of the ruler.
  const y = Math.round(geometry.rulerHeight / 2);
  const input = new SyntheticInput(canvas);
  const sweep = { approx: [] as number[], exact: [] as number[] };
  type Jump = { approx: number | null; exact: number | null; full: number | null };
  let jumpPhase: Jump | null = null;
  frameService.onLatency = (kind, ms) => {
    if (!jumpPhase) sweep[kind].push(ms);
    else if (jumpPhase[kind] === null) jumpPhase[kind] = ms;
    // The next exact frame is the full-quality one, requested after the rest.
    else if (kind === "exact" && jumpPhase.full === null) jumpPhase.full = ms;
  };
  const steps = options.steps ?? 600;
  let sweepPhase: PhaseResult;
  const jumps: Jump[] = [];
  try {
    sweepPhase = await measure("ruler sweep", async () => {
      input.pointer("pointerdown", left, y, true);
      for (let i = 1; i <= steps; i++) {
        input.pointer("pointermove", left + ((right - left) * i) / steps, y, true);
        await nextFrame();
      }
      input.pointer("pointerup", right, y, false);
    });
    await sleep(800);
    let seed = 7;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    input.pointer("pointerdown", left, y, true);
    await sleep(500);
    for (let i = 0; i < (options.jumps ?? 40); i++) {
      const x = left + random() * (right - left);
      const jump: Jump = { approx: null, exact: null, full: null };
      jumpPhase = jump;
      input.pointer("pointermove", x, y, true);
      const started = performance.now();
      while (jump.exact === null && performance.now() - started < 2000) await nextFrame();
      // Until Auto quality's full frame has come (the scrub resting on a frame).
      while (jump.full === null && performance.now() - started < 3000) await nextFrame();
      jumps.push(jump);
    }
    input.pointer("pointerup", left, y, false);
  } finally {
    frameService.onLatency = null;
    input.dispose();
  }
  const of = (key: keyof Jump) => jumps.map((jump) => jump[key]).filter((ms): ms is number => ms !== null);
  return {
    media: media ? { name: media.name, width: media.kind === "video" ? media.width : 0, height: media.kind === "video" ? media.height : 0, durationS: Math.round(media.durationUs / 1e5) / 10, proxy: media.kind === "video" ? media.proxy?.status ?? null : null } : null,
    quality: sessionStore.state.getState().preview.quality,
    sweep: { phase: sweepPhase, first: latencyStats(sweep.approx), exact: latencyStats(sweep.exact) },
    jumps: { count: jumps.length, timedOut: jumps.filter((jump) => jump.exact === null).length, first: latencyStats(of("approx")), exact: latencyStats(of("exact")), full: latencyStats(of("full")) },
  };
}

export async function benchExport(seconds = 60) {
  requireTimeline();
  const project = documentStore.getState();
  const end = Math.min(contentEnd(project), secondsToFrames(seconds, project.settings.fps));
  const started = performance.now();
  const id = await enqueueExport({ ...currentRequest("video"), range: { start: 0, end }, destination: "project" });
  if (!id) throw new Error("Nothing was exported");
  let running: number | null = null;
  while (exportQueue.get(id)) {
    if (running === null && exportQueue.running?.id === id) running = performance.now();
    await sleep(100);
  }
  const done = performance.now();
  const entry = sessionStore.state.getState().exportLog[0];
  const rangeS = end / fpsToNumber(project.settings.fps);
  const ms = done - (running ?? started);
  return { frames: end, rangeS: Math.round(rangeS * 100) / 100, status: entry?.status ?? null, ms: Math.round(ms), realtime: Math.round((ms / 1000 / rangeS) * 100) / 100 };
}

/** Navigation to the app's marks, from the performance timeline (ms). */
export function startupMarks(): Record<string, number> {
  const marks: Record<string, number> = {};
  for (const mark of performance.getEntriesByType("mark")) if (mark.name.startsWith("app:") || mark.name.startsWith("editor:")) marks[mark.name] ??= Math.round(mark.startTime);
  return marks;
}

export function benchStartup(): void {
  const url = new URL(location.href);
  url.searchParams.set("bench", "startup");
  location.assign(url);
}

type MemoryReport = PerfSnapshot["memory"] & { frames: PerfSnapshot["frames"]; decoders: PerfSnapshot["decoders"] };

async function memoryNow(): Promise<MemoryReport> {
  await perfMonitor.pollWorker();
  const snapshot = perfMonitor.snapshot();
  return { ...snapshot.memory, frames: snapshot.frames, decoders: snapshot.decoders };
}

export async function benchMemory(): Promise<{ open: MemoryReport; closed: MemoryReport }> {
  requireTimeline();
  const open = await memoryNow();
  await closeProject();
  await sleep(3000);
  return { open, closed: await memoryNow() };
}
