// Default keymap (spec §18, BINDING): the single source of shortcut data. Shortcuts dispatch command
// ids; buttons, context menus and the command palette use the same ids.
import type { FocusScope } from "./focusScope.js";

export interface KeyBinding {
  /** Command id. One id per user-facing action. */
  id: string;
  /** Keymap strings; `Mod` = Ctrl on Windows/Linux, Cmd on macOS. */
  keys: readonly string[];
  scopes: readonly FocusScope[];
  /**
   * Held keys (J/K/L, frame stepping): OS key repeats are suppressed and a matching key-up is
   * dispatched with phase "up" so the handler can run its own repeat/acceleration (spec §3.6, §8).
   */
  hold?: true;
}

const G: readonly FocusScope[] = ["global"];
const TL: readonly FocusScope[] = ["timeline"];
const PV: readonly FocusScope[] = ["preview"];
const TL_PV: readonly FocusScope[] = ["timeline", "preview"];

export const DEFAULT_KEYMAP: readonly KeyBinding[] = [
  // Transport
  { id: "transport.playPause", keys: ["Space"], scopes: G },
  { id: "transport.shuttleBack", keys: ["J"], scopes: G, hold: true },
  { id: "transport.shuttleStop", keys: ["K"], scopes: G, hold: true },
  { id: "transport.shuttleForward", keys: ["L"], scopes: G, hold: true },
  { id: "transport.stepBack", keys: ["Left"], scopes: G, hold: true },
  { id: "transport.stepForward", keys: ["Right"], scopes: G, hold: true },
  { id: "transport.stepBack5", keys: ["Shift+Left"], scopes: G, hold: true },
  { id: "transport.stepForward5", keys: ["Shift+Right"], scopes: G, hold: true },
  { id: "transport.stepBack1s", keys: ["Mod+Left"], scopes: G, hold: true },
  { id: "transport.stepForward1s", keys: ["Mod+Right"], scopes: G, hold: true },
  { id: "transport.goToStart", keys: ["Home"], scopes: G },
  { id: "transport.goToEnd", keys: ["End"], scopes: G },
  { id: "transport.playAround", keys: ["Shift+K"], scopes: G },
  { id: "transport.playInToOut", keys: ["Mod+Shift+Space"], scopes: G },
  { id: "transport.toggleLoop", keys: ["Mod+Shift+L"], scopes: G },

  // Timeline navigation
  { id: "timeline.prevEditPoint", keys: ["Up"], scopes: TL },
  { id: "timeline.nextEditPoint", keys: ["Down"], scopes: TL },
  // §18 Shift+Up/Down; §6.13 also names Mod+Shift+M / Shift+M.
  { id: "timeline.prevMarker", keys: ["Shift+Up", "Mod+Shift+M"], scopes: TL },
  { id: "timeline.nextMarker", keys: ["Shift+Down", "Shift+M"], scopes: TL },
  { id: "timeline.zoomIn", keys: ["="], scopes: TL },
  { id: "timeline.zoomOut", keys: ["-"], scopes: TL },
  { id: "timeline.zoomFit", keys: ["\\"], scopes: TL },
  { id: "timeline.zoomToSelection", keys: ["Shift+\\"], scopes: TL },
  { id: "timeline.trackHeightUp", keys: ["Mod+Alt+Up"], scopes: TL },
  { id: "timeline.trackHeightDown", keys: ["Mod+Alt+Down"], scopes: TL },
  { id: "timeline.centerPlayhead", keys: ["Mod+Shift+."], scopes: TL },

  // Editing
  { id: "edit.split", keys: ["Mod+K"], scopes: G },
  { id: "edit.splitAll", keys: ["Mod+Shift+K"], scopes: G },
  // §12: Delete also removes the selected media in the media panel.
  { id: "edit.delete", keys: ["Delete", "Backspace"], scopes: ["timeline", "preview", "media"] },
  { id: "edit.rippleDelete", keys: ["Shift+Delete", "Shift+Backspace"], scopes: TL_PV },
  { id: "edit.rippleTrimPrev", keys: ["Q"], scopes: G },
  { id: "edit.rippleTrimNext", keys: ["W"], scopes: G },
  { id: "edit.extendToPlayhead", keys: ["E"], scopes: TL },
  { id: "edit.closeGap", keys: ["G"], scopes: TL },
  { id: "edit.closeAllGaps", keys: ["Shift+G"], scopes: TL },
  { id: "edit.lift", keys: [";"], scopes: TL },
  { id: "edit.extract", keys: ["'"], scopes: TL },
  { id: "edit.freezeFrame", keys: ["Shift+F"], scopes: G },
  { id: "edit.punchZoom", keys: ["Shift+Z"], scopes: G },
  { id: "edit.duplicate", keys: ["Mod+D"], scopes: TL_PV },
  { id: "edit.defaultTransition", keys: ["Mod+Shift+D"], scopes: TL },
  { id: "edit.group", keys: ["Mod+G"], scopes: TL },
  { id: "edit.ungroup", keys: ["Mod+Shift+G"], scopes: TL },
  { id: "edit.toggleLink", keys: ["Mod+L"], scopes: TL },
  { id: "edit.nudgeLeft", keys: ["Alt+Left"], scopes: TL },
  { id: "edit.nudgeRight", keys: ["Alt+Right"], scopes: TL },
  { id: "edit.nudgeLeft5", keys: ["Alt+Shift+Left"], scopes: TL },
  { id: "edit.nudgeRight5", keys: ["Alt+Shift+Right"], scopes: TL },
  { id: "edit.moveToTrackAbove", keys: ["Alt+Up"], scopes: TL },
  { id: "edit.moveToTrackBelow", keys: ["Alt+Down"], scopes: TL },
  { id: "edit.rename", keys: ["F2"], scopes: ["timeline", "media"] },

  // Markers and range
  { id: "marker.add", keys: ["M"], scopes: G },
  { id: "range.markIn", keys: ["I"], scopes: G },
  { id: "range.markOut", keys: ["O"], scopes: G },
  { id: "range.clearIn", keys: ["Alt+I"], scopes: G },
  { id: "range.clearOut", keys: ["Alt+O"], scopes: G },
  { id: "range.clearInOut", keys: ["Alt+X"], scopes: G },
  { id: "range.goToIn", keys: ["Shift+I"], scopes: G },
  { id: "range.goToOut", keys: ["Shift+O"], scopes: G },
  { id: "range.markClip", keys: ["X"], scopes: TL },

  // Toggles and tools
  { id: "toggle.snap", keys: ["S"], scopes: G, hold: true },
  { id: "toggle.linkedSelection", keys: ["Shift+S"], scopes: G },
  { id: "tool.select", keys: ["V"], scopes: G },
  { id: "tool.razor", keys: ["C"], scopes: G },
  { id: "tool.hand", keys: ["H"], scopes: G },
  { id: "tool.slip", keys: ["Y"], scopes: G },
  { id: "tool.slide", keys: ["U"], scopes: G },
  { id: "tool.rateStretch", keys: ["R"], scopes: G },

  // Add
  { id: "add.title", keys: ["T"], scopes: G },
  { id: "add.subtitle", keys: ["Shift+T"], scopes: G },

  // History and clipboard
  { id: "history.undo", keys: ["Mod+Z"], scopes: G },
  { id: "history.redo", keys: ["Mod+Shift+Z", "Mod+Y"], scopes: G },
  { id: "clipboard.cut", keys: ["Mod+X"], scopes: TL_PV },
  { id: "clipboard.copy", keys: ["Mod+C"], scopes: TL_PV },
  { id: "clipboard.paste", keys: ["Mod+V"], scopes: TL_PV },
  { id: "clipboard.pasteInsert", keys: ["Mod+Shift+V"], scopes: TL_PV },
  { id: "clipboard.pasteAttributes", keys: ["Mod+Alt+V"], scopes: TL_PV },

  // Selection
  { id: "selection.selectAll", keys: ["Mod+A"], scopes: TL_PV },
  { id: "selection.deselect", keys: ["Mod+Shift+A"], scopes: TL_PV },

  // Canvas (preview)
  { id: "canvas.nudgeLeft", keys: ["Left"], scopes: PV },
  { id: "canvas.nudgeRight", keys: ["Right"], scopes: PV },
  { id: "canvas.nudgeUp", keys: ["Up"], scopes: PV },
  { id: "canvas.nudgeDown", keys: ["Down"], scopes: PV },
  { id: "canvas.nudgeLeft10", keys: ["Shift+Left"], scopes: PV },
  { id: "canvas.nudgeRight10", keys: ["Shift+Right"], scopes: PV },
  { id: "canvas.nudgeUp10", keys: ["Shift+Up"], scopes: PV },
  { id: "canvas.nudgeDown10", keys: ["Shift+Down"], scopes: PV },
  { id: "canvas.zoomFit", keys: ["Mod+0"], scopes: PV },
  { id: "canvas.zoom100", keys: ["Mod+1"], scopes: PV },
  { id: "canvas.zoom200", keys: ["Mod+2"], scopes: PV },
  { id: "preview.toggleFullscreen", keys: ["F"], scopes: G },

  // Text (spec §7.7): Enter edits the selected text clip (declined without one); Mod+Enter and Esc
  // both commit and exit ("Esc commits and exits", §10.2 "Esc keeps the clip with the typed content").
  { id: "text.edit", keys: ["Enter"], scopes: TL_PV },
  { id: "text.commit", keys: ["Mod+Enter"], scopes: ["textEditing"] },
  { id: "text.cancel", keys: ["Escape"], scopes: ["textEditing"] },

  // Media into the timeline (spec §6.14: `,` insert / `.` overwrite at the playhead, Premiere style;
  // over a hovered card they take that card, see panels/media/hoverScrub.ts)
  { id: "media.insertAtPlayhead", keys: [","], scopes: ["media"] },
  { id: "media.overwriteAtPlayhead", keys: ["."], scopes: ["media"] },

  // App
  { id: "media.import", keys: ["Mod+I"], scopes: G },
  { id: "project.new", keys: ["Mod+N"], scopes: G },
  { id: "project.open", keys: ["Mod+O"], scopes: G },
  { id: "project.save", keys: ["Mod+S"], scopes: G },
  { id: "app.export", keys: ["Mod+E"], scopes: G },
  { id: "app.commandPalette", keys: ["Mod+Shift+P"], scopes: G },
  { id: "app.cancel", keys: ["Escape"], scopes: G },
];

const BY_ID = new Map(DEFAULT_KEYMAP.map((binding) => [binding.id, binding]));

export function bindingFor(id: string): KeyBinding | undefined {
  return BY_ID.get(id);
}
