// The capability audit (spec §21.1, Batch 82): a manifest key is announced only when something tests it. Every
// `true` flag and every value of every list in `capabilities.json` has a rule here, and the rule holds only when
// a field of an interop fixture uses it (`fixtures/interop/*/project.json`, the full fixture among them) or, for
// what a project file cannot show (the CLI, export, the app's reload and repair), a unit test file exists that
// exercises it. A key with no rule, a rule whose evidence is gone and a rule for a key no longer in the manifest
// all fail the audit. Pure: the corpus and the file check are passed in.
import type { Capabilities } from "./capabilities.js";

type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** The top-level maps keyed by id. */
const ID_MAPS: ReadonlySet<string> = new Set(["clips", "media", "sequences", "captionTracks"]);

/** What the fixtures hold, indexed once. */
export class Corpus {
  readonly projects: Json[];
  /** Every object key anywhere in a project. */
  readonly keys = new Set<string>();
  /**
   * The strings at each path, with array indexes dropped and the ids of the top-level maps (`clips`, `media`,
   * `sequences`, `captionTracks`) written `*`: `clips.*.animIn.id` -> fade, pop ...
   */
  readonly paths = new Map<string, Set<string>>();
  /** The property paths of every clip's `keyframes`. */
  readonly keyframeProps = new Set<string>();
  readonly clips: Json[] = [];

  constructor(projects: Json[]) {
    this.projects = projects;
    for (const project of projects) {
      this.walk(project, "");
      for (const clip of Object.values<Json>(project.clips ?? {})) {
        this.clips.push(clip);
        for (const prop of Object.keys(clip.keyframes ?? {})) this.keyframeProps.add(prop);
      }
    }
  }

  private walk(node: Json, path: string): void {
    if (typeof node === "string") {
      let set = this.paths.get(path);
      if (!set) this.paths.set(path, (set = new Set()));
      set.add(node);
    } else if (Array.isArray(node)) {
      for (const item of node) this.walk(item, path);
    } else if (node && typeof node === "object") {
      const idMap = ID_MAPS.has(path);
      for (const [k, v] of Object.entries(node)) {
        this.keys.add(k);
        this.walk(v, path === "" ? k : `${path}.${idMap ? "*" : k}`);
      }
    }
  }

  /** Whether `value` is the string at some path matching one of `patterns` (the list's own fields, not any field of that name). */
  has(value: string, ...patterns: RegExp[]): boolean {
    for (const [path, set] of this.paths) if (set.has(value) && patterns.some((pattern) => pattern.test(path))) return true;
    return false;
  }

  /** Whether some clip of one of `kinds` (any when none) satisfies `test`. */
  clip(test: (clip: Json) => boolean, ...kinds: string[]): boolean {
    return this.clips.some((clip) => (kinds.length === 0 || kinds.includes(clip.kind)) && test(clip));
  }
}

export type Rule =
  /** A value that describes a limit or a constant, not a feature. */
  | { skip: string }
  /** A unit test file (relative to the repo) that exercises it. */
  | { test: string }
  /** A flag: the corpus uses it. */
  | { fixture: (corpus: Corpus) => boolean }
  /** A list: each value is the string at a path that matches (`Corpus.paths`): the list's own fields only. */
  | { at: RegExp }
  /** A list of keyframe property paths (`<id>` stands for any id): each is keyed on some clip. */
  | { keyframes: true };

const anyKey = (...keys: string[]): Rule => ({ fixture: (c) => keys.some((key) => c.keys.has(key)) });
const CLIP_KIND = /^clips\.\*\.kind$/;
const KEY_EASE = /^clips\.\*\.keyframes\..+\.ease$/;
const kind = (value: string): Rule => ({ fixture: (c) => c.has(value, CLIP_KIND) });
const ease = (value: string): Rule => ({ fixture: (c) => c.has(value, KEY_EASE) });
/** Where a caption's own style lives: a track's style and a cue's override. */
const captionPath = (tail: string) => new RegExp(String.raw`^(?:clips\.\*\.styleOverride|captionTracks\.\*\.style)\.${tail}$`);
const keyed = (clip: Json, field: string) => clip[field] !== undefined;

/** The rules, by manifest path (`a.b`). */
export const RULES: Record<string, Rule> = {
  "project.file": { skip: "a constant" },
  "project.fontsManifest": { skip: "a constant" },
  "project.fontsManifestVersion": { skip: "a constant" },
  "project.sampleRate": { skip: "a constant" },
  "media.video": { test: "src/media/mediaKinds.test.ts" },
  "media.audio": { test: "src/media/mediaKinds.test.ts" },
  "media.image": { test: "src/media/mediaKinds.test.ts" },
  "media.animatedImage.formats": { test: "src/media/mediaKinds.test.ts" },
  "media.animatedImage.alpha": { test: "src/media/mediaKinds.test.ts" },
  "media.videoAlpha": { fixture: (c) => c.projects.some((p) => Object.values<Json>(p.media ?? {}).some((m) => m.kind === "video" && m.alpha === true)) },
  "media.imageSequence": anyKey("sequence"),
  "media.lottie": kind("lottie"),
  "media.lottieFormats": { test: "src/media/mediaKinds.test.ts" },
  trackKinds: { at: /^(?:sequences\.\*\.)?tracks\.kind$/ },
  clipKinds: { at: CLIP_KIND },
  "transform.rotation3d": anyKey("rotationX", "rotationY"),
  "transform.parenting": anyKey("parentId"),
  "transform.motionPaths": { fixture: (c) => c.keyframeProps.has("transform.position") },
  "transform.autoOrient": anyKey("autoOrient"),
  "keyframes.props": { keyframes: true },
  "keyframes.eases": { at: KEY_EASE },
  "keyframes.bezier": ease("bezier"),
  "keyframes.spring": ease("spring"),
  "keyframes.vectorValues": { fixture: (c) => c.clips.some((clip) => Object.values<Json[]>(clip.keyframes ?? {}).some((keys) => keys.some((key) => Array.isArray(key.value)))) },
  "keyframes.effectProps": { keyframes: true },
  "solid.shapes": { at: /^clips\.\*\.shape$/ },
  "solid.fills": { fixture: (c) => c.clip((clip) => typeof clip.fill?.r === "number", "solid") && c.clip((clip) => clip.fill?.from !== undefined, "solid") && c.clip((clip) => clip.fill?.type === "linear", "solid") && c.clip((clip) => clip.fill?.type === "radial", "solid") },
  "solid.stroke": { fixture: (c) => c.clip((clip) => keyed(clip, "stroke"), "solid") },
  "solid.shadow": { fixture: (c) => c.clip((clip) => keyed(clip, "shadow"), "solid") },
  "solid.cornerRadii": anyKey("cornerRadii"),
  "mediaFrame.stroke": { fixture: (c) => c.clip((clip) => keyed(clip, "stroke"), "video", "image") },
  "mediaFrame.shadow": { fixture: (c) => c.clip((clip) => keyed(clip, "shadow"), "video", "image") },
  "mediaFrame.cornerRadius": { fixture: (c) => c.clip((clip) => (clip.cornerRadius ?? 0) > 0, "video", "image") },
  "text.fills": { fixture: (c) => c.clip((clip) => typeof clip.style?.fill?.r === "number", "text") && c.clip((clip) => clip.style?.fill?.from !== undefined, "text") && c.clip((clip) => clip.style?.fill?.type === "linear", "text") && c.clip((clip) => clip.style?.fill?.type === "radial", "text") },
  "text.stroke": { fixture: (c) => c.clip((clip) => clip.style?.stroke?.enabled === true, "text") },
  "text.shadow": { fixture: (c) => c.clip((clip) => clip.style?.shadow?.enabled === true, "text") },
  "text.background.modes": { at: /^clips\.\*\.style\.background\.mode$/ },
  "text.background.stroke": { fixture: (c) => c.clip((clip) => clip.style?.background?.stroke?.enabled === true, "text") },
  "text.background.shadow": { fixture: (c) => c.clip((clip) => clip.style?.background?.shadow?.enabled === true, "text") },
  "text.anims": { at: /^clips\.\*\.(?:animIn|animOut|animLoop)\.id$/ },
  "text.animUnits": { at: /^clips\.\*\.(?:animators\.unit|(?:animIn|animOut|animLoop)\.perUnit)$/ },
  "text.spans": anyKey("spans"),
  "text.counter": anyKey("counter"),
  "text.animators": anyKey("animators"),
  "text.animatorKeyframeProps": { keyframes: true },
  "captions.highlightModes": { at: captionPath(String.raw`highlight\.mode`) },
  "captions.perCueStyle": anyKey("styleOverride"),
  "captions.wordEmphasis": anyKey("emphasis"),
  "captions.cueAnims": { at: captionPath(String.raw`anim\.(?:in|out)\.kind`) },
  "captions.boxModes": { at: captionPath(String.raw`text\.background\.mode`) },
  "captions.wordsImport": { test: "src/text/wordsImport.test.ts" },
  transitions: { at: /^clips\.\*\.transition(?:In|Out)\.kind$/ },
  "compositing.compound": kind("compound"),
  "compositing.blendModes": { at: /^clips\.\*\.blend$/ },
  "compositing.trackMatte": anyKey("matte"),
  "compositing.masks": anyKey("masks"),
  "compositing.maskModes": { at: /^clips\.\*\.masks\.mode$/ },
  "compositing.maskKeyframeProps": { keyframes: true },
  "compositing.adjustment": kind("adjustment"),
  "vector.shapes": kind("shape"),
  "vector.trimPaths": anyKey("trim"),
  "vector.svgImport": { test: "src/core/shapes/svgImport.test.ts" },
  "vector.primitives": { at: /^clips\.\*\.paths\.primitive\.kind$/ },
  "vector.caps": { at: /^clips\.\*\.paths\.stroke\.cap$/ },
  "vector.joins": { at: /^clips\.\*\.paths\.stroke\.join$/ },
  "vector.fillRules": { at: /^clips\.\*\.paths\.fillRule$/ },
  "vector.keyframeProps": { keyframes: true },
  effects: { at: /^clips\.\*\.effects\.type$/ },
  "audio.fadeCurves": { at: /^clips\.\*\.fades\.curve$/ },
  "audio.fades": { fixture: (c) => c.clip((clip) => (clip.fades?.in ?? 0) > 0 || (clip.fades?.out ?? 0) > 0, "audio", "video") },
  "audio.trackGain": { fixture: (c) => c.projects.some((p) => [...(p.tracks ?? []), ...Object.values<Json>(p.sequences ?? {}).flatMap((s) => s.tracks)].some((t: Json) => t.gainDb !== undefined)) },
  "audio.pan": { fixture: (c) => c.clip((clip) => clip.volume?.pan !== undefined) },
  "audio.loudness": anyKey("loudness"),
  "audio.beatMarkers": { test: "src/core/commands/markerCommands.test.ts" },
  "time.freeze": { fixture: (c) => c.clip((clip) => clip.speed === 0, "video") },
  "time.reverse": { fixture: (c) => c.clip((clip) => clip.reverse === true, "video") },
  "time.remap": anyKey("timeRemap"),
  "time.frameBlend": anyKey("frameBlend"),
  templates: { fixture: (c) => c.projects.some((p) => Object.values<Json>(p.sequences ?? {}).some((s) => (s.params ?? []).length > 0)) },
  templateParamKinds: { at: /^sequences\.\*\.params\.kind$/ },
  "export.containers": { test: "src/export/presets.test.ts" },
  "export.videoCodecs": { test: "src/export/codecs.test.ts" },
  "export.alpha": { test: "src/export/webm/WebmMuxer.test.ts" },
  "export.imageSequence": { test: "src/export/png.test.ts" },
  "export.gif": { test: "src/export/gif.test.ts" },
  "export.stems": { test: "src/export/stems.test.ts" },
  "cli.validate": { test: "src/core/document/interop.test.ts" },
  "cli.normalize": { test: "src/core/document/normalizeCli.test.ts" },
  "cli.info": { test: "src/core/document/interop.test.ts" },
  "cli.render": { test: "src/render/headless/cliRender.test.ts" },
  "cli.compare": { test: "src/render/headless/compareSources.test.ts" },
  "cli.fill": { test: "src/core/document/templateFill.test.ts" },
  "interop.openLink": { test: "src/core/document/interopOpen.test.ts" },
  "interop.externalReload": { test: "src/project/ProjectSession.reload.test.ts" },
  "interop.repairOnOpen": { test: "src/project/repair.test.ts" },
  "interop.fallbackOf": anyKey("fallbackOf"),
  "interop.generatorMeta": anyKey("generator"),
};

/** The top-level manifest keys that describe the build, not a capability. */
const META = new Set(["manifestVersion", "app", "appVersion", "lastBatch", "schemaVersion"]);

interface Leaf {
  path: string;
  /** Set for a list of strings. */
  items?: string[];
}

/** The keys to audit: every true flag and every list of strings. */
export function manifestLeaves(manifest: Capabilities): Leaf[] {
  const leaves: Leaf[] = [];
  const walk = (node: unknown, path: string) => {
    if (node === true) leaves.push({ path });
    else if (Array.isArray(node)) {
      if (node.length > 0 && node.every((item) => typeof item === "string")) leaves.push({ path, items: node as string[] });
    } else if (node && typeof node === "object") {
      for (const [key, value] of Object.entries(node)) walk(value, `${path}.${key}`.replace(/^\./, ""));
    }
  };
  for (const [key, value] of Object.entries(manifest)) if (!META.has(key)) walk(value, key);
  return leaves;
}

function manifestHas(manifest: Capabilities, path: string): boolean {
  let node: unknown = manifest;
  for (const part of path.split(".")) {
    if (!node || typeof node !== "object" || !(part in node)) return false;
    node = (node as Record<string, unknown>)[part];
  }
  return node !== false;
}

/** What fails the audit (empty: it passes). `fileExists` checks a repo-relative path. */
export function auditCapabilities(manifest: Capabilities, corpus: Corpus, fileExists: (path: string) => boolean): string[] {
  const problems: string[] = [];
  for (const leaf of manifestLeaves(manifest)) {
    const rule = RULES[leaf.path];
    if (!rule) {
      problems.push(`${leaf.path}: announced without a rule (no fixture field or test covers it)`);
      continue;
    }
    if ("skip" in rule) continue;
    if ("test" in rule) {
      if (!fileExists(rule.test)) problems.push(`${leaf.path}: its test ${rule.test} is missing`);
    } else if ("fixture" in rule) {
      if (!rule.fixture(corpus)) problems.push(`${leaf.path}: no fixture field uses it`);
    } else if ("at" in rule) {
      for (const item of leaf.items ?? []) if (!corpus.has(item, rule.at)) problems.push(`${leaf.path}: no fixture uses "${item}"`);
    } else {
      for (const item of leaf.items ?? []) {
        const source = item.split(".").map((part) => (/^<.+>$/.test(part) ? "[^.]+" : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).join("\\.");
        const pattern = new RegExp(`^${source}$`);
        if (![...corpus.keyframeProps].some((prop) => pattern.test(prop))) problems.push(`${leaf.path}: no clip keys "${item}"`);
      }
    }
  }
  for (const path of Object.keys(RULES)) if (!manifestHas(manifest, path)) problems.push(`${path}: a rule for a key the manifest does not announce`);
  return problems;
}
