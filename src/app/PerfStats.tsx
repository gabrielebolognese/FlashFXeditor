// The dev performance overlay (Batch 45): React mounts the element while `perfDev.stats` is on; the
// text is written in the scheduler loop (`devStats`) four times a second, never by React (P1).
import { useEffect, useRef } from "react";
import { formatPerf } from "../core/perf/formatPerf.js";
import { useStoreSelector } from "../core/store/useStoreSelector.js";
import { perfDev } from "./perfDev.js";
import { perfMonitor } from "./perfMonitor.js";
import styles from "./PerfStats.module.css";
import { scheduler } from "./services.js";

const REFRESH_MS = 250;

function attach(element: HTMLElement): () => void {
  const stop = scheduler.register("devStats", {
    render: () => {
      element.textContent = formatPerf(perfMonitor.snapshot());
    },
  });
  const tick = () => {
    void perfMonitor.pollWorker().then(() => scheduler.invalidate("devStats"));
  };
  const timer = setInterval(tick, REFRESH_MS);
  tick();
  return () => {
    clearInterval(timer);
    stop();
  };
}

function Overlay() {
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    const element = ref.current;
    return element ? attach(element) : undefined;
  }, []);
  return <pre ref={ref} className={styles.stats} aria-label="Performance stats" />;
}

const selectStats = (state: { stats: boolean }) => state.stats;

export function PerfStats() {
  const shown = useStoreSelector(perfDev, selectStats);
  return shown ? <Overlay /> : null;
}
