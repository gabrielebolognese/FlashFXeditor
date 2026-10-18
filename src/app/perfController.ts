// Dev tooling of the performance pass (Batch 45), loaded by main.tsx in dev builds only: the
// performance overlay's toggle, the benchmark commands (app/perfBench.ts) and `__editor.perf` for the
// acceptance runs. A page opened with `?bench=startup` reports its startup marks once interactive.
import { showToast } from "../ui/toasts.js";
import { benchExport, benchMemory, benchScrub, benchStartup, benchTimeline, startupMarks, type PhaseResult } from "./perfBench.js";
import { perfDev } from "./perfDev.js";
import { perfMonitor } from "./perfMonitor.js";
import { closeProject } from "./projectController.js";
import { actions } from "./services.js";

export { perfMonitor } from "./perfMonitor.js";
export { PerfStats } from "./PerfStats.js";

const phaseLine = (phase: PhaseResult) => `${phase.phase}: ${phase.fps} fps, max ${phase.maxFrameMs} ms, ${phase.reactCommits} commits`;

/** Runs a benchmark from a command: the report on the console, a summary in a toast. */
function report<T>(name: string, run: () => Promise<T>, summary: (result: T) => string): () => void {
  return () => {
    showToast({ tone: "info", message: `${name} benchmark running…` });
    run().then(
      (result) => {
        console.info(`[bench] ${name}`, JSON.stringify(result));
        showToast({ tone: "success", message: `${name} benchmark done`, detail: `${summary(result)} (details on the console)` });
      },
      (error: unknown) => showToast({ tone: "error", message: `${name} benchmark failed`, detail: error instanceof Error ? error.message : String(error) }),
    );
  };
}

/** `?bench=startup`: the marks once the editor is idle after its first render. */
function reportStartup(): void {
  const url = new URL(location.href);
  if (url.searchParams.get("bench") !== "startup") return;
  url.searchParams.delete("bench");
  history.replaceState(null, "", url);
  const done = () => {
    const marks = startupMarks();
    if (marks["app:interactive"] === undefined) return void setTimeout(done, 100);
    console.info("[bench] startup", JSON.stringify(marks));
    showToast({ tone: "success", message: `Interactive ${marks["app:interactive"]} ms after navigation`, detail: "Dev server (unbundled modules): measure the build for P12. Marks on the console." });
  };
  done();
}

export function installPerfController(): () => void {
  perfMonitor.start();
  const editor = ((globalThis as { __editor?: Record<string, unknown> }).__editor ??= {});
  editor.perf = { monitor: perfMonitor, snapshot: () => perfMonitor.snapshot(), marks: startupMarks, closeProject, bench: { timeline: benchTimeline, scrub: benchScrub, export: benchExport, memory: benchMemory, startup: benchStartup } };
  const stops = [
    actions.register("dev.togglePerfStats", () => perfDev.set((state) => ({ stats: !state.stats }))),
    actions.register("dev.benchTimeline", report("Timeline", benchTimeline, (result) => result.phases.map(phaseLine).join(" · "))),
    actions.register(
      "dev.benchScrub",
      report("Scrub", benchScrub, ({ jumps }) => `exact frame after a jump: p50 ${jumps.exact.p50} ms, p95 ${jumps.exact.p95} ms`),
    ),
    actions.register(
      "dev.benchExport",
      report("Export", () => benchExport(), ({ ms, realtime }) => `${(ms / 1000).toFixed(1)} s, ${realtime}x realtime`),
    ),
    actions.register("dev.benchStartup", () => benchStartup()),
    actions.register(
      "dev.benchMemory",
      report("Memory", benchMemory, ({ open, closed }) => `GPU textures ${open.gpuTextures} -> ${closed.gpuTextures}, open frames ${open.frames.main} -> ${closed.frames.main}`),
    ),
  ];
  reportStartup();
  return () => {
    for (const stop of stops) stop();
  };
}
