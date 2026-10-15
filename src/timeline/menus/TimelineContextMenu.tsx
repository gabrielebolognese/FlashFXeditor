import { useCallback } from "react";
import { closeContextMenu, setLabelColor, timelineMenu } from "../../app/cutController.js";
import { addMarkerAt } from "../../app/markerController.js";
import { actions, documentStore, sessionStore } from "../../app/services.js";
import type { ClipId, LabelColor, Project, Track } from "../../core/document/types.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import { ContextMenu, type ContextMenuEntry } from "../../ui/ContextMenu.js";
import { selectionSpan } from "../model/inOut.js";
import { linkOffset } from "../model/queries.js";
import type { ContextMenuRequest } from "../view/TimelineView.js";
import { labelSwatches } from "./labelSwatches.js";

// The timeline's right-click menus (spec §6.16): clip, gap, track header and ruler/marker. Rows
// dispatch command ids (the same as the keys and the toolbar); the label swatches set the selected
// clips' label color. Rendered only while a menu is open (a right-click is not a P1 interaction).
// TODO(batch 27): Speed and Freeze frame rows; TODO(batch 36): fades and transitions; TODO(batch 39):
// Duplicate; TODO(batch 41): Enable/Disable and Reveal in media panel.

const SWATCH_PREFIX = "label:";
/** The ruler menu's Add marker: at the frame right-clicked (the `M` key adds at the playhead). */
const ADD_MARKER_HERE = "marker.addHere";

/** Link/Unlink, Group/Ungroup and Move into sync (spec §6.12, §6.16), labeled by what they would do to the selection. */
function linkEntries(project: Project, clipId: ClipId): ContextMenuEntry[] {
  const selection = sessionStore.selection.getState();
  const clips = (selection.kind === "clips" ? [...selection.clipIds] : [clipId]).map((id) => project.clips[id]).filter((clip) => clip !== undefined);
  const linked = clips.some((clip) => clip.linkGroup !== undefined);
  const grouped = clips.some((clip) => clip.group !== undefined);
  return [
    { kind: "item", id: "edit.toggleLink", label: linked ? "Unlink" : "Link", commandId: "edit.toggleLink" },
    { kind: "item", id: "edit.group", label: "Group", commandId: "edit.group", disabled: clips.length < 2 },
    { kind: "item", id: "edit.ungroup", label: "Ungroup", commandId: "edit.ungroup", disabled: !grouped },
    { kind: "item", id: "edit.moveIntoSync", label: "Move into sync", disabled: linkOffset(project, clipId) === 0 },
  ];
}

function clipEntries(project: Project, clipId: ClipId, current: LabelColor | null): ContextMenuEntry[] {
  return [
    // TODO(batch 39): clipboard.
    { kind: "item", id: "clipboard.cut", label: "Cut", commandId: "clipboard.cut", disabled: true },
    { kind: "item", id: "clipboard.copy", label: "Copy", commandId: "clipboard.copy", disabled: true },
    { kind: "item", id: "clipboard.paste", label: "Paste", commandId: "clipboard.paste", disabled: true },
    { kind: "separator" },
    { kind: "item", id: "edit.split", label: "Split at playhead", commandId: "edit.split" },
    { kind: "item", id: "edit.delete", label: "Delete", commandId: "edit.delete" },
    { kind: "item", id: "edit.rippleDelete", label: "Ripple delete", commandId: "edit.rippleDelete" },
    { kind: "separator" },
    ...linkEntries(project, clipId),
    { kind: "separator" },
    { kind: "item", id: "edit.rename", label: "Rename", commandId: "edit.rename" },
    { kind: "swatches", id: "labels", label: "Label", swatches: labelSwatches(current, { prefix: SWATCH_PREFIX, removable: true }) },
  ];
}

/** The ruler/marker menu (spec §6.16): add a marker where clicked, edit or delete the marker clicked, clear or set the in/out range. */
function rulerEntries(project: Project, markerId: string | null): ContextMenuEntry[] {
  const { inPoint, outPoint } = sessionStore.state.getState();
  const span = selectionSpan(project, sessionStore.selection.getState(), sessionStore.gap.getState(), sessionStore.editPoint.getState());
  return [
    { kind: "item", id: ADD_MARKER_HERE, label: "Add marker" },
    { kind: "item", id: "marker.edit", label: "Edit marker", disabled: markerId === null },
    { kind: "item", id: "marker.delete", label: "Delete marker", disabled: markerId === null },
    { kind: "separator" },
    { kind: "item", id: "range.clearInOut", label: "Clear in/out", commandId: "range.clearInOut", disabled: inPoint === null && outPoint === null },
    { kind: "item", id: "range.toSelection", label: "Set in/out to selection", disabled: span === null },
  ];
}

function entriesOf(menu: ContextMenuRequest, project: Project): readonly ContextMenuEntry[] {
  switch (menu.kind) {
    case "clip":
      return clipEntries(project, menu.clipId, project.clips[menu.clipId]?.color ?? null);
    case "gap":
      return GAP_ENTRIES;
    case "track": {
      const track = project.tracks.find((candidate) => candidate.id === menu.trackId);
      return track ? trackEntries(project, track) : [];
    }
    case "ruler":
      return rulerEntries(project, menu.markerId);
  }
}

const GAP_ENTRIES: readonly ContextMenuEntry[] = [
  { kind: "item", id: "edit.closeGap", label: "Close gap", commandId: "edit.closeGap" },
  { kind: "item", id: "edit.closeAllGapsOnTrack", label: "Close all gaps on track" },
];

/** The track header menu (spec §6.16): add, rename, delete, height, select its clips, lock all, mute others. */
function trackEntries(project: Project, track: Track): ContextMenuEntry[] {
  const add: ContextMenuEntry[] =
    track.kind === "video"
      ? [
          { kind: "item", id: "track.addVideoAbove", label: "Add video track above" },
          { kind: "item", id: "track.addVideoBelow", label: "Add video track below" },
          { kind: "item", id: "track.addAudio", label: "Add audio track" },
        ]
      : track.kind === "audio"
        ? [
            { kind: "item", id: "track.addVideo", label: "Add video track" },
            { kind: "item", id: "track.addAudioAbove", label: "Add audio track above" },
            { kind: "item", id: "track.addAudioBelow", label: "Add audio track below" },
          ]
        : [
            { kind: "item", id: "track.addVideo", label: "Add video track" },
            { kind: "item", id: "track.addAudio", label: "Add audio track" },
          ];
  const heights: ContextMenuEntry[] =
    track.kind === "caption"
      ? []
      : [
          { kind: "separator" },
          { kind: "item", id: "track.heightS", label: "Height S", active: track.height === "S" },
          { kind: "item", id: "track.heightM", label: "Height M", active: track.height === "M" },
          { kind: "item", id: "track.heightL", label: "Height L", active: track.height === "L" },
        ];
  const allLocked = project.tracks.every((candidate) => candidate.locked);
  return [
    ...add,
    { kind: "separator" },
    { kind: "item", id: "track.rename", label: "Rename", commandId: "edit.rename" },
    { kind: "item", id: "track.delete", label: "Delete track", disabled: track.locked },
    { kind: "item", id: "track.deleteEmpty", label: "Delete empty tracks" },
    ...heights,
    { kind: "separator" },
    { kind: "item", id: "track.selectClips", label: "Select all clips on track", disabled: track.locked || track.clipIds.length === 0 },
    { kind: "item", id: "track.lockAll", label: allLocked ? "Unlock all tracks" : "Lock all tracks" },
    ...(track.kind === "caption" ? [] : [{ kind: "item", id: "track.muteOthers", label: "Mute all others" } as const]),
  ];
}

export function TimelineContextMenu() {
  const menu = useStoreSelector(timelineMenu, (state) => state);
  const onSelect = useCallback(
    (id: string) => {
      if (id === ADD_MARKER_HERE && menu?.kind === "ruler") {
        addMarkerAt(menu.frame);
        return;
      }
      if (!id.startsWith(SWATCH_PREFIX)) {
        actions.run(id);
        return;
      }
      const color = id.slice(SWATCH_PREFIX.length) as LabelColor;
      const clip = menu?.kind === "clip" ? documentStore.getState().clips[menu.clipId] : undefined;
      // The active swatch again removes the label.
      setLabelColor(clip?.color === color ? null : color);
    },
    [menu],
  );
  if (!menu) return null;
  return <ContextMenu x={menu.x} y={menu.y} entries={entriesOf(menu, documentStore.getState())} onSelect={onSelect} onClose={closeContextMenu} />;
}
