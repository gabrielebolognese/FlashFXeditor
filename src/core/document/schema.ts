// The field table (spec §21.3, Batch 54): one description of every object of project.json and of the font
// manifest, with each field's type, range, whether it is required and its default. The strict validator
// (`strict.ts`), the JSON Schema (`jsonSchema.ts`), the INTEROP.md field reference and, from Batch 55,
// the defaults of `normalize` all come from it. A batch that adds a field adds it here in the same commit
// (spec §21.1). Pure: no DOM.
import { MAX_GAIN_DB, MAX_SPEED, MIN_GAIN_DB } from "./limits.js";
import { ANIMATOR_PROP_PATTERN, KEYFRAME_PROPS, MASK_PROP_PATTERN, SHAPE_PROP_PATTERN } from "./keyframes.js";
import { EFFECT_PROP_PATTERN } from "../effects/effectParams.js";
import { PRIMITIVE_LIMITS } from "../shapes/primitives.js";
import { BLEND_MODES, EFFECT_TYPES, FADE_CURVES, MASK_MODES, MATTE_MODES, CAPTION_HIGHLIGHTS, CLIP_KINDS, CUE_ANIM_KINDS, EASE_IDS, LABEL_COLORS, PRESET_SET_IDS, SCHEMA_VERSION, FILL_RULES, LINE_CAPS, LINE_JOINS, SOLID_SHAPE_IDS, STROKE_ALIGNS, COUNTER_SEPARATORS, SELECTOR_ORDERS, SELECTOR_SHAPES, TEXT_ANIM_IDS, TEXT_ANIM_UNITS, TEXT_BACKGROUND_MODES, TRACK_KINDS, TRANSITION_DIRECTIONS, TRANSITION_KINDS, type JsonValue } from "./types.js";

export type FieldType =
  | { t: "string"; nonEmpty?: boolean }
  | { t: "number"; min?: number; max?: number; exclusiveMin?: boolean; integer?: boolean; nullable?: boolean }
  | { t: "boolean" }
  | { t: "enum"; values: readonly (string | number)[] }
  /** An object described by the schema `schema`. */
  | { t: "object"; schema: string; nullable?: boolean }
  | { t: "array"; item: FieldType; length?: number }
  /** An object with free keys (ids, property names), or only `keys` (and keys matching `keyPatterns`, regex sources) when given. */
  | { t: "record"; item: FieldType; keys?: readonly string[]; keyPatterns?: readonly string[] }
  /** One of several shapes, told apart by a key only that shape has; or null when `nullable`. */
  | { t: "union"; options: readonly { when: string; label: string; type: FieldType }[]; nullable?: boolean }
  /** Any JSON object: the content is not described (`fallbackOf.data`). */
  | { t: "json" }
  /** A finite number, or an array of 1 to `max` finite numbers (a keyframe value: a number, a point or a color); also a string with `strings` (an effect parameter, Batch 74). */
  | { t: "numberOrVector"; max: number; strings?: boolean };

export interface Field {
  type: FieldType;
  required: boolean;
  /** The value the app uses when the field is absent or the object is created (absent: none, or computed). */
  default?: JsonValue;
  doc: string;
}

export interface ObjectSchema {
  name: string;
  doc: string;
  /** The TypeScript interfaces it describes (`types.ts`, `fonts.ts`): a test checks every interface is covered. */
  types: readonly string[];
  fields: Readonly<Record<string, Field>>;
  /** A schema whose objects are told apart by the `kind` field: the schema of each kind. */
  variants?: Readonly<Record<string, string>>;
  /** A schema that is a plain value type (a keyed record) rather than an object with fixed fields. */
  value?: FieldType;
}

// --- Builders -----------------------------------------------------------------------------------------

const str: FieldType = { t: "string" };
const text: FieldType = { t: "string", nonEmpty: true };
const bool: FieldType = { t: "boolean" };
const num: FieldType = { t: "number" };
const int = (min?: number, max?: number): FieldType => ({ t: "number", integer: true, ...(min !== undefined && { min }), ...(max !== undefined && { max }) });
const range = (min: number, max: number): FieldType => ({ t: "number", min, max });
const pos: FieldType = { t: "number", min: 0, exclusiveMin: true };
const nonNeg: FieldType = { t: "number", min: 0 };
const oneOf = (values: readonly (string | number)[]): FieldType => ({ t: "enum", values });
const obj = (schema: string): FieldType => ({ t: "object", schema });
const list = (item: FieldType): FieldType => ({ t: "array", item });
const req = (type: FieldType, doc: string, def?: JsonValue): Field => ({ type, required: true, doc, ...(def !== undefined && { default: def }) });
const opt = (type: FieldType, doc: string, def?: JsonValue): Field => ({ type, required: false, doc, ...(def !== undefined && { default: def }) });

const FILL_UNION = {
  t: "union" as const,
  options: [
    { when: "r", label: "RGBA", type: obj("RGBA") },
    { when: "from", label: "gradient", type: obj("Gradient") },
    { when: "stops", label: "gradient with stops", type: obj("GradientFill") },
  ],
};
const FILL: FieldType = FILL_UNION;
const WHITE = { r: 1, g: 1, b: 1, a: 1 };
const BLACK = { r: 0, g: 0, b: 0, a: 1 };
const FRAMES = "Integer frames at the project frame rate.";
const US = "Integer microseconds.";

// --- Shared objects -----------------------------------------------------------------------------------

const STROKE_FIELDS: Record<string, Field> = { enabled: req(bool, "Drawn.", false), width: req(nonNeg, "Width, project px.", 6), color: req(obj("RGBA"), "Color.", BLACK) };
const SHADOW_FIELDS: Record<string, Field> = {
  enabled: req(bool, "Drawn.", false),
  x: req(num, "Offset x, project px.", 0),
  y: req(num, "Offset y, project px.", 6),
  blur: req(nonNeg, "Blur, project px.", 16),
  color: req(obj("RGBA"), "Color.", { r: 0, g: 0, b: 0, a: 0.6 }),
};
const BACKGROUND_FIELDS: Record<string, Field> = {
  enabled: req(bool, "Drawn.", false),
  color: req(obj("RGBA"), "Color.", { r: 0, g: 0, b: 0, a: 0.7 }),
  paddingX: req(nonNeg, "Horizontal padding, project px.", 28),
  paddingY: req(nonNeg, "Vertical padding, project px.", 12),
  radius: req(nonNeg, "Corner radius, project px.", 16),
  mode: req(oneOf(TEXT_BACKGROUND_MODES), "One box per line, one for the block, or (captions) one per word.", "block"),
  stroke: opt(obj("TextStroke"), "The box's border, drawn inside its edge (Batch 58); absent: none."),
  shadow: opt(obj("TextShadow"), "The box's shadow, drawn outside it (Batch 58); absent: none."),
};
const HIGHLIGHT_FIELDS: Record<string, Field> = {
  mode: req(oneOf(CAPTION_HIGHLIGHTS), "The effect."),
  color: req(obj("RGBA"), "The active word's fill (color modes) or its box (background)."),
  inactiveColor: req(obj("RGBA"), "The fill of the other words while a cue has word timings."),
  emphasisColor: opt(obj("RGBA"), "The fill of emphasis words from the cue's first frame (Batch 59); absent: the highlight color."),
};

const SCHEMAS: ObjectSchema[] = [
  {
    name: "Rational",
    doc: "A frame rate as an exact fraction: 30 is 30/1, 29.97 is 30000/1001.",
    types: ["Rational"],
    fields: { num: req(int(1), "Numerator."), den: req(int(1), "Denominator.") },
  },
  {
    name: "RGBA",
    doc: "A color: channels 0..1, straight (not premultiplied) alpha.",
    types: ["RGBA"],
    fields: { r: req(range(0, 1), "Red."), g: req(range(0, 1), "Green."), b: req(range(0, 1), "Blue."), a: req(range(0, 1), "Alpha.", 1) },
  },
  {
    name: "Gradient",
    doc: "A vertical two-stop gradient, `from` at the top of the box it fills to `to` at the bottom.",
    types: ["Gradient"],
    fields: { from: req(obj("RGBA"), "Top color."), to: req(obj("RGBA"), "Bottom color.") },
  },
  {
    name: "GradientFill",
    doc: "A gradient with 2 to 8 stops, linear or radial (Batch 58).",
    types: ["GradientFill"],
    fields: {
      type: req(oneOf(["linear", "radial"]), "Linear or radial.", "linear"),
      angle: req(num, "Linear: degrees, 0 = top to bottom, clockwise.", 0),
      center: req(obj("FractionPoint"), "Radial: the center, fractions of the box.", { x: 0.5, y: 0.5 }),
      radius: req(nonNeg, "Radial: a fraction of half the box diagonal.", 1),
      stops: req(list(obj("GradientStop")), "2 to 8 stops, `at` ascending."),
    },
  },
  { name: "GradientStop", doc: "One color of a gradient.", types: ["GradientStop"], fields: { at: req(range(0, 1), "Position along the gradient."), color: req(obj("RGBA"), "Color.") } },
  { name: "FractionPoint", doc: "A point as fractions of a box.", types: [], fields: { x: req(num, "Fraction of the width."), y: req(num, "Fraction of the height.") } },
  {
    name: "StrokeStyle",
    doc: "The outline of a solid or a picture (Batch 58); absent: none.",
    types: ["StrokeStyle"],
    fields: {
      width: req(nonNeg, "Width, project px.", 3),
      color: req(obj("RGBA"), "Color.", BLACK),
      align: req(oneOf(STROKE_ALIGNS), "Inside the edge, centered on it or outside it.", "inside"),
      dash: opt(list(nonNeg), "Dash and gap lengths, project px (at most 4 are drawn); absent: a solid line."),
      dashOffset: opt(num, "Where the pattern starts along the outline, project px."),
    },
  },
  {
    name: "ShadowStyle",
    doc: "The shadow of a solid or a picture (Batch 58); absent: none. `blur` 0 is a hard edge.",
    types: ["ShadowStyle"],
    fields: {
      x: req(num, "Offset x, project px.", 7),
      y: req(num, "Offset y, project px.", 7),
      blur: req(nonNeg, "Blur, project px (0: a hard edge).", 0),
      spread: req(num, "Grows the shadow by this much on every side, project px.", 0),
      color: req(obj("RGBA"), "Color.", BLACK),
    },
  },
  {
    name: "Transform",
    doc: "Where a layer sits. x and y are project pixels from the project center (right and down are positive); scale 1 is the native size.",
    types: ["Transform"],
    fields: {
      x: req(num, "Horizontal offset, project px.", 0),
      y: req(num, "Vertical offset, project px.", 0),
      scale: req(pos, "Scale (the horizontal one when `scaleY` is present).", 1),
      scaleY: opt(pos, "Vertical scale when it differs from `scale`."),
      rotation: req(num, "Degrees, clockwise.", 0),
      rotationX: opt(num, "2.5D (Batch 70): degrees about the layer's horizontal axis through its anchor (the top tips away for positive values).", 0),
      rotationY: opt(num, "2.5D (Batch 70): degrees about the layer's vertical axis through its anchor.", 0),
      z: opt(num, "2.5D (Batch 70): depth, project px; positive is farther away.", 0),
      anchor: req(obj("Anchor"), "The point the layer turns and scales around, fractions of its size from its top-left corner (0.5, 0.5 is the center).", { x: 0.5, y: 0.5 }),
      flipH: req(bool, "Mirrored left to right.", false),
      flipV: req(bool, "Mirrored top to bottom.", false),
    },
  },
  { name: "Anchor", doc: "A point as fractions of a layer's size from its top-left corner.", types: [], fields: { x: req(num, "Horizontal."), y: req(num, "Vertical.") } },
  {
    name: "Crop",
    doc: "The part of the picture cut off each side, fractions 0..1 of the media size.",
    types: ["Crop"],
    fields: { left: req(range(0, 1), "Left.", 0), top: req(range(0, 1), "Top.", 0), right: req(range(0, 1), "Right.", 0), bottom: req(range(0, 1), "Bottom.", 0) },
  },
  {
    name: "Volume",
    doc: "A clip's sound level.",
    types: ["Volume"],
    fields: {
      gainDb: req(range(MIN_GAIN_DB, MAX_GAIN_DB), "Gain in dB.", 0),
      muted: req(bool, "Silenced.", false),
      pan: opt(range(-1, 1), "Audio clips (Batch 77): -1 (left) to 1 (right). Absent: 0. Keyframe prop `volume.pan`.", 0),
    },
  },
  { name: "Fades", doc: "Fade lengths at the clip's edges.", types: [], fields: {
      in: req(int(0), `Fade in. ${FRAMES}`, 0),
      out: req(int(0), `Fade out. ${FRAMES}`, 0),
      curve: opt(oneOf(FADE_CURVES), "Audio fades (Batch 77): the shape. Absent: equalPower.", "equalPower"),
    },
  },
  {
    name: "Loudness",
    doc: "The export loudness target (Batch 77): the mixdown is measured, one gain brings it to the target and a true-peak limiter holds the ceiling.",
    types: ["LoudnessTarget"],
    fields: { targetLufs: req(range(-40, 0), "Integrated loudness, LUFS (ITU-R BS.1770-4).", -14), truePeakDb: req(range(-20, 0), "True-peak ceiling, dBTP.", -1) },
  },
  {
    name: "Keyframe",
    doc: "One keyframe: a value at a frame relative to the clip start. A key's `ease` shapes the segment from it to the next key.",
    types: ["KeyData"],
    fields: {
      frame: req(int(), `Relative to the clip start; one key per frame, sorted. Any integer: after a head trim keys before the clip start (negative) or past its end are kept so a trim back restores them. ${FRAMES}`),
      value: req({ t: "numberOrVector", max: 4096 }, "The value: a number, or for a color property an array [r, g, b, a] (straight alpha, 0..1, interpolated per channel), a point [x, y], or a path mask's points [x0, y0, x1, y1, ...] (Batch 73)."),
      ease: req(oneOf(EASE_IDS), "The curve to the next key.", "linear"),
      bezier: opt({ t: "array", item: num, length: 4 }, "Ease `bezier`: the CSS cubic-bezier(x1, y1, x2, y2); x1 and x2 are 0..1 (Batch 60)."),
      spring: opt(obj("KeySpring"), "Ease `spring`: damping and frequency; 0.7 and 4 when absent (Batch 60)."),
      spatialIn: opt({ t: "array", item: num, length: 2 }, "`transform.position` keys: the motion path's incoming tangent [x, y], relative to the key's point (Batch 69)."),
      spatialOut: opt({ t: "array", item: num, length: 2 }, "`transform.position` keys: the motion path's outgoing tangent [x, y], relative to the key's point (Batch 69)."),
    },
  },
  {
    name: "KeySpring",
    doc: "The parameters of a `spring` ease: a damped cosine over the segment that ends exactly on the next key's value.",
    types: [],
    fields: { damping: req(nonNeg, "Decay over the segment (0 never decays).", 0.7), frequency: req(pos, "Oscillations over the segment.", 4) },
  },
  {
    name: "Keyframes",
    doc: "Keyframe lists by property id, each sorted by frame.",
    types: ["Keyframes"],
    fields: {},
    value: { t: "record", item: { t: "array", item: obj("Keyframe") }, keys: KEYFRAME_PROPS, keyPatterns: [SHAPE_PROP_PATTERN.source, ANIMATOR_PROP_PATTERN.source, MASK_PROP_PATTERN.source, EFFECT_PROP_PATTERN.source] },
  },
  {
    name: "Transition",
    doc: "A transition at the cut between two abutting clips: the left clip's `transitionOut` and the right clip's `transitionIn` hold the same values.",
    types: ["Transition"],
    fields: {
      id: req(text, "Shared by the two clips of the cut."),
      kind: req(oneOf(TRANSITION_KINDS), "The look."),
      before: req(int(0), `Frames before the cut. ${FRAMES}`),
      after: req(int(0), `Frames after the cut. ${FRAMES}`),
      direction: opt(oneOf(TRANSITION_DIRECTIONS), "Slide, push, whip: the way the picture travels.", "left"),
      angle: opt(num, "Wipe: degrees, 0 = the edge travels left to right, 90 = top to bottom.", 0),
      softness: opt(num, "Wipe, iris: the soft width of the edge, 0 to 1.", 0),
      center: opt(obj("FractionPoint"), "Iris: the circle's center, fractions of the frame.", { x: 0.5, y: 0.5 }),
      ease: opt(oneOf(EASE_IDS), "The progress curve. Absent = the linear mix of schema 14 and before; the motion kinds are created with easeInOut."),
    },
  },
  {
    name: "RemapKey",
    doc: "A key of a clip's `timeRemap` (Batch 78): the source time the picture shows at a clip-relative frame. The first key is at frame 0, the last at the clip's duration; frames strictly increase.",
    types: [],
    fields: {
      frame: req(int(0), `Clip-relative frame. ${FRAMES}`),
      sourceUs: req(int(0), `Source time shown. ${US}`),
      ease: req(oneOf(EASE_IDS), "The curve of the segment that starts at this key (linear: a constant speed).", "linear"),
    },
  },
  {
    name: "TrackMatte",
    doc: "A track matte (Batch 72): the clip shows only where the matte clip is opaque (alpha) or bright (luma) at the frame, or the opposite (inverted).",
    types: ["TrackMatte"],
    fields: {
      clipId: req(text, "A visual clip of a video track in the same sequence (not the clip itself). While it is not at the frame the matte is empty: alpha and luma hide the clip, the inverted modes show it whole."),
      mode: req(oneOf(MATTE_MODES), "What of the matte clip is used.", "alpha"),
    },
  },
  {
    name: "Mask",
    doc: "A mask (Batch 73): the clip shows only where its masks, combined in order, cover it. Values are in the clip's content px (a picture's own px, a solid's size, a text box, a shape's view box, a compound's sequence frame).",
    types: ["Mask"],
    fields: {
      id: req(text, "Unique among the clip's masks: letters, digits, `_` or `-` (keyframe ids are `masks.<id>.<field>`)."),
      shape: req({ t: "union", options: [{ when: "w", label: "box", type: obj("MaskBox") }, { when: "d", label: "path", type: obj("MaskPath") }] }, "A rectangle or ellipse box, or a closed path."),
      mode: req(oneOf(MASK_MODES), "How it combines with the masks before it: add (union), subtract, intersect. A first mask that subtracts or intersects starts from the whole clip.", "add"),
      feather: req(nonNeg, "Edge softness on each side of the outline, content px (0 keeps a one pixel antialiased edge).", 0),
      expansion: req(num, "Grows the shape by this many content px (negative shrinks it).", 0),
      opacity: req(range(0, 1), "Scales the mask's coverage.", 1),
      inverted: req(bool, "Uses the outside of the shape.", false),
    },
  },
  {
    name: "Effect",
    doc: "An effect (Batch 74; color, stylize, keys and LUTs since Batch 75): one step of a visual clip's effect stack, applied in order to its picture in content space (after its masks, before its transform, opacity, blend and matte). The parameters of each type, their ranges and defaults are listed in INTEROP.md §5.13 and §5.14; a missing parameter takes its default.",
    types: ["Effect"],
    fields: {
      id: req(text, "Unique among the clip's effects: letters, digits, `_` or `-` (keyframe ids are `effects.<id>.<param>`)."),
      type: req(oneOf(EFFECT_TYPES), "The effect type."),
      enabled: req(bool, "Off: the effect is kept but not drawn.", true),
      params: req({ t: "record", item: { t: "numberOrVector", max: 4, strings: true } }, "Parameters by name: numbers (toggles are 0 or 1), colors [r, g, b, a] (straight alpha, 0..1), choices (strings) and files (a project path such as `luts/warm.cube`, or \"\" for none). Only the type's parameters, each in its range.", {}),
    },
  },
  {
    name: "MaskBox",
    doc: "A rectangle or an ellipse mask shape (Batch 73), content px.",
    types: ["MaskBox"],
    fields: {
      kind: req(oneOf(["rect", "ellipse"]), "Kind."),
      x: req(num, "Left edge."),
      y: req(num, "Top edge."),
      w: req(nonNeg, "Width."),
      h: req(nonNeg, "Height."),
      radius: opt(nonNeg, "Rectangles: corner radius (at most half the shorter side).", 0),
    },
  },
  {
    name: "MaskPath",
    doc: "A path mask shape (Batch 73): SVG path data in content px; every subpath is closed. Its points (every coordinate pair of the parsed M, L, C form in order) are the value of `masks.<id>.path` keys.",
    types: ["MaskPath"],
    fields: {
      kind: req(oneOf(["path"]), "Kind."),
      d: req(str, "SVG path data (M L H V C S Q T A Z, absolute or relative)."),
    },
  },
  {
    name: "FallbackOf",
    doc: "Marks a clip as a baked stand-in for a clip kind or feature a tool could not write natively. `data` is opaque apart from its `kind`.",
    types: ["FallbackOf"],
    fields: {
      kind: req(text, "The kind of the native clip it stands for (any kind, present or future); equals `data.kind`."),
      reason: req(str, "Why the stand-in exists."),
      schemaVersion: req(int(1), "The schema version `data` follows."),
      headTrim: opt(int(0), `How far the stand-in's first frame moved into the native clip (split, head trim, slip). ${FRAMES}`, 0),
      data: req({ t: "json" }, "The native clip in the editor's JSON, without `id`, `trackId`, `start` and `duration`."),
    },
  },

  // --- Text -----------------------------------------------------------------------------------------
  {
    name: "TextBox",
    doc: "How a text box is sized.",
    types: ["TextBox"],
    fields: { mode: req(oneOf(["auto", "fixed"]), "`auto` fits the lines; `fixed` wraps words at `width`.", "auto"), width: req(pos, "Wrap width in project px (used while fixed).", 900) },
  },
  { name: "TextContent", doc: "What a text clip says.", types: ["TextContent"], fields: { value: req(str, "Plain text with `\\n` line breaks."), box: req(obj("TextBox"), "Its box.") } },
  {
    name: "TextStroke",
    doc: "An outline drawn outside the glyphs.",
    types: ["TextStroke"],
    fields: STROKE_FIELDS,
  },
  {
    name: "TextShadow",
    doc: "A drop shadow of the text.",
    types: ["TextShadow"],
    fields: SHADOW_FIELDS,
  },
  {
    name: "TextBackground",
    doc: "A box behind each line or the whole text.",
    types: ["TextBackground"],
    fields: BACKGROUND_FIELDS,
  },
  {
    name: "TextStyle",
    doc: "The look of a text clip. Sizes are project px; `lineHeight` multiplies the size.",
    types: ["TextStyle"],
    fields: {
      fontFamily: req(text, "A family name; a missing family draws with the UI font.", "Inter"),
      fontWeight: req(int(1, 1000), "1..1000 (variable fonts take any value in their range).", 700),
      italic: req(bool, "Italic face.", false),
      fontSize: req(pos, "Size, project px.", 96),
      fill: req(FILL, "A color or a vertical two-stop gradient.", WHITE),
      stroke: req(obj("TextStroke"), "Outline."),
      shadow: req(obj("TextShadow"), "Shadow."),
      background: req(obj("TextBackground"), "Background box."),
      textCase: req(oneOf(["none", "upper", "lower", "title"]), "Case transform.", "none"),
      letterSpacing: req(num, "Extra space between letters, project px.", 0),
      lineHeight: req(pos, "Line height, a multiple of the size.", 1.2),
      align: req(oneOf(["left", "center", "right"]), "Horizontal alignment.", "center"),
      verticalAnchor: req(oneOf(["top", "middle", "bottom"]), "The edge of the box that stays in place when the text grows.", "middle"),
    },
  },
  {
    name: "TextAnim",
    doc: "A text clip's in or out animation, played at most over half the clip.",
    types: ["TextAnim"],
    fields: {
      id: req(oneOf(TEXT_ANIM_IDS), "The animation."),
      duration: req(int(0), `The whole animation, every unit's delay included. ${FRAMES}`),
      perUnit: opt(oneOf(TEXT_ANIM_UNITS), "What moves one by one, instead of the animation's own unit."),
      stagger: opt(int(0), `Delay between two units; spread over the duration when absent. ${FRAMES}`),
      ease: opt(oneOf(EASE_IDS), "Timing curve; the animation's own when absent."),
    },
  },
  {
    name: "PresetTextAnim",
    doc: "A preset's animation, timed in milliseconds (presets cross frame rates).",
    types: ["PresetTextAnim"],
    fields: {
      id: req(oneOf(TEXT_ANIM_IDS), "The animation."),
      durationMs: req(nonNeg, "Whole animation, ms."),
      perUnit: opt(oneOf(TEXT_ANIM_UNITS), "What moves one by one."),
      staggerMs: opt(nonNeg, "Delay between units, ms."),
      ease: opt(oneOf(EASE_IDS), "Timing curve."),
    },
  },
  {
    name: "TextPreset",
    doc: "A text preset. Project presets are files in `presets/text/`; `textPresetsLocal` stays empty.",
    types: ["TextPreset"],
    fields: {
      id: req(text, "Unique id."),
      name: req(str, "Name."),
      style: req(obj("TextStyle"), "The look, sized for a frame whose short side is 1080 px."),
      box: req(obj("TextBox"), "Its box."),
      animIn: opt(obj("PresetTextAnim"), "In animation."),
      animOut: opt(obj("PresetTextAnim"), "Out animation."),
      defaultDuration: opt(int(1), "Length of a clip made from it, ms."),
      position: opt(obj("Anchor"), "Where the clip sits, project px from the frame center (applied when `applyPosition`)."),
      applyPosition: req(bool, "Applying also moves clips to `position`."),
      sampleText: opt(str, "What its button shows and a new clip reads."),
      sets: opt(list(oneOf(PRESET_SET_IDS)), "The bundled sets it is in."),
      highlight: opt(obj("CaptionHighlight"), "The word highlight it gives a caption track."),
      captionAnim: opt(obj("CaptionAnim"), "The cue animations it gives a caption track (Batch 59)."),
      tags: req(list(str), "Its user sets."),
      favorite: req(bool, "Starred."),
      createdAt: req(str, "ISO time."),
      updatedAt: req(str, "ISO time."),
    },
  },

  // --- Captions -------------------------------------------------------------------------------------
  {
    name: "CaptionHighlight",
    doc: "How the word being spoken stands out when a cue has word timings.",
    types: ["CaptionHighlight"],
    fields: HIGHLIGHT_FIELDS,
  },
  {
    name: "CaptionStyle",
    doc: "The look of a caption track's cues.",
    types: ["CaptionStyle"],
    fields: {
      text: req(obj("TextStyle"), "The text style."),
      position: req(oneOf(["bottom", "center", "top", "custom"]), "Where cues sit: a preset, or `custom` at x and y.", "bottom"),
      x: req(num, "`custom`: the middle of the caption, project px from the frame center.", 0),
      y: req(num, "`custom`: the middle of the caption, project px from the frame center (down is positive).", 0),
      maxWidth: req(pos, "Words wrap at this width, project px."),
      maxLines: req(int(1), "A cue with more lines is drawn smaller until it fits."),
      highlight: req(obj("CaptionHighlight"), "The word highlight."),
      anim: opt(obj("CaptionAnim"), "Cue in and out animations (Batch 59); absent: none."),
    },
  },
  {
    name: "CueAnim",
    doc: "An animation of a cue's whole caption box at its start or end, at most half the cue long.",
    types: ["CueAnim"],
    fields: {
      kind: req(oneOf(CUE_ANIM_KINDS), "The animation."),
      frames: req(int(0), `How long it runs; 0 is none (a cue override of its track's animation). ${FRAMES}`),
    },
  },
  {
    name: "CaptionAnim",
    doc: "The animations of a cue's start (`in`) and end (`out`).",
    types: ["CaptionAnim"],
    fields: { in: opt(obj("CueAnim"), "At the cue's start."), out: opt(obj("CueAnim"), "At the cue's end.") },
  },
  {
    name: "CaptionTextOverride",
    doc: "The text style fields a cue can set over its track's; the parts of the stroke, shadow and background one by one.",
    types: ["CaptionTextOverride"],
    fields: {
      fontFamily: opt(text, "Family."),
      fontWeight: opt(int(1, 1000), "Weight."),
      italic: opt(bool, "Italic."),
      fontSize: opt(pos, "Size."),
      fill: opt(FILL, "Fill."),
      stroke: opt(obj("TextStrokeOverride"), "Parts of the outline."),
      shadow: opt(obj("TextShadowOverride"), "Parts of the shadow."),
      background: opt(obj("TextBackgroundOverride"), "Parts of the background box."),
      textCase: opt(oneOf(["none", "upper", "lower", "title"]), "Case."),
      letterSpacing: opt(num, "Letter spacing."),
      lineHeight: opt(pos, "Line height."),
      align: opt(oneOf(["left", "center", "right"]), "Alignment."),
    },
  },
  { name: "TextStrokeOverride", doc: "Any parts of `TextStroke`.", types: [], fields: partial(STROKE_FIELDS) },
  { name: "TextShadowOverride", doc: "Any parts of `TextShadow`.", types: [], fields: partial(SHADOW_FIELDS) },
  { name: "TextBackgroundOverride", doc: "Any parts of `TextBackground`.", types: [], fields: partial(BACKGROUND_FIELDS) },
  { name: "CaptionHighlightOverride", doc: "Any parts of `CaptionHighlight`.", types: [], fields: partial(HIGHLIGHT_FIELDS) },
  {
    name: "CaptionStyleOverride",
    doc: "A cue's own style over its track's: a sparse set of fields, so a change of the track style still changes every field the cue did not set.",
    types: ["CaptionStyleOverride"],
    fields: {
      text: opt(obj("CaptionTextOverride"), "Text style fields."),
      position: opt(oneOf(["bottom", "center", "top", "custom"]), "Position."),
      x: opt(num, "x."),
      y: opt(num, "y."),
      maxWidth: opt(pos, "Wrap width."),
      maxLines: opt(int(1), "Line count."),
      highlight: opt(obj("CaptionHighlightOverride"), "Highlight parts."),
      anim: opt(obj("CaptionAnim"), "Cue animations."),
    },
  },
  { name: "CaptionTrackData", doc: "A caption track's data; its cues are the track's clips.", types: ["CaptionTrackData"], fields: { style: req(obj("CaptionStyle"), "The style of its cues.") } },
  {
    name: "CaptionWord",
    doc: "A word of a cue with its timing.",
    types: ["CaptionWord"],
    fields: {
      text: req(str, "The word."),
      start: req(int(), `Relative to the cue's start, inclusive; may be negative or past the cue's end (an in-trim keeps the words it hides, so a trim back shows them again). ${FRAMES}`),
      end: req(int(), `Relative to the cue's start, exclusive; after \`start\`. ${FRAMES}`),
      emphasis: opt(bool, "Shows the highlight's emphasis color from the cue's first frame (Batch 59)."),
      color: opt(obj("RGBA"), "This word's own fill, over every other color (Batch 59)."),
    },
  },

  // --- Project --------------------------------------------------------------------------------------
  {
    name: "Settings",
    doc: "The project's frame and time base.",
    types: [],
    fields: {
      width: req(int(1), "Frame width, px.", 1080),
      height: req(int(1), "Frame height, px.", 1920),
      fps: req(obj("Rational"), "Frame rate (24, 25, 30, 50 and 60 are the usual ones).", { num: 30, den: 1 }),
      background: req(obj("RGBA"), "Color behind every layer.", BLACK),
      sampleRate: req(oneOf([48000]), "Audio sample rate.", 48000),
      perspective: opt({ ...pos, nullable: true }, "Viewing distance of the 2.5D layers, px (Batch 70); null: none (a flat projection). Absent: 1600.", 1600),
      loudness: opt({ t: "object", schema: "Loudness", nullable: true }, "Export loudness target (Batch 77); null or absent: off.", null),
    },
  },
  {
    name: "ProjectGenerator",
    doc: "The tool that wrote the project; shown in the Project section of the properties panel.",
    types: ["ProjectGenerator"],
    fields: { name: req(text, "Tool name."), version: opt(str, "Tool version."), source: opt(str, "Where the input came from."), url: opt(str, "Tool home page.") },
  },
  {
    name: "ProjectMeta",
    doc: "Bookkeeping the app stamps on save.",
    types: ["ProjectMeta"],
    fields: {
      createdAt: req(str, "ISO time."),
      modifiedAt: req(str, "ISO time."),
      appVersion: req(str, "The app version that last saved it."),
      generator: opt(obj("ProjectGenerator"), "The tool that wrote it."),
    },
  },
  {
    name: "FileRef",
    doc: "Where a media file is: a path inside the project folder (a generated project always uses `relPath`) or, for a linked file, a browser handle key.",
    types: [],
    fields: {
      relPath: opt(text, "Path inside the project folder, `/` separated, no `..`."),
      handleKey: opt(str, "Browser file handle key (written by the app for linked files); empty for a pasted file the app cannot resolve, which stays offline until relinked."),
      pathHint: opt(str, "Where the linked file was, for the relink dialog."),
    },
  },
  {
    name: "Proxy",
    doc: "A lower resolution copy the preview plays.",
    types: [],
    fields: {
      relPath: req(text, "Path inside the project folder."),
      width: req(int(1), "Width, px."),
      height: req(int(1), "Height, px."),
      status: req(oneOf(["none", "pending", "ready", "failed"]), "State."),
    },
  },
  {
    name: "Analysis",
    doc: "State of the background analysis of a media item.",
    types: [],
    fields: { thumbs: req(oneOf(["none", "pending", "ready"]), "Thumbnails.", "none"), peaks: req(oneOf(["none", "pending", "ready"]), "Audio peaks.", "none") },
  },
  {
    name: "MediaItem",
    doc: "A file of the media bin.",
    types: ["MediaItem"],
    fields: {
      id: req(text, "Unique id; the key it is stored under."),
      kind: req(oneOf(["video", "audio", "image"]), "Kind."),
      name: req(str, "Display name."),
      file: req(obj("FileRef"), "The file."),
      durationUs: req(int(0), `Length; 0 for a still image. ${US}`),
      width: opt(int(1), "Picture width, px."),
      height: opt(int(1), "Picture height, px."),
      rotation: opt(oneOf([0, 90, 180, 270]), "Display rotation, degrees."),
      fps: opt(obj("Rational"), "Frame rate of a video."),
      hasAudio: req(bool, "Has a sound track.", false),
      codec: opt(str, "Video codec label (image: its format)."),
      audioCodec: opt(str, "Audio codec label."),
      proxy: opt(obj("Proxy"), "Its proxy."),
      analysis: req(obj("Analysis"), "Analysis state.", { thumbs: "none", peaks: "none" }),
      binId: opt(text, "The bin it is in; names an entry of `bins`."),
      addedAt: req(str, "ISO time."),
      size: opt(int(0), "File size in bytes when imported."),
      alpha: opt(bool, "True for a VP8/VP9 WebM whose alpha channel is decoded (set by the probe; omit it for any other file)."),
      sequence: opt(obj("ImageSequence"), "An image sequence: numbered PNG or WebP frames of one size, played at `fps`. `kind` is `image`, `file.relPath` names the first frame and `durationUs` is count / fps."),
    },
  },
  {
    name: "ImageSequence",
    doc: "The numbered frames of an image sequence (spec §21.11).",
    types: ["ImageSequence"],
    fields: {
      dir: req(text, "The folder of the frames, relative to the project folder, `/` separated, no `..`."),
      pattern: req(text, "printf-style file name of a frame: `%d` or `%0Nd` once, such as `frame_%05d.png`. The extension is `.png` or `.webp`."),
      first: req(int(0), "The number of the first frame (the value `%d` takes).", 0),
      count: req(int(1), "How many frames, numbered first .. first + count - 1 without gaps."),
      fps: req(obj("Rational"), "Playback rate of the sequence."),
    },
  },
  { name: "Bin", doc: "A media panel folder (flat, one level).", types: ["Bin"], fields: { id: req(text, "Unique id."), name: req(text, "Name.") } },
  {
    name: "Track",
    doc: "A lane of clips. Video tracks come first (index 0 is the bottom one), then the caption track, then audio tracks.",
    types: ["Track"],
    fields: {
      id: req(text, "Unique id."),
      kind: req(oneOf(TRACK_KINDS), "Kind."),
      name: req(str, "Name (V1, A1, CC1)."),
      clipIds: req(list(text), "Its clips, sorted by start, non-overlapping."),
      locked: req(bool, "Locked against edits.", false),
      muted: req(bool, "Muted.", false),
      solo: req(bool, "Soloed.", false),
      hidden: req(bool, "Hidden.", false),
      targeted: req(bool, "Takes inserts.", true),
      height: req(oneOf(["S", "M", "L"]), "Row height.", "M"),
      gainDb: opt(range(MIN_GAIN_DB, MAX_GAIN_DB), "Audio tracks (Batch 77): level in dB. Absent: 0.", 0),
      pan: opt(range(-1, 1), "Audio tracks (Batch 77): -1 (left) to 1 (right). Absent: 0.", 0),
    },
  },
  {
    name: "Marker",
    doc: "A labeled flag on the timeline, sorted by frame.",
    types: ["Marker"],
    fields: { id: req(text, "Unique id."), frame: req(int(0), FRAMES), color: req(oneOf(LABEL_COLORS), "Label color."), label: req(str, "Text.") },
  },
  {
    name: "Project",
    doc: "project.json.",
    types: ["Project"],
    fields: {
      schemaVersion: req(int(1), "The schema version; this build writes and reads up to the current one.", SCHEMA_VERSION),
      id: req(text, "Unique id, never changes (uuid v4 recommended)."),
      name: req(str, "Project name."),
      settings: req(obj("Settings"), "Frame and time base."),
      media: req({ t: "record", item: obj("MediaItem") }, "Media by id.", {}),
      bins: req(list(obj("Bin")), "Media bins in strip order.", []),
      tracks: req(list(obj("Track")), "Tracks in order.", []),
      clips: req({ t: "record", item: obj("Clip") }, "All clips by id; tracks list their ids.", {}),
      markers: req(list(obj("Marker")), "Markers sorted by frame.", []),
      captionTracks: req({ t: "record", item: obj("CaptionTrackData") }, "Style of the caption track, by track id.", {}),
      textPresetsLocal: req(list(obj("TextPreset")), "Kept empty.", []),
      sequences: opt({ t: "record", item: obj("Sequence") }, "Nested sequences by id (Batch 62); what compound clips show. Absent: none.", {}),
      meta: req(obj("ProjectMeta"), "Bookkeeping."),
    },
  },

  // --- Clips ----------------------------------------------------------------------------------------
  {
    name: "Clip",
    doc: "A clip: the `kind` field selects its description.",
    types: [],
    fields: {},
    variants: Object.fromEntries(CLIP_KINDS.map((kind) => [kind, `Clip.${kind}`])),
  },
  { name: "ClipBase", doc: "The fields every clip has.", types: ["ClipBase"], fields: clipBaseFields() },
  ...(["video", "audio", "image"] as const).map((kind): ObjectSchema => ({ name: `Clip.${kind}`, doc: `A ${kind} clip.`, types: kind === "video" ? ["MediaClip"] : [], fields: { ...clipBaseFields(kind), ...mediaClipFields(kind) } })),
  {
    name: "Clip.text",
    doc: "A text clip.",
    types: ["TextClip"],
    fields: {
      ...clipBaseFields("text"),
      text: req(obj("TextContent"), "What it says."),
      style: req(obj("TextStyle"), "Its look."),
      animIn: opt(obj("TextAnim"), "In animation."),
      animOut: opt(obj("TextAnim"), "Out animation."),
      presetId: opt(text, "The preset it was made from."),
      spans: opt(list(obj("TextSpan")), "Styled runs inside the text, sorted by `start` and not overlapping (Batch 67). Content: presets never store them."),
      counter: opt(obj("TextCounter"), "A number that counts (Batch 68): the clip shows `prefix + value + suffix`; `text.value` holds the final text."),
      animators: opt(list(obj("TextAnimator")), "Range-selector animators (Batch 68)."),
      transform: req(obj("Transform"), "Placement."),
      opacity: req(range(0, 1), "Opacity.", 1),
      keyframes: opt(obj("Keyframes"), "Animated properties."),
      fades: req(obj("Fades"), "Opacity fades.", { in: 0, out: 0 }),
    },
  },
  {
    name: "TextCounter",
    doc: "A counting number: the value goes from `from` to `to` over the clip through `ease`, or follows the keys of `text.counter.value`.",
    types: ["TextCounter"],
    fields: {
      from: req(num, "Value on the first frame.", 0),
      to: req(num, "Value on the last frame.", 100),
      decimals: req(int(0, 6), "Digits after the decimal point.", 0),
      prefix: req(str, "Text before the number.", ""),
      suffix: req(str, "Text after the number.", ""),
      separator: req(oneOf(COUNTER_SEPARATORS), "Thousands separator (empty: none).", ""),
      ease: req(oneOf(EASE_IDS), "Timing curve.", "easeOut"),
    },
  },
  {
    name: "TextAnimator",
    doc: "A per-character, word or line animation: each unit gets an amount 0..1 from the range selector and each prop applies times that amount.",
    types: ["TextAnimator"],
    fields: {
      id: req(text, "Unique within the clip; keyframe properties name it (`animators.<id>.*`)."),
      unit: req(oneOf(TEXT_ANIM_UNITS), "What the selector counts.", "char"),
      selector: req(obj("AnimatorSelector"), "The range selector."),
      props: req(obj("AnimatorProps"), "What the animator does at amount 1."),
    },
  },
  {
    name: "AnimatorSelector",
    doc: "A range selector with After Effects semantics: a window over the units, shaped by `shape`, moved by `offset`.",
    types: ["AnimatorSelector"],
    fields: {
      start: req(num, "Window start, fraction of the units.", 0),
      end: req(num, "Window end, fraction of the units.", 1),
      offset: req(num, "Moves the window; key it from 0 to 1 for a reveal.", 0),
      shape: req(oneOf(SELECTOR_SHAPES), "Falloff inside the window.", "rampUp"),
      ease: req(range(-1, 1), "Reshapes the ramps (0: none).", 0),
      order: req(oneOf(SELECTOR_ORDERS), "Which unit sits where in the window.", "forward"),
      seed: req(int(0), "Seed of the random order.", 1),
    },
  },
  {
    name: "AnimatorProps",
    doc: "What an animator does to a unit at amount 1; each is times the unit's amount (opacity moves toward its value, fill toward its color).",
    types: ["AnimatorProps"],
    fields: {
      x: opt(num, "Offset x, project px."),
      y: opt(num, "Offset y, project px."),
      scale: opt(num, "Scale at amount 1 (1: unchanged; moves toward it)."),
      rotation: opt(num, "Degrees."),
      opacity: opt(range(0, 1), "Opacity at amount 1."),
      blur: opt(nonNeg, "Blur, project px."),
      tracking: opt(num, "Extra letter spacing, project px."),
      fill: opt(obj("RGBA"), "Color at amount 1."),
    },
  },
  {
    name: "TextSpan",
    doc: "A styled run of a text clip: `[start, end)` in UTF-16 units of `text.value`.",
    types: ["TextSpan"],
    fields: {
      start: req(int(0), "First character, UTF-16 offset into `text.value`."),
      end: req(int(1), "After the last character; greater than `start`, at most the length of `text.value`."),
      style: req(obj("TextSpanStyle"), "What it changes."),
    },
  },
  {
    name: "TextSpanStyle",
    doc: "What a span changes on its characters; an absent field keeps the clip style's.",
    types: ["TextSpanStyle"],
    fields: {
      fill: opt(FILL, "Text color."),
      fontFamily: opt(text, "Font family."),
      fontWeight: opt(range(1, 1000), "Font weight."),
      italic: opt(bool, "Italic."),
      underline: opt(bool, "A line under the text."),
      strike: opt(bool, "A line through the text."),
      highlight: opt(obj("RGBA"), "A box behind the text."),
    },
  },
  {
    name: "Clip.solid",
    doc: "A solid or shape layer: `size` project px at scale 1.",
    types: ["SolidClip"],
    fields: {
      ...clipBaseFields("solid"),
      fill: req(FILL, "A color or a vertical two-stop gradient."),
      shape: req(oneOf(SOLID_SHAPE_IDS), "The shape.", "rect"),
      size: req(obj("Size"), "Width and height at scale 1, project px."),
      cornerRadius: req(nonNeg, "Corner radius, project px (at most half the shorter side; rounds a line's ends).", 0),
      cornerRadii: opt({ t: "array", item: nonNeg, length: 4 }, "Radii of the corners tl, tr, br, bl; wins over `cornerRadius` (Batch 58)."),
      stroke: opt(obj("StrokeStyle"), "Outline (Batch 58)."),
      shadow: opt(obj("ShadowStyle"), "Shadow (Batch 58)."),
      transform: req(obj("Transform"), "Placement."),
      opacity: req(range(0, 1), "Opacity.", 1),
      keyframes: opt(obj("Keyframes"), "Animated properties."),
      fades: opt(obj("Fades"), "Opacity fades."),
    },
  },
  {
    name: "Clip.compound",
    doc: "A nested sequence shown as one layer (Batch 62): inner frame = `offset + (frame - start)`; `offset + duration` stays within the sequence.",
    types: ["CompoundClip"],
    fields: {
      ...clipBaseFields("compound"),
      sequenceId: req(text, "The sequence it shows (a key of `Project.sequences`); instances may share one."),
      offset: req(int(0), `The sequence frame shown at the clip's first frame. ${FRAMES}`, 0),
      transform: req(obj("Transform"), "Placement."),
      opacity: req(range(0, 1), "Opacity.", 1),
      keyframes: opt(obj("Keyframes"), "Animated properties."),
      fades: req(obj("Fades"), "Opacity fades.", { in: 0, out: 0 }),
      volume: req(obj("Volume"), "Gain of the inner audio."),
    },
  },
  {
    name: "Clip.shape",
    doc: "A vector graphic (Batch 65): paths drawn in order in a view box of `size` project px at scale 1.",
    types: ["ShapeClip"],
    fields: {
      ...clipBaseFields("shape"),
      size: req(obj("Size"), "The view box: width and height at scale 1, project px."),
      paths: req(list(obj("ShapePath")), "The paths, bottom to top.", []),
      transform: req(obj("Transform"), "Placement."),
      opacity: req(range(0, 1), "Opacity.", 1),
      keyframes: opt(obj("Keyframes"), "Animated properties, including `paths.<id>.*`."),
      fades: opt(obj("Fades"), "Opacity fades."),
    },
  },
  {
    name: "Clip.null",
    doc: "An invisible controller (Batch 69): never drawn or exported, a parent for other layers. `size` is the outline shown when it is selected.",
    types: ["NullClip"],
    fields: {
      ...clipBaseFields("null"),
      size: req(obj("Size"), "The selection outline: width and height at scale 1, project px.", { w: 100, h: 100 }),
      transform: req(obj("Transform"), "Placement."),
      keyframes: opt(obj("Keyframes"), "Animated properties, including `transform.position`."),
    },
  },
  {
    name: "Clip.adjustment",
    doc: "An adjustment clip (Batch 76): no picture of its own; during its range its effects apply to the composite of every layer below it in the same sequence, its masks (in project px) limit the area and its opacity mixes the result with the unaffected picture. No transform, parent, blend mode or matte.",
    types: ["AdjustmentClip"],
    fields: {
      ...clipBaseFields("adjustment"),
      effects: req(list(obj("Effect")), "The effect stack applied to the picture below, in order; empty = no change.", []),
      opacity: req(range(0, 1), "How much of the adjusted picture shows over the unaffected one.", 1),
      keyframes: opt(obj("Keyframes"), "Animated properties: `opacity`, `masks.<id>.*` and `effects.<id>.*` only."),
      fades: opt(obj("Fades"), "Opacity fades."),
    },
  },
  {
    name: "ShapePath",
    doc: "One path of a shape clip (Batch 65). With `primitive`, the path is generated from it and `d` holds the generated data.",
    types: ["ShapePath"],
    fields: {
      id: req(text, "Unique within the clip: letters, digits, `_` and `-` (keyframe ids name it)."),
      d: req(str, "SVG path data in view-box px (M L H V C S Q T A Z, absolute and relative); empty: nothing.", ""),
      fill: { type: { ...FILL_UNION, nullable: true }, required: true, default: null, doc: "A color, a vertical two-stop gradient or a gradient with stops (laid out in the path's box); null: no fill." },
      fillRule: req(oneOf(FILL_RULES), "Which points are inside where the path crosses itself.", "nonzero"),
      stroke: opt(obj("PathStroke"), "Outline; absent: none."),
      trim: opt(obj("PathTrim"), "The drawn part of the stroke; absent: all of it."),
      primitive: opt(obj("Primitive"), "The generator of the path; absent: `d` is the path."),
    },
  },
  {
    name: "PathStroke",
    doc: "The stroke of a path (Batch 65): a StrokeStyle in view-box px with caps, joins and a miter limit. `inside` and `outside` apply to closed paths (open ones are centered).",
    types: ["PathStroke"],
    fields: {
      width: req(nonNeg, "Width, view-box px.", 4),
      color: req(obj("RGBA"), "Color.", BLACK),
      align: req(oneOf(STROKE_ALIGNS), "Inside the fill, centered on the path or outside it.", "center"),
      dash: opt(list(nonNeg), "Dash and gap lengths, view-box px (an odd list repeats); absent or empty: a solid line."),
      dashOffset: opt(num, "Where the pattern starts along each subpath, view-box px."),
      cap: req(oneOf(LINE_CAPS), "Ends of open subpaths and dashes.", "butt"),
      join: req(oneOf(LINE_JOINS), "Corners.", "miter"),
      miterLimit: req({ t: "number", min: 1 }, "Longest miter as a multiple of the width; longer ones are beveled.", 4),
    },
  },
  {
    name: "PathTrim",
    doc: "The part of a path's stroke that is drawn (Batch 65): fractions of the whole path length (subpaths in order); `offset` shifts both ends and wraps.",
    types: ["PathTrim"],
    fields: { start: req(range(0, 1), "Start.", 0), end: req(range(0, 1), "End.", 1), offset: req(num, "Shift of both ends, fractions of the length.", 0) },
  },
  {
    name: "Primitive",
    doc: "A generated path, centered in the view box (Batch 65); angles in degrees, 0 = up, clockwise.",
    types: [],
    fields: {},
    variants: { rect: "Primitive.rect", ellipse: "Primitive.ellipse", polygon: "Primitive.polygon", star: "Primitive.star", arrow: "Primitive.arrow", arc: "Primitive.arc", line: "Primitive.line" },
  },
  { name: "Primitive.rect", doc: "A rectangle.", types: [], fields: { kind: req(oneOf(["rect"]), "Kind."), w: req(nonNeg, "Width."), h: req(nonNeg, "Height."), radius: req(nonNeg, "Corner radius (at most half the shorter side).", 0) } },
  { name: "Primitive.ellipse", doc: "An ellipse.", types: [], fields: { kind: req(oneOf(["ellipse"]), "Kind."), w: req(nonNeg, "Width."), h: req(nonNeg, "Height.") } },
  {
    name: "Primitive.polygon",
    doc: "A regular polygon, its first corner up.",
    types: [],
    fields: { kind: req(oneOf(["polygon"]), "Kind."), sides: req(int(PRIMITIVE_LIMITS.sides.min, PRIMITIVE_LIMITS.sides.max), "Corners.", 6), radius: req(nonNeg, "Center to corner."), roundness: req(range(0, 1), "Corner rounding (fraction of half the shorter neighboring edge).", 0) },
  },
  {
    name: "Primitive.star",
    doc: "A star, its first point up.",
    types: [],
    fields: {
      kind: req(oneOf(["star"]), "Kind."),
      points: req(int(PRIMITIVE_LIMITS.points.min, PRIMITIVE_LIMITS.points.max), "Points.", 5),
      inner: req(nonNeg, "Center to the inner corners."),
      outer: req(nonNeg, "Center to the points."),
      roundness: req(range(0, 1), "Corner rounding (fraction of half the shorter neighboring edge).", 0),
    },
  },
  {
    name: "Primitive.arrow",
    doc: "An arrow pointing right (a closed outline).",
    types: [],
    fields: { kind: req(oneOf(["arrow"]), "Kind."), length: req(nonNeg, "Tail to tip."), shaft: req(nonNeg, "Shaft thickness."), head: req(nonNeg, "Head width."), headLength: req(nonNeg, "Head length (at most the length).") },
  },
  {
    name: "Primitive.arc",
    doc: "An open circular arc from `start` to `end` (clockwise when `end` is larger); stroke it.",
    types: [],
    fields: {
      kind: req(oneOf(["arc"]), "Kind."),
      radius: req(nonNeg, "Radius."),
      start: req(range(PRIMITIVE_LIMITS.angle.min, PRIMITIVE_LIMITS.angle.max), "Start angle, degrees.", 0),
      end: req(range(PRIMITIVE_LIMITS.angle.min, PRIMITIVE_LIMITS.angle.max), "End angle, degrees (the sweep is at most a full turn).", 270),
    },
  },
  { name: "Primitive.line", doc: "A horizontal line (open); stroke it.", types: [], fields: { kind: req(oneOf(["line"]), "Kind."), length: req(nonNeg, "Length.") } },
  {
    name: "Sequence",
    doc: "A nested sequence (Batch 62): its inner clips are in `Project.clips` on its own tracks. Up to 8 levels of nesting; a cycle is invalid.",
    types: ["Sequence"],
    fields: {
      id: req(text, "Unique id; the key it is stored under."),
      name: req(str, "Display name."),
      size: req(obj("Size"), "Frame size, project px."),
      duration: req(int(1), `Length. ${FRAMES}`),
      background: { type: { t: "object", schema: "RGBA", nullable: true }, required: true, default: null, doc: "Color behind the inner layers; null: transparent." },
      tracks: req(list(obj("Track")), "Inner video and audio tracks, ordered like `Project.tracks`; no caption track."),
      perspective: opt({ ...pos, nullable: true }, "Viewing distance of its 2.5D layers, px (Batch 70); null: none. Absent: 1600.", 1600),
      depthSort: opt(bool, "Inner layers drawn by depth, farthest first, instead of track order (Batch 70).", false),
    },
  },
  { name: "Size", doc: "A width and a height in project px.", types: [], fields: { w: req(pos, "Width."), h: req(pos, "Height.") } },
  {
    name: "Clip.caption",
    doc: "A caption cue. Its style is its track's with `styleOverride` on top.",
    types: ["CaptionClip"],
    fields: {
      ...clipBaseFields("caption"),
      text: req(str, "Plain text with `\\n` line breaks."),
      words: opt(list(obj("CaptionWord")), "Word timings (karaoke), relative to the cue start."),
      styleOverride: opt(obj("CaptionStyleOverride"), "The cue's own style."),
      presetId: opt(text, "The preset it was styled with."),
    },
  },

  // --- Fonts manifest -------------------------------------------------------------------------------
  {
    name: "FontManifest",
    doc: "`fonts/fonts.json`: the font files the project carries.",
    types: [],
    fields: { version: req(oneOf([1, 2]), "2 since Batch 51 (each face's source); version 1 faces were system fonts.", 2), faces: req(list(obj("FontFace")), "The faces.") },
  },
  {
    name: "FontFace",
    doc: "One face of a family, in a file of `fonts/`.",
    types: ["ProjectFontFace"],
    fields: {
      family: req(text, "Family name texts refer to."),
      style: opt(str, "The face's style name (\"Bold Italic\").", "Regular"),
      weight: opt(int(1, 1000), "Weight.", 400),
      italic: opt(bool, "Italic.", false),
      postscriptName: opt(str, "PostScript name (the file name when absent)."),
      file: req(text, "File name inside `fonts/` (no path)."),
      source: opt(oneOf(["library", "user", "system"]), "Where it came from (version 2).", "system"),
      weightRange: opt({ t: "array", item: int(1, 1000), length: 2 }, "A variable file's weight axis [min, max]."),
      unicodeRange: opt(str, "The characters a subset file covers."),
      origin: opt(str, "The library file (`<slug>/<file>`) or My fonts id it is a copy of."),
    },
  },
];

function clipBaseFields(kind?: string): Record<string, Field> {
  return {
    id: req(text, "Unique id; the key it is stored under."),
    trackId: req(text, "The track listing it."),
    kind: req(kind ? oneOf([kind]) : oneOf(CLIP_KINDS), "Kind."),
    name: req(str, "Display name."),
    start: req(int(0), `First frame on the timeline. ${FRAMES}`),
    duration: req(int(1), `Length, at least 1. ${FRAMES}`),
    color: opt(oneOf(LABEL_COLORS), "Label color."),
    linkGroup: opt(text, "Clips sharing it move and trim together."),
    group: opt(text, "Clips sharing it select together."),
    enabled: req(bool, "Drawn and heard.", true),
    fallbackOf: opt(obj("FallbackOf"), "Set when the clip is a baked stand-in."),
    parentId: opt(text, "A visual clip of a video track in the same sequence: this clip's transform is in the parent's space (Batch 69). No cycles."),
    autoOrient: opt(bool, "Rotation follows the tangent of the `transform.position` motion path (Batch 69)."),
    backfaceHidden: opt(bool, "2.5D (Batch 70): not drawn while its back faces the viewer.", false),
    blend: opt(oneOf(BLEND_MODES), "Visual clips (Batch 72): how the clip blends with the picture below it (W3C formulas; `add` is linear dodge).", "normal"),
    matte: opt(obj("TrackMatte"), "Visual clips (Batch 72): the clip shows only through another clip's alpha or luma."),
    matteOnly: opt(bool, "Visual clips (Batch 72): not drawn on its own; it is another clip's matte.", false),
    masks: opt(list(obj("Mask")), "Visual clips (Batch 73): masks combined in order; absent or empty = the whole clip shows."),
    effects: opt(list(obj("Effect")), "Visual clips (Batch 74): the effect stack, applied in order after the masks; absent or empty = none."),
  };
}

function mediaClipFields(kind: "video" | "audio" | "image"): Record<string, Field> {
  return {
    mediaId: req(text, "The media item it plays; a clip whose item was removed stays as an offline clip."),
    in: req(int(0), `Source in point. ${US}`),
    out: req(int(1), `Source out point; \`out - in\` equals \`duration * speed\` frame times (within one frame). ${US}`),
    speed: req({ t: "number", min: 0, max: MAX_SPEED }, "Playback speed 0.25..4 (0 only for a video freeze frame).", 1),
    transform: req(obj("Transform"), "Placement."),
    opacity: req(range(0, 1), "Opacity.", 1),
    crop: req(obj("Crop"), "Cropping."),
    ...(kind === "audio"
      ? {}
      : {
          cornerRadius: opt(nonNeg, "Rounded corners of the cropped picture, project px (Batch 58)."),
          stroke: opt(obj("StrokeStyle"), "Outline around the cropped picture (Batch 58)."),
          shadow: opt(obj("ShadowStyle"), "Shadow of the cropped picture (Batch 58)."),
        }),
    volume: req(obj("Volume"), "Sound level."),
    fades: req(obj("Fades"), kind === "audio" ? "Volume fades." : "Opacity and volume fades.", { in: 0, out: 0 }),
    keyframes: opt(obj("Keyframes"), "Animated properties."),
    timeRemap: opt(list(obj("RemapKey")), "Video clips (Batch 78): keys mapping timeline frames to source times; replaces `speed` for the picture and mutes the linked audio. At least two keys."),
    reverse: opt(bool, "Video and audio clips (Batch 78): the source plays backward, from `out` to `in`. Ignored when `timeRemap` is set.", false),
    frameBlend: opt(bool, "Video clips (Batch 78): when the source advances less than one frame per timeline frame, the two nearest source frames are mixed.", false),
    transitionIn: opt(obj("Transition"), "Transition at the start."),
    transitionOut: opt(obj("Transition"), "Transition at the end."),
  };
}

/** `fields`, all optional (a sparse override). */
function partial(fields: Record<string, Field>): Record<string, Field> {
  return Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, { ...field, required: false }]));
}

/** Every object of the format, by name. */
export const FIELD_TABLE: Readonly<Record<string, ObjectSchema>> = Object.fromEntries(SCHEMAS.map((schema) => [schema.name, schema]));

/** The schema `name` (throws for an unknown one). */
export function schemaOf(name: string): ObjectSchema {
  const schema = FIELD_TABLE[name];
  if (!schema) throw new Error(`The field table has no object "${name}"`);
  return schema;
}
