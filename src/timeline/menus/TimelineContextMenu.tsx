import { useCallback } from "react";
import { closeContextMenu, setLabelColor, timelineMenu } from "../../app/cutController.js";
import { actions, documentStore, sessionStore } from "../../app/services.js";
import { LABEL_COLORS, type ClipId, type LabelColor, type Project, type Track } from "../../core/document/types.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import { ContextMenu, type ContextMenuEntry } from "../../ui/ContextMenu.js";
import { linkOffset } from "../model/queries.js";

// The timeline's right-click menus (spec §6.16): clip, gap and track header. Rows dispatch command ids
// (the same as the keys and the toolbar); the label swatches set the selected clips' label color.
// Rendered only while a menu is open (a right-click is not a P1 interaction).
// TODO(batch 19): the ruler/marker menu; the other clip rows of §6.16 come with their batches
// (Speed/Freeze 27, Duplicate 39, Enable/Disable and Reveal 41, Fades/Transitions 36...).

const LABEL_NAMES: Record<LabelColor, string> = {
  red: "Red",
  orange: "Orange",
  green: "Green",
  teal: "Teal",
  blue: "Blue",
  violet: "Violet",
  pink: "Pink",
  grey: "Grey",
};

const SWATCH_PREFIX = "label:";

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
    {
      kind: "swatches",
      id: "labels",
      label: "Label",
      swatches: LABEL_COLORS.map((color) => ({
        id: `${SWATCH_PREFIX}${color}`,
        label: current === color ? `${LABEL_NAMES[color]} (click to remove)` : LABEL_NAMES[color],
        color: `var(--label-${color})`,
        active: current === color,
      })),
    },
  ];
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
  const project = documentStore.getState();
  const track = menu.kind === "track" ? project.tracks.find((candidate) => candidate.id === menu.trackId) : undefined;
  const entries =
    menu.kind === "clip" ? clipEntries(project, menu.clipId, project.clips[menu.clipId]?.color ?? null) : menu.kind === "gap" ? GAP_ENTRIES : track ? trackEntries(project, track) : [];
  return <ContextMenu x={menu.x} y={menu.y} entries={entries} onSelect={onSelect} onClose={closeContextMenu} />;
}
