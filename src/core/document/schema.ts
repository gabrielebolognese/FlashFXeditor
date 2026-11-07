// The field table (spec §21.3, Batch 54): one description of every object of project.json and of the font
// manifest, with each field's type, range, whether it is required and its default. The strict validator
// (`strict.ts`), the JSON Schema (`jsonSchema.ts`), the INTEROP.md field reference and, from Batch 55,
// the defaults of `normalize` all come from it. A batch that adds a field adds it here in the same commit
// (spec §21.1). Pure: no DOM.
import { MAX_GAIN_DB, MAX_SPEED, MIN_GAIN_DB } from "./limits.js";
import { KEYFRAME_PROPS } from "./keyframes.js";
import { CAPTION_HIGHLIGHTS, CLIP_KINDS, CUE_ANIM_KINDS, EASE_IDS, LABEL_COLORS, PRESET_SET_IDS, SCHEMA_VERSION, SOLID_SHAPE_IDS, STROKE_ALIGNS, TEXT_ANIM_IDS, TEXT_ANIM_UNITS, TEXT_BACKGROUND_MODES, TRACK_KINDS, TRANSITION_KINDS, type JsonValue } from "./types.js";

export type FieldType =
  | { t: "string"; nonEmpty?: boolean }
  | { t: "number"; min?: number; max?: number; exclusiveMin?: boolean; integer?: boolean }
  | { t: "boolean" }
  | { t: "enum"; values: readonly (string | number)[] }
  /** An object described by the schema `schema`. */
  | { t: "object"; schema: string }
  | { t: "array"; item: FieldType; length?: number }
  /** An object with free keys (ids, property names), or only `keys` when given. */
  | { t: "record"; item: FieldType; keys?: readonly string[] }
  /** One of several shapes, told apart by a key only that shape has. */
  | { t: "union"; options: readonly { when: string; label: string; type: FieldType }[] }
  /** Any JSON object: the content is not described (`fallbackOf.data`). */
  | { t: "json" }
  /** A finite number, or an array of 1 to `max` finite numbers (a keyframe value: a number, a point or a color). */
  | { t: "numberOrVector"; max: number };

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

const FILL: FieldType = {
  t: "union",
  options: [
    { when: "r", label: "RGBA", type: obj("RGBA") },
    { when: "from", label: "gradient", type: obj("Gradient") },
    { when: "stops", label: "gradient with stops", type: obj("GradientFill") },
  ],
};
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
    fields: { gainDb: req(range(MIN_GAIN_DB, MAX_GAIN_DB), "Gain in dB.", 0), muted: req(bool, "Silenced.", false) },
  },
  { name: "Fades", doc: "Fade lengths at the clip's edges.", types: [], fields: { in: req(int(0), `Fade in. ${FRAMES}`, 0), out: req(int(0), `Fade out. ${FRAMES}`, 0) } },
  {
    name: "Keyframe",
    doc: "One keyframe: a value at a frame relative to the clip start. A key's `ease` shapes the segment from it to the next key.",
    types: ["KeyData"],
    fields: {
      frame: req(int(), `Relative to the clip start; one key per frame, sorted. Any integer: after a head trim keys before the clip start (negative) or past its end are kept so a trim back restores them. ${FRAMES}`),
      value: req({ t: "numberOrVector", max: 4 }, "The value: a number, or for a color property an array [r, g, b, a] (straight alpha, 0..1, interpolated per channel)."),
      ease: req(oneOf(EASE_IDS), "The curve to the next key.", "linear"),
      bezier: opt({ t: "array", item: num, length: 4 }, "Ease `bezier`: the CSS cubic-bezier(x1, y1, x2, y2); x1 and x2 are 0..1 (Batch 60)."),
      spring: opt(obj("KeySpring"), "Ease `spring`: damping and frequency; 0.7 and 4 when absent (Batch 60)."),
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
    value: { t: "record", item: { t: "array", item: obj("Keyframe") }, keys: KEYFRAME_PROPS },
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
      transform: req(obj("Transform"), "Placement."),
      opacity: req(range(0, 1), "Opacity.", 1),
      keyframes: opt(obj("Keyframes"), "Animated properties."),
      fades: req(obj("Fades"), "Opacity fades.", { in: 0, out: 0 }),
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
