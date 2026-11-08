import { Diamond, Timer, X } from "lucide-react";
import { useMemo, useSyncExternalStore } from "react";
import { appSettings, documentStore, sessionStore } from "../../app/services.js";
import { rememberColor } from "../../app/propertiesController.js";
import { SELECTOR_ORDERS, SELECTOR_SHAPES, TEXT_ANIM_UNITS, type ClipId, type Project, type RGBA, type TextAnimator } from "../../core/document/types.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import { addAnimator, animatorKeyed, animatorKeyProp, animatorOf, editTextClips, removeAnimator, setAnimatorChoice, setAnimatorProp, setAnimatorStopwatch, toggleAnimatorKey, type AnimatorNumberField } from "../../timeline/edit/animators.js";
import { ColorField } from "../../ui/ColorField.js";
import { IconButton } from "../../ui/IconButton.js";
import { NumberField } from "../../ui/NumberField.js";
import { Select } from "../../ui/Select.js";
import { animatorBinding, primaryText, type AnimatorBindingDeps, type AnimatorNumberProp } from "./animatorBinding.js";
import { Row } from "./Section.js";

// The Animators section (spec §21.13, §11) of the selected text clips: a list of range-selector animators,
// each with its unit (character, word, line), the selector (shape, order, start, end, offset, ease, seed;
// start, end and offset have stopwatches) and the properties it moves (position, scale, rotation, opacity,
// blur, tracking and a tint color). The section shows the first selected text clip's animators; an edit
// writes the animator of the same id on every selected text clip that has it. Number fields are bound
// outside React (animatorBinding.ts); the list re-renders only when animators are added, removed or keyed.

const DEPS: AnimatorBindingDeps = {
  document: documentStore,
  playhead: { get: () => sessionStore.state.getState().playhead, subscribe: (listener) => sessionStore.state.select((state) => state.playhead, listener) },
};

const PCT = (field: AnimatorNumberField, label: string, min: number, max: number): AnimatorNumberProp => ({ field, label, scale: 100, min, max, precision: 0 });
const NUM = (field: AnimatorNumberField, label: string, min: number, max: number, precision = 1): AnimatorNumberProp => ({ field, label, scale: 1, min, max, precision });

const SELECTOR_ROWS: { prop: AnimatorNumberProp; row: string; unit: string; keyable: boolean }[] = [
  { prop: PCT("selector.start", "Selector start", -200, 300), row: "Start", unit: "%", keyable: true },
  { prop: PCT("selector.end", "Selector end", -200, 300), row: "End", unit: "%", keyable: true },
  { prop: PCT("selector.offset", "Selector offset", -300, 300), row: "Offset", unit: "%", keyable: true },
  { prop: PCT("selector.ease", "Selector ease", -100, 100), row: "Ease", unit: "%", keyable: false },
  { prop: NUM("selector.seed", "Selector seed", 0, 9999, 0), row: "Seed", unit: "#", keyable: false },
];

const PROP_ROWS: { prop: AnimatorNumberProp; row: string; unit: string }[] = [
  { prop: NUM("props.x", "Position X", -4096, 4096), row: "X", unit: "px" },
  { prop: NUM("props.y", "Position Y", -4096, 4096), row: "Y", unit: "px" },
  { prop: PCT("props.scale", "Scale", 0, 1000), row: "Scale", unit: "%" },
  { prop: NUM("props.rotation", "Rotation", -3600, 3600), row: "Rotation", unit: "°" },
  { prop: PCT("props.opacity", "Opacity", 0, 100), row: "Opacity", unit: "%" },
  { prop: NUM("props.blur", "Blur", 0, 256), row: "Blur", unit: "px" },
  { prop: NUM("props.tracking", "Tracking", -512, 512), row: "Tracking", unit: "px" },
];

const UNIT_LABELS = { char: "Character", word: "Word", line: "Line" } as const;
const SHAPE_LABELS = { square: "Square", rampUp: "Ramp up", rampDown: "Ramp down", triangle: "Triangle", round: "Round", smooth: "Smooth" } as const;
const ORDER_LABELS = { forward: "Forward", reverse: "Reverse", random: "Random" } as const;

const run = (ids: readonly ClipId[], label: string, edit: Parameters<typeof editTextClips>[2]) => {
  const command = editTextClips(documentStore.getState(), ids, edit, { label, at: sessionStore.state.getState().playhead });
  if (command) documentStore.dispatch(command);
};

const KEYABLE = ["selector.start", "selector.end", "selector.offset", "props.x", "props.y", "props.scale", "props.rotation", "props.opacity", "props.blur", "props.tracking"];

/** The animators of the first text clip as one string, so the list renders again only when they change (ids, choices, keys, tint). */
const listKey = (project: Project, ids: readonly ClipId[]): string => {
  const clip = primaryText(project, ids);
  if (!clip) return "";
  return (clip.animators ?? []).map((a) => `${a.id}~${a.unit}~${a.selector.shape}~${a.selector.order}~${a.props.fill ? "t" : "-"}~${KEYABLE.map((f) => (animatorKeyed(clip, a.id, f) ? 1 : 0)).join("")}`).join("|");
};

function KeyButtons({ ids, animatorId, field, keyed }: { ids: readonly ClipId[]; animatorId: string; field: AnimatorNumberField; keyed: boolean }) {
  const name = field.replace(/^(selector|props)\./, "$1 ");
  return (
    <>
      <IconButton control icon={Diamond} label={`Add or remove a ${name} keyframe at the playhead`} disabled={!keyed} onClick={() => run(ids, "Toggle animator keyframe", (clip, rel) => toggleAnimatorKey(clip, animatorId, field, rel))} />
      <IconButton
        control
        icon={Timer}
        label={keyed ? `Stop animating ${name} (removes its keyframes)` : `Animate ${name}`}
        pressed={keyed}
        onClick={() => run(ids, keyed ? "Remove animator keyframes" : "Animate animator field", (clip, rel) => setAnimatorStopwatch(clip, animatorId, field, !keyed, rel))}
      />
    </>
  );
}

function NumberRow({ ids, animator, prop, row, unit, keyable, keyed }: { ids: readonly ClipId[]; animator: TextAnimator; prop: AnimatorNumberProp; row: string; unit: string; keyable: boolean; keyed: boolean }) {
  const binding = useMemo(() => animatorBinding(DEPS, prop, ids, animator.id), [ids, prop, animator.id]);
  const keyProp = animatorKeyProp(animator.id, prop.field);
  return (
    <Row label={row}>
      <NumberField label={unit} binding={binding} precision={prop.precision} min={prop.min} max={prop.max} ariaLabel={`${prop.label} (animator ${animator.id})`} />
      {keyable && keyProp !== null && <KeyButtons ids={ids} animatorId={animator.id} field={prop.field} keyed={keyed} />}
    </Row>
  );
}

const WHITE: RGBA = { r: 1, g: 1, b: 1, a: 1 };
const selectRecent = (settings: { recentColors: readonly string[] }) => settings.recentColors;

function AnimatorBlock({ ids, animatorId, index }: { ids: readonly ClipId[]; animatorId: string; index: number }) {
  const recent = useStoreSelector(appSettings, selectRecent);
  const clip = primaryText(documentStore.getState(), ids);
  const animator = clip ? animatorOf(clip, animatorId) : undefined;
  if (!clip || !animator) return null;
  const n = index + 1;
  return (
    <>
      <Row label={`Animator ${n}`}>
        <IconButton control icon={X} label={`Remove animator ${n}`} onClick={() => run(ids, "Remove animator", (c) => removeAnimator(c, animatorId))} />
      </Row>
      <Row label="Unit">
        <Select label={`Animator ${n} unit`} value={animator.unit} options={TEXT_ANIM_UNITS.map((value) => ({ value, label: UNIT_LABELS[value] }))} onChange={(value) => run(ids, "Change animator unit", (c) => setAnimatorChoice(c, animatorId, "unit", value))} />
      </Row>
      <Row label="Shape">
        <Select label={`Animator ${n} selector shape`} value={animator.selector.shape} options={SELECTOR_SHAPES.map((value) => ({ value, label: SHAPE_LABELS[value] }))} onChange={(value) => run(ids, "Change selector shape", (c) => setAnimatorChoice(c, animatorId, "selector.shape", value))} />
      </Row>
      <Row label="Order">
        <Select label={`Animator ${n} selector order`} value={animator.selector.order} options={SELECTOR_ORDERS.map((value) => ({ value, label: ORDER_LABELS[value] }))} onChange={(value) => run(ids, "Change selector order", (c) => setAnimatorChoice(c, animatorId, "selector.order", value))} />
      </Row>
      {SELECTOR_ROWS.map((r) => (
        <NumberRow key={r.prop.field} ids={ids} animator={animator} prop={r.prop} row={r.row} unit={r.unit} keyable={r.keyable} keyed={animatorKeyed(clip, animatorId, r.prop.field)} />
      ))}
      {PROP_ROWS.map((r) => (
        <NumberRow key={r.prop.field} ids={ids} animator={animator} prop={r.prop} row={r.row} unit={r.unit} keyable keyed={animatorKeyed(clip, animatorId, r.prop.field)} />
      ))}
      <Row label="Tint">
        <ColorField
          value={animator.props.fill ?? WHITE}
          recent={recent}
          ariaLabel={`Animator ${n} tint color`}
          onChange={(color) => {
            run(ids, "Change animator tint", (c) => setAnimatorProp(c, animatorId, "fill", color));
            rememberColor(color);
          }}
        />
        <IconButton control text="None" label="No tint" pressed={animator.props.fill === undefined} onClick={() => run(ids, "Remove animator tint", (c) => setAnimatorProp(c, animatorId, "fill", null))} />
      </Row>
    </>
  );
}

export function AnimatorSection({ ids }: { ids: readonly ClipId[] }) {
  const key = useSyncExternalStore(
    (listener) => documentStore.subscribe(() => listener(), { affects: ["text", "clips"] }),
    () => listKey(documentStore.getState(), ids),
  );
  const list = key === "" ? [] : key.split("|").map((entry) => entry.split("~")[0] as string);
  return (
    <>
      {list.map((id, index) => (
        <AnimatorBlock key={`${id}:${key}`} ids={ids} animatorId={id} index={index} />
      ))}
      <Row label={list.length === 0 ? "Animators" : ""}>
        <IconButton control text="Add animator" label="Add an animator: moves the characters, words or lines one after another through a range" onClick={() => run(ids, "Add animator", (c) => void addAnimator(c))} />
      </Row>
    </>
  );
}
