import { useCallback } from "react";
import { canPaste } from "../../app/clipboardController.js";
import { closeContextMenu, timelineMenu } from "../../app/cutController.js";
import { keyframeClipboard, LANE_SECTIONS } from "../../app/keyframeController.js";
import { chipCut, fadePresetId } from "../../app/transitionController.js";
import { TRANSITION_LABELS } from "../../core/document/transitions.js";
import { canFade, FADE_PRESET_SECONDS } from "../edit/fades.js";
import { actions, documentStore, sessionStore } from "../../app/services.js";
import { EASE_LABELS, SECTION_LABELS, sectionEaseAt, type KeyframeSection } from "../../core/document/keyframes.js";
import { laneSection } from "../../core/store/sessionStore.js";
import { keyable } from "../edit/keyframes.js";
import { isLayerClip, layerContent } from "../edit/transform.js";
import { allMuted, audioTargets, canDetach } from "../edit/volume.js";
import { EASE_IDS, TRANSITION_KINDS, type ClipId, type Frame, type LabelColor, type Project, type Track } from "../../core/document/types.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import { ContextMenu, type ContextMenuEntry } from "../../ui/ContextMenu.js";
import { selectionSpan } from "../model/inOut.js";
import { linkOffset, neighbors } from "../model/queries.js";
import type { ContextMenuRequest } from "../view/TimelineView.js";
import { labelSwatches } from "./labelSwatches.js";

// The timeline's right-click menus (spec §6.16): clip, gap, track header, ruler/marker and keyframe
// (spec §6.15, Batch 35: easing, delete, copy/paste keyframes). Rows dispatch command ids (the same as
// the keys and the toolbar); the label swatches set the selected clips' label color. Rendered only
// while a menu is open (a right-click is not a P1 interaction). "Speed..." opens the Speed section on
// its field; Reverse is not built, so it has no row (Batch 27). "Show keyframes for" lists the
// sections a clip's lane can show (the menu has no submenus: a heading and one row per section). Fade in
// and Fade out presets (0.25 s, 0.5 s, 1 s) and Add transition (the 3 kinds) are inline choice rows
// (Batch 36: the transition at the cut the quick row's chips use, `chipCut`). Audio clips and video
// clips with sound get Mute, Normalize, Auto-duck music and Detach audio (Batch 37); an audio track's
// menu gets Auto-duck music for its clips. Cut, Copy, Paste (at the playhead), Paste insert, Paste
// attributes... (its checklist popover) and Duplicate (after the selection) since Batch 39. Since Batch
// 40 every row is a registered command: the label swatches are `clip.label.<color>`, Reveal in media
// panel (`clip.revealMedia`) and Match project size (Fit / Fill: `transform.fit` / `transform.fill`)
// complete the §6.16 list, and the ruler's Add marker is `marker.addHere` with the right-clicked frame.

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

/** Enable/Disable (spec §6.16) names what it would do to the selection: Disable while any clip is enabled. */
function enableEntry(project: Project, clipId: ClipId): ContextMenuEntry {
  const selection = sessionStore.selection.getState();
  const ids = selection.kind === "clips" ? [...selection.clipIds] : [clipId];
  const anyEnabled = ids.some((id) => project.clips[id]?.enabled === true);
  return { kind: "item", id: "clip.toggleEnabled", label: anyEnabled ? "Disable" : "Enable", commandId: "clip.toggleEnabled" };
}

/** Speed... (video and audio clips) and Freeze frame at playhead (a video clip under the playhead). */
function speedEntries(project: Project, clipId: ClipId): ContextMenuEntry[] {
  const clip = project.clips[clipId];
  const playhead = sessionStore.state.getState().playhead;
  const timed = clip?.kind === "video" || clip?.kind === "audio";
  const freezable = clip?.kind === "video" && clip.start <= playhead && playhead < clip.start + clip.duration;
  return [
    { kind: "item", id: "clip.speedPanel", label: "Speed...", disabled: !timed },
    { kind: "item", id: "edit.freezeFrame", label: "Freeze frame at playhead", commandId: "edit.freezeFrame", disabled: !freezable },
  ];
}

/** The audio rows (Batch 37) of an audio clip, or of a video clip with linked audio or sound to detach. */
function audioEntries(project: Project, clipId: ClipId): ContextMenuEntry[] {
  const selection = sessionStore.selection.getState();
  const ids = selection.kind === "clips" && selection.clipIds.has(clipId) ? [...selection.clipIds] : [clipId];
  const audio = audioTargets(project, ids);
  const detach = ids.some((id) => canDetach(project, id));
  if (audio.length === 0 && !detach) return [];
  return [
    { kind: "separator" },
    { kind: "item", id: "clip.mute", label: allMuted(project, audio) ? "Unmute" : "Mute", disabled: audio.length === 0 },
    { kind: "item", id: "audio.normalize", label: "Normalize", disabled: audio.length === 0 },
    { kind: "item", id: "audio.autoDuck", label: "Auto-duck music", disabled: audio.length === 0 },
    { kind: "item", id: "audio.detach", label: "Detach audio", disabled: !detach },
  ];
}

/** Reveal in media panel (spec §6.16): clips that play a media item. */
function revealEntries(project: Project, clipId: ClipId): ContextMenuEntry[] {
  const clip = project.clips[clipId];
  return clip && "mediaId" in clip ? [{ kind: "item", id: "clip.revealMedia", label: "Reveal in media panel" }] : [];
}

/** Match project size (spec §6.16 "Fit / Fill"): layers with a content size, as the quick row's Fit and Fill. */
function matchEntries(project: Project, clipId: ClipId): ContextMenuEntry[] {
  const clip = project.clips[clipId];
  if (!clip || !isLayerClip(clip) || !layerContent(project, clip)) return [];
  return [
    {
      kind: "choices",
      id: "matchSize",
      label: "Match project size",
      choices: [
        { id: "transform.fit", label: "Fit", tooltip: "Fit in frame" },
        { id: "transform.fill", label: "Fill", tooltip: "Fill frame" },
      ],
    },
  ];
}

/** Fade presets and Add transition (spec §6.16, Batch 36): inline choice rows. */
function fadeEntries(project: Project, clipId: ClipId): ContextMenuEntry[] {
  const clip = project.clips[clipId];
  if (!clip || !canFade(clip)) return [];
  const presets = (edge: "in" | "out") => FADE_PRESET_SECONDS.map((seconds) => ({ id: fadePresetId(edge, seconds), label: `${seconds} s`, tooltip: `Fade ${edge} ${seconds} s` }));
  const cut = chipCut() !== null;
  return [
    { kind: "separator" },
    { kind: "choices", id: "fadeIn", label: "Fade in", choices: presets("in") },
    { kind: "choices", id: "fadeOut", label: "Fade out", choices: presets("out") },
    {
      kind: "choices",
      id: "addTransition",
      label: "Transition",
      choices: TRANSITION_KINDS.map((kind) => ({ id: `transition.add.${kind}`, label: SHORT_KIND[kind], tooltip: `Add ${TRANSITION_LABELS[kind].toLowerCase()}`, disabled: !cut })),
    },
  ];
}

const SHORT_KIND = { crossDissolve: "Dissolve", dipToBlack: "Black", dipToWhite: "White" } as const;

/** A cue's own rows (spec §10.5): merge it into the cue before it. */
function cueEntries(project: Project, clipId: ClipId): ContextMenuEntry[] {
  return [{ kind: "item", id: "caption.mergePrevious", label: "Merge with previous cue", disabled: neighbors(project, clipId).prev === null }];
}

/** "Show keyframes for" (spec §6.16, §6.4): the section the clip's lane shows, for clips with a lane (layers). */
function laneEntries(project: Project, clipId: ClipId): ContextMenuEntry[] {
  const clip = project.clips[clipId];
  if (!clip || !keyable(clip, "transform")) return [];
  const shown = laneSection(sessionStore.state.getState(), clipId);
  return [
    { kind: "separator" },
    { kind: "heading", label: "Show keyframes for" },
    ...LANE_SECTIONS.map((section) => ({ kind: "item" as const, id: `keyframes.lane.${section}`, label: SECTION_LABELS[section], active: shown === section })),
  ];
}

/** The keyframe menu (spec §6.15): easing of the selected keys (the clicked one's checked), delete, copy, paste. */
function keyframeEntries(project: Project, clipId: ClipId, section: KeyframeSection, frame: Frame): ContextMenuEntry[] {
  const clip = project.clips[clipId];
  const current = clip && "keyframes" in clip ? sectionEaseAt(clip.keyframes, section, frame) : null;
  const count = sessionStore.keyframes.getState()?.frames.length ?? 1;
  return [
    { kind: "heading", label: "Easing" },
    ...EASE_IDS.map((ease) => ({ kind: "item" as const, id: `keyframe.ease.${ease}`, label: EASE_LABELS[ease], active: current === ease })),
    { kind: "separator" },
    { kind: "item", id: "keyframe.delete", label: count === 1 ? "Delete keyframe" : "Delete keyframes", commandId: "edit.delete" },
    { kind: "item", id: "keyframe.copy", label: count === 1 ? "Copy keyframe" : "Copy keyframes" },
    { kind: "item", id: "keyframe.paste", label: "Paste keyframes", disabled: keyframeClipboard.getState()?.section !== section },
  ];
}

function clipEntries(project: Project, clipId: ClipId, current: LabelColor | null): ContextMenuEntry[] {
  return [
    { kind: "item", id: "clipboard.cut", label: "Cut", commandId: "clipboard.cut" },
    { kind: "item", id: "clipboard.copy", label: "Copy", commandId: "clipboard.copy" },
    { kind: "item", id: "clipboard.paste", label: "Paste", commandId: "clipboard.paste", disabled: !canPaste() },
    { kind: "item", id: "clipboard.pasteInsert", label: "Paste insert", commandId: "clipboard.pasteInsert", disabled: !canPaste() },
    { kind: "item", id: "clipboard.pasteAttributes", label: "Paste attributes...", commandId: "clipboard.pasteAttributes", disabled: !canPaste() },
    { kind: "item", id: "edit.duplicate", label: "Duplicate", commandId: "edit.duplicate" },
    { kind: "separator" },
    { kind: "item", id: "edit.split", label: "Split at playhead", commandId: "edit.split" },
    { kind: "item", id: "edit.delete", label: "Delete", commandId: "edit.delete" },
    { kind: "item", id: "edit.rippleDelete", label: "Ripple delete", commandId: "edit.rippleDelete" },
    enableEntry(project, clipId),
    { kind: "separator" },
    ...linkEntries(project, clipId),
    { kind: "separator" },
    { kind: "item", id: "edit.rename", label: "Rename", commandId: "edit.rename" },
    { kind: "swatches", id: "labels", label: "Label", swatches: labelSwatches(current, { prefix: "clip.label.", removable: true }) },
    { kind: "separator" },
    ...(project.clips[clipId]?.kind === "caption" ? cueEntries(project, clipId) : speedEntries(project, clipId)),
    ...revealEntries(project, clipId),
    ...audioEntries(project, clipId),
    ...fadeEntries(project, clipId),
    ...matchEntries(project, clipId),
    ...laneEntries(project, clipId),
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
    case "keyframe":
      return keyframeEntries(project, menu.clipId, menu.section, menu.frame);
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
    ...(track.kind === "audio" ? [{ kind: "item", id: "audio.autoDuck", label: "Auto-duck music", disabled: track.locked || track.clipIds.length === 0 } as const] : []),
  ];
}

export function TimelineContextMenu() {
  const menu = useStoreSelector(timelineMenu, (state) => state);
  const onSelect = useCallback(
    (id: string) => {
      if (id === ADD_MARKER_HERE && menu?.kind === "ruler") actions.run(id, null, String(menu.frame));
      else actions.run(id);
    },
    [menu],
  );
  if (!menu) return null;
  return <ContextMenu x={menu.x} y={menu.y} entries={entriesOf(menu, documentStore.getState())} onSelect={onSelect} onClose={closeContextMenu} />;
}
