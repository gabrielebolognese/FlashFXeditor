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
import { useMemo, useState, type ChangeEvent } from "react";
import { liveEdit } from "../../app/liveEdit.js";
import { rememberColor } from "../../app/propertiesController.js";
import { appSettings, documentStore, fontLibrary } from "../../app/services.js";
import { textEditor } from "../../app/previewController.js";
import { editTexts, previewTexts, type TextChange } from "../../app/textController.js";
import { systemFonts } from "../../app/fontController.js";
import { formatHexColor, parseHexColor } from "../../core/document/color.js";
import type { Clip, ClipId, RGBA, TextAlign, TextAnchor, TextCase, TextClip, TextStyle } from "../../core/document/types.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import type { AppSettings } from "../../project/appSettings.js";
import { bundledFont } from "../../render/text/bundledFonts.js";
import { fillColor, isGradient } from "../../text/style.js";
import { ColorField } from "../../ui/ColorField.js";
import { IconButton } from "../../ui/IconButton.js";
import { NumberField } from "../../ui/NumberField.js";
import { Select, type SelectOption } from "../../ui/Select.js";
import { Toggle } from "../../ui/Toggle.js";
import { FontField } from "./FontPicker.js";
import { Row } from "./Section.js";
import styles from "./Section.module.css";
import { textBinding, type TextBindingDeps } from "./textBinding.js";
import { BOX_WIDTH, FONT_SIZE, LETTER_SPACING, LINE_HEIGHT, PADDING_X, PADDING_Y, RADIUS, SHADOW_BLUR, SHADOW_X, SHADOW_Y, STROKE_WIDTH } from "./textProps.js";
import text from "./TextSection.module.css";
import { MIXED, NONE, SKIP, useClipsShared, type Shared } from "./useShared.js";

// The Text section (spec §11, §10.1) of the selected text clips: content, font (picker with previews),
// weight and italic, size, fill (solid or a vertical gradient), stroke, shadow and background box
// (each a switch with its values), alignment, vertical anchor, letter spacing, line height, case, and
// the box (auto size, or a fixed width that wraps). Every edit is one undo step over all the selected
// text clips; mixed values show `--`. Number fields are bound outside React (textBinding.ts): a label
// scrub shows live and re-rasterizes only those layers (P1, P2, P11). Content typing coalesces into
// one step per burst; while the text is edited on the canvas (spec §7.7) the content shows the draft,
// and focusing it ends that editing first (committed). TODO(batch 30): Save as preset.

const DEPS: TextBindingDeps = { document: documentStore, live: liveEdit };

const style = (clip: Clip): TextStyle | null => (clip.kind === "text" ? clip.style : null);
const getValue = (clip: Clip) => (clip.kind === "text" ? clip.text.value : SKIP);
const getFamily = (clip: Clip) => style(clip)?.fontFamily ?? SKIP;
const getWeight = (clip: Clip) => style(clip)?.fontWeight ?? SKIP;
const getItalic = (clip: Clip) => style(clip)?.italic ?? SKIP;
const getGradient = (clip: Clip) => (clip.kind === "text" ? isGradient(clip.style.fill) : SKIP);
const getFill = (clip: Clip) => (clip.kind === "text" ? formatHexColor(fillColor(clip.style.fill)) : SKIP);
const getFillBottom = (clip: Clip) => (clip.kind === "text" && isGradient(clip.style.fill) ? formatHexColor(clip.style.fill.to) : SKIP);
const getStroke = (clip: Clip) => style(clip)?.stroke.enabled ?? SKIP;
const getStrokeColor = (clip: Clip) => (clip.kind === "text" ? formatHexColor(clip.style.stroke.color) : SKIP);
const getShadow = (clip: Clip) => style(clip)?.shadow.enabled ?? SKIP;
const getShadowColor = (clip: Clip) => (clip.kind === "text" ? formatHexColor(clip.style.shadow.color) : SKIP);
const getBackground = (clip: Clip) => style(clip)?.background.enabled ?? SKIP;
const getBackgroundColor = (clip: Clip) => (clip.kind === "text" ? formatHexColor(clip.style.background.color) : SKIP);
const getBackgroundMode = (clip: Clip) => style(clip)?.background.mode ?? SKIP;
const getAlign = (clip: Clip) => style(clip)?.align ?? SKIP;
const getAnchor = (clip: Clip) => style(clip)?.verticalAnchor ?? SKIP;
const getCase = (clip: Clip) => style(clip)?.textCase ?? SKIP;
const getBoxMode = (clip: Clip) => (clip.kind === "text" ? clip.text.box.mode : SKIP);
const selectRecent = (settings: AppSettings) => settings.recentColors;

/** A style change of every selected text clip. */
const restyle =
  (patch: (style: TextStyle) => Partial<TextStyle>): TextChange =>
  (clip: TextClip) => ({ style: { ...clip.style, ...patch(clip.style) } });

const WEIGHT_NAMES: Record<number, string> = { 100: "Thin", 200: "ExtraLight", 300: "Light", 400: "Regular", 500: "Medium", 600: "SemiBold", 700: "Bold", 800: "ExtraBold", 900: "Black" };

/** The weights a family offers: a bundled font's axis in steps of 100, an installed family's faces, else 100..900. */
function weightOptions(family: string | null, current: number | null): SelectOption<string>[] {
  let weights: number[] = [100, 200, 300, 400, 500, 600, 700, 800, 900];
  const bundled = family ? bundledFont(family) : null;
  if (bundled) weights = weights.filter((w) => w >= bundled.weights[0] && w <= bundled.weights[1]);
  if (current !== null && !weights.includes(current)) weights = [...weights, current].sort((a, b) => a - b);
  return weights.map((w) => ({ value: String(w), label: `${WEIGHT_NAMES[w] ?? "Weight"} ${w}` }));
}

const colorOf = (value: Shared<string>, fallback: RGBA): RGBA => (typeof value === "string" ? (parseHexColor(value) ?? fallback) : fallback);

interface ChoiceProps<T extends string> {
  value: Shared<T>;
  options: readonly { value: T; label: string; icon?: LucideIcon; text?: string }[];
  onChange: (value: T) => void;
}

/** A row of pressed-state buttons choosing one value (icons or text chips). */
function Choice<T extends string>({ value, options, onChange }: ChoiceProps<T>) {
  return (
    <div className={styles.buttons}>
      {options.map((option) => (
        <IconButton key={option.value} icon={option.icon} text={option.text} label={option.label} pressed={value === option.value} onClick={() => onChange(option.value)} />
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

const selectInline = (state: { clipId: ClipId | null; value: string }) => state;

/** The content: typing edits every selected text clip live, one undo step per burst of typing. */
function ContentField({ ids }: { ids: readonly ClipId[] }) {
  const value = useClipsShared(ids, getValue);
  // Edited on the canvas: its draft.
  const inline = useStoreSelector(textEditor.state, selectInline);
  const drafting = inline.clipId !== null && ids.includes(inline.clipId);
  const shown = drafting ? inline.value : typeof value === "string" ? value : "";
  // While the field has the focus it shows what was typed (the document follows it, one burst at a time).
  const [draft, setDraft] = useState(shown);
  const [editing, setEditing] = useState(false);
  const onChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const next = event.target.value;
    setDraft(next);
    editTexts(ids, (clip) => ({ text: { ...clip.text, value: next } }), "Edit text", "properties.text.content");
  };
  return (
    <textarea
      className={text.content}
      value={editing ? draft : shown}
      placeholder={value === MIXED ? "--" : "Text"}
      aria-label="Text"
      spellCheck={false}
      onFocus={() => {
        // One editor of the content at a time: the canvas's commits first.
        textEditor.end(true);
        setDraft(shown);
        setEditing(true);
      }}
      onBlur={() => setEditing(false)}
      onChange={onChange}
    />
  );
}

export function TextSection({ ids }: { ids: readonly ClipId[] }) {
  const bindings = useMemo(
    () => ({
      size: textBinding(DEPS, FONT_SIZE, ids),
      spacing: textBinding(DEPS, LETTER_SPACING, ids),
      lineHeight: textBinding(DEPS, LINE_HEIGHT, ids),
      stroke: textBinding(DEPS, STROKE_WIDTH, ids),
      shadowX: textBinding(DEPS, SHADOW_X, ids),
      shadowY: textBinding(DEPS, SHADOW_Y, ids),
      shadowBlur: textBinding(DEPS, SHADOW_BLUR, ids),
      padX: textBinding(DEPS, PADDING_X, ids),
      padY: textBinding(DEPS, PADDING_Y, ids),
      radius: textBinding(DEPS, RADIUS, ids),
      boxWidth: textBinding(DEPS, BOX_WIDTH, ids),
    }),
    [ids],
  );
  const family = useClipsShared(ids, getFamily);
  const weight = useClipsShared(ids, getWeight);
  const italic = useClipsShared(ids, getItalic);
  const gradient = useClipsShared(ids, getGradient);
  const fill = useClipsShared(ids, getFill);
  const fillBottom = useClipsShared(ids, getFillBottom);
  const stroke = useClipsShared(ids, getStroke);
  const strokeColor = useClipsShared(ids, getStrokeColor);
  const shadow = useClipsShared(ids, getShadow);
  const shadowColor = useClipsShared(ids, getShadowColor);
  const background = useClipsShared(ids, getBackground);
  const backgroundColor = useClipsShared(ids, getBackgroundColor);
  const backgroundMode = useClipsShared(ids, getBackgroundMode);
  const align = useClipsShared(ids, getAlign);
  const anchor = useClipsShared(ids, getAnchor);
  const textCase = useClipsShared(ids, getCase);
  const boxMode = useClipsShared(ids, getBoxMode);
  const recent = useStoreSelector(appSettings, selectRecent);
  // The weight list follows the installed fonts once they are listed.
  useStoreSelector(systemFonts, (state) => state.status);

  const edit = (label: string, change: TextChange) => editTexts(ids, change, label);
  const color = (label: string, set: (style: TextStyle, color: RGBA) => Partial<TextStyle>) => ({
    onChange: (next: RGBA) => {
      edit(label, restyle((s) => set(s, next)));
      rememberColor(next);
    },
    onPreview: (next: RGBA | null) => previewTexts(ids, next ? restyle((s) => set(s, next)) : null),
  });
  const familyName = typeof family === "string" ? family : null;
  const weightValue = typeof weight === "number" ? weight : null;
  const isGradientFill = gradient === true;
  const black: RGBA = { r: 0, g: 0, b: 0, a: 1 };
  const white: RGBA = { r: 1, g: 1, b: 1, a: 1 };

  return (
    <>
      <Row label="Text">
        <ContentField ids={ids} />
      </Row>
      <Row label="Font">
        <FontField
          value={family}
          onPick={(next) => {
            if (fontLibrary.source(next) !== "bundled") void fontLibrary.load({ fontFamily: next, fontWeight: weightValue ?? 400, italic: italic === true }, "");
            edit("Change font", restyle(() => ({ fontFamily: next })));
          }}
        />
      </Row>
      <Row label="Weight">
        <div className={styles.withAction}>
          <Select
            label="Font weight"
            value={weightValue === null ? "" : String(weightValue)}
            options={weight === MIXED ? [{ value: "", label: "--" }, ...weightOptions(familyName, null)] : weightOptions(familyName, weightValue)}
            onChange={(next) => next !== "" && edit("Change font weight", restyle(() => ({ fontWeight: Number(next) })))}
          />
          <IconButton icon={Italic} label="Italic" pressed={italic === true} onClick={() => edit("Change italic", restyle(() => ({ italic: italic !== true })))} />
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
          onChange={(mode) =>
            edit(
              "Change fill",
              restyle((s) => (mode === "gradient" ? { fill: isGradient(s.fill) ? s.fill : { from: s.fill, to: s.stroke.color } } : { fill: fillColor(s.fill) })),
            )
          }
        />
      </Row>
      <Row label={isGradientFill ? "Top" : "Color"}>
        <ColorField
          value={colorOf(fill, white)}
          recent={recent}
          ariaLabel={isGradientFill ? "Gradient top color" : "Text color"}
          {...color("Change text color", (s, c) => ({ fill: isGradient(s.fill) ? { ...s.fill, from: c } : c }))}
        />
      </Row>
      {isGradientFill && (
        <Row label="Bottom">
          <ColorField value={colorOf(fillBottom, black)} recent={recent} ariaLabel="Gradient bottom color" {...color("Change text color", (s, c) => ({ fill: isGradient(s.fill) ? { ...s.fill, to: c } : c }))} />
        </Row>
      )}
      <Row label="Stroke">
        <span className={styles.switchCell}>
          <Toggle checked={stroke === true} mixed={stroke === MIXED} label="Outline" onChange={(on) => edit(on ? "Add stroke" : "Remove stroke", restyle((s) => ({ stroke: { ...s.stroke, enabled: on } })))} />
        </span>
      </Row>
      {stroke !== false && stroke !== NONE && (
        <>
          <Row label="Width">
            <NumberField label="W" unit="px" binding={bindings.stroke} precision={1} min={STROKE_WIDTH.min} max={STROKE_WIDTH.max} ariaLabel="Stroke width" />
          </Row>
          <Row label="Color">
            <ColorField value={colorOf(strokeColor, black)} recent={recent} ariaLabel="Stroke color" {...color("Change stroke", (s, c) => ({ stroke: { ...s.stroke, color: c } }))} />
          </Row>
        </>
      )}
      <Row label="Shadow">
        <span className={styles.switchCell}>
          <Toggle checked={shadow === true} mixed={shadow === MIXED} label="Drop shadow" onChange={(on) => edit(on ? "Add shadow" : "Remove shadow", restyle((s) => ({ shadow: { ...s.shadow, enabled: on } })))} />
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
            <ColorField value={colorOf(shadowColor, black)} recent={recent} ariaLabel="Shadow color" {...color("Change shadow", (s, c) => ({ shadow: { ...s.shadow, color: c } }))} />
          </Row>
        </>
      )}
      <Row label="Background">
        <span className={styles.switchCell}>
          <Toggle
            checked={background === true}
            mixed={background === MIXED}
            label="Background box"
            onChange={(on) => edit(on ? "Add background" : "Remove background", restyle((s) => ({ background: { ...s.background, enabled: on } })))}
          />
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
              onChange={(mode) => edit("Change background", restyle((s) => ({ background: { ...s.background, mode } })))}
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
            <ColorField value={colorOf(backgroundColor, black)} recent={recent} ariaLabel="Background color" {...color("Change background", (s, c) => ({ background: { ...s.background, color: c } }))} />
          </Row>
        </>
      )}
      <Row label="Align">
        <Choice value={align} options={ALIGNS} onChange={(next) => edit("Change alignment", restyle(() => ({ align: next })))} />
      </Row>
      <Row label="Anchor">
        <Choice value={anchor} options={ANCHORS} onChange={(next) => edit("Change anchor", restyle(() => ({ verticalAnchor: next })))} />
      </Row>
      <Row label="Spacing">
        <NumberField label={<MoveHorizontal aria-hidden="true" />} unit="px" binding={bindings.spacing} precision={1} min={LETTER_SPACING.min} max={LETTER_SPACING.max} ariaLabel="Letter spacing" />
      </Row>
      <Row label="Line height">
        <NumberField label={<MoveVertical aria-hidden="true" />} unit="×" binding={bindings.lineHeight} precision={2} step={0.01} min={LINE_HEIGHT.min} max={LINE_HEIGHT.max} ariaLabel="Line height" />
      </Row>
      <Row label="Case">
        <Choice value={textCase} options={CASES} onChange={(next) => edit("Change case", restyle(() => ({ textCase: next })))} />
      </Row>
      <Row label="Box">
        <Choice
          value={boxMode}
          options={[
            { value: "auto", label: "Auto size: the box fits the lines", text: "Auto" },
            { value: "fixed", label: "Fixed width: words wrap at the width", text: "Fixed" },
          ]}
          onChange={(mode) => edit(mode === "fixed" ? "Fixed text box" : "Auto size text box", (clip) => ({ text: { ...clip.text, box: { ...clip.text.box, mode } } }))}
        />
      </Row>
      <Row label="Width">
        <NumberField label="W" unit="px" binding={bindings.boxWidth} precision={0} min={BOX_WIDTH.min} max={BOX_WIDTH.max} disabled={boxMode !== "fixed"} ariaLabel="Text box width" />
      </Row>
    </>
  );
}
