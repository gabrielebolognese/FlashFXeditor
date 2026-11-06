import { Plus, X } from "lucide-react";
import { addColorOverride, clearColorOverrides } from "../../app/lottieController.js";
import { rememberColor } from "../../app/propertiesController.js";
import { appSettings, documentStore } from "../../app/services.js";
import type { Command } from "../../core/commands/command.js";
import type { Clip, ClipId } from "../../core/document/types.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import { setColorOverrides, setLottieLoop, withFrom, withoutRow, withTo } from "../../timeline/edit/lottie.js";
import { ColorField } from "../../ui/ColorField.js";
import { IconButton } from "../../ui/IconButton.js";
import { Toggle } from "../../ui/Toggle.js";
import { Row } from "./Section.js";
import { MIXED, SKIP, useClipsShared } from "./useShared.js";

// The Lottie section (spec §21.23, Batch 79): Loop, and the color replacements of the animation (each a From
// color the animation uses and the To color it becomes). Edits apply to every selected Lottie clip; the rows
// show the first clip's list.

const selectRecent = (settings: { recentColors: readonly string[] }) => settings.recentColors;
const getLoop = (clip: Clip) => (clip.kind === "lottie" ? clip.loop === true : SKIP);
const getOverrides = (clip: Clip) => (clip.kind === "lottie" ? JSON.stringify(clip.colorOverrides ?? []) : SKIP);

const run = (command: Command | null) => {
  if (command) documentStore.dispatch(command);
};

export function LottieSection({ ids }: { ids: readonly ClipId[] }) {
  const recent = useStoreSelector(appSettings, selectRecent);
  const loop = useClipsShared(ids, getLoop);
  const serialized = useClipsShared(ids, getOverrides);
  const first = ids[0] === undefined ? undefined : documentStore.getState().clips[ids[0]];
  const overrides = first?.kind === "lottie" ? (first.colorOverrides ?? []) : [];
  const edit = (next: ReturnType<typeof withTo>, label: string) => run(setColorOverrides(documentStore.getState(), ids, next, label));

  return (
    <>
      <Row label="Loop">
        <Toggle label="Loop the animation" tooltip="Repeat the animation for the length of the clip; off holds its last frame" commandId="clip.lottie.loop" checked={loop === true} mixed={loop === MIXED} onChange={(on) => run(setLottieLoop(documentStore.getState(), ids, on))} />
      </Row>
      {serialized === MIXED && <span>Clips have different color replacements</span>}
      {serialized !== MIXED &&
        overrides.map((row, index) => (
          <Row key={index} label={`Color ${index + 1}`}>
            <ColorField value={row.from} recent={recent} ariaLabel={`Replaced color ${index + 1}`} onChange={(color) => edit(withFrom(overrides, index, color), "Change replaced color")} />
            <ColorField
              value={row.to}
              recent={recent}
              ariaLabel={`New color ${index + 1}`}
              onChange={(color) => {
                edit(withTo(overrides, index, color), "Change animation color");
                rememberColor(color);
              }}
            />
            <IconButton control icon={X} label={`Remove color replacement ${index + 1}`} onClick={() => edit(withoutRow(overrides, index), "Remove color replacement")} />
          </Row>
        ))}
      <Row label="Colors">
        <IconButton control icon={Plus} text="Add color" label="Replace another color of the animation" onClick={() => void addColorOverride()} />
        <IconButton control text="Clear" label="Remove every color replacement" disabled={overrides.length === 0 && serialized !== MIXED} onClick={clearColorOverrides} />
      </Row>
    </>
  );
}
