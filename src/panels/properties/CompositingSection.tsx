import { useCallback } from "react";
import { documentStore } from "../../app/services.js";
import type { Command } from "../../core/commands/command.js";
import { BLEND_MODES, MATTE_MODES, type BlendMode, type Clip, type ClipId, type MatteMode, type Project } from "../../core/document/types.js";
import { BLEND_MODE_META } from "../../core/effects/blendModes.js";
import { isVisualClip } from "../../core/effects/trackMatte.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import { matteCandidates, setBlend, setMatte, setMatteMode, setMatteOnly } from "../../timeline/edit/compositing.js";
import { Select, type SelectOption } from "../../ui/Select.js";
import { Toggle } from "../../ui/Toggle.js";
import { Row } from "./Section.js";
import { MIXED, NONE, SKIP, useClipsShared } from "./useShared.js";

// The Compositing section (spec §21.17, Batch 72) of the selected visual clips: the Blend list (13
// modes), the Matte picker (none, or a visual clip of the same sequence), its mode and the Matte only
// switch (hides a clip used as a matte). Every choice is one command over the selected clips; the
// section reads the document through narrow selectors (no render on playback or a scrub, P1).

const BLEND_OPTIONS: readonly SelectOption<BlendMode | "">[] = BLEND_MODES.map((mode) => ({ value: mode, label: BLEND_MODE_META[mode].label }));
const MATTE_LABELS: Record<MatteMode, string> = { alpha: "Alpha", alphaInverted: "Alpha inverted", luma: "Luma", lumaInverted: "Luma inverted" };
const MODE_OPTIONS: readonly SelectOption<MatteMode | "">[] = MATTE_MODES.map((mode) => ({ value: mode, label: MATTE_LABELS[mode] }));
/** The Matte picker's value for "several clips with different mattes" (shown blank: no option has it). */
const MIXED_VALUE = "\u0000mixed";

const getBlend = (clip: Clip) => (isVisualClip(clip) ? (clip.blend ?? "normal") : SKIP);
const getMatte = (clip: Clip) => (isVisualClip(clip) ? (clip.matte?.clipId ?? "") : SKIP);
const getMode = (clip: Clip) => (isVisualClip(clip) && clip.matte ? clip.matte.mode : SKIP);
const getMatteOnly = (clip: Clip) => (isVisualClip(clip) ? clip.matteOnly === true : SKIP);

/** The matte candidates of the first clip as one string (`id\tlabel` lines): a render only when they change. */
function candidatesKey(project: Project, id: ClipId | undefined): string {
  if (id === undefined) return "";
  const lines: string[] = [];
  for (const clip of matteCandidates(project, id)) {
    const track = project.tracks.find((t) => t.id === clip.trackId) ?? Object.values(project.sequences).flatMap((s) => s.tracks).find((t) => t.id === clip.trackId);
    lines.push(`${clip.id}\t${clip.name}${track ? ` (${track.name})` : ""}`);
  }
  return lines.join("\n");
}

const run = (command: Command | null) => {
  if (command) documentStore.dispatch(command);
};

export function CompositingSection({ ids }: { ids: readonly ClipId[] }) {
  const blend = useClipsShared(ids, getBlend);
  const matte = useClipsShared(ids, getMatte);
  const mode = useClipsShared(ids, getMode);
  const matteOnly = useClipsShared(ids, getMatteOnly);
  const candidates = useStoreSelector(
    documentStore,
    useCallback((project: Project) => candidatesKey(project, ids[0]), [ids]),
  );
  const matteOptions: SelectOption<string>[] = [{ value: "", label: "None" }];
  for (const line of candidates === "" ? [] : candidates.split("\n")) {
    const [value = "", label = ""] = line.split("\t");
    matteOptions.push({ value, label });
  }
  const matteValue = matte === MIXED ? MIXED_VALUE : matte === NONE ? "" : matte;
  const hasMatte = matteValue !== "";

  const pickMatte = (clipId: string) => {
    const project = documentStore.getState();
    if (clipId === "") return run(setMatte(project, ids, null));
    run(setMatte(project, ids, { clipId, mode: mode === MIXED || mode === NONE ? "alpha" : mode }));
  };

  return (
    <>
      <Row label="Blend">
        <Select label="Blend mode" value={blend === MIXED || blend === NONE ? "" : blend} options={BLEND_OPTIONS} onChange={(value) => value !== "" && run(setBlend(documentStore.getState(), ids, value))} />
      </Row>
      <Row label="Matte">
        <Select label="Track matte" value={matteValue} options={matteOptions} onChange={pickMatte} />
      </Row>
      <Row label="Mode">
        <Select label="Track matte mode" value={mode === MIXED || mode === NONE ? "" : mode} options={MODE_OPTIONS} disabled={!hasMatte} tooltip={hasMatte ? undefined : "Pick a matte first"} onChange={(value) => value !== "" && run(setMatteMode(documentStore.getState(), ids, value))} />
      </Row>
      <Row label="Matte only">
        <Toggle
          label="Use as matte only"
          tooltip="Hide this clip: it is drawn only as another clip's matte"
          commandId="clip.matteOnly"
          checked={matteOnly === true}
          mixed={matteOnly === MIXED}
          onChange={(on) => run(setMatteOnly(documentStore.getState(), ids, on))}
        />
      </Row>
    </>
  );
}
