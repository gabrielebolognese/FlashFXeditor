// The capability manifest (spec §21.2, Batch 54): what this build of the editor supports, for the tools
// that write projects. Its lists come from the model constants; its flags from FEATURES, the one place
// a batch turns a capability on. `capabilities.json` at the repo root is this object, written by
// `npm run capabilities` (a unit test fails when the file is stale). Pure: no DOM.
import { ACCEPTED_EXTENSIONS } from "../media/mediaKinds.js";
import { ANIMATION_BUDGET_BYTES, ANIMATION_MAX_SIZE, MAX_GAIN_DB, MAX_SPEED, MIN_GAIN_DB, MIN_SPEED } from "./document/limits.js";
import { KEYFRAME_PROPS } from "./document/keyframes.js";
import { FONT_MANIFEST_VERSION } from "../text/fonts.js";
import { CAPTION_HIGHLIGHTS, CLIP_KINDS, CUE_ANIM_KINDS, EASE_IDS, SCHEMA_VERSION, SOLID_SHAPE_IDS, TEXT_ANIM_IDS, TEXT_ANIM_UNITS, TEXT_BACKGROUND_MODES, TRACK_KINDS, TRANSITION_KINDS } from "./document/types.js";

/** The `manifestVersion`: changes only when a key changes meaning (new keys do not change it). */
export const MANIFEST_VERSION = 1;
/** The last batch that touched the manifest (spec §21.1: each batch sets it to its own number). */
export const LAST_BATCH = 64;

/** The flags of the manifest: a batch that adds a capability flips its key here (spec §21.2 table). */
export const FEATURES = {
  media: { videoAlpha: true, imageSequence: true, lottie: false },
  transform: { rotation3d: false, parenting: false, motionPaths: false, autoOrient: false },
  keyframes: { bezier: true, spring: true, vectorValues: true },
  solid: { stroke: true, shadow: true, cornerRadii: true },
  mediaFrame: { stroke: true, shadow: true, cornerRadius: true },
  text: { spans: false, counter: false, animators: false, backgroundStroke: true, backgroundShadow: true },
  captions: { perCueStyle: true, wordEmphasis: true, wordsImport: true },
  compositing: { compound: true, trackMatte: false, masks: false, adjustment: false },
  vector: { shapes: false, trimPaths: false, svgImport: false },
  audio: { fades: true, trackGain: false, pan: false, loudness: false },
  time: { freeze: true, reverse: false, remap: false, frameBlend: false },
  templates: false,
  export: { alpha: false, imageSequence: false, gif: false, stems: false },
  cli: { validate: true, normalize: true, info: true, render: true, compare: true },
  interop: { openLink: true, externalReload: true, repairOnOpen: true, fallbackOf: true, generatorMeta: true },
} as const;

export interface Capabilities {
  manifestVersion: number;
  app: string;
  appVersion: string;
  lastBatch: number;
  schemaVersion: number;
  [key: string]: unknown;
}

const extensions = (accepted: readonly string[]) => (names: readonly string[]) => names.filter((name) => accepted.includes(`.${name}`));
const VIDEO = ["mp4", "mov", "m4v", "webm"];
const AUDIO = ["mp3", "m4a", "aac", "wav", "ogg"];
const IMAGE = ["png", "jpg", "jpeg", "webp", "gif", "svg"];

/** The manifest of this build (the key order is the file's). */
export function buildCapabilities(appVersion: string): Capabilities {
  const accepted = extensions(ACCEPTED_EXTENSIONS);
  const f = FEATURES;
  return {
    manifestVersion: MANIFEST_VERSION,
    app: "shorts-editor",
    appVersion,
    lastBatch: LAST_BATCH,
    schemaVersion: SCHEMA_VERSION,
    project: { file: "project.json", fontsManifest: "fonts/fonts.json", fontsManifestVersion: FONT_MANIFEST_VERSION, sampleRate: 48000 },
    media: {
      video: accepted(VIDEO),
      audio: accepted(AUDIO),
      image: accepted(IMAGE),
      animatedImage: { formats: ["gif", "webp"], alpha: true, maxSide: ANIMATION_MAX_SIZE, textureBudgetBytes: ANIMATION_BUDGET_BYTES },
      videoAlpha: f.media.videoAlpha,
      imageSequence: f.media.imageSequence,
      lottie: f.media.lottie,
    },
    trackKinds: [...TRACK_KINDS],
    clipKinds: [...CLIP_KINDS],
    transform: { ...f.transform },
    keyframes: { props: [...KEYFRAME_PROPS], eases: [...EASE_IDS], ...f.keyframes },
    solid: { shapes: [...SOLID_SHAPE_IDS], fills: ["color", "gradient2", "linear", "radial"], ...f.solid },
    mediaFrame: { ...f.mediaFrame },
    text: {
      fills: ["color", "gradient2", "linear", "radial"],
      stroke: true,
      shadow: true,
      background: { modes: [...TEXT_BACKGROUND_MODES], stroke: f.text.backgroundStroke, shadow: f.text.backgroundShadow },
      anims: [...TEXT_ANIM_IDS],
      animUnits: [...TEXT_ANIM_UNITS],
      spans: f.text.spans,
      counter: f.text.counter,
      animators: f.text.animators,
    },
    captions: {
      highlightModes: [...CAPTION_HIGHLIGHTS],
      perCueStyle: f.captions.perCueStyle,
      wordEmphasis: f.captions.wordEmphasis,
      cueAnims: [...CUE_ANIM_KINDS],
      boxModes: [...TEXT_BACKGROUND_MODES],
      wordsImport: f.captions.wordsImport,
    },
    transitions: [...TRANSITION_KINDS],
    compositing: { compound: f.compositing.compound, blendModes: ["normal"], trackMatte: f.compositing.trackMatte, masks: f.compositing.masks, adjustment: f.compositing.adjustment },
    vector: { ...f.vector },
    effects: [],
    audio: { clipGainDb: [MIN_GAIN_DB, MAX_GAIN_DB], ...f.audio },
    time: { speedRange: [MIN_SPEED, MAX_SPEED], ...f.time },
    templates: f.templates,
    export: { containers: ["mp4"], videoCodecs: ["h264", "hevc", "av1"], ...f.export },
    cli: { ...f.cli },
    interop: { ...f.interop },
  };
}

/** The text of `capabilities.json` (and of `cli capabilities`). */
export function formatCapabilities(capabilities: Capabilities): string {
  return `${JSON.stringify(capabilities, null, 2)}\n`;
}
