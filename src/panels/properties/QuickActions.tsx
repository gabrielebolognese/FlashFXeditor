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
  ScissorsLineDashed,
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
import { silenceRow } from "../../app/silenceController.js";
import { clickTransitionChip, pressTransitionChip } from "../../app/transitionController.js";
import { secondsToFrames } from "../../core/document/time.js";
import { TRANSITION_LABELS } from "../../core/document/transitions.js";
import type { ClipId, Project, TransitionKind } from "../../core/document/types.js";
import { fadeTargets, hasFade, QUICK_FADE_SECONDS } from "../../timeline/edit/fades.js";
import { clipCut } from "../../timeline/edit/transitions.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import { silenceTargets } from "../../timeline/edit/silence.js";
import { hasSpeed } from "../../timeline/edit/speed.js";
import { allMuted, audioTargets } from "../../timeline/edit/volume.js";
import { isLayerClip, layerContent } from "../../timeline/edit/transform.js";
import { isClipLocked } from "../../timeline/model/queries.js";
import { IconButton } from "../../ui/IconButton.js";
import { PresetNameField } from "../media/PresetNameField.js";
import { SilenceRow } from "./SilenceRow.js";
import styles from "./QuickActions.module.css";

// The quick-action row (spec §11, §17): one click each, at the top of the panel for a clip selection
// (and for a selected edit point: only the transition chips apply there, Batch 36), in the §17 order.
// Fade in / Fade out 0.5 s (Batch 36) fade the selected clips and their linked audio, or take the fade
// away when they all have it (pressed then). The transition chips (Batch 36) add a dissolve, a dip to
// black or white at the selected edit point, else at the primary clip's cut nearest the playhead; a
// chip dragged onto the timeline adds it at the cut it lands on. Fit, Fill, Center, Flip H / V, Reset, Freeze frame, Punch zoom, the speed chips
// (0.5x, 1x, 1.5x, 2x: the Speed section's options apply), Duplicate and Delete run their command ids;
// Mute (Batch 37) mutes the selected audio clips and the audio linked to selected video clips, pressed
// while they all are muted (every chip is live since Batch 37). Remove silence (Batch 38) opens its
// parameter row under the buttons (pressed while it is open) for the audio the Audio section edits. A
// button is disabled (never hidden, so
// the row never shifts) when nothing selected can take it (its
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

/** A fade chip (Batch 36): live, pressed while every selected clip has that fade. */
interface Fade {
  kind: "fade";
  id: "clip.fadeIn" | "clip.fadeOut";
  label: string;
  icon: LucideIcon;
}

/** Remove silence (Batch 38): opens the parameter row, pressed while it is open. */
interface Silence {
  kind: "silence";
  label: string;
  icon: LucideIcon;
}

/** The Mute toggle (Batch 37): live with audio to mute, pressed while it all is muted. */
interface Mute {
  kind: "mute";
  label: string;
  icon: LucideIcon;
}

/** A transition chip (Batch 36): click or drag onto a cut. */
interface TransitionChip {
  kind: "transition";
  transition: TransitionKind;
  label: string;
  icon: LucideIcon;
}

type Entry = Live | Fade | Mute | Silence | TransitionChip | { kind: "gap" } | { kind: "updatePreset" };

const ENTRIES: readonly Entry[] = [
  { kind: "live", id: "transform.fit", label: "Fit in frame", icon: Shrink, needs: "content" },
  { kind: "live", id: "transform.fill", label: "Fill frame", icon: Maximize2, needs: "content" },
  { kind: "live", id: "transform.center", label: "Center in frame", icon: Focus, needs: "content" },
  { kind: "live", id: "transform.flipH", label: "Flip horizontal", icon: FlipHorizontal2, needs: "layer" },
  { kind: "live", id: "transform.flipV", label: "Flip vertical", icon: FlipVertical2, needs: "layer" },
  { kind: "live", id: "transform.reset", label: "Reset transform", icon: RotateCcw, needs: "layer" },
  { kind: "gap" },
  { kind: "fade", id: "clip.fadeIn", label: "Fade in 0.5 s", icon: TrendingUp },
  { kind: "fade", id: "clip.fadeOut", label: "Fade out 0.5 s", icon: TrendingDown },
  { kind: "live", id: "edit.freezeFrame", label: "Freeze frame", icon: Snowflake, commandId: "edit.freezeFrame", needs: "video" },
  { kind: "live", id: "edit.punchZoom", label: "Punch zoom", icon: ZoomIn, commandId: "edit.punchZoom", needs: "layer" },
  { kind: "gap" },
  { kind: "live", id: "clip.speed.50", label: "Speed 0.5x", text: "0.5x", needs: "speed" },
  { kind: "live", id: "clip.speed.100", label: "Speed 1x", text: "1x", needs: "speed" },
  { kind: "live", id: "clip.speed.150", label: "Speed 1.5x", text: "1.5x", needs: "speed" },
  { kind: "live", id: "clip.speed.200", label: "Speed 2x", text: "2x", needs: "speed" },
  { kind: "gap" },
  { kind: "mute", label: "Mute", icon: VolumeX },
  { kind: "silence", label: "Remove silence", icon: ScissorsLineDashed },
  { kind: "live", id: "preset.save", label: "Save as preset", icon: BookmarkPlus, needs: "text" },
  { kind: "updatePreset" },
  { kind: "gap" },
  { kind: "transition", transition: "crossDissolve", label: "Add dissolve", icon: Blend },
  { kind: "transition", transition: "dipToBlack", label: "Add dip to black", icon: Moon },
  { kind: "transition", transition: "dipToWhite", label: "Add dip to white", icon: Sun },
  { kind: "gap" },
  { kind: "live", id: "edit.duplicate", label: "Duplicate", icon: CopyPlus, commandId: "edit.duplicate", needs: "clips" },
  { kind: "live", id: "edit.delete", label: "Delete", icon: Trash2, commandId: "edit.delete", needs: "clips" },
];

const NEEDS = ["content", "layer", "primary", "clips", "video", "speed", "text", "fade", "fadeIn", "fadeOut", "cut", "audio", "muted", "silence"] as const;

const bit = (need: (typeof NEEDS)[number]) => 1 << NEEDS.indexOf(need);

/** What the selection can take, as bits of NEEDS (a number: the row renders only when it changes); `editPoint`: a selected cut. */
function abilities(project: Project, ids: readonly ClipId[], primary: ClipId, editPoint: boolean): number {
  let bits = editPoint ? bit("cut") : 0;
  // Fades (Batch 36): any clip that fades; pressed when every one (with its linked audio) has the quick fade.
  const fading = fadeTargets(project, ids);
  if (fading.length > 0) {
    bits |= bit("fade");
    const frames = secondsToFrames(QUICK_FADE_SECONDS, project.settings.fps);
    if (hasFade(project, fading, "in", frames)) bits |= bit("fadeIn");
    if (hasFade(project, fading, "out", frames)) bits |= bit("fadeOut");
  }
  if (project.clips[primary] && clipCut(project, primary, 0)) bits |= bit("cut");
  // Mute (Batch 37): the audio the Audio section edits; pressed when it all is muted.
  const audio = audioTargets(project, ids);
  if (audio.length > 0) bits |= bit("audio");
  if (allMuted(project, audio)) bits |= bit("muted");
  // Remove silence (Batch 38): that audio, playing, with no linked member locked.
  if (audio.length > 0 && silenceTargets(project, ids).length > 0) bits |= bit("silence");
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

export function QuickActions({ ids, primary, editPoint = false }: { ids: readonly ClipId[]; primary: ClipId; editPoint?: boolean }) {
  const select = useCallback((project: Project) => abilities(project, ids, primary, editPoint), [ids, primary, editPoint]);
  const bits = useStoreSelector(documentStore, select);
  const naming = useStoreSelector(presetNaming, (where) => where === "quick");
  const silence = useStoreSelector(silenceRow, (open) => open);
  return (
    <>
      <div className={styles.row} role="toolbar" aria-label="Quick actions">
        {ENTRIES.map((entry, index) => {
          if (entry.kind === "gap") return <span key={`gap-${index}`} className={styles.gap} aria-hidden="true" />;
          if (entry.kind === "updatePreset") return <UpdatePresetButton key="update-preset" />;
          if (entry.kind === "mute") {
            const on = (bits & bit("muted")) !== 0;
            return <IconButton key="mute" icon={entry.icon} label={on ? "Unmute" : "Mute"} pressed={on} disabled={(bits & bit("audio")) === 0} onClick={() => run("clip.mute")} />;
          }
          if (entry.kind === "silence") {
            const enabled = (bits & bit("silence")) !== 0;
            const label = silence ? "Remove silence: close the parameter row" : enabled ? "Remove silence: find the pauses and cut them out" : "Remove silence: select a clip with sound";
            return <IconButton key="silence" icon={entry.icon} label={label} pressed={silence} disabled={!enabled && !silence} onClick={() => run("audio.removeSilence")} />;
          }
          if (entry.kind === "fade") {
            const on = (bits & bit(entry.id === "clip.fadeIn" ? "fadeIn" : "fadeOut")) !== 0;
            return <IconButton key={entry.id} icon={entry.icon} label={on ? `${entry.label}: on (click to remove)` : entry.label} pressed={on} disabled={(bits & bit("fade")) === 0} onClick={() => run(entry.id)} />;
          }
          if (entry.kind === "transition") {
            // Always enabled: a chip can be dragged onto any cut.
            const { transition } = entry;
            const where = (bits & bit("cut")) !== 0 ? "at the selected cut, or drag it onto one" : "drag it onto a cut";
            return (
              <IconButton
                key={transition}
                icon={entry.icon}
                label={`${entry.label} (${TRANSITION_LABELS[transition].toLowerCase()}, 15 frames): ${where}`}
                onPointerDown={(event) => pressTransitionChip(event, transition, event.currentTarget)}
                onClick={() => clickTransitionChip(transition)}
              />
            );
          }
          const enabled = (bits & (1 << NEEDS.indexOf(entry.needs))) !== 0;
          return <IconButton key={entry.id} icon={entry.icon} text={entry.text} label={entry.label} commandId={entry.commandId} disabled={!enabled} onClick={() => run(entry.id)} />;
        })}
      </div>
      {naming && (
        <div className={styles.nameRow}>
          <PresetNameField />
        </div>
      )}
      {silence && <SilenceRow />}
    </>
  );
}
