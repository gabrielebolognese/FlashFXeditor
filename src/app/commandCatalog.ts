// The command catalog (Batch 40, spec §3.6 "every user-facing action has exactly one command id"):
// the label, category, icon and search words of every command id. The CommandRegistry holds the
// handlers; buttons, menus, the command palette, the shortcut editor and the cheat sheet read their
// names and icons here, and the dev audit (app/commandAudit.ts) checks that both agree with the keymap.
import {
  ArrowUpDown,
  AudioLines,
  AudioWaveform,
  Blend,
  Bookmark,
  BookmarkCheck,
  BookmarkPlus,
  Brackets,
  BringToFront,
  Captions,
  ChevronLeft,
  ChevronRight,
  ChevronsDown,
  ChevronsLeftRight,
  Clipboard,
  ClipboardPaste,
  Command,
  Copy,
  CopyPlus,
  Crop,
  Delete,
  Diamond,
  Eraser,
  Expand,
  FileDown,
  FilePlus,
  FileUp,
  FlipHorizontal2,
  FlipVertical2,
  Focus,
  FoldHorizontal,
  FolderOpen,
  FolderSync,
  FolderX,
  Frame,
  Gauge,
  Grid3x3,
  Group,
  Hand,
  ImageDown,
  ImagePlus,
  Import,
  Keyboard,
  LayoutGrid,
  Link,
  List,
  LocateFixed,
  Lock,
  Magnet,
  Maximize,
  Maximize2,
  Merge,
  Mic,
  Moon,
  MousePointer2,
  MoveHorizontal,
  Paintbrush,
  Pause,
  Pencil,
  Plus,
  Redo2,
  Repeat,
  RotateCcw,
  Rows3,
  RulerDimensionLine,
  Save,
  ScanSearch,
  ScissorsLineDashed,
  Search,
  SendToBack,
  Settings,
  Shrink,
  SkipBack,
  SkipForward,
  Slice,
  Snowflake,
  Square,
  SquareSplitHorizontal,
  StepBack,
  StepForward,
  Subtitles,
  Sun,
  Tag,
  Timer,
  Trash2,
  TrendingDown,
  TrendingUp,
  Type,
  Undo2,
  Unlink2,
  Upload,
  VolumeX,
  Waves,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from "lucide-react";
import { EASE_LABELS, KEYFRAME_SECTIONS, SECTION_LABELS, type KeyframeSection } from "../core/document/keyframes.js";
import { TRANSITION_LABELS } from "../core/document/transitions.js";
import { EASE_IDS, LABEL_COLORS, TRANSITION_KINDS } from "../core/document/types.js";
import type { FocusScope } from "../core/keyboard/focusScope.js";
import { FADE_PRESET_SECONDS } from "../timeline/edit/fades.js";
import { LABEL_NAMES } from "../timeline/menus/labelSwatches.js";

/** Palette and cheat sheet groups, in their order. */
export const COMMAND_CATEGORIES = [
  "Transport",
  "Timeline",
  "Edit",
  "Clipboard",
  "Selection",
  "Clip",
  "Speed",
  "Fades and transitions",
  "Keyframes",
  "Audio",
  "Markers and range",
  "Tracks",
  "Tools",
  "Toggles",
  "Add",
  "Text",
  "Captions",
  "Presets",
  "Canvas",
  "Preview",
  "Media",
  "Project",
  "App",
  "Dev",
] as const;
export type CommandCategory = (typeof COMMAND_CATEGORIES)[number];

export interface CommandInfo {
  id: string;
  label: string;
  category: CommandCategory;
  icon?: LucideIcon;
  /** Other words the palette finds it by. */
  keywords?: string;
  /**
   * False: a row of one menu that needs what was right-clicked (a preset card, a ruler frame), or a key
   * that only means something mid-gesture (Esc, the text editor's own keys): not in the palette.
   */
  palette?: false;
  /** Where its keys act when the keymap has no default for it (the shortcut editor adds one). Global otherwise. */
  scopes?: readonly FocusScope[];
  /** Runs with no project open (the start screen). */
  anywhere?: true;
  /** Registered in dev builds only. */
  dev?: true;
}

const TL: readonly FocusScope[] = ["timeline"];
const PV: readonly FocusScope[] = ["preview"];
const MEDIA: readonly FocusScope[] = ["media"];

type Extra = Omit<CommandInfo, "id" | "label" | "category">;
const entry = (category: CommandCategory) => (id: string, label: string, extra: Extra = {}): CommandInfo => ({ id, label, category, ...extra });

const transport = entry("Transport");
const timeline = entry("Timeline");
const edit = entry("Edit");
const clipboard = entry("Clipboard");
const selection = entry("Selection");
const clip = entry("Clip");
const speed = entry("Speed");
const fades = entry("Fades and transitions");
const keyframes = entry("Keyframes");
const audio = entry("Audio");
const markers = entry("Markers and range");
const tracks = entry("Tracks");
const tools = entry("Tools");
const toggles = entry("Toggles");
const add = entry("Add");
const text = entry("Text");
const captions = entry("Captions");
const presets = entry("Presets");
const canvas = entry("Canvas");
const preview = entry("Preview");
const media = entry("Media");
const project = entry("Project");
const app = entry("App");
const dev = entry("Dev");

/** The keyframe sections with a stopwatch in the properties panel, and those a clip's lane can show. */
export const PANEL_SECTIONS: readonly KeyframeSection[] = KEYFRAME_SECTIONS;
export const LANE_SECTIONS: readonly KeyframeSection[] = ["transform", "opacity"];
/** The command id of a fade preset of the clip menu (spec §6.16: 0.25 s, 0.5 s, 1 s). */
export const fadePresetId = (edge: "in" | "out", seconds: number) => `clip.fade${edge === "in" ? "In" : "Out"}.${Math.round(seconds * 100)}`;
/** The quick row's speed chips (spec §17). */
export const SPEED_CHIPS: readonly { id: string; speed: number }[] = [
  { id: "clip.speed.50", speed: 0.5 },
  { id: "clip.speed.100", speed: 1 },
  { id: "clip.speed.150", speed: 1.5 },
  { id: "clip.speed.200", speed: 2 },
];
export const PREVIEW_QUALITIES = ["auto", "full", "proxy", "half", "quarter"] as const;
const QUALITY_LABELS: Record<(typeof PREVIEW_QUALITIES)[number], string> = { auto: "Auto", full: "Full", proxy: "Proxy", half: "1/2", quarter: "1/4" };
export const SAFE_ZONE_IDS = ["none", "reels", "tiktok", "shorts"] as const;
const SAFE_ZONE_LABELS: Record<(typeof SAFE_ZONE_IDS)[number], string> = { none: "None", reels: "Reels", tiktok: "TikTok", shorts: "Shorts" };
export const GRID_IDS = ["none", "thirds", "squares", "custom"] as const;
const GRID_LABELS: Record<(typeof GRID_IDS)[number], string> = { none: "None", thirds: "Thirds", squares: "Squares", custom: "Custom" };
const NUDGES = [
  ["Left", "left"],
  ["Right", "right"],
  ["Up", "up"],
  ["Down", "down"],
] as const;

export const COMMANDS: readonly CommandInfo[] = [
  // Transport (spec §8, §18)
  transport("transport.playPause", "Play / Pause", { icon: Pause, keywords: "start stop playback" }),
  transport("transport.shuttleBack", "Shuttle back", { icon: SkipBack, keywords: "reverse rewind J" }),
  transport("transport.shuttleStop", "Shuttle pause", { keywords: "stop K" }),
  transport("transport.shuttleForward", "Shuttle forward", { icon: SkipForward, keywords: "fast forward L" }),
  transport("transport.stepBack", "Previous frame", { icon: StepBack, keywords: "step back" }),
  transport("transport.stepForward", "Next frame", { icon: StepForward, keywords: "step forward" }),
  transport("transport.stepBack5", "Back 5 frames", { keywords: "step" }),
  transport("transport.stepForward5", "Forward 5 frames", { keywords: "step" }),
  transport("transport.stepBack1s", "Back 1 second", { keywords: "step" }),
  transport("transport.stepForward1s", "Forward 1 second", { keywords: "step" }),
  transport("transport.goToStart", "Go to start", { icon: SkipBack, keywords: "home beginning" }),
  transport("transport.goToEnd", "Go to end", { icon: SkipForward }),
  transport("transport.playAround", "Play around the playhead"),
  transport("transport.playInToOut", "Play in to out", { icon: Brackets, keywords: "range" }),
  transport("transport.toggleLoop", "Loop playback", { icon: Repeat, keywords: "repeat" }),

  // Timeline navigation and view (spec §6.6, §6.13, §18)
  timeline("timeline.prevEditPoint", "Previous edit point", { keywords: "cut jump" }),
  timeline("timeline.nextEditPoint", "Next edit point", { keywords: "cut jump" }),
  timeline("timeline.prevMarker", "Previous marker"),
  timeline("timeline.nextMarker", "Next marker"),
  timeline("timeline.zoomIn", "Zoom in", { icon: ZoomIn }),
  timeline("timeline.zoomOut", "Zoom out", { icon: ZoomOut }),
  timeline("timeline.zoomFit", "Zoom to fit", { icon: Expand, keywords: "whole timeline" }),
  timeline("timeline.zoomToSelection", "Zoom to selection", { icon: ScanSearch }),
  timeline("timeline.centerPlayhead", "Center playhead", { icon: LocateFixed }),
  timeline("timeline.trackHeightUp", "Taller selected tracks", { keywords: "track height" }),
  timeline("timeline.trackHeightDown", "Shorter selected tracks", { keywords: "track height" }),
  timeline("timeline.trackHeightCycle", "Track height", { icon: Rows3, keywords: "small medium large all tracks" }),
  timeline("view.toggleTimecodeFormat", "Timecode: frames or milliseconds", { keywords: "ff ms format" }),

  // Editing (spec §6.10, §6.11, §18)
  edit("edit.split", "Split at playhead", { icon: SquareSplitHorizontal, keywords: "cut razor blade" }),
  edit("edit.splitAll", "Split all tracks at playhead", { icon: SquareSplitHorizontal, keywords: "cut razor" }),
  edit("edit.delete", "Delete", { icon: Trash2, keywords: "remove" }),
  edit("edit.rippleDelete", "Ripple delete", { icon: Delete, keywords: "remove close gap" }),
  edit("edit.rippleTrimPrev", "Ripple trim start to playhead", { keywords: "Q" }),
  edit("edit.rippleTrimNext", "Ripple trim end to playhead", { keywords: "W" }),
  edit("edit.extendToPlayhead", "Extend edit to playhead"),
  edit("edit.closeGap", "Close gap", { icon: FoldHorizontal }),
  edit("edit.closeAllGaps", "Close all gaps", { icon: Shrink, keywords: "compact remove gaps" }),
  edit("edit.closeAllGapsOnTrack", "Close all gaps on track", { keywords: "compact", scopes: TL }),
  edit("edit.lift", "Lift in/out range", { keywords: "remove range leave gap" }),
  edit("edit.extract", "Extract in/out range", { keywords: "remove range ripple" }),
  edit("edit.freezeFrame", "Freeze frame at playhead", { icon: Snowflake, keywords: "hold still" }),
  edit("edit.punchZoom", "Punch zoom at playhead", { icon: Focus, keywords: "zoom in cut" }),
  edit("edit.duplicate", "Duplicate", { icon: CopyPlus, keywords: "copy" }),
  edit("edit.defaultTransition", "Add default transition", { icon: Blend, keywords: "dissolve" }),
  edit("edit.group", "Group", { icon: Group }),
  edit("edit.ungroup", "Ungroup"),
  edit("edit.toggleLink", "Link / Unlink", { icon: Link, keywords: "audio video sync" }),
  edit("edit.moveIntoSync", "Move into sync", { keywords: "linked offset", scopes: TL }),
  edit("edit.nudgeLeft", "Nudge clips 1 frame left"),
  edit("edit.nudgeRight", "Nudge clips 1 frame right"),
  edit("edit.nudgeLeft5", "Nudge clips 5 frames left"),
  edit("edit.nudgeRight5", "Nudge clips 5 frames right"),
  edit("edit.moveToTrackAbove", "Move clips to the track above"),
  edit("edit.moveToTrackBelow", "Move clips to the track below"),
  edit("edit.rename", "Rename", { icon: Pencil, keywords: "clip media track name" }),
  edit("history.undo", "Undo", { icon: Undo2 }),
  edit("history.redo", "Redo", { icon: Redo2 }),

  // Clipboard (spec §18, Batch 39)
  clipboard("clipboard.cut", "Cut", { icon: ScissorsLineDashed }),
  clipboard("clipboard.copy", "Copy", { icon: Copy }),
  clipboard("clipboard.paste", "Paste", { icon: ClipboardPaste, keywords: "overwrite at playhead" }),
  clipboard("clipboard.pasteInsert", "Paste insert", { icon: ClipboardPaste, keywords: "ripple" }),
  clipboard("clipboard.pasteAttributes", "Paste attributes…", { icon: Clipboard, keywords: "style transform effects" }),

  // Selection
  selection("selection.selectAll", "Select all"),
  selection("selection.deselect", "Deselect all", { keywords: "clear selection" }),

  // Clip (spec §6.16, §11)
  clip("clip.toggleEnabled", "Enable / Disable clip", { keywords: "turn off hide" }),
  clip("clip.revealMedia", "Reveal in media panel", { icon: Search, keywords: "find source" }),
  ...LABEL_COLORS.map((color) => clip(`clip.label.${color}`, `Label: ${LABEL_NAMES[color]}`, { icon: Tag, keywords: "color" })),
  clip("clip.label.none", "Remove label", { icon: Tag, keywords: "color" }),
  clip("transform.fit", "Fit in frame", { icon: Shrink, keywords: "match project size" }),
  clip("transform.fill", "Fill frame", { icon: Maximize2, keywords: "match project size cover" }),
  clip("transform.center", "Center in frame", { icon: Focus }),
  clip("transform.flipH", "Flip horizontal", { icon: FlipHorizontal2, keywords: "mirror" }),
  clip("transform.flipV", "Flip vertical", { icon: FlipVertical2, keywords: "mirror" }),
  clip("transform.reset", "Reset transform", { icon: RotateCcw }),
  clip("crop.toFrame", "Crop to frame", { icon: Frame }),
  clip("crop.reset", "Reset crop", { icon: RotateCcw }),
  clip("crop.toggleMode", "Crop mode", { icon: Crop, keywords: "enter leave crop" }),

  // Speed (spec §11, Batch 27)
  speed("clip.speedPanel", "Speed…", { icon: Gauge, keywords: "rate duration" }),
  ...SPEED_CHIPS.map((chip) => speed(chip.id, `Speed ${chip.speed}x`, { keywords: "rate" })),

  // Fades and transitions (spec §6.15, Batch 36)
  fades("clip.fadeIn", "Fade in 0.5 s", { icon: TrendingUp }),
  fades("clip.fadeOut", "Fade out 0.5 s", { icon: TrendingDown }),
  ...FADE_PRESET_SECONDS.flatMap((seconds) => [fades(fadePresetId("in", seconds), `Fade in ${seconds} s`, { icon: TrendingUp }), fades(fadePresetId("out", seconds), `Fade out ${seconds} s`, { icon: TrendingDown })]),
  ...TRANSITION_KINDS.map((kind) => fades(`transition.add.${kind}`, `Add ${TRANSITION_LABELS[kind].toLowerCase()}`, { icon: kind === "crossDissolve" ? Blend : kind === "dipToBlack" ? Moon : Sun, keywords: "transition" })),
  fades("transition.delete", "Delete transition", { icon: Trash2 }),

  // Keyframes (spec §6.15, §11, Batch 35)
  keyframes("toggle.clipKeyframes", "Show clip keyframes", { icon: Diamond, keywords: "lane" }),
  ...PANEL_SECTIONS.flatMap((section) => {
    const name = SECTION_LABELS[section];
    return [
      keyframes(`keyframes.stopwatch.${section}`, `Animate ${name.toLowerCase()} (stopwatch)`, { icon: Timer }),
      keyframes(`keyframes.toggle.${section}`, `${name}: add / remove keyframe at playhead`, { icon: Diamond }),
      keyframes(`keyframes.prev.${section}`, `${name}: previous keyframe`, { icon: ChevronLeft }),
      keyframes(`keyframes.next.${section}`, `${name}: next keyframe`, { icon: ChevronRight }),
    ];
  }),
  ...LANE_SECTIONS.map((section) => keyframes(`keyframes.lane.${section}`, `Show keyframes for ${SECTION_LABELS[section].toLowerCase()}`, { icon: Diamond })),
  ...EASE_IDS.map((ease) => keyframes(`keyframe.ease.${ease}`, `Keyframe easing: ${EASE_LABELS[ease]}`, { keywords: "ease interpolation" })),
  keyframes("keyframe.delete", "Delete selected keyframes", { icon: Trash2 }),
  keyframes("keyframe.copy", "Copy selected keyframes", { icon: Copy }),
  keyframes("keyframe.paste", "Paste keyframes", { icon: ClipboardPaste }),

  // Audio (spec §14, Batches 10, 37, 38)
  audio("audio.toggleMute", "Mute monitoring", { icon: VolumeX, keywords: "sound preview speaker" }),
  audio("audio.resetMeters", "Reset the clip indicators", { keywords: "meter peak" }),
  audio("clip.mute", "Mute / Unmute clip audio", { icon: VolumeX }),
  audio("audio.normalize", "Normalize", { icon: AudioLines, keywords: "gain loudness peak" }),
  audio("audio.autoDuck", "Auto-duck music", { icon: ChevronsDown, keywords: "lower ducking voice" }),
  audio("audio.detach", "Detach audio", { icon: Unlink2, keywords: "separate sound" }),
  audio("audio.removeSilence", "Remove silence", { icon: ScissorsLineDashed, keywords: "pauses cut auto" }),
  audio("audio.removeSilence.apply", "Remove silence: apply", { keywords: "cut pauses" }),
  audio("audio.removeSilence.cancel", "Remove silence: cancel"),

  // Markers and range (spec §6.13)
  markers("marker.add", "Add marker", { icon: Bookmark }),
  markers("marker.addHere", "Add marker here", { icon: Bookmark, palette: false }),
  markers("marker.edit", "Edit marker"),
  markers("marker.delete", "Delete marker", { icon: Trash2 }),
  markers("range.markIn", "Mark in", { keywords: "in point" }),
  markers("range.markOut", "Mark out", { keywords: "out point" }),
  markers("range.clearIn", "Clear in"),
  markers("range.clearOut", "Clear out"),
  markers("range.clearInOut", "Clear in and out", { keywords: "range" }),
  markers("range.goToIn", "Go to in"),
  markers("range.goToOut", "Go to out"),
  markers("range.markClip", "Mark clip", { keywords: "in out range" }),
  markers("range.toSelection", "Set in/out to selection", { keywords: "range" }),

  // Tracks (spec §6.12, §6.16)
  tracks("track.addVideoAbove", "Add video track above", { icon: Plus, scopes: TL }),
  tracks("track.addVideoBelow", "Add video track below", { icon: Plus, scopes: TL }),
  tracks("track.addVideo", "Add video track", { icon: Plus }),
  tracks("track.addAudioAbove", "Add audio track above", { icon: Plus, scopes: TL }),
  tracks("track.addAudioBelow", "Add audio track below", { icon: Plus, scopes: TL }),
  tracks("track.addAudio", "Add audio track", { icon: Plus }),
  tracks("track.rename", "Rename track", { icon: Pencil, scopes: TL }),
  tracks("track.delete", "Delete track", { icon: Trash2, scopes: TL }),
  tracks("track.deleteEmpty", "Delete empty tracks"),
  tracks("track.heightS", "Track height S", { scopes: TL }),
  tracks("track.heightM", "Track height M", { scopes: TL }),
  tracks("track.heightL", "Track height L", { scopes: TL }),
  tracks("track.selectClips", "Select all clips on track", { scopes: TL }),
  tracks("track.lockAll", "Lock / Unlock all tracks", { icon: Lock }),
  tracks("track.muteOthers", "Mute all other tracks", { icon: VolumeX, scopes: TL }),

  // Tools (spec §6.1)
  tools("tool.select", "Select tool", { icon: MousePointer2 }),
  tools("tool.razor", "Razor tool", { icon: Slice, keywords: "blade cut" }),
  tools("tool.hand", "Hand tool", { icon: Hand, keywords: "pan" }),
  tools("tool.slip", "Slip tool", { icon: MoveHorizontal }),
  tools("tool.slide", "Slide tool", { icon: ChevronsLeftRight }),
  tools("tool.rateStretch", "Rate stretch tool", { icon: Gauge, keywords: "speed" }),

  // Toggles
  toggles("toggle.snap", "Snap", { icon: Magnet, keywords: "snapping magnet" }),
  toggles("toggle.linkedSelection", "Linked selection", { icon: Link }),
  toggles("toggle.rippleMode", "Ripple mode", { icon: Waves }),
  toggles("toggle.audioScrub", "Audio scrub", { icon: AudioWaveform, keywords: "scrubbing sound" }),

  // Add (spec §17 timeline toolbar)
  add("add.title", "Add title", { icon: Type, keywords: "text" }),
  add("add.subtitle", "Add subtitle", { icon: Subtitles, keywords: "text lower" }),
  add("add.captionTrack", "Add caption track", { icon: Captions }),
  add("add.solid", "Add solid", { icon: Square, keywords: "color shape" }),
  add("add.image", "Add image", { icon: ImagePlus, keywords: "picture photo" }),

  // Text (spec §7.7)
  text("text.edit", "Edit text", { icon: Type, keywords: "inline typing" }),
  text("text.commit", "Finish editing text", { palette: false }),
  text("text.cancel", "Leave text editing", { palette: false }),

  // Captions (spec §10.5, §10.6)
  captions("captions.addCue", "Add cue at playhead", { icon: Plus }),
  captions("captions.import", "Import SRT/VTT", { icon: FileUp, keywords: "subtitles captions file" }),
  captions("captions.export", "Export SRT/VTT", { icon: FileDown, keywords: "subtitles captions file" }),
  captions("captions.style", "Caption style", { icon: Paintbrush }),
  captions("captions.clear", "Clear all cues", { icon: Eraser }),
  captions("captions.transcribe", "Transcribe", { icon: Mic, keywords: "speech to text whisper auto captions" }),
  captions("caption.mergePrevious", "Merge with previous cue", { icon: Merge }),
  captions("caption.editText", "Edit cue text", { icon: Pencil, scopes: MEDIA }),

  // Presets (spec §10.3)
  presets("preset.save", "Save as preset", { icon: BookmarkPlus, keywords: "new preset from selection text style" }),
  presets("preset.update", "Update preset", { icon: BookmarkCheck }),
  presets("presets.import", "Import presets", { icon: FileUp }),
  presets("presets.export", "Export presets", { icon: FileDown }),
  presets("presets.showGlobal", "Presets: global", { keywords: "library" }),
  presets("presets.showProject", "Presets: this project"),
  presets("presets.chooseFolder", "Presets library folder…", { icon: FolderOpen }),
  presets("presets.syncFolder", "Sync the presets library folder", { icon: FolderSync }),
  presets("presets.stopFolder", "Stop syncing the presets library folder", { icon: FolderX }),
  presets("preset.apply", "Apply preset", { palette: false }),
  presets("preset.addAtPlayhead", "Add preset at playhead", { palette: false }),
  presets("preset.defaultTitle", "Use as default title", { palette: false }),
  presets("preset.defaultSubtitle", "Use as default subtitle", { palette: false }),
  presets("preset.favorite", "Favorite preset", { palette: false }),
  presets("preset.applyPosition", "Preset applies its position", { palette: false }),
  presets("preset.rename", "Rename preset", { palette: false }),
  presets("preset.duplicate", "Duplicate preset", { palette: false }),
  presets("preset.export", "Export preset…", { palette: false }),
  presets("preset.delete", "Delete preset", { palette: false }),

  // Canvas (spec §7)
  ...NUDGES.flatMap(([name, word]) => [
    canvas(`canvas.nudge${name}`, `Nudge layers 1 px ${word}`, { scopes: PV }),
    canvas(`canvas.nudge${name}10`, `Nudge layers 10 px ${word}`, { scopes: PV }),
  ]),
  canvas("canvas.bringForward", "Bring forward", { icon: BringToFront, keywords: "track above order" }),
  canvas("canvas.sendBackward", "Send backward", { icon: SendToBack, keywords: "track below order" }),
  canvas("canvas.lockTrack", "Lock the layer's track", { icon: Lock }),
  canvas("canvas.duplicate", "Duplicate layer (+20 px)", { icon: CopyPlus, scopes: PV }),
  canvas("canvas.zoomFit", "Preview zoom: Fit", { icon: Expand }),
  canvas("canvas.zoom25", "Preview zoom 25%"),
  canvas("canvas.zoom50", "Preview zoom 50%"),
  canvas("canvas.zoom100", "Preview zoom 100%"),
  canvas("canvas.zoom200", "Preview zoom 200%"),
  canvas("canvas.zoom400", "Preview zoom 400%"),

  // Preview (spec §7.5, §7.6, §13)
  preview("preview.toggleFullscreen", "Fullscreen preview", { icon: Maximize }),
  preview("preview.exportFrame", "Export frame", { icon: ImageDown, keywords: "still png snapshot" }),
  preview("preview.toggleGuides", "Smart guides", { icon: RulerDimensionLine }),
  ...PREVIEW_QUALITIES.map((quality) => preview(`preview.quality.${quality}`, `Preview quality: ${QUALITY_LABELS[quality]}`)),
  ...SAFE_ZONE_IDS.map((zone) => preview(`preview.safeZone.${zone}`, `Safe zone: ${SAFE_ZONE_LABELS[zone]}`, { icon: Grid3x3 })),
  ...GRID_IDS.map((grid) => preview(`preview.grid.${grid}`, `Grid: ${GRID_LABELS[grid]}`, { icon: Grid3x3 })),
  preview("preview.gridCellsFewer", "Custom grid: fewer cells"),
  preview("preview.gridCellsMore", "Custom grid: more cells"),
  preview("preview.toggleCenterCross", "Center cross", { keywords: "overlay guide" }),
  preview("preview.toggleSafeMargins", "Title / action safe", { keywords: "overlay margins" }),
  preview("preview.toggleRulers", "Rulers above 100%", { keywords: "overlay" }),
  preview("preview.togglePixelGrid", "Pixel grid from 800%", { keywords: "overlay" }),

  // Media (spec §12)
  media("media.import", "Import media", { icon: Import, keywords: "add files video audio" }),
  media("media.insertAtPlayhead", "Insert media at playhead", { keywords: "ripple" }),
  media("media.overwriteAtPlayhead", "Overwrite media at playhead"),
  media("media.addToCanvas", "Add media to canvas", { scopes: MEDIA }),
  media("media.generateProxy", "Generate proxy", { scopes: MEDIA }),
  media("media.removeProxy", "Remove proxy", { scopes: MEDIA }),
  media("media.regenerateThumbnails", "Regenerate thumbnails", { scopes: MEDIA }),
  media("media.viewGrid", "Media: grid view", { icon: LayoutGrid }),
  media("media.viewList", "Media: list view", { icon: List }),
  media("media.toggleSortDirection", "Media: ascending / descending", { icon: ArrowUpDown, keywords: "sort order" }),
  media("panel.media", "Show the Media tab", { keywords: "panel" }),
  media("panel.presets", "Show the Presets tab", { keywords: "panel text" }),
  media("panel.captions", "Show the Captions tab", { keywords: "panel subtitles cues" }),

  // Project (spec §15)
  project("project.new", "New project", { icon: FilePlus, anywhere: true }),
  project("project.open", "Open project", { icon: FolderOpen, anywhere: true }),
  project("project.save", "Save now", { icon: Save }),
  project("project.rename", "Rename project", { icon: Pencil }),
  project("project.allowEditing", "Allow editing (read-only project)", { keywords: "unlock write" }),

  // App
  app("app.commandPalette", "Command palette", { icon: Command, anywhere: true, palette: false }),
  app("app.shortcuts", "Keyboard shortcuts", { icon: Keyboard, keywords: "cheat sheet keys help", anywhere: true }),
  app("app.settings", "Settings", { icon: Settings, keywords: "preferences shortcuts keymap rebind", anywhere: true }),
  app("app.export", "Export", { icon: Upload, keywords: "render mp4" }),
  app("app.cancel", "Cancel gesture / close", { palette: false }),

  // Dev builds only
  dev("dev.addText", "Add a dev text", { dev: true }),
  dev("dev.generateTimeline", "Generate a test timeline", { dev: true }),
  dev("dev.toggleGpuStats", "GPU stats", { icon: Gauge, dev: true }),
  dev("dev.toggleTimelineStats", "Timeline stats", { icon: Gauge, dev: true }),
];

const BY_ID = new Map(COMMANDS.map((info) => [info.id, info]));

export function commandInfo(id: string): CommandInfo | undefined {
  return BY_ID.get(id);
}

/** The command's label, or its id when the catalog has none (the audit reports that). */
export function commandLabel(id: string): string {
  return BY_ID.get(id)?.label ?? id;
}

/** Where a command's keys act when the keymap has none for it (the shortcut editor). */
export function commandScopes(id: string): readonly FocusScope[] {
  return BY_ID.get(id)?.scopes ?? ["global"];
}
