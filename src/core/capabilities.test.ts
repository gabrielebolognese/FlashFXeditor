import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCapabilities, FEATURES, formatCapabilities, LAST_BATCH, MANIFEST_VERSION } from "./capabilities.js";
import { KEYFRAME_PROPS } from "./document/keyframes.js";
import { MAX_GAIN_DB, MAX_SPEED, MIN_GAIN_DB, MIN_SPEED } from "./document/limits.js";
import { CAPTION_HIGHLIGHTS, CLIP_KINDS, EASE_IDS, SCHEMA_VERSION, SOLID_SHAPE_IDS, TEXT_ANIM_IDS, TRACK_KINDS, TRANSITION_KINDS } from "./document/types.js";
import { ACCEPTED_EXTENSIONS } from "../media/mediaKinds.js";

const repoFile = (name: string) => readFileSync(join(process.cwd(), name), "utf8");
const appVersion = (JSON.parse(repoFile("package.json")) as { version: string }).version;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const manifest = buildCapabilities(appVersion) as Record<string, any>;

describe("capabilities.json (spec §21.2)", () => {
  it("is exactly what this build generates (stale file: run `npm run capabilities`)", () => {
    expect(repoFile("capabilities.json")).toBe(formatCapabilities(buildCapabilities(appVersion)));
    expect(JSON.parse(repoFile("capabilities.json"))).toEqual(manifest);
  });

  it("lists the model constants", () => {
    expect(manifest.schemaVersion).toBe(SCHEMA_VERSION);
    expect(manifest.trackKinds).toEqual([...TRACK_KINDS]);
    expect(manifest.clipKinds).toEqual([...CLIP_KINDS]);
    expect(manifest.keyframes.props).toEqual([...KEYFRAME_PROPS]);
    expect(manifest.keyframes.eases).toEqual([...EASE_IDS]);
    expect(manifest.solid.shapes).toEqual([...SOLID_SHAPE_IDS]);
    expect(manifest.text.anims).toEqual([...TEXT_ANIM_IDS]);
    expect(manifest.captions.highlightModes).toEqual([...CAPTION_HIGHLIGHTS]);
    expect(manifest.transitions).toEqual([...TRANSITION_KINDS]);
    expect(manifest.audio.clipGainDb).toEqual([MIN_GAIN_DB, MAX_GAIN_DB]);
    expect(manifest.time.speedRange).toEqual([MIN_SPEED, MAX_SPEED]);
    const media = [...manifest.media.video, ...manifest.media.audio, ...manifest.media.image].map((ext: string) => `.${ext}`).sort();
    expect(media).toEqual([...ACCEPTED_EXTENSIONS].sort());
  });

  it("has schemaVersion 4 and the Batch 54 and 55 keys true, the keys of later batches false", () => {
    expect(manifest.schemaVersion).toBe(4);
    expect(manifest.manifestVersion).toBe(MANIFEST_VERSION);
    expect(manifest.lastBatch).toBe(LAST_BATCH);
    expect(manifest.cli).toEqual({ validate: true, normalize: true, info: true, render: false, compare: false });
    expect(manifest.interop).toEqual({ openLink: false, externalReload: false, repairOnOpen: false, fallbackOf: true, generatorMeta: true });
    expect(FEATURES.templates).toBe(false);
  });

  it("keeps every other key of the v1.1.0 manifest of §21.2", () => {
    expect(manifest.project).toEqual({ file: "project.json", fontsManifest: "fonts/fonts.json", fontsManifestVersion: 2, sampleRate: 48000 });
    expect(manifest.media).toMatchObject({ video: ["mp4", "mov", "m4v", "webm"], audio: ["mp3", "m4a", "aac", "wav", "ogg"], image: ["png", "jpg", "jpeg", "webp", "gif", "svg"], videoAlpha: false });
    expect(manifest.media.animatedImage).toEqual({ formats: ["gif", "webp"], alpha: true, maxSide: 2048, textureBudgetBytes: 134217728 });
    expect(manifest.captions).toMatchObject({ perCueStyle: true, wordEmphasis: false, cueAnims: [], boxModes: ["line", "block"], wordsImport: false });
    expect(manifest.text.background).toEqual({ modes: ["line", "block"], stroke: false, shadow: false });
    expect(manifest.compositing).toEqual({ compound: false, blendModes: ["normal"], trackMatte: false, masks: false, adjustment: false });
    expect(manifest.export).toEqual({ containers: ["mp4"], videoCodecs: ["h264", "hevc", "av1"], alpha: false, imageSequence: false, gif: false, stems: false });
    expect(manifest.effects).toEqual([]);
  });
});
