import { Circle, Minus, Square, SquareRoundCorner, Squircle } from "lucide-react";
import { useMemo } from "react";
import { editSolids, previewSolids, type SolidChange } from "../../app/graphicsController.js";
import { liveEdit } from "../../app/liveEdit.js";
import { rememberColor } from "../../app/propertiesController.js";
import { appSettings, documentStore } from "../../app/services.js";
import { formatHexColor, isRgba } from "../../core/document/color.js";
import type { Clip, ClipId, RGBA, SolidClip, SolidShape } from "../../core/document/types.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import type { AppSettings } from "../../project/appSettings.js";
import { shapeName, solidLook, withShape } from "../../timeline/edit/solid.js";
import { ColorField } from "../../ui/ColorField.js";
import { NumberField } from "../../ui/NumberField.js";
import { Row } from "./Section.js";
import styles from "./Section.module.css";
import { solidBinding, type SolidBindingDeps } from "./solidBinding.js";
import { SOLID_HEIGHT, SOLID_RADIUS, SOLID_WIDTH } from "./solidProps.js";
import { Choice, colorOf, type ChoiceProps } from "./StyleFields.js";
import { MIXED, NONE, SKIP, useClipsShared } from "./useShared.js";

// The Solid section (spec §11 "Solid properties: fill, shape, size, radius", Batch 34) of the selected
// solids: the shape (rect, rounded rect, ellipse, line), the fill (a color, or a vertical gradient's
// top and bottom), the size and the corner radius (rounded rects and line ends). Every edit is one
// undo step over all the selected solids; mixed values show `--`. Number fields are bound outside
// React (solidBinding.ts): a label scrub shows live (P1, P2); a color dragged in the picker too.

const DEPS: SolidBindingDeps = { document: documentStore, live: liveEdit };

const getShape = (clip: Clip) => (clip.kind === "solid" ? clip.shape : SKIP);
const getGradient = (clip: Clip) => (clip.kind === "solid" ? !isRgba(clip.fill) : SKIP);
const getTop = (clip: Clip) => (clip.kind === "solid" ? formatHexColor(isRgba(clip.fill) ? clip.fill : clip.fill.from) : SKIP);
const getBottom = (clip: Clip) => (clip.kind === "solid" && !isRgba(clip.fill) ? formatHexColor(clip.fill.to) : SKIP);
const selectRecent = (settings: AppSettings) => settings.recentColors;

const SHAPES: ChoiceProps<SolidShape>["options"] = [
  { value: "rect", label: shapeName("rect"), icon: Square },
  { value: "roundedRect", label: shapeName("roundedRect"), icon: Squircle },
  { value: "ellipse", label: shapeName("ellipse"), icon: Circle },
  { value: "line", label: shapeName("line"), icon: Minus },
];

const WHITE: RGBA = { r: 1, g: 1, b: 1, a: 1 };
const BLACK: RGBA = { r: 0, g: 0, b: 0, a: 1 };

/** The fill of `clip` with its top (or only) color `color`. */
const withTop = (clip: SolidClip, color: RGBA) => (isRgba(clip.fill) ? color : { ...clip.fill, from: color });
/** The fill of `clip` with its bottom color `color` (a gradient made from its color when it has none). */
const withBottom = (clip: SolidClip, color: RGBA) => (isRgba(clip.fill) ? { from: clip.fill, to: color } : { ...clip.fill, to: color });

export function SolidSection({ ids }: { ids: readonly ClipId[] }) {
  const bindings = useMemo(() => ({ width: solidBinding(DEPS, SOLID_WIDTH, ids), height: solidBinding(DEPS, SOLID_HEIGHT, ids), radius: solidBinding(DEPS, SOLID_RADIUS, ids) }), [ids]);
  const shape = useClipsShared(ids, getShape);
  const gradient = useClipsShared(ids, getGradient);
  const top = useClipsShared(ids, getTop);
  const bottom = useClipsShared(ids, getBottom);
  const recent = useStoreSelector(appSettings, selectRecent);
  const isGradient = gradient === true;
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
      <Row label="Fill">
        <Choice
          value={gradient === MIXED || gradient === NONE ? gradient : isGradient ? "gradient" : "solid"}
          options={[
            { value: "solid", label: "Solid color", text: "Solid" },
            { value: "gradient", label: "Vertical gradient", text: "Gradient" },
          ]}
          onChange={(mode) =>
            editSolids(ids, (clip) => ({ fill: mode === "gradient" ? (isRgba(clip.fill) ? { from: clip.fill, to: BLACK } : clip.fill) : isRgba(clip.fill) ? clip.fill : clip.fill.from }), "Change fill")
          }
        />
      </Row>
      <Row label={isGradient ? "Top" : "Color"}>
        <ColorField value={colorOf(top, WHITE)} recent={recent} ariaLabel={isGradient ? "Gradient top color" : "Fill color"} {...color("Change fill", withTop)} />
      </Row>
      {/* Disabled, never hidden (spec §17): choosing Gradient moves nothing; a solid fill shows the bottom a gradient starts with. */}
      <Row label="Bottom">
        <ColorField value={colorOf(bottom, BLACK)} recent={recent} ariaLabel="Gradient bottom color" disabled={!isGradient} {...color("Change fill", withBottom)} />
      </Row>
      <Row label="Size">
        <div className={styles.pair}>
          <NumberField label="W" unit="px" binding={bindings.width} precision={0} min={SOLID_WIDTH.min} max={SOLID_WIDTH.max} ariaLabel="Solid width" />
          <NumberField label="H" unit="px" binding={bindings.height} precision={0} min={SOLID_HEIGHT.min} max={SOLID_HEIGHT.max} ariaLabel="Solid height" />
        </div>
      </Row>
      <Row label="Radius">
        <NumberField label={<SquareRoundCorner aria-hidden="true" />} unit="px" binding={bindings.radius} precision={0} min={SOLID_RADIUS.min} max={SOLID_RADIUS.max} disabled={!rounds} ariaLabel="Corner radius" />
      </Row>
    </>
  );
}
