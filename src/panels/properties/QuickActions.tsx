import {
  Blend,
  BookmarkCheck,
  BookmarkPlus,
  CopyPlus,
  Focus,
  FlipHorizontal2,
  FlipVertical2,
  Maximize2,
  Moon,
  RotateCcw,
  Shrink,
  Snowflake,
  Sun,
  Trash2,
  TrendingDown,
  TrendingUp,
  VolumeX,
  ZoomIn,
  type LucideIcon,
} from "lucide-react";
import { useCallback } from "react";
import { presetLibrary, presetNaming, presetSourceClip, updatablePreset, type PresetLibrary } from "../../app/presetController.js";
import { actions, documentStore } from "../../app/services.js";
import type { ClipId, Project } from "../../core/document/types.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import { hasSpeed } from "../../timeline/edit/speed.js";
import { isLayerClip, layerContent } from "../../timeline/edit/transform.js";
import { isClipLocked } from "../../timeline/model/queries.js";
import { IconButton } from "../../ui/IconButton.js";
import { PresetNameField } from "../media/PresetNameField.js";
import styles from "./QuickActions.module.css";

// The quick-action row (spec §11, §17): one click each, at the top of the panel for a clip selection,
// in the §17 order. Fit, Fill, Center, Flip H / V, Reset, Freeze frame, Punch zoom, the speed chips
// (0.5x, 1x, 1.5x, 2x: the Speed section's options apply), Duplicate and Delete run their command ids;
// the chips of later batches are present and disabled (never hidden, so the row never shifts), their
// tooltip naming the batch in dev builds. A button is disabled when nothing selected can take it (its
// state follows the selection, never the playhead: Freeze frame and Punch zoom report a playhead that
// is not over the clip). Save as preset (spec §10.3) opens a name field under the row; Update preset
// is enabled when the selected text clip's preset exists and its look differs, its tooltip naming the
// preset and saying what happens to the other clips that use it.

interface Live {
  kind: "live";
  id: string;
  label: string;
  icon?: LucideIcon;
  /** A text chip (the speed chips). */
  text?: string;
  /** Shown in the tooltip with its key. */
  commandId?: string;
  needs: (typeof NEEDS)[number];
}

interface Planned {
  kind: "planned";
  label: string;
  icon?: LucideIcon;
  text?: string;
  batch: number;
}

type Entry = Live | Planned | { kind: "gap" } | { kind: "updatePreset" };

const ENTRIES: readonly Entry[] = [
  { kind: "live", id: "transform.fit", label: "Fit in frame", icon: Shrink, needs: "content" },
  { kind: "live", id: "transform.fill", label: "Fill frame", icon: Maximize2, needs: "content" },
  { kind: "live", id: "transform.center", label: "Center in frame", icon: Focus, needs: "content" },
  { kind: "live", id: "transform.flipH", label: "Flip horizontal", icon: FlipHorizontal2, needs: "layer" },
  { kind: "live", id: "transform.flipV", label: "Flip vertical", icon: FlipVertical2, needs: "layer" },
  { kind: "live", id: "transform.reset", label: "Reset transform", icon: RotateCcw, needs: "layer" },
  { kind: "gap" },
  { kind: "planned", label: "Fade in 0.5 s", icon: TrendingUp, batch: 36 },
  { kind: "planned", label: "Fade out 0.5 s", icon: TrendingDown, batch: 36 },
  { kind: "live", id: "edit.freezeFrame", label: "Freeze frame", icon: Snowflake, commandId: "edit.freezeFrame", needs: "video" },
  { kind: "live", id: "edit.punchZoom", label: "Punch zoom", icon: ZoomIn, commandId: "edit.punchZoom", needs: "layer" },
  { kind: "gap" },
  { kind: "live", id: "clip.speed.50", label: "Speed 0.5x", text: "0.5x", needs: "speed" },
  { kind: "live", id: "clip.speed.100", label: "Speed 1x", text: "1x", needs: "speed" },
  { kind: "live", id: "clip.speed.150", label: "Speed 1.5x", text: "1.5x", needs: "speed" },
  { kind: "live", id: "clip.speed.200", label: "Speed 2x", text: "2x", needs: "speed" },
  { kind: "gap" },
  { kind: "planned", label: "Mute", icon: VolumeX, batch: 37 },
  { kind: "live", id: "preset.save", label: "Save as preset", icon: BookmarkPlus, needs: "text" },
  { kind: "updatePreset" },
  { kind: "gap" },
  { kind: "planned", label: "Add dissolve", icon: Blend, batch: 36 },
  { kind: "planned", label: "Add dip to black", icon: Moon, batch: 36 },
  { kind: "planned", label: "Add dip to white", icon: Sun, batch: 36 },
  { kind: "gap" },
  { kind: "live", id: "edit.duplicate", label: "Duplicate", icon: CopyPlus, commandId: "edit.duplicate", needs: "primary" },
  { kind: "live", id: "edit.delete", label: "Delete", icon: Trash2, commandId: "edit.delete", needs: "clips" },
];

const NEEDS = ["content", "layer", "primary", "clips", "video", "speed", "text"] as const;

/** What the selection can take, as bits of NEEDS (a number: the row renders only when it changes). */
function abilities(project: Project, ids: readonly ClipId[], primary: ClipId): number {
  let bits = 0;
  for (const id of ids) {
    const clip = project.clips[id];
    if (!clip || isClipLocked(project, id)) continue;
    bits |= 1 << 3;
    if (clip.kind === "video") bits |= 1 << 4;
    if (hasSpeed(clip)) bits |= 1 << 5;
    if (clip.kind === "text") bits |= 1 << 6;
    if (!isLayerClip(clip)) continue;
    bits |= 1 << 1;
    if (layerContent(project, clip)) bits |= 1 << 0;
  }
  if (project.clips[primary] && !isClipLocked(project, primary)) bits |= 1 << 2;
  return bits;
}

const plannedTooltip = (entry: Planned) => (import.meta.env.DEV ? `${entry.label}: coming in Batch ${entry.batch}` : entry.label);
const run = (id: string) => void actions.run(id);

const selectLibrary = (library: PresetLibrary) => library;

/** The name of the preset Update preset would write into, or null (re-read when the document or the presets change). */
function updatableName(project: Project): string | null {
  return updatablePreset(project, presetSourceClip(project))?.name ?? null;
}

/** `Update "Name"` (spec §10.3, §17): the selected text clip's look into its preset. */
function UpdatePresetButton() {
  // Renders again when the presets change; the inline selector then reads them again.
  useStoreSelector(presetLibrary, selectLibrary);
  const name = useStoreSelector(documentStore, (project: Project) => updatableName(project));
  const label = name
    ? `Update "${name}": saves this clip's style into the preset. Other clips that use "${name}" keep their own style until you apply the preset to them again.`
    : "Update preset: the selected text has no preset, or already has its style";
  return <IconButton icon={BookmarkCheck} label={label} commandId="preset.update" disabled={name === null} onClick={() => run("preset.update")} />;
}

export function QuickActions({ ids, primary }: { ids: readonly ClipId[]; primary: ClipId }) {
  const select = useCallback((project: Project) => abilities(project, ids, primary), [ids, primary]);
  const bits = useStoreSelector(documentStore, select);
  const naming = useStoreSelector(presetNaming, (where) => where === "quick");
  return (
    <>
      <div className={styles.row} role="toolbar" aria-label="Quick actions">
        {ENTRIES.map((entry, index) => {
          if (entry.kind === "gap") return <span key={`gap-${index}`} className={styles.gap} aria-hidden="true" />;
          if (entry.kind === "updatePreset") return <UpdatePresetButton key="update-preset" />;
          if (entry.kind === "planned") return <IconButton key={entry.label} icon={entry.icon} text={entry.text} label={plannedTooltip(entry)} disabled />;
          const enabled = (bits & (1 << NEEDS.indexOf(entry.needs))) !== 0;
          return <IconButton key={entry.id} icon={entry.icon} text={entry.text} label={entry.label} commandId={entry.commandId} disabled={!enabled} onClick={() => run(entry.id)} />;
        })}
      </div>
      {naming && (
        <div className={styles.nameRow}>
          <PresetNameField />
        </div>
      )}
    </>
  );
}
