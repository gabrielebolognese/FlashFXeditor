// Timeline toolbar content (spec §6.1), left to right. Item ids are command ids.
import {
  AudioWaveform,
  Bookmark,
  ChevronsLeftRight,
  Delete,
  Diamond,
  Expand,
  Focus,
  FoldHorizontal,
  Gauge,
  Hand,
  ImagePlus,
  Link,
  Magnet,
  MousePointer2,
  MoveHorizontal,
  Rows3,
  ScanSearch,
  Captions,
  Shrink,
  Slice,
  Snowflake,
  Square,
  SquareSplitHorizontal,
  Subtitles,
  Trash2,
  Type,
  Waves,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from "lucide-react";

export type ToolbarItem =
  | { kind: "button"; id: string; label: string; icon: LucideIcon; text?: string; toggle?: true }
  | { kind: "zoomSlider" };

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
      { kind: "button", id: "tool.select", label: "Select", icon: MousePointer2, toggle: true },
      { kind: "button", id: "tool.razor", label: "Razor", icon: Slice, toggle: true },
      { kind: "button", id: "tool.hand", label: "Hand", icon: Hand, toggle: true },
      { kind: "button", id: "tool.slip", label: "Slip", icon: MoveHorizontal, toggle: true },
      { kind: "button", id: "tool.slide", label: "Slide", icon: ChevronsLeftRight, toggle: true },
      { kind: "button", id: "tool.rateStretch", label: "Rate stretch", icon: Gauge, toggle: true },
    ],
  },
  {
    id: "toggles",
    label: "Toggles",
    priority: 2,
    items: [
      { kind: "button", id: "toggle.snap", label: "Snap", icon: Magnet, toggle: true },
      { kind: "button", id: "toggle.linkedSelection", label: "Linked selection", icon: Link, toggle: true },
      { kind: "button", id: "toggle.rippleMode", label: "Ripple mode", icon: Waves, toggle: true },
      { kind: "button", id: "toggle.clipKeyframes", label: "Show clip keyframes", icon: Diamond, toggle: true },
      { kind: "button", id: "toggle.audioScrub", label: "Audio scrub", icon: AudioWaveform, toggle: true },
    ],
  },
  {
    id: "edit",
    label: "Edit",
    priority: 4,
    items: [
      { kind: "button", id: "edit.split", label: "Split at playhead", icon: SquareSplitHorizontal },
      { kind: "button", id: "edit.delete", label: "Delete", icon: Trash2 },
      { kind: "button", id: "edit.rippleDelete", label: "Ripple delete", icon: Delete },
      { kind: "button", id: "edit.closeGap", label: "Close gap", icon: FoldHorizontal },
      { kind: "button", id: "edit.closeAllGaps", label: "Close all gaps (compact)", icon: Shrink },
      { kind: "button", id: "marker.add", label: "Add marker", icon: Bookmark },
      { kind: "button", id: "edit.freezeFrame", label: "Freeze frame", icon: Snowflake },
      { kind: "button", id: "edit.punchZoom", label: "Punch zoom", icon: Focus },
    ],
  },
  {
    id: "add",
    label: "Add",
    priority: 3,
    // TODO(batch 30): favorite text presets as chips (up to 8) after these buttons.
    items: [
      { kind: "button", id: "add.title", label: "Add title", icon: Type, text: "Title" },
      { kind: "button", id: "add.subtitle", label: "Add subtitle", icon: Subtitles, text: "Subtitle" },
      { kind: "button", id: "add.captionTrack", label: "Add caption track", icon: Captions },
      { kind: "button", id: "add.solid", label: "Add solid", icon: Square },
      { kind: "button", id: "add.image", label: "Add image", icon: ImagePlus },
    ],
  },
  {
    id: "zoom",
    label: "Zoom",
    priority: 1,
    items: [
      { kind: "button", id: "timeline.zoomOut", label: "Zoom out", icon: ZoomOut },
      { kind: "zoomSlider" },
      { kind: "button", id: "timeline.zoomIn", label: "Zoom in", icon: ZoomIn },
      { kind: "button", id: "timeline.zoomFit", label: "Zoom to fit", icon: Expand },
      { kind: "button", id: "timeline.zoomToSelection", label: "Zoom to selection", icon: ScanSearch },
      // TODO(batch 18): the Center playhead button (spec §6.6; `Mod+Shift+.` works since Batch 14).
      { kind: "button", id: "timeline.trackHeightCycle", label: "Track height", icon: Rows3 },
    ],
  },
];
