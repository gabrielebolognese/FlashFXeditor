// Whether an export runs (Batch 43), for the parts of the app that act differently meanwhile (spec
// §16): proxy jobs pause (the export takes the encoder), playback plays proxies, Clear cache is refused
// (the export writes cache/export-temp/) and the texture budget is split. No heavy imports: the media,
// preview and cache controllers read it.
import type { IdleQueue } from "../core/scheduler/IdleQueue.js";
import { createStore } from "../core/store/createStore.js";

export interface ExportState {
  running: boolean;
  paused: boolean;
}

export const exportState = createStore<ExportState>({ running: false, paused: false });

export const exportRunning = (): boolean => exportState.getState().running;

type Pauser = Pick<IdleQueue, "isPaused" | "onPauseChange">;

/** `idle`'s pauses, and paused while an export runs (the proxy jobs). */
export function pausedWhileExporting(idle: Pauser): Pauser {
  const paused = () => idle.isPaused || exportRunning();
  return {
    get isPaused() {
      return paused();
    },
    onPauseChange: (listener) => {
      let last = paused();
      const update = () => {
        const next = paused();
        if (next === last) return;
        last = next;
        listener(next);
      };
      const stops = [idle.onPauseChange(update), exportState.select((state) => state.running, update)];
      return () => {
        for (const stop of stops) stop();
      };
    },
  };
}
