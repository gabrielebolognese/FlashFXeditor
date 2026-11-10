import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCapabilities } from "./capabilities.js";
import { auditCapabilities, Corpus, manifestLeaves, RULES } from "./capabilityAudit.js";

const root = process.cwd();
const appVersion = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string }).version;
const manifest = buildCapabilities(appVersion);
const fixtures = join(root, "fixtures", "interop");
const readProject = (name: string) => JSON.parse(readFileSync(join(fixtures, name, "project.json"), "utf8")) as Record<string, unknown>;
const all = readdirSync(fixtures).filter((name) => name !== "broken" && existsSync(join(fixtures, name, "project.json")));
const fileExists = (path: string) => existsSync(join(root, path));
const corpusOf = (names: string[]) => new Corpus(names.map(readProject));

describe("capability audit (Batch 82)", () => {
  it("every true manifest key has a fixture field or a test that uses it", () => {
    expect(auditCapabilities(manifest, corpusOf(all), fileExists)).toEqual([]);
  });

  it("the full fixture alone uses every value of every list and every flag a project file can show", () => {
    // Only the rules answered by a project file count here (tests cover the rest).
    const full = corpusOf(["full"]);
    const problems = auditCapabilities(manifest, full, () => true);
    expect(problems).toEqual([]);
  });

  it("answers every list and keyframe rule from a project file: only what a project cannot show has a test rule", () => {
    const tested = Object.entries(RULES).filter(([, rule]) => "test" in rule).map(([path]) => path).sort();
    expect(tested).toEqual([
      "audio.beatMarkers", "captions.wordsImport", "cli.compare", "cli.fill", "cli.info", "cli.normalize", "cli.render", "cli.validate",
      "export.alpha", "export.containers", "export.gif", "export.imageSequence", "export.stems", "export.videoCodecs",
      "interop.externalReload", "interop.openLink", "interop.repairOnOpen", "media.animatedImage.alpha", "media.animatedImage.formats",
      "media.audio", "media.image", "media.lottieFormats", "media.video", "vector.svgImport",
    ]);
  });

  it("a keyframe property no clip keys fails, and motion paths need transform.position keys", () => {
    const stripped = all.map((name) => {
      const project = structuredClone(readProject(name)) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      for (const clip of Object.values<any>(project.clips ?? {})) { // eslint-disable-line @typescript-eslint/no-explicit-any
        for (const prop of ["transform.position", "transform.scale", "masks.km.feather", "paths.kp.trim.start", "animators.ka.props.blur"]) delete clip.keyframes?.[prop];
      }
      return project;
    });
    const problems = auditCapabilities(manifest, new Corpus(stripped), fileExists);
    expect(problems).toContain("transform.motionPaths: no fixture field uses it");
    expect(problems).toContain('keyframes.props: no clip keys "transform.scale"');
    expect(problems).toContain('compositing.maskKeyframeProps: no clip keys "masks.<id>.feather"');
    expect(problems).toContain('vector.keyframeProps: no clip keys "paths.<id>.trim.start"');
    expect(problems).toContain('text.animatorKeyframeProps: no clip keys "animators.<id>.props.blur"');
  });

  it("a list value shown only under another list's field does not count", () => {
    // A text clip, a mask called "fade" and no template, caption or transition: the values of other lists must not satisfy these.
    const project = { clips: { a: { kind: "text", masks: [{ id: "fade", mode: "block" }], effects: [{ id: "t", type: "text" }] } }, tracks: [{ kind: "video" }] };
    const problems = auditCapabilities(manifest, new Corpus([project]), fileExists);
    expect(problems).toContain('templateParamKinds: no fixture uses "text"');
    expect(problems).toContain('text.anims: no fixture uses "fade"');
    expect(problems).toContain('transitions: no fixture uses "dipToBlack"');
    expect(problems).toContain('captions.boxModes: no fixture uses "block"');
    expect(problems).toContain('text.background.modes: no fixture uses "block"');
    expect(problems).toContain('compositing.maskModes: no fixture uses "add"');
  });

  it("a key announced without evidence fails", () => {
    const loose = structuredClone(manifest) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    loose.invented = { feature: true };
    loose.time.sparkle = true;
    expect(auditCapabilities(loose as typeof manifest, corpusOf(all), fileExists)).toEqual([
      "time.sparkle: announced without a rule (no fixture field or test covers it)",
      "invented.feature: announced without a rule (no fixture field or test covers it)",
    ]);
  });

  it("a rule whose evidence is gone fails, and a list value no fixture uses fails", () => {
    expect(auditCapabilities(manifest, corpusOf(all), () => false).length).toBeGreaterThan(5);
    const extended = structuredClone(manifest) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    extended.transitions.push("teleport");
    extended.effects.push("sepia");
    expect(auditCapabilities(extended as typeof manifest, corpusOf(all), fileExists)).toEqual(['transitions: no fixture uses "teleport"', 'effects: no fixture uses "sepia"']);
  });

  it("a flag a fixture does not use fails when the evidence is removed", () => {
    const withoutMatte = corpusOf(all.filter((name) => name !== "compositing" && name !== "full" && name !== "masks"));
    expect(auditCapabilities(manifest, withoutMatte, fileExists).some((p) => p.startsWith("compositing.trackMatte"))).toBe(true);
  });

  it("has no rule for a key the manifest lacks, and every leaf of this manifest has one", () => {
    const leaves = manifestLeaves(manifest).map((leaf) => leaf.path);
    expect(leaves.filter((path) => !(path in RULES))).toEqual([]);
    expect(Object.keys(RULES).filter((path) => !leaves.includes(path) && !path.startsWith("project."))).toEqual([]);
  });
});
