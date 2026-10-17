// Timeline toolbar content (spec §6.1, §17), left to right. Item ids are command ids: their icons and
// labels come from the command catalog (app/commandCatalog.ts), `label` only where the toolbar words it
// differently.

export type ToolbarItem =
  | { kind: "button"; id: string; label?: string; text?: string; toggle?: true }
  | { kind: "zoomSlider" }
  /** The favorite text presets as chips (spec §6.1: up to 8, from the Presets tab). */
  | { kind: "presetChips" };

export interface ToolbarGroup {
  id: string;
  label: string;
  /** Lower priority groups are hidden first when the toolbar overflows. */
  priority: number;
  items: readonly ToolbarItem[];
}

export const TOOLBAR_GROUPS: readonly ToolbarGroup[] = [
  {
    id: "tools",
    label: "Tools",
    priority: 5,
    items: [
      { kind: "button", id: "tool.select", toggle: true },
      { kind: "button", id: "tool.razor", toggle: true },
      { kind: "button", id: "tool.hand", toggle: true },
      { kind: "button", id: "tool.slip", toggle: true },
      { kind: "button", id: "tool.slide", toggle: true },
      { kind: "button", id: "tool.rateStretch", toggle: true },
    ],
  },
  {
    id: "toggles",
    label: "Toggles",
    priority: 2,
    items: [
      { kind: "button", id: "toggle.snap", toggle: true },
      { kind: "button", id: "toggle.linkedSelection", toggle: true },
      { kind: "button", id: "toggle.rippleMode", toggle: true },
      { kind: "button", id: "toggle.clipKeyframes", toggle: true },
      { kind: "button", id: "toggle.audioScrub", toggle: true },
    ],
  },
  {
    id: "edit",
    label: "Edit",
    priority: 4,
    items: [
      { kind: "button", id: "edit.split" },
      { kind: "button", id: "edit.delete" },
      { kind: "button", id: "edit.rippleDelete" },
      { kind: "button", id: "edit.closeGap" },
      { kind: "button", id: "edit.closeAllGaps", label: "Close all gaps (compact)" },
      { kind: "button", id: "marker.add" },
      { kind: "button", id: "edit.freezeFrame" },
      { kind: "button", id: "edit.punchZoom" },
    ],
  },
  {
    id: "add",
    label: "Add",
    priority: 3,
    items: [
      { kind: "button", id: "add.title", text: "Title" },
      { kind: "button", id: "add.subtitle", text: "Subtitle" },
      { kind: "button", id: "add.captionTrack" },
      { kind: "button", id: "add.solid" },
      { kind: "button", id: "add.image" },
      { kind: "presetChips" },
    ],
  },
  {
    id: "zoom",
    label: "Zoom",
    priority: 1,
    items: [
      { kind: "button", id: "timeline.zoomOut" },
      { kind: "zoomSlider" },
      { kind: "button", id: "timeline.zoomIn" },
      { kind: "button", id: "timeline.zoomFit" },
      { kind: "button", id: "timeline.zoomToSelection" },
      { kind: "button", id: "timeline.centerPlayhead" },
      { kind: "button", id: "timeline.trackHeightCycle" },
    ],
  },
];
