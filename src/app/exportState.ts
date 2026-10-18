// Whether an export runs (Batch 43), for the parts of the app that act differently meanwhile (spec
// §16): proxy jobs pause (the export takes the encoder), playback plays proxies, Clear cache is refused
// (the export writes cache/export-temp/) and the texture budget is split. No heavy imports: the media,
// preview and cache controllers read it, and the properties panel and Esc read the Export tab's state.
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

/**
 * The Export tab of the properties panel (spec §2.2, §16): `open` while it is in the panel's header,
 * `active` while it is the tab shown (else Edit Properties is); `focus` counts the times it was asked
 * for (the tab takes the focus each time).
 */
export interface ExportTabState {
  open: boolean;
  active: boolean;
  focus: number;
}

export const exportTab = createStore<ExportTabState>({ open: false, active: false, focus: 0 });

/** Opens the Export tab (or shows it again) and gives it the focus. */
export function openExportTab(): void {
  exportTab.set((state) => ({ open: true, active: true, focus: state.focus + 1 }));
}

/** Shows one of the two tabs while the Export tab is open. */
export function showExportTab(active: boolean): void {
  exportTab.set((state) => (state.open && state.active !== active ? { ...state, active } : state));
}

/** Closes the Export tab (Esc, its close button): the panel returns to Edit Properties. False when it was closed. */
export function closeExportTab(): boolean {
  if (!exportTab.getState().open) return false;
  exportTab.set((state) => ({ ...state, open: false, active: false }));
  return true;
}
