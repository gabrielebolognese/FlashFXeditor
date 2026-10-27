import { useRef, type KeyboardEvent } from "react";
import { presetNaming, saveSelectionAsPreset, suggestedPresetName } from "../../app/presetController.js";
import { MAX_PRESET_NAME } from "../../text/presets.js";
import fieldStyles from "../../ui/NumberField.module.css";

/**
 * The inline name field of Save as preset (spec §10.3): prefilled with the selected text's font and
 * size, all selected; Enter saves, Esc or a click elsewhere cancels.
 */
export function PresetNameField() {
  const done = useRef(false);
  const finish = (name: string | null) => {
    if (done.current) return;
    done.current = true;
    if (name !== null) saveSelectionAsPreset(name);
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
    <label className={fieldStyles.field}>
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