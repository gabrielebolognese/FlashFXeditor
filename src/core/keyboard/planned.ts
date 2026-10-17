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
  // Batch 39: clipboard (Duplicate, Mod+D, is registered since Batch 25).
  "clipboard.cut": { batch: 39, label: "Cut" },
  "clipboard.copy": { batch: 39, label: "Copy" },
  "clipboard.paste": { batch: 39, label: "Paste" },
  "clipboard.pasteInsert": { batch: 39, label: "Paste insert" },
  "clipboard.pasteAttributes": { batch: 39, label: "Paste attributes" },
  // Batch 40: command palette.
  "app.commandPalette": { batch: 40, label: "Command palette" },
  // Batch 44: export.
  "app.export": { batch: 44, label: "Export" },
};

/** The dev toast for a bound key whose command is not built yet: `Add title: coming in Batch 29`. */
export function plannedMessage(id: string): string | null {
  const planned = PLANNED_COMMANDS[id];
  return planned ? `${planned.label}: coming in Batch ${planned.batch}` : null;
}
