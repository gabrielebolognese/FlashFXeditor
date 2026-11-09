import { ArrowDown, ArrowUp, Diamond, Timer, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, type MouseEvent } from "react";
import { maskBinding, maskStopwatch, maskToggleKey, moveMask, removeOneMask, setMaskInverted, setMaskMode } from "../../app/maskController.js";
import { maskMode } from "../../app/previewController.js";
import { documentStore, sessionStore } from "../../app/services.js";
import { MASK_MODES, type Clip, type ClipId, type Keyframes, type Mask, type MaskMode, type Project } from "../../core/document/types.js";
import type { MaskField, MaskNumberField } from "../../core/masks/maskEval.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import { isMaskable, maskKeyAt } from "../../timeline/edit/masks.js";
import { IconButton } from "../../ui/IconButton.js";
import iconStyles from "../../ui/IconButton.module.css";
import { NumberField } from "../../ui/NumberField.js";
import { Select, type SelectOption } from "../../ui/Select.js";
import { Toggle } from "../../ui/Toggle.js";
import keyStyles from "./KeyframeControls.module.css";
import { Row } from "./Section.js";

// The Masks section (spec §21.18, Batch 73). For the selected visual clips: add a rectangle, ellipse or
// path mask, the Wipe in and Circle reveal presets, mask mode on the canvas (Alt+M) and Remove masks.
// For one clip, each of its masks in order: mode (add, subtract, intersect), invert, reorder and remove,
// then its number fields (position, size and roundness of a box; feather, expansion, opacity), each with
// a key diamond and a stopwatch; a path's points have one stopwatch (they are edited on the canvas).
// Number fields are bound outside React (maskController); the section renders on the masks' structure
// only (narrow selectors, P1); the diamonds follow the playhead through DOM writes.

type MaskedClip = Clip & { masks?: Mask[]; keyframes?: Keyframes };

const MODE_LABELS: Record<MaskMode, string> = { add: "Add", subtract: "Subtract", intersect: "Intersect" };
const MODE_OPTIONS: readonly SelectOption<MaskMode>[] = MASK_MODES.map((mode) => ({ value: mode, label: MODE_LABELS[mode] }));
const keepFocus = (event: MouseEvent) => event.preventDefault();

interface FieldUi {
  field: MaskNumberField;
  name: string;
  letter: string;
  unit: string | undefined;
  scale: number;
  min: number;
  max: number;
}
const FIELDS: Readonly<Record<MaskNumberField, FieldUi>> = {
  x: { field: "x", name: "X", letter: "X", unit: "px", scale: 1, min: -16384, max: 16384 },
  y: { field: "y", name: "Y", letter: "Y", unit: "px", scale: 1, min: -16384, max: 16384 },
  w: { field: "w", name: "Width", letter: "W", unit: "px", scale: 1, min: 0, max: 16384 },
  h: { field: "h", name: "Height", letter: "H", unit: "px", scale: 1, min: 0, max: 16384 },
  radius: { field: "radius", name: "Roundness", letter: "R", unit: "px", scale: 1, min: 0, max: 8192 },
  feather: { field: "feather", name: "Feather", letter: "F", unit: "px", scale: 1, min: 0, max: 2048 },
  expansion: { field: "expansion", name: "Expansion", letter: "E", unit: "px", scale: 1, min: -2048, max: 2048 },
  opacity: { field: "opacity", name: "Opacity", letter: "O", unit: "%", scale: 100, min: 0, max: 100 },
};

/** The one maskable clip's masks as one string (id, kind, mode, invert, keyed fields): a render only when they change. */
function signatureOf(project: Project, id: ClipId | undefined): string {
  const clip = id === undefined ? undefined : (project.clips[id] as MaskedClip | undefined);
  if (!clip || !isMaskable(clip)) return "";
  return JSON.stringify((clip.masks ?? []).map((m) => [m.id, m.shape.kind, m.mode, m.inverted ? 1 : 0, Object.keys(clip.keyframes ?? {}).filter((prop) => prop.startsWith(`masks.${m.id}.`)).sort()]));
}

/** The key diamond (follows the playhead through DOM writes) and the stopwatch of one mask field. */
function MaskKeys({ clipId, maskId, field, name, keyed }: { clipId: ClipId; maskId: string; field: MaskField; name: string; keyed: boolean }) {
  const keyRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const button = keyRef.current;
    if (!button) return undefined;
    const update = () => {
      const clip = documentStore.getState().clips[clipId] as MaskedClip | undefined;
      const onKey = clip ? maskKeyAt(clip, maskId, field, sessionStore.state.getState().playhead) : false;
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
  }, [clipId, maskId, field, name]);
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
        onClick={keyed ? () => maskToggleKey(clipId, maskId, field) : undefined}
      >
        <Diamond className={iconStyles.icon} aria-hidden="true" />
      </button>
      <IconButton control icon={Timer} label={keyed ? `Stop animating ${name} (removes its keyframes)` : `Animate ${name}`} pressed={keyed} onClick={() => maskStopwatch(clipId, maskId, field, !keyed)} />
    </>
  );
}

function MaskNumber({ clipId, maskId, index, ui, keyed }: { clipId: ClipId; maskId: string; index: number; ui: FieldUi; keyed: boolean }) {
  const binding = useMemo(() => maskBinding(clipId, maskId, ui.field, ui.scale), [clipId, maskId, ui]);
  return (
    <Row label={ui.name}>
      <span className={keyStyles.controls}>
        <NumberField label={ui.letter} unit={ui.unit} binding={binding} precision={0} min={ui.min} max={ui.max} ariaLabel={`Mask ${index + 1} ${ui.name.toLowerCase()}`} />
        <MaskKeys clipId={clipId} maskId={maskId} field={ui.field} name={ui.name.toLowerCase()} keyed={keyed} />
      </span>
    </Row>
  );
}

type MaskRow = [id: string, kind: Mask["shape"]["kind"], mode: MaskMode, inverted: 0 | 1, keyed: string[]];

function MaskBlock({ clipId, row, index, count }: { clipId: ClipId; row: MaskRow; index: number; count: number }) {
  const [maskId, kind, mode, inverted, keyedProps] = row;
  const keyed = (field: MaskField) => keyedProps.includes(`masks.${maskId}.${field}`);
  const fields: MaskNumberField[] = kind === "path" ? ["feather", "expansion", "opacity"] : kind === "rect" ? ["x", "y", "w", "h", "radius", "feather", "expansion", "opacity"] : ["x", "y", "w", "h", "feather", "expansion", "opacity"];
  const kindName = kind === "rect" ? "Rectangle" : kind === "ellipse" ? "Ellipse" : "Path";
  return (
    <>
      <Row label={`Mask ${index + 1}`}>
        <span className={keyStyles.controls}>
          <Select label={`Mask ${index + 1} mode (${kindName.toLowerCase()})`} value={mode} options={MODE_OPTIONS} onChange={(value) => setMaskMode(clipId, maskId, value)} />
          <IconButton control icon={ArrowUp} label="Move mask up" disabled={index === 0} onClick={() => moveMask(clipId, maskId, -1)} />
          <IconButton control icon={ArrowDown} label="Move mask down" disabled={index === count - 1} onClick={() => moveMask(clipId, maskId, 1)} />
          <IconButton control icon={Trash2} label="Remove mask" onClick={() => removeOneMask(clipId, maskId)} />
        </span>
      </Row>
      <Row label="Invert">
        <Toggle label={`Invert mask ${index + 1}`} tooltip="Keep the outside of the mask instead of the inside" checked={inverted === 1} onChange={(on) => setMaskInverted(clipId, maskId, on)} />
      </Row>
      {kind === "path" && (
        <Row label="Path">
          <span className={keyStyles.controls}>
            <MaskKeys clipId={clipId} maskId={maskId} field="path" name="path" keyed={keyed("path")} />
          </span>
        </Row>
      )}
      {fields.map((field) => (
        <MaskNumber key={field} clipId={clipId} maskId={maskId} index={index} ui={FIELDS[field]} keyed={keyed(field)} />
      ))}
    </>
  );
}

export function MasksSection({ ids }: { ids: readonly ClipId[] }) {
  const one = ids.length === 1 ? ids[0] : undefined;
  const signature = useStoreSelector(
    documentStore,
    useCallback((project: Project) => signatureOf(project, one), [one]),
  );
  const masking = useStoreSelector(
    maskMode,
    useCallback((state: { target: ClipId | null }) => one !== undefined && state.target === one, [one]),
  );
  const rows = useMemo(() => (signature === "" ? [] : (JSON.parse(signature) as MaskRow[])), [signature]);
  return (
    <>
      <Row label="Add">
        <span className={keyStyles.controls}>
          <IconButton commandId="clip.mask.addRect" />
          <IconButton commandId="clip.mask.addEllipse" />
          <IconButton commandId="clip.mask.addPath" />
          <IconButton commandId="canvas.maskMode" label={masking ? "Leave mask mode" : "Edit masks on the canvas"} pressed={masking} disabled={one === undefined} />
          <IconButton commandId="clip.mask.removeAll" />
        </span>
      </Row>
      <Row label="Presets">
        <span className={keyStyles.controls}>
          <IconButton commandId="clip.mask.wipeIn" text="Wipe in" />
          <IconButton commandId="clip.mask.circleReveal" text="Circle reveal" />
        </span>
      </Row>
      {one !== undefined && rows.map((row, index) => <MaskBlock key={row[0]} clipId={one} row={row} index={index} count={rows.length} />)}
    </>
  );
}
