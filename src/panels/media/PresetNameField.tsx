import { useRef, type KeyboardEvent } from "react";
import { barSet, presetNaming, saveSelectionAsPreset, suggestedPresetName } from "../../app/presetController.js";
import { MAX_PRESET_NAME } from "../../text/presets.js";
import fieldStyles from "../../ui/NumberField.module.css";
import { useFocusReturn } from "../properties/focusReturn.js";

/** Closed from inside (Enter, Esc), the field gives the focus back to the button that opened it in its panel. */
const opener =
  (command: string) =>
  ({ panel }: { panel: Element | null }) =>
    panel?.querySelector(`[data-command="${command}"]:not([aria-disabled])`);
const FROM_SAVE = opener("preset.save");
const FROM_BAR = opener("presetBar.add");

/**
 * The inline name field of Save as preset (spec §10.3): prefilled with the selected text's font and
 * size, all selected; Enter saves, Esc or a click elsewhere cancels. In the preset bar (`bar`, the `+`
 * button, spec §20.2) the new preset joins the set the bar shows.
 */
export function PresetNameField({ bar = false }: { bar?: boolean }) {
  const done = useRef(false);
  const field = useRef<HTMLLabelElement>(null);
  useFocusReturn(field, bar ? FROM_BAR : FROM_SAVE);
  const finish = (name: string | null) => {
    if (done.current) return;
    done.current = true;
    if (name !== null) saveSelectionAsPreset(name, bar ? barSet() : null);
    presetNaming.set(null);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") finish(event.currentTarget.value);
    else if (event.key === "Escape") {
      // The field's own Esc: not the app's (deselect, cancel a gesture).
      event.stopPropagation();
      finish(null);
    }
  };
  return (
    <label ref={field} className={fieldStyles.field}>
      <input
        className={`${fieldStyles.input} ${fieldStyles.text}`}
        defaultValue={suggestedPresetName()}
        maxLength={MAX_PRESET_NAME}
        aria-label="Preset name"
        placeholder="Preset name"
        spellCheck={false}
        autoFocus
        onFocus={(event) => event.currentTarget.select()}
        onKeyDown={onKeyDown}
        onBlur={() => finish(null)}
      />
    </label>
  );
}
