import { Trash2 } from "lucide-react";
import { useState } from "react";
import { documentStore } from "../../app/services.js";
import type { Command } from "../../core/commands/command.js";
import { getPath } from "../../core/document/templates.js";
import type { ClipId, JsonValue, SequenceId } from "../../core/document/types.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import { addParamTarget, EXPOSABLE_FIELDS as FIELDS, exposeKinds, exposeParam, exposeProblem, removeParam, updateParam } from "../../timeline/edit/templates.js";
import { IconButton } from "../../ui/IconButton.js";
import { NumberField, useValueBinding } from "../../ui/NumberField.js";
import { Select } from "../../ui/Select.js";
import { TextField } from "../../ui/TextField.js";
import { Row } from "./Section.js";

// The Parameters section (spec §21.24, Batch 80): shown inside an open compound. Lists the parameters of its
// sequence (rename, number range, default from the current value, remove) and exposes a field of the selected
// clip: as a new parameter, or as one more field of an existing parameter.

const run = (command: Command | null) => {
  if (command) documentStore.dispatch(command);
};

function Bound({ label, value, onSet }: { label: string; value: number | null; onSet: (value: number | null) => void }) {
  const binding = useValueBinding(value ?? 0, (next) => onSet(next));
  return <NumberField binding={binding} ariaLabel={label} precision={2} step={1} />;
}

export function ParametersSection({ sequenceId, primary }: { sequenceId: SequenceId; primary: ClipId }) {
  const params = useStoreSelector(documentStore, (project) => project.sequences[sequenceId]?.params);
  const exposable = useStoreSelector(documentStore, (project) => FIELDS.filter((field) => exposeProblem(project, primary, field.path) === null).map((field) => field.path).join(","));
  const [path, setPath] = useState<string>("");
  const [target, setTarget] = useState<string>("");
  const paths = exposable === "" ? [] : exposable.split(",");
  const chosen = paths.includes(path) ? path : (paths[0] ?? "");
  const project = documentStore.getState();
  const pathOptions = paths.map((value) => ({ value, label: FIELDS.find((field) => field.path === value)?.label ?? value }));
  const targetOptions = (params ?? []).filter((param) => chosen !== "" && exposeKinds(project, primary, chosen).includes(param.kind)).map((param) => ({ value: param.id, label: param.label }));
  const chosenTarget = targetOptions.some((option) => option.value === target) ? target : (targetOptions[0]?.value ?? "");

  return (
    <>
      {(params ?? []).map((param) => {
        const first = param.targets[0];
        const current = first ? (getPath(documentStore.getState().clips[first.clipId], first.path) as JsonValue | undefined) : undefined;
        return (
          <div key={param.id} style={{ display: "contents" }}>
            <Row label={param.kind}>
              <TextField value={param.label} ariaLabel={`Name of ${param.label}`} onCommit={(label) => run(updateParam(documentStore.getState(), sequenceId, param.id, { label }))} />
              <IconButton control icon={Trash2} label={`Remove ${param.label}`} onClick={() => run(removeParam(documentStore.getState(), sequenceId, param.id))} />
            </Row>
            {param.kind === "number" && (
              <Row label="Range">
                <Bound label={`Minimum of ${param.label}`} value={param.min ?? null} onSet={(min) => run(updateParam(documentStore.getState(), sequenceId, param.id, { min }))} />
                <Bound label={`Maximum of ${param.label}`} value={param.max ?? null} onSet={(max) => run(updateParam(documentStore.getState(), sequenceId, param.id, { max }))} />
              </Row>
            )}
            <Row label="Default">
              <IconButton control text="Use current" label={`Make the field's current value the default of ${param.label}`} disabled={current === undefined} onClick={() => current !== undefined && run(updateParam(documentStore.getState(), sequenceId, param.id, { default: structuredClone(current) }))} />
            </Row>
          </div>
        );
      })}
      <Row label="Field">
        <Select value={chosen} options={pathOptions} label="Field to expose" disabled={pathOptions.length === 0} onChange={setPath} />
      </Row>
      <Row label="Expose">
        <IconButton control text="As parameter" label="Make the field a parameter of this compound" disabled={chosen === ""} onClick={() => run(exposeParam(documentStore.getState(), primary, chosen))} />
      </Row>
      {targetOptions.length > 0 && (
        <Row label="Add to">
          <Select value={chosenTarget} options={targetOptions} label="Parameter to add the field to" onChange={setTarget} />
          <IconButton control text="Add" label="Make the field follow that parameter" onClick={() => run(addParamTarget(documentStore.getState(), sequenceId, chosenTarget, primary, chosen))} />
        </Row>
      )}
    </>
  );
}
