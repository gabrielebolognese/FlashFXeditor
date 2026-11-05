import { SquareRoundCorner } from "lucide-react";
import { useMemo } from "react";
import { rememberColor } from "../../app/propertiesController.js";
import { appSettings, documentStore, sessionStore } from "../../app/services.js";
import { hasLookKeys, lookAtFrame } from "../../core/document/keyProps.js";
import { formatHexColor } from "../../core/document/color.js";
import type { ClipId, RGBA, ShadowStyle, StrokeAlign, StrokeStyle } from "../../core/document/types.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import type { AppSettings } from "../../project/appSettings.js";
import { DEFAULT_SHADOW, DEFAULT_STROKE, frameRadius, isFrameClip, setFrameStyle, SOFT_SHADOW, type FrameClip, type FramePatch } from "../../timeline/edit/frameStyle.js";
import { cornerRadiiOf } from "../../core/document/fill.js";
import { ColorField } from "../../ui/ColorField.js";
import { NumberField, roundTo, valueBinding, type NumberBinding } from "../../ui/NumberField.js";
import { shared } from "./context.js";
import { KeyRows } from "./KeyframeControls.js";
import { Row } from "./Section.js";
import styles from "./Section.module.css";
import { Choice, colorOf, type ChoiceProps } from "./StyleFields.js";
import { SKIP, useClipsShared } from "./useShared.js";

// The Frame section (spec §21.7, Batch 58) of the selected solids, videos and images: Stroke (width,
// color, inside / center / outside, solid / dashed / dotted), Shadow (none, hard or soft preset, offset,
// blur, spread, color) and Corners (one radius; solids also one per corner). Every edit is one
// `clip.frameStyle` command over all the selected clips; fields are commit-only (no live preview).

const selectRecent = (settings: AppSettings) => settings.recentColors;
const BLACK: RGBA = { r: 0, g: 0, b: 0, a: 1 };

type DashKind = "solid" | "dashed" | "dotted";
type ShadowKind = "none" | "hard" | "soft";

const ON_OFF: ChoiceProps<"off" | "on">["options"] = [
  { value: "off", label: "No stroke", text: "None" },
  { value: "on", label: "Stroke", text: "On" },
];
const ALIGNS: ChoiceProps<StrokeAlign>["options"] = [
  { value: "inside", label: "Stroke inside the edge", text: "In" },
  { value: "center", label: "Stroke centered on the edge", text: "Mid" },
  { value: "outside", label: "Stroke outside the edge", text: "Out" },
];
const DASHES: ChoiceProps<DashKind>["options"] = [
  { value: "solid", label: "Solid line", text: "Solid" },
  { value: "dashed", label: "Dashed line", text: "Dash" },
  { value: "dotted", label: "Dotted line", text: "Dot" },
];
const SHADOWS: ChoiceProps<ShadowKind>["options"] = [
  { value: "none", label: "No shadow", text: "None" },
  { value: "hard", label: "Hard shadow", text: "Hard" },
  { value: "soft", label: "Soft shadow", text: "Soft" },
];

const dashKind = (stroke: StrokeStyle): DashKind => (!stroke.dash || stroke.dash.length === 0 ? "solid" : stroke.dash[0]! <= stroke.width ? "dotted" : "dashed");
const dashOf = (kind: DashKind, width: number): number[] | undefined => {
  const w = Math.max(1, width);
  return kind === "solid" ? undefined : kind === "dashed" ? [w * 3, w * 2] : [w, w * 1.5];
};
const shadowKind = (shadow: ShadowStyle | undefined): ShadowKind => (!shadow ? "none" : shadow.blur > 0 ? "soft" : "hard");

const getStroke = (clip: import("../../core/document/types.js").Clip) => (isFrameClip(clip) ? (clip.stroke ? "on" : "off") : SKIP);
const getAlign = (clip: import("../../core/document/types.js").Clip) => (isFrameClip(clip) && clip.stroke ? clip.stroke.align : SKIP);
const getDash = (clip: import("../../core/document/types.js").Clip) => (isFrameClip(clip) && clip.stroke ? dashKind(clip.stroke) : SKIP);
const getStrokeColor = (clip: import("../../core/document/types.js").Clip) => (isFrameClip(clip) && clip.stroke ? formatHexColor(clip.stroke.color) : SKIP);
const getShadow = (clip: import("../../core/document/types.js").Clip) => (isFrameClip(clip) ? shadowKind(clip.shadow) : SKIP);
const getShadowColor = (clip: import("../../core/document/types.js").Clip) => (isFrameClip(clip) && clip.shadow ? formatHexColor(clip.shadow.color) : SKIP);

const playhead = (): number => sessionStore.state.getState().playhead;

/** The frame clips among `ids`, each as it shows at the playhead when it has keyed look properties (Batch 61). */
const frameClips = (ids: readonly ClipId[]): FrameClip[] => {
  const project = documentStore.getState();
  const at = playhead();
  const out: FrameClip[] = [];
  for (const id of ids) {
    const clip = project.clips[id];
    if (isFrameClip(clip)) out.push(lookAtFrame(clip, at));
  }
  return out;
};

const anyKeyed = (ids: readonly ClipId[]): boolean => {
  const project = documentStore.getState();
  return ids.some((id) => {
    const clip = project.clips[id];
    return !!clip && "keyframes" in clip && hasLookKeys(clip.keyframes);
  });
};

/** A number field over `read` of the clips it applies to (`null`: not applicable), written as a patch. */
function frameBinding(ids: readonly ClipId[], label: string, min: number, max: number, read: (clip: FrameClip) => number | null, write: (clip: FrameClip, value: number) => FramePatch): NumberBinding {
  const clamp = (value: number) => roundTo(Math.min(max, Math.max(min, value)), 0);
  return valueBinding(
    {
      read() {
        const values: number[] = [];
        for (const clip of frameClips(ids)) {
          const value = read(clip);
          if (value !== null) values.push(value);
        }
        const value = shared(values, (v) => v);
        return value && !value.mixed ? value.value : null;
      },
      subscribe: (listener) => {
        const stops = [
          documentStore.subscribe(() => listener(), { affects: ["composite"] }),
          // Keyed values change along the timeline: re-read when the playhead moves (DOM only, P1).
          sessionStore.state.select((state) => state.playhead, () => anyKeyed(ids) && listener()),
        ];
        return () => {
          for (const stop of stops) stop();
        };
      },
    },
    (value) => {
      const command = setFrameStyle(documentStore.getState(), ids, (clip) => (read(clip) === null ? null : write(clip, clamp(value))), { label, at: playhead(), coalesceKey: `properties.frame.${label}` });
      if (command) documentStore.dispatch(command);
    },
  );
}

const strokeField = (ids: readonly ClipId[], label: string, key: "width" | "dashOffset", max: number) =>
  frameBinding(
    ids,
    label,
    key === "width" ? 0 : -max,
    max,
    (clip) => (clip.stroke ? (key === "width" ? clip.stroke.width : (clip.stroke.dashOffset ?? 0)) : null),
    (clip, value) => ({ stroke: { ...clip.stroke!, [key]: value } }),
  );

const shadowField = (ids: readonly ClipId[], label: string, key: "x" | "y" | "blur" | "spread", min: number, max: number) =>
  frameBinding(
    ids,
    label,
    min,
    max,
    (clip) => (clip.shadow ? clip.shadow[key] : null),
    (clip, value) => ({ shadow: { ...clip.shadow!, [key]: value } }),
  );

const cornerField = (ids: readonly ClipId[], index: 0 | 1 | 2 | 3) =>
  frameBinding(
    ids,
    "Corner radius",
    0,
    8192,
    (clip) => (clip.kind === "solid" ? cornerRadiiOf(clip.size.w, clip.size.h, clip.cornerRadius, clip.cornerRadii)[index] : null),
    (clip, value) => {
      const radii: readonly number[] = clip.kind === "solid" ? cornerRadiiOf(clip.size.w, clip.size.h, clip.cornerRadius, clip.cornerRadii) : [0, 0, 0, 0];
      const next: [number, number, number, number] = [radii[0] ?? 0, radii[1] ?? 0, radii[2] ?? 0, radii[3] ?? 0];
      next[index] = value;
      return { cornerRadii: next };
    },
  );

export function FrameSection({ ids }: { ids: readonly ClipId[] }) {
  const bindings = useMemo(
    () => ({
      radius: frameBinding(ids, "Corner radius", 0, 8192, (clip) => frameRadius(clip), (_clip, value) => ({ cornerRadius: value })),
      width: strokeField(ids, "Stroke width", "width", 1000),
      dashOffset: strokeField(ids, "Dash offset", "dashOffset", 100000),
      x: shadowField(ids, "Shadow x", "x", -4000, 4000),
      y: shadowField(ids, "Shadow y", "y", -4000, 4000),
      blur: shadowField(ids, "Shadow blur", "blur", 0, 1000),
      spread: shadowField(ids, "Shadow spread", "spread", -1000, 1000),
      tl: cornerField(ids, 0),
      tr: cornerField(ids, 1),
      br: cornerField(ids, 2),
      bl: cornerField(ids, 3),
    }),
    [ids],
  );
  const stroke = useClipsShared(ids, getStroke);
  const align = useClipsShared(ids, getAlign);
  const dash = useClipsShared(ids, getDash);
  const strokeColor = useClipsShared(ids, getStrokeColor);
  const shadow = useClipsShared(ids, getShadow);
  const shadowColor = useClipsShared(ids, getShadowColor);
  const recent = useStoreSelector(appSettings, selectRecent);
  const hasStroke = stroke === "on";
  const hasShadow = shadow === "hard" || shadow === "soft";
  const allSolids = useClipsShared(ids, (clip) => (isFrameClip(clip) ? clip.kind === "solid" : SKIP)) === true;

  const edit = (label: string, change: (clip: FrameClip) => FramePatch | null) => {
    const command = setFrameStyle(documentStore.getState(), ids, change, { label, at: playhead() });
    if (command) documentStore.dispatch(command);
  };
  const colorProps = (label: string, field: "stroke" | "shadow") => ({
    onChange: (next: RGBA) => {
      edit(label, (clip) => (clip[field] ? ({ [field]: { ...clip[field], color: next } } as FramePatch) : null));
      rememberColor(next);
    },
  });

  return (
    <>
      <KeyRows ids={ids} section="stroke" />
      <Row label="Stroke">
        <Choice value={stroke} options={ON_OFF} onChange={(mode) => edit(mode === "on" ? "Add stroke" : "Remove stroke", (clip) => ({ stroke: mode === "on" ? (clip.stroke ?? { ...DEFAULT_STROKE }) : null }))} />
      </Row>
      <Row label="Width">
        <NumberField label="W" unit="px" binding={bindings.width} precision={0} min={0} max={1000} disabled={!hasStroke} ariaLabel="Stroke width" />
      </Row>
      <Row label="Stroke color">
        <ColorField value={colorOf(strokeColor, BLACK)} recent={recent} ariaLabel="Stroke color" disabled={!hasStroke} {...colorProps("Change stroke color", "stroke")} />
      </Row>
      <Row label="Align">
        <Choice value={align} options={ALIGNS} disabled={!hasStroke} onChange={(next) => edit("Change stroke align", (clip) => (clip.stroke ? { stroke: { ...clip.stroke, align: next } } : null))} />
      </Row>
      <Row label="Dash">
        <Choice
          value={dash}
          options={DASHES}
          disabled={!hasStroke}
          onChange={(kind) =>
            edit("Change stroke dash", (clip) => {
              if (!clip.stroke) return null;
              const next = dashOf(kind, clip.stroke.width);
              const rest = { width: clip.stroke.width, color: clip.stroke.color, align: clip.stroke.align, ...(clip.stroke.dashOffset !== undefined && { dashOffset: clip.stroke.dashOffset }) };
              return { stroke: next ? { ...rest, dash: next } : rest };
            })
          }
        />
      </Row>
      <Row label="Dash offset">
        <NumberField label="O" unit="px" binding={bindings.dashOffset} precision={0} min={-100000} max={100000} disabled={!hasStroke || dash === "solid"} ariaLabel="Dash offset" />
      </Row>
      <KeyRows ids={ids} section="shadow" />
      <Row label="Shadow">
        <Choice
          value={shadow}
          options={SHADOWS}
          onChange={(kind) =>
            edit("Change shadow", (clip) => {
              if (kind === "none") return { shadow: null };
              const base = clip.shadow ?? (kind === "soft" ? SOFT_SHADOW : DEFAULT_SHADOW);
              return { shadow: kind === "soft" ? { ...base, blur: base.blur > 0 ? base.blur : SOFT_SHADOW.blur } : { ...base, blur: 0 } };
            })
          }
        />
      </Row>
      <Row label="Offset">
        <div className={styles.pair}>
          <NumberField label="X" unit="px" binding={bindings.x} precision={0} min={-4000} max={4000} disabled={!hasShadow} ariaLabel="Shadow x" />
          <NumberField label="Y" unit="px" binding={bindings.y} precision={0} min={-4000} max={4000} disabled={!hasShadow} ariaLabel="Shadow y" />
        </div>
      </Row>
      <Row label="Blur">
        <div className={styles.pair}>
          <NumberField label="B" unit="px" binding={bindings.blur} precision={0} min={0} max={1000} disabled={!hasShadow} ariaLabel="Shadow blur" />
          <NumberField label="S" unit="px" binding={bindings.spread} precision={0} min={-1000} max={1000} disabled={!hasShadow} ariaLabel="Shadow spread" />
        </div>
      </Row>
      <Row label="Shadow color">
        <ColorField value={colorOf(shadowColor, BLACK)} recent={recent} ariaLabel="Shadow color" disabled={!hasShadow} {...colorProps("Change shadow color", "shadow")} />
      </Row>
      {/* Solids keep their one radius in the Solid section; here pictures get theirs, and solids a radius per corner. */}
      {!allSolids && (
        <>
        <KeyRows ids={ids} section="corners" />
        <Row label="Radius">
          <NumberField label={<SquareRoundCorner aria-hidden="true" />} unit="px" binding={bindings.radius} precision={0} min={0} max={8192} ariaLabel="Picture corner radius" />
        </Row>
        </>
      )}
      {allSolids && (
        <>
          <Row label="Corners">
            <div className={styles.pair}>
              <NumberField label="TL" unit="px" binding={bindings.tl} precision={0} min={0} max={8192} ariaLabel="Top left radius" />
              <NumberField label="TR" unit="px" binding={bindings.tr} precision={0} min={0} max={8192} ariaLabel="Top right radius" />
            </div>
          </Row>
          <Row label="">
            <div className={styles.pair}>
              <NumberField label="BL" unit="px" binding={bindings.bl} precision={0} min={0} max={8192} ariaLabel="Bottom left radius" />
              <NumberField label="BR" unit="px" binding={bindings.br} precision={0} min={0} max={8192} ariaLabel="Bottom right radius" />
            </div>
          </Row>
        </>
      )}
    </>
  );
}
