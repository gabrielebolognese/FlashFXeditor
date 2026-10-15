import { useCallback } from "react";
import { closeContextMenu, setLabelColor, timelineMenu } from "../../app/cutController.js";
import { actions, documentStore } from "../../app/services.js";
import { LABEL_COLORS, type LabelColor } from "../../core/document/types.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import { ContextMenu, type ContextMenuEntry } from "../../ui/ContextMenu.js";

// The timeline's right-click menus (spec §6.16, first minimal set): clip and gap. Rows dispatch
// command ids (the same as the keys and the toolbar); the label swatches set the selected clips'
// label color. Rendered only while a menu is open (a right-click is not a P1 interaction).
// TODO(batch 16): the track header menu; TODO(batch 19): the ruler/marker menu; the other clip rows
// of §6.16 come with their batches (Link/Group 16, Speed/Freeze 27, Fades/Transitions 36...).

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

function clipEntries(current: LabelColor | null): ContextMenuEntry[] {
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
  const entries = menu.kind === "clip" ? clipEntries(documentStore.getState().clips[menu.clipId]?.color ?? null) : GAP_ENTRIES;
  return <ContextMenu x={menu.x} y={menu.y} entries={entries} onSelect={onSelect} onClose={closeContextMenu} />;
}
