// The preset card menu (spec §10.3 "Right-click card"), shared by the Presets tab's cards and the
// preset bar's buttons (spec §20.2 "right-click opens the preset card menu"). Every row is a `preset.*`
// command run with the preset's id (presetController).
import { appliesToCaptions, presetSourceClip } from "../../app/presetController.js";
import type { TextPreset } from "../../core/document/types.js";
import type { ContextMenuEntry } from "../../ui/ContextMenu.js";

export const PRESET_MENU = {
  apply: "preset.apply",
  defaultTitle: "preset.defaultTitle",
  defaultSubtitle: "preset.defaultSubtitle",
  favorite: "preset.favorite",
  inTitles: "preset.inTitles",
  inSubtitles: "preset.inSubtitles",
  inCaptions: "preset.inCaptions",
  applyPosition: "preset.applyPosition",
  rename: "preset.rename",
  tags: "preset.editTags",
  duplicate: "preset.duplicate",
  export: "preset.export",
  delete: "preset.delete",
} as const;

/** The rows for `preset`; `writable`: its scope can change (a read-only project's cannot). */
export function presetMenuEntries(preset: TextPreset, writable: boolean, defaults: { title: string | null; subtitle: string | null }): ContextMenuEntry[] {
  const inSet = (set: "titles" | "subtitles" | "captions") => preset.sets?.includes(set) ?? false;
  return [
    { kind: "item", id: PRESET_MENU.apply, label: presetSourceClip() ? "Apply to selected text" : appliesToCaptions() ? "Apply to captions" : "Add at playhead" },
    { kind: "separator" },
    { kind: "item", id: PRESET_MENU.defaultTitle, label: "Use as default title", commandId: "add.title", active: defaults.title === preset.id },
    { kind: "item", id: PRESET_MENU.defaultSubtitle, label: "Use as default subtitle", commandId: "add.subtitle", active: defaults.subtitle === preset.id },
    { kind: "item", id: PRESET_MENU.applyPosition, label: "Apply position", active: preset.applyPosition, disabled: !writable },
    { kind: "heading", label: "Preset bar sets" },
    { kind: "item", id: PRESET_MENU.favorite, label: "Favorites", active: preset.favorite, disabled: !writable, keepOpen: true },
    { kind: "item", id: PRESET_MENU.inTitles, label: "Titles", active: inSet("titles"), disabled: !writable, keepOpen: true },
    { kind: "item", id: PRESET_MENU.inSubtitles, label: "Subtitles", active: inSet("subtitles"), disabled: !writable, keepOpen: true },
    { kind: "item", id: PRESET_MENU.inCaptions, label: "Captions", active: inSet("captions"), disabled: !writable, keepOpen: true },
    { kind: "item", id: PRESET_MENU.tags, label: "Tags…", disabled: !writable },
    { kind: "separator" },
    { kind: "item", id: PRESET_MENU.rename, label: "Rename", disabled: !writable },
    { kind: "item", id: PRESET_MENU.duplicate, label: "Duplicate", disabled: !writable },
    { kind: "item", id: PRESET_MENU.export, label: "Export…" },
    { kind: "item", id: PRESET_MENU.delete, label: "Delete", disabled: !writable },
  ];
}
