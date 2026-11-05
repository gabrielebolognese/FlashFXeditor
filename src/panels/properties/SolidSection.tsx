import { Circle, Minus, Square, SquareRoundCorner, Squircle } from "lucide-react";
import { useMemo } from "react";
import { editSolids, previewSolids, type SolidChange } from "../../app/graphicsController.js";
import { liveEdit } from "../../app/liveEdit.js";
import { rememberColor } from "../../app/propertiesController.js";
import { appSettings, documentStore, sessionStore } from "../../app/services.js";
import { formatHexColor, isRgba } from "../../core/document/color.js";
import { fillAsMode, fillAsStops, fillFirstColor, fillLastColor, fillMode, fillWithFirst, fillWithLast, type FillMode } from "../../core/document/fill.js";
import type { Clip, ClipId, GradientFill, RGBA, SolidClip, SolidShape } from "../../core/document/types.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import type { AppSettings } from "../../project/appSettings.js";
import { shapeName, solidLook, withShape } from "../../timeline/edit/solid.js";
import { ColorField } from "../../ui/ColorField.js";
import { NumberField, roundTo, valueBinding, type NumberBinding } from "../../ui/NumberField.js";
import { KeyRows } from "./KeyframeControls.js";
import { Row } from "./Section.js";
import styles from "./Section.module.css";
import { solidBinding, type SolidBindingDeps } from "./solidBinding.js";
import { SOLID_HEIGHT, SOLID_RADIUS, SOLID_WIDTH } from "./solidProps.js";
import { Choice, colorOf, type ChoiceProps } from "./StyleFields.js";
import { MIXED, SKIP, useClipsShared } from "./useShared.js";

// The Solid section (spec §11 "Solid properties: fill, shape, size, radius", Batch 34) of the selected
// solids: the shape (rect, rounded rect, ellipse, line), the fill (a color, or a vertical gradient's
// top and bottom), the size and the corner radius (rounded rects and line ends). Every edit is one
// undo step over all the selected solids; mixed values show `--`. Number fields are bound outside
// React (solidBinding.ts): a label scrub shows live (P1, P2); a color dragged in the picker too.

const DEPS: SolidBindingDeps = { document: documentStore, live: liveEdit, playhead: { get: () => sessionStore.state.getState().playhead, subscribe: (listener) => sessionStore.state.select((state) => state.playhead, listener) } };

const getShape = (clip: Clip) => (clip.kind === "solid" ? clip.shape : SKIP);
const modeOf = fillMode;
const getMode = (clip: Clip) => (clip.kind === "solid" ? modeOf(clip.fill) : SKIP);
const getTop = (clip: Clip) => (clip.kind === "solid" ? formatHexColor(fillFirstColor(clip.fill)) : SKIP);
const getBottom = (clip: Clip) => (clip.kind === "solid" && !isRgba(clip.fill) ? formatHexColor(fillLastColor(clip.fill)) : SKIP);
const selectRecent = (settings: AppSettings) => settings.recentColors;

const SHAPES: ChoiceProps<SolidShape>["options"] = [
  { value: "rect", label: shapeName("rect"), icon: Square },
  { value: "roundedRect", label: shapeName("roundedRect"), icon: Squircle },
  { value: "ellipse", label: shapeName("ellipse"), icon: Circle },
  { value: "line", label: shapeName("line"), icon: Minus },
];

const WHITE: RGBA = { r: 1, g: 1, b: 1, a: 1 };
const BLACK: RGBA = { r: 0, g: 0, b: 0, a: 1 };

const withTop = (clip: SolidClip, color: RGBA) => fillWithFirst(clip.fill, color);
const withBottom = (clip: SolidClip, color: RGBA) => fillWithLast(clip.fill, color);

/** A gradient's number (angle, radial center and radius) as a field over the selected solids; commit-only. */
function gradientBinding(ids: readonly ClipId[], label: string, mode: FillMode, read: (fill: GradientFill) => number, write: (fill: GradientFill, value: number) => GradientFill, min: number, max: number): NumberBinding {
  const gradientOf = (clip: SolidClip): GradientFill | null => (!isRgba(clip.fill) && modeOf(clip.fill) === mode ? fillAsStops(clip.fill) : null);
  const clamp = (value: number) => roundTo(Math.min(max, Math.max(min, value)), 0);
  return valueBinding(
    {
      read() {
        const values: number[] = [];
        for (const id of ids) {
          const clip = documentStore.getState().clips[id];
          const gradient = clip?.kind === "solid" ? gradientOf(clip) : null;
          if (gradient) values.push(read(gradient));
        }
        return values.length > 0 && values.every((v) => v === values[0]) ? (values[0] ?? null) : null;
      },
      subscribe: (listener) => documentStore.subscribe(() => listener(), { affects: ["composite"] }),
    },
    (value) => editSolids(ids, (clip) => { const gradient = gradientOf(clip); return gradient ? { fill: write(gradient, clamp(value)) } : null; }, label, `properties.solid.${label}`),
  );
}

export function SolidSection({ ids }: { ids: readonly ClipId[] }) {
  const bindings = useMemo(() => ({ width: solidBinding(DEPS, SOLID_WIDTH, ids), height: solidBinding(DEPS, SOLID_HEIGHT, ids), radius: solidBinding(DEPS, SOLID_RADIUS, ids) }), [ids]);
  const shape = useClipsShared(ids, getShape);
  const mode = useClipsShared(ids, getMode);
  const top = useClipsShared(ids, getTop);
  const bottom = useClipsShared(ids, getBottom);
  const recent = useStoreSelector(appSettings, selectRecent);
  const isGradient = mode === "linear" || mode === "radial";
  const gradients = useMemo(
    () => ({
      angle: gradientBinding(ids, "Gradient angle", "linear", (g) => g.angle, (g, v) => ({ ...g, angle: v }), -360, 360),
      cx: gradientBinding(ids, "Gradient center x", "radial", (g) => Math.round(g.center.x * 100), (g, v) => ({ ...g, center: { ...g.center, x: v / 100 } }), -500, 500),
      cy: gradientBinding(ids, "Gradient center y", "radial", (g) => Math.round(g.center.y * 100), (g, v) => ({ ...g, center: { ...g.center, y: v / 100 } }), -500, 500),
      radius: gradientBinding(ids, "Gradient radius", "radial", (g) => Math.round(g.radius * 100), (g, v) => ({ ...g, radius: v / 100 }), 1, 1000),
    }),
    [ids],
  );
  // Corners round on rounded rects and line ends only.
  const rounds = shape === "roundedRect" || shape === "line" || shape === MIXED;

  const color = (label: string, set: (clip: SolidClip, color: RGBA) => SolidClip["fill"]) => ({
    onChange: (next: RGBA) => {
      editSolids(ids, (clip) => ({ fill: set(clip, next) }), label);
      rememberColor(next);
    },
    onPreview: (next: RGBA | null) => previewSolids(ids, next ? ((clip) => ({ fill: set(clip, next) })) satisfies SolidChange : null),
  });

  return (
    <>
      <Row label="Shape">
        <Choice value={shape} options={SHAPES} onChange={(next) => editSolids(ids, (clip) => withShape(solidLook(clip), next, documentStore.getState().settings), "Change shape")} />
      </Row>
      <KeyRows ids={ids} section="fill" />
      <Row label="Fill">
        <Choice
          value={mode}
          options={[
            { value: "solid", label: "Solid color", text: "Solid" },
            { value: "linear", label: "Linear gradient", text: "Linear" },
            { value: "radial", label: "Radial gradient", text: "Radial" },
          ]}
          onChange={(next) => editSolids(ids, (clip) => ({ fill: fillAsMode(clip.fill, next) }), "Change fill")}
        />
      </Row>
      <Row label={isGradient ? "From" : "Color"}>
        <ColorField value={colorOf(top, WHITE)} recent={recent} ariaLabel={isGradient ? "Gradient first color" : "Fill color"} {...color("Change fill", withTop)} />
      </Row>
      {/* Disabled, never hidden (spec §17): choosing a gradient moves nothing; a solid fill shows the last color a gradient starts with. */}
      <Row label="To">
        <ColorField value={colorOf(bottom, BLACK)} recent={recent} ariaLabel="Gradient last color" disabled={!isGradient} {...color("Change fill", withBottom)} />
      </Row>
      <Row label="Angle">
        <NumberField label="A" unit="deg" binding={gradients.angle} precision={0} min={-360} max={360} disabled={mode !== "linear"} ariaLabel="Gradient angle" />
      </Row>
      <Row label="Center">
        <div className={styles.pair}>
          <NumberField label="X" unit="%" binding={gradients.cx} precision={0} min={-500} max={500} disabled={mode !== "radial"} ariaLabel="Gradient center x" />
          <NumberField label="Y" unit="%" binding={gradients.cy} precision={0} min={-500} max={500} disabled={mode !== "radial"} ariaLabel="Gradient center y" />
        </div>
      </Row>
      <Row label="Reach">
        <NumberField label="R" unit="%" binding={gradients.radius} precision={0} min={1} max={1000} disabled={mode !== "radial"} ariaLabel="Gradient radius" />
      </Row>
      <KeyRows ids={ids} section="size" />
      <Row label="Size">
        <div className={styles.pair}>
          <NumberField label="W" unit="px" binding={bindings.width} precision={0} min={SOLID_WIDTH.min} max={SOLID_WIDTH.max} ariaLabel="Solid width" />
          <NumberField label="H" unit="px" binding={bindings.height} precision={0} min={SOLID_HEIGHT.min} max={SOLID_HEIGHT.max} ariaLabel="Solid height" />
        </div>
      </Row>
      <KeyRows ids={ids} section="corners" />
      <Row label="Radius">
        <NumberField label={<SquareRoundCorner aria-hidden="true" />} unit="px" binding={bindings.radius} precision={0} min={SOLID_RADIUS.min} max={SOLID_RADIUS.max} disabled={!rounds} ariaLabel="Corner radius" />
      </Row>
    </>
  );
}
