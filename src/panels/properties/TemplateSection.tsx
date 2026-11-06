import { RotateCcw } from "lucide-react";
import { useMemo } from "react";
import { saveSequenceAsTemplate } from "../../app/compoundTemplateController.js";
import { rememberColor } from "../../app/propertiesController.js";
import { appSettings, documentStore } from "../../app/services.js";
import type { Command } from "../../core/commands/command.js";
import { isRgba } from "../../core/document/color.js";
import { paramValue } from "../../core/document/templates.js";
import type { ClipId, CompoundClip, JsonValue, RGBA, TemplateParam } from "../../core/document/types.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import { resetInstanceValues, setInstanceValue } from "../../timeline/edit/templates.js";
import { ColorField } from "../../ui/ColorField.js";
import { IconButton } from "../../ui/IconButton.js";
import { NumberField, useValueBinding } from "../../ui/NumberField.js";
import { Select } from "../../ui/Select.js";
import { TextField } from "../../ui/TextField.js";
import { Toggle } from "../../ui/Toggle.js";
import { Row } from "./Section.js";

// The instance form of a template (spec §21.24, Batch 80): one field per parameter of the sequence the selected
// compound clip shows, edited as a simple form; every field has a Reset, and Reset all clears the instance's own
// values. With several instances of one template selected, an edit applies to all of them.

const selectRecent = (settings: { recentColors: readonly string[] }) => settings.recentColors;

const run = (command: Command | null) => {
  if (command) documentStore.dispatch(command);
};

const WHITE: RGBA = { r: 1, g: 1, b: 1, a: 1 };

function NumberParam({ param, value, onSet }: { param: TemplateParam; value: number; onSet: (value: number) => void }) {
  const binding = useValueBinding(value, onSet);
  return <NumberField binding={binding} ariaLabel={param.label} precision={param.max !== undefined && param.max <= 1 ? 2 : 0} {...(param.min !== undefined && { min: param.min })} {...(param.max !== undefined && { max: param.max })} />;
}

export function TemplateSection({ ids }: { ids: readonly ClipId[] }) {
  const recent = useStoreSelector(appSettings, selectRecent);
  const primary = useStoreSelector(documentStore, (project) => {
    const clip = ids[0] === undefined ? undefined : project.clips[ids[0]];
    return clip?.kind === "compound" ? clip : null;
  });
  const sequence = useStoreSelector(documentStore, (project) => (primary ? (project.sequences[primary.sequenceId] ?? null) : null));
  const mediaOptions = useStoreSelector(documentStore, (project) => project.media);
  const options = useMemo(() => Object.values(mediaOptions).map((item) => ({ value: item.id, label: item.name })), [mediaOptions]);
  if (!primary || !sequence) return null;
  const params = sequence.params ?? [];
  const set = (param: TemplateParam, value: JsonValue) => run(setInstanceValue(documentStore.getState(), ids, param.id, value));
  const own = (instance: CompoundClip, param: TemplateParam) => instance.params?.[param.id] !== undefined;

  return (
    <>
      {params.map((param) => {
        const value = paramValue(primary, param);
        const control = (() => {
          switch (param.kind) {
            case "text":
              return <TextField value={String(value)} ariaLabel={param.label} onCommit={(text) => set(param, text)} />;
            case "font":
              return <TextField value={String(value)} ariaLabel={param.label} onCommit={(text) => set(param, text)} />;
            case "color":
              return (
                <ColorField
                  value={isRgba(value as never) ? (value as unknown as RGBA) : WHITE}
                  recent={recent}
                  ariaLabel={param.label}
                  onChange={(color) => {
                    set(param, { ...color });
                    rememberColor(color);
                  }}
                />
              );
            case "number":
              return <NumberParam param={param} value={typeof value === "number" ? value : 0} onSet={(next) => set(param, next)} />;
            case "toggle":
              return <Toggle label={param.label} checked={value === true} onChange={(on) => set(param, on)} />;
            case "media":
              return <Select value={String(value)} options={options} label={param.label} onChange={(id) => set(param, id)} />;
          }
        })();
        return (
          <Row key={param.id} label={param.label}>
            {control}
            <IconButton control icon={RotateCcw} label={`Reset ${param.label}`} disabled={!own(primary, param)} onClick={() => run(resetInstanceValues(documentStore.getState(), ids, param.id))} />
          </Row>
        );
      })}
      <Row label="Template">
        <IconButton control text="Reset all" label="Reset every field to the template's values" disabled={primary.params === undefined || Object.keys(primary.params).length === 0} onClick={() => run(resetInstanceValues(documentStore.getState(), ids, null))} />
        <IconButton control text="Save as template" label="Save this compound as a reusable template" onClick={() => void saveSequenceAsTemplate(sequence.id)} />
      </Row>
    </>
  );
}
