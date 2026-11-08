import { useMemo } from "react";
import { documentStore, sessionStore } from "../../app/services.js";
import { isEaseId } from "../../core/document/keyframes.js";
import { COUNTER_SEPARATORS, type Clip, type ClipId, type CounterSeparator, type TextCounter } from "../../core/document/types.js";
import { EASE_LABELS, TEXT_EASES } from "../../text/anim.js";
import { MAX_COUNTER_DECIMALS, newCounter } from "../../text/counter.js";
import { editTextClips, setCounterField, setCounterOn } from "../../timeline/edit/animators.js";
import { NumberField, valueBinding } from "../../ui/NumberField.js";
import { Select } from "../../ui/Select.js";
import { Toggle } from "../../ui/Toggle.js";
import { primaryText } from "./animatorBinding.js";
import { Row } from "./Section.js";
import { MIXED, SKIP, useClipsShared } from "./useShared.js";
import text from "./TextSection.module.css";

// The Counter rows of the Text section (spec §21.13, Batch 68): turns the text into a number that counts
// from one value to another over the clip (decimals, prefix, suffix, thousands separator, easing). The
// clip text keeps the final value.

const SEPARATOR_LABELS: Record<CounterSeparator, string> = { "": "None", ",": "Comma", ".": "Dot", " ": "Space", "'": "Apostrophe" };
const hasCounter = (clip: Clip) => (clip.kind === "text" ? clip.counter !== undefined : SKIP);

const run = (ids: readonly ClipId[], label: string, change: (counter: TextCounter) => Partial<TextCounter>) => {
  const command = editTextClips(documentStore.getState(), ids, (clip) => setCounterField(clip, change(clip.counter as TextCounter)), { label, at: sessionStore.state.getState().playhead });
  if (command) documentStore.dispatch(command);
};

function numberBinding(ids: readonly ClipId[], field: "from" | "to" | "decimals", label: string, min: number, max: number) {
  const read = () => primaryText(documentStore.getState(), ids)?.counter?.[field] ?? null;
  return valueBinding({ read, subscribe: (listener) => documentStore.subscribe(() => listener(), { affects: ["text"] }) }, (value) => run(ids, label, () => ({ [field]: Math.min(max, Math.max(min, value)) })));
}

export function CounterRows({ ids }: { ids: readonly ClipId[] }) {
  const on = useClipsShared(ids, hasCounter);
  const from = useMemo(() => numberBinding(ids, "from", "Change counter start", -1e9, 1e9), [ids]);
  const to = useMemo(() => numberBinding(ids, "to", "Change counter end", -1e9, 1e9), [ids]);
  const decimals = useMemo(() => numberBinding(ids, "decimals", "Change counter decimals", 0, MAX_COUNTER_DECIMALS), [ids]);
  const counter = primaryText(documentStore.getState(), ids)?.counter;
  const enabled = on === true;
  return (
    <>
      <Row label="Counter">
        <Toggle
          checked={enabled}
          mixed={on === MIXED}
          label="Counter: the text counts from one number to another"
          onChange={(next) => {
            const command = editTextClips(documentStore.getState(), ids, (clip) => setCounterOn(clip, next, newCounter), { label: next ? "Turn text into a counter" : "Turn counter off", at: sessionStore.state.getState().playhead });
            if (command) documentStore.dispatch(command);
          }}
        />
      </Row>
      <Row label="From">
        <NumberField label="0" binding={from} precision={2} min={-1e9} max={1e9} disabled={!enabled} ariaLabel="Counter from" />
      </Row>
      <Row label="To">
        <NumberField label="9" binding={to} precision={2} min={-1e9} max={1e9} disabled={!enabled} ariaLabel="Counter to" />
      </Row>
      <Row label="Decimals">
        <NumberField label="." binding={decimals} precision={0} min={0} max={MAX_COUNTER_DECIMALS} disabled={!enabled} ariaLabel="Counter decimals" />
      </Row>
      <Row label="Prefix">
        <input className={text.counterText} aria-label="Counter prefix" disabled={!enabled} value={counter?.prefix ?? ""} onChange={(e) => run(ids, "Change counter prefix", () => ({ prefix: e.target.value }))} />
      </Row>
      <Row label="Suffix">
        <input className={text.counterText} aria-label="Counter suffix" disabled={!enabled} value={counter?.suffix ?? ""} onChange={(e) => run(ids, "Change counter suffix", () => ({ suffix: e.target.value }))} />
      </Row>
      <Row label="Thousands">
        <Select label="Counter thousands separator" value={counter?.separator ?? ""} disabled={!enabled} options={COUNTER_SEPARATORS.map((value) => ({ value, label: SEPARATOR_LABELS[value] }))} onChange={(separator) => run(ids, "Change counter separator", () => ({ separator }))} />
      </Row>
      <Row label="Easing">
        <Select
          label="Counter easing"
          value={counter?.ease ?? "easeOut"}
          disabled={!enabled}
          options={TEXT_EASES.map((value) => ({ value, label: EASE_LABELS[value] }))}
          onChange={(ease) => isEaseId(ease) && run(ids, "Change counter easing", () => ({ ease }))}
        />
      </Row>
    </>
  );
}
