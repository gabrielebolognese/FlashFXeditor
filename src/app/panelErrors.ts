// Panel faults (Batch 47): a panel whose React render throws (its PanelBoundary catches it) or whose
// canvas view fails frame after frame (the FrameScheduler reports it) shows an error state in its place
// with Reload panel; the other panels keep working, and the document, the undo history and the autosave
// live outside React, so nothing is lost. A reload remounts the panel (its views mount again).
import type { ActionContext } from "../core/keyboard/KeyDispatcher.js";
import type { InvalidationFlag } from "../core/scheduler/FrameScheduler.js";
import { createStore } from "../core/store/createStore.js";
import type { PanelId } from "../core/store/layoutStore.js";

const PANELS: readonly PanelId[] = ["media", "properties", "preview", "timeline"];

/** The message of each panel that failed, until it is reloaded. */
export const panelFaults = createStore<Readonly<Partial<Record<PanelId, string>>>>({});
/** Bumped by each reload: a panel's boundary keys its contents with it, so they mount afresh. */
export const panelEpochs = createStore<Readonly<Partial<Record<PanelId, number>>>>({});

/** The panel a canvas flag draws into (the dev stats chip belongs to none). */
const PANEL_OF_FLAG: Readonly<Partial<Record<InvalidationFlag, PanelId>>> = {
  timelineContent: "timeline",
  timelineOverlay: "timeline",
  preview: "preview",
  gizmo: "preview",
  previewOverlay: "preview",
  meters: "preview",
  mediaThumbs: "media",
};

export function isPanelId(value: unknown): value is PanelId {
  return typeof value === "string" && (PANELS as readonly string[]).includes(value);
}

export function panelOfFlags(flags: readonly InvalidationFlag[]): PanelId | null {
  for (const flag of flags) {
    const panel = PANEL_OF_FLAG[flag];
    if (panel) return panel;
  }
  return null;
}

/** Puts `panel` in its error state (the first fault's message stays until a reload). */
export function reportPanelFault(panel: PanelId, error: unknown): void {
  const message = error instanceof Error ? error.message || error.name : String(error);
  panelFaults.set((faults) => (faults[panel] !== undefined ? faults : { ...faults, [panel]: message }));
}

/** Remounts `panels`, clearing their faults. Returns the panels reloaded. */
export function reloadPanels(panels: readonly PanelId[]): PanelId[] {
  if (panels.length === 0) return [];
  panelFaults.set((faults) => {
    if (!panels.some((panel) => faults[panel] !== undefined)) return faults;
    const next = { ...faults };
    for (const panel of panels) delete next[panel];
    return next;
  });
  panelEpochs.set((epochs) => {
    const next = { ...epochs };
    for (const panel of panels) next[panel] = (next[panel] ?? 0) + 1;
    return next;
  });
  return [...panels];
}

/**
 * `panel.reload`: the panel named by `arg`; without one, every panel in its error state, else the
 * panel that had the keyboard (the palette's scope).
 */
export function runPanelReload(context: ActionContext | null, arg?: string): void {
  if (isPanelId(arg)) {
    reloadPanels([arg]);
    return;
  }
  const faulted = PANELS.filter((panel) => panelFaults.getState()[panel] !== undefined);
  if (faulted.length > 0) reloadPanels(faulted);
  else if (isPanelId(context?.scope)) reloadPanels([context.scope]);
}
