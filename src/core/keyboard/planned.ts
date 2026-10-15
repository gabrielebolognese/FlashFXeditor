// Shortcuts of the keymap (spec §18) whose commands later batches build. Every §18 key is bound since
// Batch 18; a key whose command is not registered yet shows "<label>: coming in Batch NN" in dev builds
// (the KeyDispatcher's fallback in app/services.ts). A batch that registers one of these removes it here.

export interface PlannedCommand {
  /** The batch that builds the command. */
  batch: number;
  /** The action's name, as §18 gives it. */
  label: string;
}

export const PLANNED_COMMANDS: Readonly<Record<string, PlannedCommand>> = {
  // Batch 21: preview viewport and fullscreen.
  "preview.toggleFullscreen": { batch: 21, label: "Fullscreen preview" },
  "canvas.zoomFit": { batch: 21, label: "Canvas zoom to fit" },
  "canvas.zoom100": { batch: 21, label: "Canvas zoom 100%" },
  "canvas.zoom200": { batch: 21, label: "Canvas zoom 200%" },
  // Batch 22: the transform gizmo's nudges.
  "canvas.nudgeLeft": { batch: 22, label: "Canvas nudge" },
  "canvas.nudgeRight": { batch: 22, label: "Canvas nudge" },
  "canvas.nudgeUp": { batch: 22, label: "Canvas nudge" },
  "canvas.nudgeDown": { batch: 22, label: "Canvas nudge" },
  "canvas.nudgeLeft10": { batch: 22, label: "Canvas nudge 10 px" },
  "canvas.nudgeRight10": { batch: 22, label: "Canvas nudge 10 px" },
  "canvas.nudgeUp10": { batch: 22, label: "Canvas nudge 10 px" },
  "canvas.nudgeDown10": { batch: 22, label: "Canvas nudge 10 px" },
  // Batch 27: freeze frame, punch zoom.
  "edit.freezeFrame": { batch: 27, label: "Freeze frame" },
  "edit.punchZoom": { batch: 27, label: "Punch zoom" },
  // Batch 29: titles, subtitles, inline text editing.
  "add.title": { batch: 29, label: "Add title" },
  "add.subtitle": { batch: 29, label: "Add subtitle" },
  "text.edit": { batch: 29, label: "Edit text" },
  "text.commit": { batch: 29, label: "Commit text editing" },
  "text.cancel": { batch: 29, label: "Cancel text editing" },
  // Batch 36: transitions.
  "edit.defaultTransition": { batch: 36, label: "Default transition" },
  // Batch 39: clipboard and duplicate.
  "clipboard.cut": { batch: 39, label: "Cut" },
  "clipboard.copy": { batch: 39, label: "Copy" },
  "clipboard.paste": { batch: 39, label: "Paste" },
  "clipboard.pasteInsert": { batch: 39, label: "Paste insert" },
  "clipboard.pasteAttributes": { batch: 39, label: "Paste attributes" },
  "edit.duplicate": { batch: 39, label: "Duplicate" },
  // Batch 40: command palette.
  "app.commandPalette": { batch: 40, label: "Command palette" },
  // Batch 44: export.
  "app.export": { batch: 44, label: "Export" },
};

/** The dev toast for a bound key whose command is not built yet: `Fullscreen preview: coming in Batch 21`. */
export function plannedMessage(id: string): string | null {
  const planned = PLANNED_COMMANDS[id];
  return planned ? `${planned.label}: coming in Batch ${planned.batch}` : null;
}
