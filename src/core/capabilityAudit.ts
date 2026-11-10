// The capability audit (spec §21.1, Batch 82): a manifest key is announced only when something tests it. Every
// `true` flag and every value of every list in `capabilities.json` has a rule here, and the rule holds only when
// a field of an interop fixture uses it (`fixtures/interop/*/project.json`, the full fixture among them) or, for
// what a project file cannot show (the CLI, export, the app's reload and repair), a unit test file exists that
// exercises it. A key with no rule, a rule whose evidence is gone and a rule for a key no longer in the manifest
// all fail the audit. Pure: the corpus and the file check are passed in.
import type { Capabilities } from "./capabilities.js";

type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** What the fixtures hold, indexed once. */
export class Corpus {
  readonly projects: Json[];
  /** Every object key anywhere in a project. */
  readonly keys = new Set<string>();
  /** The strings that appear under each key (`ease` -> linear, easeIn ...). */
  readonly values = new Map<string, Set<string>>();
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

  private walk(node: Json, key: string): void {
    if (typeof node === "string") {
      let set = this.values.get(key);
      if (!set) this.values.set(key, (set = new Set()));
      set.add(node);
    } else if (Array.isArray(node)) {
      for (const item of node) this.walk(item, key);
    } else if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node)) {
        this.keys.add(k);
        this.walk(v, k);
      }
    }
  }

  /** Whether some string under one of `fields` is `value`. */
  has(value: string, ...fields: string[]): boolean {
    return fields.some((field) => this.values.get(field)?.has(value));
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
  /** A list: each value appears under one of these fields. */
  | { values: readonly string[] }
  /** A list of keyframe property paths (`<id>` stands for any id): each is keyed on some clip. */
  | { keyframes: true };

const anyKey = (...keys: string[]): Rule => ({ fixture: (c) => keys.some((key) => c.keys.has(key)) });
const kind = (value: string): Rule => ({ fixture: (c) => c.has(value, "kind") });
const ease = (value: string): Rule => ({ fixture: (c) => c.has(value, "ease") });
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
  trackKinds: { values: ["kind"] },
  clipKinds: { values: ["kind"] },
  "transform.rotation3d": anyKey("rotationX", "rotationY"),
  "transform.parenting": anyKey("parentId"),
  "transform.motionPaths": anyKey("path"),
  "transform.autoOrient": anyKey("autoOrient"),
  "keyframes.props": { test: "src/core/document/keyframes.test.ts" },
  "keyframes.eases": { values: ["ease"] },
  "keyframes.bezier": ease("bezier"),
  "keyframes.spring": ease("spring"),
  "keyframes.vectorValues": { fixture: (c) => c.clips.some((clip) => Object.values<Json[]>(clip.keyframes ?? {}).some((keys) => keys.some((key) => Array.isArray(key.value)))) },
  "keyframes.effectProps": { keyframes: true },
  "solid.shapes": { values: ["shape"] },
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
  "text.background.modes": { values: ["mode"] },
  "text.background.stroke": { fixture: (c) => c.clip((clip) => clip.style?.background?.stroke?.enabled === true, "text") },
  "text.background.shadow": { fixture: (c) => c.clip((clip) => clip.style?.background?.shadow?.enabled === true, "text") },
  "text.anims": { values: ["id"] },
  "text.animUnits": { values: ["unit", "perUnit"] },
  "text.spans": anyKey("spans"),
  "text.counter": anyKey("counter"),
  "text.animators": anyKey("animators"),
  "text.animatorKeyframeProps": { test: "src/timeline/edit/animators.test.ts" },
  "captions.highlightModes": { values: ["mode"] },
  "captions.perCueStyle": anyKey("styleOverride"),
  "captions.wordEmphasis": anyKey("emphasis"),
  "captions.cueAnims": { values: ["kind"] },
  "captions.boxModes": { values: ["mode"] },
  "captions.wordsImport": { test: "src/text/wordsImport.test.ts" },
  transitions: { values: ["kind"] },
  "compositing.compound": kind("compound"),
  "compositing.blendModes": { values: ["blend"] },
  "compositing.trackMatte": anyKey("matte"),
  "compositing.masks": anyKey("masks"),
  "compositing.maskModes": { values: ["mode"] },
  "compositing.maskKeyframeProps": { test: "src/core/masks/maskEval.test.ts" },
  "compositing.adjustment": kind("adjustment"),
  "vector.shapes": kind("shape"),
  "vector.trimPaths": anyKey("trim"),
  "vector.svgImport": { test: "src/core/shapes/svgImport.test.ts" },
  "vector.primitives": { values: ["kind", "primitive"] },
  "vector.caps": { values: ["cap"] },
  "vector.joins": { values: ["join"] },
  "vector.fillRules": { values: ["fillRule"] },
  "vector.keyframeProps": { test: "src/core/document/interop.test.ts" },
  effects: { values: ["type"] },
  "audio.fadeCurves": { values: ["curve"] },
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
  templateParamKinds: { values: ["kind"] },
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
    } else if ("values" in rule) {
      for (const item of leaf.items ?? []) if (!corpus.has(item, ...rule.values)) problems.push(`${leaf.path}: no fixture uses "${item}"`);
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
