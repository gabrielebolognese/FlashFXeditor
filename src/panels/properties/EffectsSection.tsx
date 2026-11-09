import { ArrowDown, ArrowUp, Diamond, GripVertical, Timer, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, type DragEvent, type MouseEvent } from "react";
import { rememberColor } from "../../app/propertiesController.js";
import { effectBinding, effectStopwatch, effectToggleKey, enableEffect, moveOneEffect, previewEffectColor, removeOneEffect, setEffectChoice, setEffectColor, setEffectToggle, shownParam } from "../../app/effectController.js";
import { appSettings, documentStore, sessionStore } from "../../app/services.js";
import { EFFECT_TYPES, type Clip, type ClipId, type Effect, type EffectType, type Keyframes, type Project, type RGBA } from "../../core/document/types.js";
import { effectKeys } from "../../core/effects/effectEval.js";
import { EFFECT_DEFS, type EffectParamDef } from "../../core/effects/effectParams.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import { takesEffects } from "../../timeline/edit/effects.js";
import { ColorField } from "../../ui/ColorField.js";
import { IconButton } from "../../ui/IconButton.js";
import iconStyles from "../../ui/IconButton.module.css";
import { NumberField } from "../../ui/NumberField.js";
import { Select, type SelectOption } from "../../ui/Select.js";
import { Toggle } from "../../ui/Toggle.js";
import { effectAddCommand } from "./effectIcons.js";
import styles from "./EffectsSection.module.css";
import keyStyles from "./KeyframeControls.module.css";
import { Row } from "./Section.js";

// The Effects section (spec §21.19, Batch 74). For the selected visual clips: add each effect type and
// Remove effects. For one clip, its stack in order (earlier effects apply first): per effect a header with
// its enable switch, a drag handle (drop on another effect's header to move it there; Move up / Move down
// for the keyboard) and remove, then its parameters: numbers (bound outside React, effectController; a scrub
// draws live, one command on release), colors, choices and switches, each keyframeable one with a key diamond
// and a stopwatch. The section renders on the stack's structure only (narrow selector, P1); the diamonds
// follow the playhead through DOM writes.

type EffectClip = Clip & { effects?: Effect[]; keyframes?: Keyframes };
type EffectRow = [id: string, type: EffectType, enabled: 0 | 1, keyed: string[]];

const keepFocus = (event: MouseEvent) => event.preventDefault();
const DRAG_TYPE = "application/x-shorts-editor-effect";
const selectRecent = (settings: { recentColors: readonly string[] }) => settings.recentColors;

/** The one clip's stack as one string (id, type, enabled, keyed params): a render only when it changes. */
function signatureOf(project: Project, id: ClipId | undefined): string {
  const clip = id === undefined ? undefined : (project.clips[id] as EffectClip | undefined);
  if (!clip || !takesEffects(clip)) return "";
  return JSON.stringify((clip.effects ?? []).map((e) => [e.id, e.type, e.enabled ? 1 : 0, Object.keys(clip.keyframes ?? {}).filter((prop) => prop.startsWith(`effects.${e.id}.`)).sort()]));
}

/** Whether `param` of effect `effectId` has a key at the playhead. */
function keyAt(clipId: ClipId, effectId: string, param: string): boolean {
  const clip = documentStore.getState().clips[clipId] as EffectClip | undefined;
  if (!clip) return false;
  const rel = sessionStore.state.getState().playhead - clip.start;
  return effectKeys(clip.keyframes, effectId, param)?.some((k) => k.frame === rel) ?? false;
}

/** The key diamond (follows the playhead through DOM writes) and the stopwatch of one parameter. */
function EffectKeys({ clipId, effectId, param, name, keyed }: { clipId: ClipId; effectId: string; param: string; name: string; keyed: boolean }) {
  const keyRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const button = keyRef.current;
    if (!button) return undefined;
    const update = () => {
      const onKey = keyAt(clipId, effectId, param);
      const label = onKey ? `Remove ${name} keyframe` : `Add ${name} keyframe`;
      button.setAttribute("aria-pressed", String(onKey));
      button.setAttribute("aria-label", label);
      button.setAttribute("data-tooltip", label);
    };
    update();
    const stops = [documentStore.subscribe(update, { affects: ["composite"] }), sessionStore.state.select((state) => state.playhead, update)];
    return () => {
      for (const stop of stops) stop();
    };
  }, [clipId, effectId, param, name]);
  return (
    <>
      <button
        ref={keyRef}
        type="button"
        className={iconStyles.button}
        data-size="compact"
        aria-label={`Add ${name} keyframe`}
        aria-pressed={false}
        aria-disabled={!keyed || undefined}
        data-tooltip={`Add ${name} keyframe`}
        data-control=""
        onMouseDown={keepFocus}
        onClick={keyed ? () => effectToggleKey(clipId, effectId, param) : undefined}
      >
        <Diamond className={iconStyles.icon} aria-hidden="true" />
      </button>
      <IconButton control icon={Timer} label={keyed ? `Stop animating ${name} (removes its keyframes)` : `Animate ${name}`} pressed={keyed} onClick={() => effectStopwatch(clipId, effectId, param, !keyed)} />
    </>
  );
}

const toRgba = (value: number | number[] | string | null): RGBA => {
  const c = Array.isArray(value) ? value : [0, 0, 0, 1];
  return { r: c[0] ?? 0, g: c[1] ?? 0, b: c[2] ?? 0, a: c[3] ?? 1 };
};

function EffectParam({ clipId, effectId, index, def, keyed, recent }: { clipId: ClipId; effectId: string; index: number; def: EffectParamDef; keyed: boolean; recent: readonly string[] }) {
  const binding = useMemo(() => (def.kind === "number" ? effectBinding(clipId, effectId, def.name) : null), [clipId, effectId, def]);
  const name = def.label.toLowerCase();
  const aria = `Effect ${index + 1} ${name}`;
  // Colors, choices and switches render from the document (they change by commands only, or live while a color is dragged).
  const value = useStoreSelector(
    documentStore,
    useCallback(() => (def.kind === "number" ? null : JSON.stringify(shownParam(clipId, effectId, def.name))), [clipId, effectId, def]),
  );
  const parsed = value === null ? null : (JSON.parse(value) as number | number[] | string | null);
  const keys = def.keyframeable ? <EffectKeys clipId={clipId} effectId={effectId} param={def.name} name={name} keyed={keyed} /> : null;
  let control;
  if (def.kind === "number" && binding) {
    control = <NumberField label={def.label.charAt(0)} unit={def.unit} binding={binding} precision={def.max !== undefined && def.max <= 5 ? 2 : 0} step={def.max !== undefined && def.max <= 5 ? 0.01 : 1} min={def.min} max={def.max} ariaLabel={aria} />;
  } else if (def.kind === "color") {
    control = (
      <ColorField
        value={toRgba(parsed)}
        recent={recent}
        ariaLabel={aria}
        onPreview={(color) => previewEffectColor(clipId, effectId, def.name, color)}
        onChange={(color) => {
          setEffectColor(clipId, effectId, def.name, color);
          rememberColor(color);
        }}
      />
    );
  } else if (def.kind === "choice") {
    const options: SelectOption<string>[] = (def.options ?? []).map((option) => ({ value: option, label: option.charAt(0).toUpperCase() + option.slice(1) }));
    control = <Select label={aria} value={typeof parsed === "string" ? parsed : (options[0]?.value ?? "")} options={options} onChange={(next) => setEffectChoice(clipId, effectId, def.name, next)} />;
  } else {
    control = <Toggle label={aria} checked={parsed === 1} onChange={(on) => setEffectToggle(clipId, effectId, def.name, on)} />;
  }
  return (
    <Row label={def.label}>
      <span className={keyStyles.controls}>
        {control}
        {keys}
      </span>
    </Row>
  );
}

/** Drop position over an effect header: before or after it, by the pointer's half. */
function dropSide(event: DragEvent<HTMLElement>): "before" | "after" {
  const box = event.currentTarget.getBoundingClientRect();
  return event.clientY < box.top + box.height / 2 ? "before" : "after";
}

function EffectBlock({ clipId, row, index, count, recent }: { clipId: ClipId; row: EffectRow; index: number; count: number; recent: readonly string[] }) {
  const [effectId, type, enabled, keyedProps] = row;
  const def = EFFECT_DEFS[type];
  const label = `${index + 1}. ${def.label}`;
  const onDragOver = (event: DragEvent<HTMLElement>) => {
    if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    event.currentTarget.setAttribute("data-drop", dropSide(event));
  };
  const clearDrop = (event: DragEvent<HTMLElement>) => event.currentTarget.removeAttribute("data-drop");
  const onDrop = (event: DragEvent<HTMLElement>) => {
    const dragged = event.dataTransfer.getData(DRAG_TYPE);
    const side = dropSide(event);
    event.currentTarget.removeAttribute("data-drop");
    if (!dragged) return;
    event.preventDefault();
    const effects = (documentStore.getState().clips[clipId] as EffectClip | undefined)?.effects ?? [];
    const from = effects.findIndex((e) => e.id === dragged);
    if (from < 0) return;
    // The index it lands at once removed from its place.
    let to = side === "before" ? index : index + 1;
    if (from < to) to -= 1;
    moveOneEffect(clipId, dragged, to);
  };
  return (
    <>
      <Row label={label}>
        <span className={styles.header} onDragOver={onDragOver} onDragLeave={clearDrop} onDrop={onDrop}>
          <Toggle label={`Effect ${index + 1} (${def.label.toLowerCase()}) on`} tooltip={enabled ? "Turn this effect off" : "Turn this effect on"} checked={enabled === 1} onChange={(on) => enableEffect(clipId, effectId, on)} />
          <button
            type="button"
            className={`${iconStyles.button} ${styles.grip}`}
            data-size="compact"
            data-control=""
            draggable
            aria-label={`Drag to reorder ${def.label.toLowerCase()}`}
            data-tooltip="Drag to reorder"
            onMouseDown={keepFocus}
            onDragStart={(event) => {
              event.dataTransfer.setData(DRAG_TYPE, effectId);
              event.dataTransfer.effectAllowed = "move";
            }}
          >
            <GripVertical className={iconStyles.icon} aria-hidden="true" />
          </button>
          <IconButton control icon={ArrowUp} label="Move effect up" disabled={index === 0} onClick={() => moveOneEffect(clipId, effectId, index - 1)} />
          <IconButton control icon={ArrowDown} label="Move effect down" disabled={index === count - 1} onClick={() => moveOneEffect(clipId, effectId, index + 1)} />
          <IconButton control icon={Trash2} label="Remove effect" onClick={() => removeOneEffect(clipId, effectId)} />
        </span>
      </Row>
      {def.params.map((param) => (
        <EffectParam key={param.name} clipId={clipId} effectId={effectId} index={index} def={param} keyed={keyedProps.includes(`effects.${effectId}.${param.name}`)} recent={recent} />
      ))}
    </>
  );
}

export function EffectsSection({ ids }: { ids: readonly ClipId[] }) {
  const one = ids.length === 1 ? ids[0] : undefined;
  const signature = useStoreSelector(
    documentStore,
    useCallback((project: Project) => signatureOf(project, one), [one]),
  );
  const recent = useStoreSelector(appSettings, selectRecent);
  const rows = useMemo(() => (signature === "" ? [] : (JSON.parse(signature) as EffectRow[])), [signature]);
  return (
    <>
      <Row label="Add">
        <span className={keyStyles.controls}>
          {EFFECT_TYPES.map((type) => (
            <IconButton key={type} commandId={effectAddCommand(type)} />
          ))}
          <IconButton commandId="clip.effect.removeAll" />
        </span>
      </Row>
      {one !== undefined && rows.map((row, index) => <EffectBlock key={row[0]} clipId={one} row={row} index={index} count={rows.length} recent={recent} />)}
    </>
  );
}
