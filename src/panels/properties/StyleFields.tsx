import {
  ALargeSmall,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  Droplets,
  Italic,
  MoveHorizontal,
  MoveVertical,
  SquareRoundCorner,
  TextAlignCenter,
  TextAlignEnd,
  TextAlignStart,
  type LucideIcon,
} from "lucide-react";
import { useMemo } from "react";
import { rememberColor } from "../../app/propertiesController.js";
import { appSettings, fontLibrary } from "../../app/services.js";
import { systemFonts } from "../../app/fontController.js";
import { formatHexColor, parseHexColor } from "../../core/document/color.js";
import type { RGBA, TextAlign, TextAnchor, TextCase, TextStyle } from "../../core/document/types.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import type { AppSettings } from "../../project/appSettings.js";
import { bundledFont } from "../../render/text/bundledFonts.js";
import { fillColor, isGradient } from "../../text/style.js";
import { ColorField } from "../../ui/ColorField.js";
import { IconButton } from "../../ui/IconButton.js";
import { NumberField, type NumberBinding } from "../../ui/NumberField.js";
import { Select, type SelectOption } from "../../ui/Select.js";
import { Toggle } from "../../ui/Toggle.js";
import { FontField } from "./FontPicker.js";
import { Row } from "./Section.js";
import styles from "./Section.module.css";
import { FONT_SIZE, LETTER_SPACING, LINE_HEIGHT, PADDING_X, PADDING_Y, RADIUS, SHADOW_BLUR, SHADOW_X, SHADOW_Y, STROKE_WIDTH, type TextNumberProp } from "./textProps.js";
import { MIXED, NONE, SKIP, type Shared } from "./useShared.js";

// The text style rows (spec §11 Text section, §10.1), shared by the Text section (the selected text
// clips) and the Caption style section (the caption track's text, Batch 32): font (picker with
// previews), weight and italic, size, fill (solid or a vertical gradient), stroke, shadow and
// background box (each a switch with its values), alignment, vertical anchor (text clips), letter
// spacing, line height and case. What they edit is a `StyleTarget`: its values (shared, `--` when
// mixed), one undo step per edit, a live preview (a color dragged) and the number field bindings.

/** What the style rows edit. */
export interface StyleTarget {
  /** The value `get` reads on the edited styles (a hook; `get` must be stable, module scope). */
  useShared<V extends string | number | boolean | null>(get: (style: TextStyle) => V | typeof SKIP): Shared<V>;
  /** One undo step: every edited style patched. */
  edit(label: string, patch: (style: TextStyle) => Partial<TextStyle>): void;
  /** Shown live (no document change); null ends it. */
  preview(patch: ((style: TextStyle) => Partial<TextStyle>) | null): void;
  /** A number field's binding for a style property. */
  binding(prop: TextNumberProp): NumberBinding;
}

const getFamily = (s: TextStyle) => s.fontFamily;
const getWeight = (s: TextStyle) => s.fontWeight;
const getItalic = (s: TextStyle) => s.italic;
const getGradient = (s: TextStyle) => isGradient(s.fill);
const getFill = (s: TextStyle) => formatHexColor(fillColor(s.fill));
const getFillBottom = (s: TextStyle) => (isGradient(s.fill) ? formatHexColor(s.fill.to) : SKIP);
const getStroke = (s: TextStyle) => s.stroke.enabled;
const getStrokeColor = (s: TextStyle) => formatHexColor(s.stroke.color);
const getShadow = (s: TextStyle) => s.shadow.enabled;
const getShadowColor = (s: TextStyle) => formatHexColor(s.shadow.color);
const getBackground = (s: TextStyle) => s.background.enabled;
const getBackgroundColor = (s: TextStyle) => formatHexColor(s.background.color);
const getBackgroundMode = (s: TextStyle) => s.background.mode;
const getAlign = (s: TextStyle) => s.align;
const getAnchor = (s: TextStyle) => s.verticalAnchor;
const getCase = (s: TextStyle) => s.textCase;
const selectRecent = (settings: AppSettings) => settings.recentColors;

const WEIGHT_NAMES: Record<number, string> = { 100: "Thin", 200: "ExtraLight", 300: "Light", 400: "Regular", 500: "Medium", 600: "SemiBold", 700: "Bold", 800: "ExtraBold", 900: "Black" };

/** The weights a family offers: a bundled font's axis in steps of 100, an installed family's faces, else 100..900. */
function weightOptions(family: string | null, current: number | null): SelectOption<string>[] {
  let weights: number[] = [100, 200, 300, 400, 500, 600, 700, 800, 900];
  const bundled = family ? bundledFont(family) : null;
  if (bundled) weights = weights.filter((w) => w >= bundled.weights[0] && w <= bundled.weights[1]);
  if (current !== null && !weights.includes(current)) weights = [...weights, current].sort((a, b) => a - b);
  return weights.map((w) => ({ value: String(w), label: `${WEIGHT_NAMES[w] ?? "Weight"} ${w}` }));
}

export const colorOf = (value: Shared<string>, fallback: RGBA): RGBA => (typeof value === "string" ? (parseHexColor(value) ?? fallback) : fallback);

export interface ChoiceProps<T extends string> {
  value: Shared<T>;
  options: readonly { value: T; label: string; icon?: LucideIcon; text?: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}

/** A row of pressed-state buttons choosing one value (icons or text chips). */
export function Choice<T extends string>({ value, options, onChange, disabled }: ChoiceProps<T>) {
  return (
    <div className={styles.buttons}>
      {options.map((option) => (
        <IconButton key={option.value} icon={option.icon} text={option.text} label={option.label} pressed={value === option.value} disabled={disabled} onClick={() => onChange(option.value)} />
      ))}
    </div>
  );
}

const ALIGNS: ChoiceProps<TextAlign>["options"] = [
  { value: "left", label: "Align left", icon: TextAlignStart },
  { value: "center", label: "Align center", icon: TextAlignCenter },
  { value: "right", label: "Align right", icon: TextAlignEnd },
];

const ANCHORS: ChoiceProps<TextAnchor>["options"] = [
  { value: "top", label: "Anchor top: the text grows down", icon: AlignVerticalJustifyStart },
  { value: "middle", label: "Anchor middle: the text grows both ways", icon: AlignVerticalJustifyCenter },
  { value: "bottom", label: "Anchor bottom: the text grows up", icon: AlignVerticalJustifyEnd },
];

const CASES: ChoiceProps<TextCase>["options"] = [
  { value: "none", label: "As typed", text: "Aa" },
  { value: "upper", label: "Uppercase", text: "AA" },
  { value: "lower", label: "Lowercase", text: "aa" },
  { value: "title", label: "Title case", text: "Ab" },
];

const BLACK: RGBA = { r: 0, g: 0, b: 0, a: 1 };
const WHITE: RGBA = { r: 1, g: 1, b: 1, a: 1 };

/** The style rows of `target`; `anchor` adds the vertical anchor (text clips; captions sit at their position). */
export function StyleFields({ target, anchor }: { target: StyleTarget; anchor: boolean }) {
  const bindings = useMemo(
    () => ({
      size: target.binding(FONT_SIZE),
      spacing: target.binding(LETTER_SPACING),
      lineHeight: target.binding(LINE_HEIGHT),
      stroke: target.binding(STROKE_WIDTH),
      shadowX: target.binding(SHADOW_X),
      shadowY: target.binding(SHADOW_Y),
      shadowBlur: target.binding(SHADOW_BLUR),
      padX: target.binding(PADDING_X),
      padY: target.binding(PADDING_Y),
      radius: target.binding(RADIUS),
    }),
    [target],
  );
  const family = target.useShared(getFamily);
  const weight = target.useShared(getWeight);
  const italic = target.useShared(getItalic);
  const gradient = target.useShared(getGradient);
  const fill = target.useShared(getFill);
  const fillBottom = target.useShared(getFillBottom);
  const stroke = target.useShared(getStroke);
  const strokeColor = target.useShared(getStrokeColor);
  const shadow = target.useShared(getShadow);
  const shadowColor = target.useShared(getShadowColor);
  const background = target.useShared(getBackground);
  const backgroundColor = target.useShared(getBackgroundColor);
  const backgroundMode = target.useShared(getBackgroundMode);
  const align = target.useShared(getAlign);
  const verticalAnchor = target.useShared(getAnchor);
  const textCase = target.useShared(getCase);
  const recent = useStoreSelector(appSettings, selectRecent);
  // The weight list follows the installed fonts once they are listed.
  useStoreSelector(systemFonts, (state) => state.status);

  const edit = (label: string, patch: (style: TextStyle) => Partial<TextStyle>) => target.edit(label, patch);
  const color = (label: string, set: (style: TextStyle, color: RGBA) => Partial<TextStyle>) => ({
    onChange: (next: RGBA) => {
      edit(label, (s) => set(s, next));
      rememberColor(next);
    },
    onPreview: (next: RGBA | null) => target.preview(next ? (s) => set(s, next) : null),
  });
  const familyName = typeof family === "string" ? family : null;
  const weightValue = typeof weight === "number" ? weight : null;
  const isGradientFill = gradient === true;

  return (
    <>
      <Row label="Font">
        <FontField
          value={family}
          onPick={(next) => {
            if (fontLibrary.source(next) !== "bundled") void fontLibrary.load({ fontFamily: next, fontWeight: weightValue ?? 400, italic: italic === true }, "");
            edit("Change font", () => ({ fontFamily: next }));
          }}
        />
      </Row>
      <Row label="Weight">
        <div className={styles.withAction}>
          <Select
            label="Font weight"
            value={weightValue === null ? "" : String(weightValue)}
            options={weight === MIXED ? [{ value: "", label: "--" }, ...weightOptions(familyName, null)] : weightOptions(familyName, weightValue)}
            onChange={(next) => next !== "" && edit("Change font weight", () => ({ fontWeight: Number(next) }))}
          />
          <IconButton icon={Italic} label="Italic" pressed={italic === true} onClick={() => edit("Change italic", () => ({ italic: italic !== true }))} />
        </div>
      </Row>
      <Row label="Size">
        <NumberField label={<ALargeSmall aria-hidden="true" />} unit="px" binding={bindings.size} precision={0} min={FONT_SIZE.min} max={FONT_SIZE.max} ariaLabel="Font size" />
      </Row>
      <Row label="Fill">
        <Choice
          value={gradient === MIXED || gradient === NONE ? gradient : isGradientFill ? "gradient" : "solid"}
          options={[
            { value: "solid", label: "Solid color", text: "Solid" },
            { value: "gradient", label: "Vertical gradient", text: "Gradient" },
          ]}
          onChange={(mode) => edit("Change fill", (s) => (mode === "gradient" ? { fill: isGradient(s.fill) ? s.fill : { from: s.fill, to: s.stroke.color } } : { fill: fillColor(s.fill) }))}
        />
      </Row>
      <Row label={isGradientFill ? "Top" : "Color"}>
        <ColorField value={colorOf(fill, WHITE)} recent={recent} ariaLabel={isGradientFill ? "Gradient top color" : "Text color"} {...color("Change text color", (s, c) => ({ fill: isGradient(s.fill) ? { ...s.fill, from: c } : c }))} />
      </Row>
      {isGradientFill && (
        <Row label="Bottom">
          <ColorField value={colorOf(fillBottom, BLACK)} recent={recent} ariaLabel="Gradient bottom color" {...color("Change text color", (s, c) => ({ fill: isGradient(s.fill) ? { ...s.fill, to: c } : c }))} />
        </Row>
      )}
      <Row label="Stroke">
        <span className={styles.switchCell}>
          <Toggle checked={stroke === true} mixed={stroke === MIXED} label="Outline" onChange={(on) => edit(on ? "Add stroke" : "Remove stroke", (s) => ({ stroke: { ...s.stroke, enabled: on } }))} />
        </span>
      </Row>
      {stroke !== false && stroke !== NONE && (
        <>
          <Row label="Width">
            <NumberField label="W" unit="px" binding={bindings.stroke} precision={1} min={STROKE_WIDTH.min} max={STROKE_WIDTH.max} ariaLabel="Stroke width" />
          </Row>
          <Row label="Color">
            <ColorField value={colorOf(strokeColor, BLACK)} recent={recent} ariaLabel="Stroke color" {...color("Change stroke", (s, c) => ({ stroke: { ...s.stroke, color: c } }))} />
          </Row>
        </>
      )}
      <Row label="Shadow">
        <span className={styles.switchCell}>
          <Toggle checked={shadow === true} mixed={shadow === MIXED} label="Drop shadow" onChange={(on) => edit(on ? "Add shadow" : "Remove shadow", (s) => ({ shadow: { ...s.shadow, enabled: on } }))} />
        </span>
      </Row>
      {shadow !== false && shadow !== NONE && (
        <>
          <Row label="Offset">
            <div className={styles.pair}>
              <NumberField label="X" unit="px" binding={bindings.shadowX} precision={1} min={SHADOW_X.min} max={SHADOW_X.max} ariaLabel="Shadow X" />
              <NumberField label="Y" unit="px" binding={bindings.shadowY} precision={1} min={SHADOW_Y.min} max={SHADOW_Y.max} ariaLabel="Shadow Y" />
            </div>
          </Row>
          <Row label="Blur">
            <NumberField label={<Droplets aria-hidden="true" />} unit="px" binding={bindings.shadowBlur} precision={1} min={SHADOW_BLUR.min} max={SHADOW_BLUR.max} ariaLabel="Shadow blur" />
          </Row>
          <Row label="Color">
            <ColorField value={colorOf(shadowColor, BLACK)} recent={recent} ariaLabel="Shadow color" {...color("Change shadow", (s, c) => ({ shadow: { ...s.shadow, color: c } }))} />
          </Row>
        </>
      )}
      <Row label="Background">
        <span className={styles.switchCell}>
          <Toggle checked={background === true} mixed={background === MIXED} label="Background box" onChange={(on) => edit(on ? "Add background" : "Remove background", (s) => ({ background: { ...s.background, enabled: on } }))} />
        </span>
      </Row>
      {background !== false && background !== NONE && (
        <>
          <Row label="Mode">
            <Choice
              value={backgroundMode}
              options={[
                { value: "line", label: "A box behind each line", text: "Per line" },
                { value: "block", label: "One box behind the whole text", text: "Block" },
              ]}
              onChange={(mode) => edit("Change background", (s) => ({ background: { ...s.background, mode } }))}
            />
          </Row>
          <Row label="Padding">
            <div className={styles.pair}>
              <NumberField label="X" unit="px" binding={bindings.padX} precision={0} min={PADDING_X.min} max={PADDING_X.max} ariaLabel="Background padding X" />
              <NumberField label="Y" unit="px" binding={bindings.padY} precision={0} min={PADDING_Y.min} max={PADDING_Y.max} ariaLabel="Background padding Y" />
            </div>
          </Row>
          <Row label="Radius">
            <NumberField label={<SquareRoundCorner aria-hidden="true" />} unit="px" binding={bindings.radius} precision={0} min={RADIUS.min} max={RADIUS.max} ariaLabel="Background corner radius" />
          </Row>
          <Row label="Color">
            <ColorField value={colorOf(backgroundColor, BLACK)} recent={recent} ariaLabel="Background color" {...color("Change background", (s, c) => ({ background: { ...s.background, color: c } }))} />
          </Row>
        </>
      )}
      <Row label="Align">
        <Choice value={align} options={ALIGNS} onChange={(next) => edit("Change alignment", () => ({ align: next }))} />
      </Row>
      {anchor && (
        <Row label="Anchor">
          <Choice value={verticalAnchor} options={ANCHORS} onChange={(next) => edit("Change anchor", () => ({ verticalAnchor: next }))} />
        </Row>
      )}
      <Row label="Spacing">
        <NumberField label={<MoveHorizontal aria-hidden="true" />} unit="px" binding={bindings.spacing} precision={1} min={LETTER_SPACING.min} max={LETTER_SPACING.max} ariaLabel="Letter spacing" />
      </Row>
      <Row label="Line height">
        <NumberField label={<MoveVertical aria-hidden="true" />} unit="×" binding={bindings.lineHeight} precision={2} step={0.01} min={LINE_HEIGHT.min} max={LINE_HEIGHT.max} ariaLabel="Line height" />
      </Row>
      <Row label="Case">
        <Choice value={textCase} options={CASES} onChange={(next) => edit("Change case", () => ({ textCase: next }))} />
      </Row>
    </>
  );
}
