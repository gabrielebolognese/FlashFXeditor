import { ChevronLeft, ChevronRight, Diamond, Timer } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, type MouseEvent } from "react";
import { editShapes, previewShapes, shapeGoToKey, shapeStopwatch, shapeToggleKey } from "../../app/shapeController.js";
import { liveEdit } from "../../app/liveEdit.js";
import { rememberColor } from "../../app/propertiesController.js";
import { appSettings, documentStore, sessionStore } from "../../app/services.js";
import { clipRel } from "../../core/document/keyframes.js";
import { formatHexColor } from "../../core/document/color.js";
import { fillAsMode, fillFirstColor, fillLastColor, fillMode, fillWithFirst, fillWithLast } from "../../core/document/fill.js";
import { FILL_RULES, LINE_CAPS, LINE_JOINS, type ClipId, type Fill, type PathStroke, type Project, type RGBA, type ShapeClip, type ShapePath } from "../../core/document/types.js";
import { PRIMITIVE_PARAMS } from "../../core/shapes/primitives.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import type { AppSettings } from "../../project/appSettings.js";
import { defaultStroke, SHAPE_GROUP_LABELS, setPathFill, setShapeField, shapeKeyFrames, shapeKindName, type PathFillMode, type ShapeKeyGroup } from "../../timeline/edit/shape.js";
import { ColorField } from "../../ui/ColorField.js";
import { IconButton } from "../../ui/IconButton.js";
import iconStyles from "../../ui/IconButton.module.css";
import { NumberField, roundTo, type NumberBinding } from "../../ui/NumberField.js";
import keyStyles from "./KeyframeControls.module.css";
import { Row } from "./Section.js";
import styles from "./Section.module.css";
import shapeStyles from "./ShapeSection.module.css";
import { liveShapeBinding, shapeBinding, type ShapeBindingDeps, type ShapeNumberProp } from "./shapeBinding.js";
import { Choice, colorOf, type ChoiceProps } from "./StyleFields.js";

// The Shape section (spec §21.12 "Tools", §11, Batch 66) of the selected shape clips: per path (the first
// selected shape's list; a path is edited by its index on every selected shape) the primitive's parameters,
// the fill (none, a color or a gradient, and the fill rule), the stroke (width, color, alignment, caps,
// joins, miter limit, dashes) and the trim, each group with a stopwatch, a navigator and a key count
// (per-path groups, see timeline/edit/shape.ts). Every edit is one undo step over all the selected
// shapes; number fields are bound outside React (shapeBinding.ts).

const DEPS: ShapeBindingDeps = { document: documentStore, playhead: { get: () => sessionStore.state.getState().playhead, subscribe: (listener) => sessionStore.state.select((state) => state.playhead, listener) }, live: liveEdit };

const WHITE: RGBA = { r: 1, g: 1, b: 1, a: 1 };
const BLACK: RGBA = { r: 0, g: 0, b: 0, a: 1 };
const selectRecent = (settings: AppSettings) => settings.recentColors;
const keepFocus = (event: MouseEvent) => event.preventDefault();

interface ParamUi {
  name: string;
  letter: string;
  unit: string;
  scale: number;
  min: number;
  max: number;
  precision: number;
}

/** The number fields of the primitives' parameters: label, unit, display scale, limits. */
const PARAMS: Readonly<Record<string, ParamUi>> = {
  w: { name: "Width", letter: "W", unit: "px", scale: 1, min: 0, max: 16384, precision: 0 },
  h: { name: "Height", letter: "H", unit: "px", scale: 1, min: 0, max: 16384, precision: 0 },
  radius: { name: "Radius", letter: "R", unit: "px", scale: 1, min: 0, max: 16384, precision: 0 },
  sides: { name: "Sides", letter: "N", unit: "", scale: 1, min: 3, max: 64, precision: 0 },
  points: { name: "Points", letter: "N", unit: "", scale: 1, min: 3, max: 64, precision: 0 },
  inner: { name: "Inner radius", letter: "I", unit: "px", scale: 1, min: 0, max: 16384, precision: 0 },
  outer: { name: "Outer radius", letter: "O", unit: "px", scale: 1, min: 0, max: 16384, precision: 0 },
  roundness: { name: "Roundness", letter: "R", unit: "%", scale: 100, min: 0, max: 100, precision: 0 },
  length: { name: "Length", letter: "L", unit: "px", scale: 1, min: 0, max: 16384, precision: 0 },
  shaft: { name: "Shaft", letter: "S", unit: "px", scale: 1, min: 0, max: 16384, precision: 0 },
  head: { name: "Head", letter: "H", unit: "px", scale: 1, min: 0, max: 16384, precision: 0 },
  headLength: { name: "Head length", letter: "L", unit: "px", scale: 1, min: 0, max: 16384, precision: 0 },
  start: { name: "Start", letter: "S", unit: "deg", scale: 1, min: -3600, max: 3600, precision: 0 },
  end: { name: "End", letter: "E", unit: "deg", scale: 1, min: -3600, max: 3600, precision: 0 },
};

const FILL_MODES: ChoiceProps<PathFillMode>["options"] = [
  { value: "none", label: "No fill", text: "None" },
  { value: "solid", label: "Solid color", text: "Solid" },
  { value: "linear", label: "Linear gradient", text: "Linear" },
  { value: "radial", label: "Radial gradient", text: "Radial" },
];
const RULES: ChoiceProps<(typeof FILL_RULES)[number]>["options"] = [
  { value: "nonzero", label: "Non-zero fill rule: overlaps stay filled", text: "Nonzero" },
  { value: "evenodd", label: "Even-odd fill rule: overlaps cut holes", text: "Even-odd" },
];
const ALIGNS: ChoiceProps<PathStroke["align"]>["options"] = [
  { value: "center", label: "Stroke centered on the outline", text: "Center" },
  { value: "inside", label: "Stroke inside the outline", text: "Inside" },
  { value: "outside", label: "Stroke outside the outline", text: "Outside" },
];
const cap = (word: string) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
const CAPS: ChoiceProps<(typeof LINE_CAPS)[number]>["options"] = LINE_CAPS.map((value) => ({ value, label: `${cap(value)} cap`, text: cap(value) }));
const JOINS: ChoiceProps<(typeof LINE_JOINS)[number]>["options"] = LINE_JOINS.map((value) => ({ value, label: `${cap(value)} join`, text: cap(value) }));
const STROKE_STATES: ChoiceProps<"off" | "on">["options"] = [
  { value: "off", label: "No stroke", text: "Off" },
  { value: "on", label: "Stroke", text: "On" },
];

const fillModeOf = (fill: Fill | null): PathFillMode => (fill === null ? "none" : fillMode(fill));
const hexOr = (fill: Fill | null, last: boolean): string => (fill === null ? "" : formatHexColor(last ? fillLastColor(fill) : fillFirstColor(fill)));

/** What the section needs to re-render on: the structure and the non-keyable values of the first shape's paths. */
function signatureOf(clip: ShapeClip | undefined): string {
  if (!clip || clip.kind !== "shape") return "";
  return JSON.stringify(
    clip.paths.map((path) => [
      path.id,
      path.primitive?.kind ?? "",
      path.fillRule,
      fillModeOf(path.fill),
      hexOr(path.fill, false),
      hexOr(path.fill, true),
      path.stroke ? [path.stroke.align, path.stroke.cap, path.stroke.join, formatHexColor(path.stroke.color), path.stroke.dash?.[0] ?? 0, path.stroke.dash?.[1] ?? 0] : "",
      clip.keyframes ? Object.keys(clip.keyframes).filter((prop) => prop.startsWith(`paths.${path.id}.`)).length : 0,
    ]),
  );
}

/** The stopwatch row of a path group: navigator, add / remove, key count and the stopwatch. */
function ShapeKeys({ ids, pathIndex, group, enabled = true }: { ids: readonly ClipId[]; pathIndex: number; group: ShapeKeyGroup; enabled?: boolean }) {
  const selectCount = useCallback(
    (project: Project) => {
      let count = 0;
      for (const id of ids) {
        const clip = project.clips[id];
        if (clip?.kind === "shape") count = Math.max(count, shapeKeyFrames(clip, pathIndex, group).length);
      }
      return count;
    },
    [ids, pathIndex, group],
  );
  const count = useStoreSelector(documentStore, selectCount);
  const animated = count > 0;
  const name = SHAPE_GROUP_LABELS[group].toLowerCase();
  const off = animated || !enabled ? "" : `: turn on the ${name} stopwatch first`;
  const keyRef = useRef<HTMLButtonElement>(null);
  // The add / remove button follows the playhead through direct DOM writes (P1).
  useEffect(() => {
    const button = keyRef.current;
    if (!button) return undefined;
    const update = () => {
      const project = documentStore.getState();
      const at = sessionStore.state.getState().playhead;
      let onKey = false;
      for (const id of ids) {
        const clip = project.clips[id];
        if (clip?.kind === "shape" && shapeKeyFrames(clip, pathIndex, group).includes(clipRel(clip, at))) onKey = true;
      }
      const label = onKey ? "Remove keyframe" : "Add keyframe";
      button.setAttribute("aria-pressed", String(onKey));
      button.setAttribute("aria-label", label);
      button.setAttribute("data-tooltip", label);
    };
    update();
    const stops = [documentStore.subscribe(update, { affects: ["composite"] }), sessionStore.state.select((state) => state.playhead, update)];
    return () => {
      for (const stop of stops) stop();
    };
  }, [ids, pathIndex, group]);
  const countText = `${count} ${count === 1 ? "keyframe" : "keyframes"}`;
  return (
    <Row label={`${SHAPE_GROUP_LABELS[group]} keys`}>
      <span className={keyStyles.controls}>
        <IconButton control icon={ChevronLeft} label={`Previous keyframe${off}`} disabled={!animated} onClick={() => shapeGoToKey(ids, pathIndex, group, -1)} />
        <button
          ref={keyRef}
          type="button"
          className={iconStyles.button}
          data-size="compact"
          aria-label="Add keyframe"
          aria-pressed={false}
          aria-disabled={!animated || undefined}
          data-tooltip="Add keyframe"
          data-control=""
          onMouseDown={keepFocus}
          onClick={animated ? () => shapeToggleKey(ids, pathIndex, group) : undefined}
        >
          <Diamond className={iconStyles.icon} aria-hidden="true" />
        </button>
        <IconButton control icon={ChevronRight} label={`Next keyframe${off}`} disabled={!animated} onClick={() => shapeGoToKey(ids, pathIndex, group, 1)} />
        <span className={keyStyles.count} role="img" aria-label={countText} data-tooltip={countText} data-off={!animated || undefined}>
          {count}
        </span>
        <IconButton
          control
          icon={Timer}
          label={animated ? `Stop animating ${name} (removes its keyframes)` : enabled ? `Animate ${name}` : `Animate ${name}: nothing to animate`}
          pressed={animated}
          disabled={!enabled && !animated}
          onClick={() => shapeStopwatch(ids, pathIndex, group, !animated)}
        />
      </span>
    </Row>
  );
}

function Num({ ids, pathIndex, prop, letter, unit, disabled, row }: { ids: readonly ClipId[]; pathIndex: number; prop: ShapeNumberProp; letter: string; unit: string; disabled?: boolean; row?: string }) {
  const binding = useMemo(() => shapeBinding(DEPS, prop, ids, pathIndex), [ids, pathIndex, prop]);
  const field = <NumberField label={letter} unit={unit === "" ? undefined : unit} binding={binding} precision={prop.precision} min={prop.min} max={prop.max} disabled={disabled} ariaLabel={`${prop.label} (path ${pathIndex + 1})`} />;
  return row === undefined ? field : <Row label={row}>{field}</Row>;
}

const TRIM_START: ShapeNumberProp = { field: "trim.start", label: "Trim start", scale: 100, min: 0, max: 100, precision: 1 };
const TRIM_END: ShapeNumberProp = { field: "trim.end", label: "Trim end", scale: 100, min: 0, max: 100, precision: 1 };
const TRIM_OFFSET: ShapeNumberProp = { field: "trim.offset", label: "Trim offset", scale: 360, min: -3600, max: 3600, precision: 0 };
const STROKE_WIDTH: ShapeNumberProp = { field: "stroke.width", label: "Stroke width", scale: 1, min: 0, max: 2048, precision: 1 };
const DASH_OFFSET: ShapeNumberProp = { field: "stroke.dashOffset", label: "Dash offset", scale: 1, min: -16384, max: 16384, precision: 0 };

/** A stroke number that is not keyable (miter limit, dash, gap): live while scrubbed, one command on release through `editShapes`. */
function plainBinding(ids: readonly ClipId[], pathIndex: number, read: (stroke: PathStroke) => number, write: (stroke: PathStroke, value: number) => void, label: string, min: number, max: number): NumberBinding {
  return liveShapeBinding(
    DEPS,
    {
      read(project, live) {
        const values: number[] = [];
        for (const id of ids) {
          const clip = live?.get(id) ?? project.clips[id];
          const stroke = clip?.kind === "shape" ? clip.paths[pathIndex]?.stroke : undefined;
          if (stroke) values.push(read(stroke));
        }
        return values.length > 0 && values.every((v) => v === values[0]) ? (values[0] ?? null) : null;
      },
      clamp: (value) => roundTo(Math.min(max, Math.max(min, value)), 1),
      edit: (value) => (clip) => {
        const stroke = clip.paths[pathIndex]?.stroke;
        if (stroke) write(stroke, value);
      },
      label,
      coalesceKey: `properties.shape.${pathIndex}.${label}`,
    },
    ids,
  );
}

function PathBlock({ ids, clip, index }: { ids: readonly ClipId[]; clip: ShapeClip; index: number }) {
  const path = clip.paths[index] as ShapePath;
  const recent = useStoreSelector(appSettings, selectRecent);
  const mode = fillModeOf(path.fill);
  const isGradient = mode === "linear" || mode === "radial";
  const stroke = path.stroke;
  const plain = useMemo(
    () => ({
      dash: plainBinding(ids, index, (s) => s.dash?.[0] ?? 0, (s, v) => { s.dash = v > 0 ? [v, s.dash?.[1] ?? v] : []; }, "Dash length", 0, 16384),
      gap: plainBinding(ids, index, (s) => s.dash?.[1] ?? s.dash?.[0] ?? 0, (s, v) => { if ((s.dash?.[0] ?? 0) > 0) s.dash = [s.dash?.[0] ?? v, Math.max(0, v)]; }, "Dash gap", 0, 16384),
      miter: plainBinding(ids, index, (s) => s.miterLimit, (s, v) => { s.miterLimit = Math.max(1, v); }, "Miter limit", 1, 100),
    }),
    [ids, index],
  );
  const fillEdit = (label: string, make: (p: ShapePath) => Fill | null) =>
    editShapes(ids, (draft, rel) => { const p = draft.paths[index]; if (p) setPathFill(draft, index, make(p), rel); }, label);
  const strokeEdit = (label: string, edit: (s: PathStroke) => void) =>
    editShapes(ids, (draft) => { const s = draft.paths[index]?.stroke; if (s) edit(s); }, label);
  const previewFill = (make: (p: ShapePath, color: RGBA) => Fill | null) => (color: RGBA | null) =>
    previewShapes(ids, color ? (draft, rel) => { const p = draft.paths[index]; if (p) setPathFill(draft, index, make(p, color), rel); } : null);
  const previewStrokeColor = (color: RGBA | null) =>
    previewShapes(ids, color ? (draft, rel) => { setShapeField(draft, draft.paths[index]?.id ?? "", "stroke.color", [color.r, color.g, color.b, color.a], rel); } : null);
  const kind = path.primitive ? shapeKindName(path.primitive.kind) : "Path";
  const params = path.primitive ? PRIMITIVE_PARAMS[path.primitive.kind] : [];

  const setStroke = (next: "off" | "on") =>
    editShapes(
      ids,
      (draft) => {
        const p = draft.paths[index];
        if (!p) return;
        if (next === "on" && !p.stroke) p.stroke = defaultStroke(draft.size);
        // A stroke that goes takes its keys with it (they could not be read back).
        if (next === "off" && p.stroke) {
          delete p.stroke;
          if (draft.keyframes) {
            for (const field of ["stroke.width", "stroke.color", "stroke.dashOffset"]) delete draft.keyframes[`paths.${p.id}.${field}`];
            if (Object.keys(draft.keyframes).length === 0) delete draft.keyframes;
          }
        }
      },
      next === "on" ? "Add stroke" : "Remove stroke",
    );

  return (
    <>
      <div className={shapeStyles.path} data-first={index === 0}>
        <span>{`Path ${index + 1}`}</span>
        <span className={shapeStyles.kind}>{kind}</span>
      </div>
      {path.primitive && (
        <>
          <ShapeKeys ids={ids} pathIndex={index} group="shape" />
          {params.map((name) => {
            const spec = PARAMS[name];
            if (!spec) return null;
            const prop: ShapeNumberProp = { field: `primitive.${name}`, label: spec.name, scale: spec.scale, min: spec.min, max: spec.max, precision: spec.precision };
            return <Num key={name} ids={ids} pathIndex={index} prop={prop} letter={spec.letter} unit={spec.unit} row={spec.name} />;
          })}
        </>
      )}
      <ShapeKeys ids={ids} pathIndex={index} group="fill" enabled={mode === "solid"} />
      <Row label="Fill">
        <Choice
          value={mode}
          options={FILL_MODES}
          onChange={(next) =>
            fillEdit("Change fill", (p) => {
              if (next === "none") return null;
              if (p.fill === null) return next === "solid" ? { ...WHITE } : fillAsMode({ ...WHITE }, next);
              return fillAsMode(p.fill, next);
            })
          }
        />
      </Row>
      <Row label={isGradient ? "From" : "Color"}>
        <ColorField
          value={colorOf(hexOr(path.fill, false), WHITE)}
          recent={recent}
          ariaLabel={isGradient ? `Gradient first color (path ${index + 1})` : `Fill color (path ${index + 1})`}
          disabled={path.fill === null}
          onPreview={previewFill((p, color) => (p.fill ? fillWithFirst(p.fill, color) : p.fill))}
          onChange={(next) => {
            fillEdit("Change fill", (p) => (p.fill ? fillWithFirst(p.fill, next) : p.fill));
            rememberColor(next);
          }}
        />
      </Row>
      <Row label="To">
        <ColorField
          value={colorOf(isGradient ? hexOr(path.fill, true) : "", BLACK)}
          recent={recent}
          ariaLabel={`Gradient last color (path ${index + 1})`}
          disabled={!isGradient}
          onPreview={previewFill((p, color) => (p.fill ? fillWithLast(p.fill, color) : p.fill))}
          onChange={(next) => {
            fillEdit("Change fill", (p) => (p.fill ? fillWithLast(p.fill, next) : p.fill));
            rememberColor(next);
          }}
        />
      </Row>
      <Row label="Rule">
        <Choice value={path.fillRule} options={RULES} onChange={(next) => editShapes(ids, (draft) => { const p = draft.paths[index]; if (p) p.fillRule = next; }, "Change fill rule")} />
      </Row>
      <Row label="Stroke">
        <Choice value={stroke ? "on" : "off"} options={STROKE_STATES} onChange={setStroke} />
      </Row>
      <ShapeKeys ids={ids} pathIndex={index} group="stroke" enabled={stroke !== undefined} />
      <Row label="Width">
        <Num ids={ids} pathIndex={index} prop={STROKE_WIDTH} letter="W" unit="px" disabled={!stroke} />
      </Row>
      <Row label="Stroke color">
        <ColorField
          value={stroke?.color ?? WHITE}
          recent={recent}
          ariaLabel={`Stroke color (path ${index + 1})`}
          disabled={!stroke}
          onPreview={previewStrokeColor}
          onChange={(next) => {
            editShapes(ids, (draft, rel) => { setShapeField(draft, draft.paths[index]?.id ?? "", "stroke.color", [next.r, next.g, next.b, next.a], rel); }, "Change stroke color");
            rememberColor(next);
          }}
        />
      </Row>
      <Row label="Align">
        <Choice value={stroke?.align ?? "center"} options={ALIGNS} disabled={!stroke} onChange={(next) => strokeEdit("Change stroke alignment", (s) => { s.align = next; })} />
      </Row>
      <Row label="Caps">
        <Choice value={stroke?.cap ?? "butt"} options={CAPS} disabled={!stroke} onChange={(next) => strokeEdit("Change stroke cap", (s) => { s.cap = next; })} />
      </Row>
      <Row label="Joins">
        <Choice value={stroke?.join ?? "miter"} options={JOINS} disabled={!stroke} onChange={(next) => strokeEdit("Change stroke join", (s) => { s.join = next; })} />
      </Row>
      <Row label="Miter limit">
        <NumberField label="M" binding={plain.miter} precision={1} min={1} max={100} disabled={!stroke || stroke.join !== "miter"} ariaLabel={`Miter limit (path ${index + 1})`} />
      </Row>
      <Row label="Dashes">
        <div className={styles.pair}>
          <NumberField label="D" unit="px" binding={plain.dash} precision={1} min={0} max={16384} disabled={!stroke} ariaLabel={`Dash length (path ${index + 1})`} />
          <NumberField label="G" unit="px" binding={plain.gap} precision={1} min={0} max={16384} disabled={!stroke || (stroke.dash?.[0] ?? 0) === 0} ariaLabel={`Dash gap (path ${index + 1})`} />
        </div>
      </Row>
      <Row label="Dash offset">
        <Num ids={ids} pathIndex={index} prop={DASH_OFFSET} letter="O" unit="px" disabled={!stroke || (stroke.dash?.[0] ?? 0) === 0} />
      </Row>
      <ShapeKeys ids={ids} pathIndex={index} group="trim" />
      <Row label="Trim start">
        <Num ids={ids} pathIndex={index} prop={TRIM_START} letter="S" unit="%" />
      </Row>
      <Row label="Trim end">
        <Num ids={ids} pathIndex={index} prop={TRIM_END} letter="E" unit="%" />
      </Row>
      <Row label="Trim offset">
        <Num ids={ids} pathIndex={index} prop={TRIM_OFFSET} letter="O" unit="deg" />
      </Row>
    </>
  );
}

export function ShapeSection({ ids }: { ids: readonly ClipId[] }) {
  const first = ids[0];
  const select = useCallback((project: Project) => signatureOf(first === undefined ? undefined : (project.clips[first] as ShapeClip | undefined)), [first]);
  useStoreSelector(documentStore, select);
  const clip = first === undefined ? undefined : documentStore.getState().clips[first];
  if (clip?.kind !== "shape") return null;
  return (
    <>
      {clip.paths.map((path, index) => (
        <PathBlock key={path.id} ids={ids} clip={clip} index={index} />
      ))}
    </>
  );
}
