import { describe, expect, it } from "vitest";
import { addCaptionTrack, makeCaptionClip, makeMedia, makeMediaClip, makeProject, makeSolidClip, makeTrack, withClips } from "../core/document/fixtures.js";
import { SCHEMA_VERSION, type JsonObject, type Project } from "../core/document/types.js";
import { fuzzRun, random } from "../timeline/edit/fuzzKit.js";
import { migrateProject, parseProjectFile, ProjectFileError, serializeProject, type Migration } from "./projectFile.js";
import { version as packageVersion } from "../../package.json";

const STAMP = { now: "2026-10-14T10:00:00.000Z", appVersion: "9.9.9" };

function richProject(): Project {
  let project = makeProject();
  project.media.m1 = makeMedia("m1");
  project.tracks.push(makeTrack("v1"), makeTrack("v2"), makeTrack("a1", "audio"));
  project = withClips(project, [
    makeMediaClip(project, { id: "c1", trackId: "v1", start: 0, duration: 30, mediaId: "m1" }),
    makeMediaClip(project, { id: "c2", trackId: "a1", start: 10, duration: 45, mediaId: "m1", kind: "audio" }),
    makeSolidClip({ id: "s1", trackId: "v2", start: 5, duration: 20 }),
  ]);
  project.markers.push({ id: "mk1", frame: 12, color: "red", label: "Beat" });
  project.settings.fps = { num: 30000, den: 1001 };
  project.settings.background = { r: 0.1, g: 0.2, b: 0.3, a: 1 };
  return project;
}

describe("serializeProject / parseProjectFile", () => {
  it("round-trips a project, stamping modifiedAt and appVersion", () => {
    const project = richProject();
    const parsed = parseProjectFile(serializeProject(project, STAMP));
    expect(parsed).toEqual({ ...project, meta: { ...project.meta, modifiedAt: STAMP.now, appVersion: STAMP.appVersion } });
    // A second round trip is byte-identical.
    expect(serializeProject(parsed, STAMP)).toBe(serializeProject(project, STAMP));
  });

  it("stamps the release version of package.json (the app passes it as appVersion, Batch 50)", () => {
    expect(packageVersion).toMatch(/^\d+\.\d+\.\d+$/);
    const parsed = parseProjectFile(serializeProject(richProject(), { now: STAMP.now, appVersion: packageVersion }));
    expect(parsed.meta.appVersion).toBe(packageVersion);
  });

  it("does not mutate the document when stamping", () => {
    const project = richProject();
    const before = structuredClone(project);
    serializeProject(project, STAMP);
    expect(project).toEqual(before);
  });

  it("rejects invalid JSON", () => {
    expect(() => parseProjectFile("{ nope")).toThrow(/not valid JSON/);
  });

  it("rejects a wrong shape with the offending fields", () => {
    const raw = JSON.parse(serializeProject(makeProject(), STAMP)) as JsonObject;
    delete raw.tracks;
    raw.name = 42;
    try {
      parseProjectFile(JSON.stringify(raw));
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ProjectFileError);
      expect((error as ProjectFileError).issues).toEqual(["name must be a string", "tracks must be an array"]);
    }
  });

  it("rejects a document that breaks invariants", () => {
    const project = richProject();
    project.tracks[0]?.clipIds.push("ghost");
    expect(() => parseProjectFile(serializeProject(project, STAMP))).toThrow(/invariants[\s\S]*ghost/);
  });

  it("turns validator crashes on malformed nested data into issues", () => {
    const raw = JSON.parse(serializeProject(richProject(), STAMP)) as { tracks: { kind: string }[] };
    raw.tracks[0]!.kind = "hologram";
    expect(() => parseProjectFile(JSON.stringify(raw))).toThrow(ProjectFileError);
  });
});

describe("migration hook", () => {
  const v1 = () => JSON.parse(serializeProject(makeProject(), STAMP)) as JsonObject;

  it("leaves a current file alone", () => {
    const raw = v1();
    expect(migrateProject(raw)).toEqual(raw);
    expect(SCHEMA_VERSION).toBe(22);
  });

  it("opens a schema 1 project (Batch 41): no bins yet, media without sizes", () => {
    const project = richProject();
    const raw = JSON.parse(serializeProject(project, STAMP)) as JsonObject;
    delete raw.bins;
    raw.schemaVersion = 1;
    const parsed = parseProjectFile(JSON.stringify(raw));
    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
    expect(parsed.bins).toEqual([]);
    expect(parsed.media.m1).toEqual(project.media.m1);
    expect(parsed.clips).toEqual(project.clips);
  });

  it("opens a schema 2 project (before Batch 53) unchanged: caption styles get a centered x, cues no override", () => {
    const project = withClips(addCaptionTrack(richProject()), [makeCaptionClip({ id: "q1", trackId: "cc", start: 0, duration: 30, text: "Hello" })]);
    const style = project.captionTracks.cc!.style;
    style.position = "custom";
    style.y = -200;
    const raw = JSON.parse(serializeProject(project, STAMP)) as { schemaVersion: number; captionTracks: Record<string, { style: Record<string, unknown> }> };
    raw.schemaVersion = 2;
    delete raw.captionTracks.cc!.style.x;
    const parsed = parseProjectFile(JSON.stringify(raw));
    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
    expect(parsed.captionTracks.cc!.style).toEqual({ ...style, x: 0 });
    expect(parsed.clips).toEqual(project.clips);
    expect(parsed.clips.q1).not.toHaveProperty("styleOverride");
  });

  it("opens a schema 3 project (before Batch 54) unchanged: no generator, no stand-in blocks", () => {
    const project = richProject();
    const raw = JSON.parse(serializeProject(project, STAMP)) as JsonObject;
    raw.schemaVersion = 3;
    const parsed = parseProjectFile(JSON.stringify(raw));
    expect(parsed.schemaVersion).toBe(22);
    expect(parsed.meta).not.toHaveProperty("generator");
    expect(parsed.clips).toEqual(project.clips);
    expect(parsed.media).toEqual(project.media);
  });

  it("opens a schema 13 project (before Batch 70) unchanged: flat layers, no perspective; keeps the 2.5D fields through save and open", () => {
    const project = richProject();
    const raw = JSON.parse(serializeProject(project, STAMP)) as JsonObject;
    raw.schemaVersion = 13;
    const parsed = parseProjectFile(JSON.stringify(raw));
    expect(parsed.schemaVersion).toBe(22);
    expect(parsed.settings).not.toHaveProperty("perspective");
    expect(parsed.clips).toEqual(project.clips);
    const clip = Object.values(project.clips).find((c) => "transform" in c) as Project["clips"][string] & { transform: Record<string, unknown> };
    const turned = { ...project, settings: { ...project.settings, perspective: null }, clips: { ...project.clips, [clip.id]: { ...clip, backfaceHidden: true, transform: { ...clip.transform, rotationX: 12.5, rotationY: -60, z: 300 } } } } as Project;
    const back = parseProjectFile(serializeProject(turned, STAMP));
    expect(back.settings.perspective).toBeNull();
    expect(back.clips[clip.id]).toMatchObject({ backfaceHidden: true, transform: { rotationX: 12.5, rotationY: -60, z: 300 } });
    const bad = JSON.parse(serializeProject(turned, STAMP)) as { settings: Record<string, unknown> };
    bad.settings.perspective = -5;
    expect(() => parseProjectFile(JSON.stringify(bad))).toThrow(/perspective/);
  });

  it("opens a schema 15 project (before Batch 72) unchanged: no blend or matte; keeps them through save and open", () => {
    const project = richProject();
    const raw = JSON.parse(serializeProject(project, STAMP)) as JsonObject;
    raw.schemaVersion = 15;
    const parsed = parseProjectFile(JSON.stringify(raw));
    expect(parsed.schemaVersion).toBe(22);
    expect(parsed.clips).toEqual(project.clips);
    const visual = Object.values(project.clips).filter((c) => c.kind === "video" || c.kind === "text" || c.kind === "solid" || c.kind === "image");
    const [a, b] = visual as [Project["clips"][string], Project["clips"][string]];
    expect(b).toBeDefined();
    const matted = { ...project, clips: { ...project.clips, [a.id]: { ...a, blend: "softLight", matte: { clipId: b.id, mode: "luma" } }, [b.id]: { ...b, matteOnly: true } } } as Project;
    const back = parseProjectFile(serializeProject(matted, STAMP));
    expect(back.clips[a.id]).toMatchObject({ blend: "softLight", matte: { clipId: b.id, mode: "luma" } });
    expect(back.clips[b.id]).toMatchObject({ matteOnly: true });
    const bad = JSON.parse(serializeProject(matted, STAMP)) as { clips: Record<string, Record<string, unknown>> };
    (bad.clips[a.id] as Record<string, unknown>).blend = "glow";
    expect(() => parseProjectFile(JSON.stringify(bad))).toThrow(/blend/);
  });

  it("opens a schema 16 project (before Batch 73) unchanged: no masks; keeps them and their keys through save and open", () => {
    const project = richProject();
    const raw = JSON.parse(serializeProject(project, STAMP)) as JsonObject;
    raw.schemaVersion = 16;
    const parsed = parseProjectFile(JSON.stringify(raw));
    expect(parsed.schemaVersion).toBe(22);
    expect(parsed.clips).toEqual(project.clips);
    const solid = Object.values(project.clips).find((c) => c.kind === "solid") as Project["clips"][string];
    expect(solid).toBeDefined();
    const masks = [
      { id: "e", shape: { kind: "ellipse", x: 10, y: 10, w: 50, h: 40 }, mode: "add", feather: 40, expansion: 0, opacity: 1, inverted: false },
      { id: "p", shape: { kind: "path", d: "M0 0L10 0L10 10Z" }, mode: "subtract", feather: 0, expansion: -2, opacity: 0.5, inverted: true },
    ];
    const keyframes = { "masks.p.path": [{ frame: 0, value: [0, 0, 10, 0, 10, 10], ease: "linear" }, { frame: 5, value: [0, 0, 20, 0, 20, 20], ease: "linear" }] };
    const masked = { ...project, clips: { ...project.clips, [solid.id]: { ...solid, masks, keyframes } } } as Project;
    const back = parseProjectFile(serializeProject(masked, STAMP));
    expect(back.clips[solid.id]).toMatchObject({ masks, keyframes });
    const bad = JSON.parse(serializeProject(masked, STAMP)) as { clips: Record<string, { masks: { mode: string }[] }> };
    (bad.clips[solid.id]?.masks[0] as { mode: string }).mode = "xor";
    expect(() => parseProjectFile(JSON.stringify(bad))).toThrow(/mode/);
  });

  it("opens a schema 17 project (before Batch 74) unchanged: no effects; keeps them and their keys through save and open", () => {
    const project = richProject();
    const raw = JSON.parse(serializeProject(project, STAMP)) as JsonObject;
    raw.schemaVersion = 17;
    const parsed = parseProjectFile(JSON.stringify(raw));
    expect(parsed.schemaVersion).toBe(22);
    expect(parsed.clips).toEqual(project.clips);
    const solid = Object.values(project.clips).find((c) => c.kind === "solid") as Project["clips"][string];
    expect(solid).toBeDefined();
    const effects = [
      { id: "fx1", type: "glow", enabled: true, params: { mode: "outer", radius: 20, intensity: 1, threshold: 0, color: [1, 1, 1, 1] } },
      { id: "fx2", type: "dropShadow", enabled: false, params: { distance: 30 } },
    ];
    const keyframes = { "effects.fx1.intensity": [{ frame: 0, value: 0, ease: "linear" }, { frame: 5, value: 1, ease: "linear" }], "effects.fx1.color": [{ frame: 0, value: [1, 0, 0, 1], ease: "linear" }] };
    const withEffects = { ...project, clips: { ...project.clips, [solid.id]: { ...solid, effects, keyframes } } } as Project;
    const back = parseProjectFile(serializeProject(withEffects, STAMP));
    expect(back.clips[solid.id]).toMatchObject({ effects, keyframes });
    const bad = JSON.parse(serializeProject(withEffects, STAMP)) as { clips: Record<string, { effects: { params: Record<string, unknown> }[] }> };
    (bad.clips[solid.id]?.effects[0] as { params: Record<string, unknown> }).params.radius = 9000;
    expect(() => parseProjectFile(JSON.stringify(bad))).toThrow(/radius/);
    const unkeyable = JSON.parse(serializeProject(withEffects, STAMP)) as { clips: Record<string, { keyframes: Record<string, unknown> }> };
    (unkeyable.clips[solid.id] as { keyframes: Record<string, unknown> }).keyframes["effects.fx1.mode"] = [{ frame: 0, value: 1, ease: "linear" }];
    expect(() => parseProjectFile(JSON.stringify(unkeyable))).toThrow(/mode/);
  });

  it("opens a schema 18 project (before Batch 75) unchanged; keeps the Effects II types and a LUT file through save and open", () => {
    const project = richProject();
    const raw = JSON.parse(serializeProject(project, STAMP)) as JsonObject;
    raw.schemaVersion = 18;
    const parsed = parseProjectFile(JSON.stringify(raw));
    expect(parsed.schemaVersion).toBe(22);
    expect(parsed.clips).toEqual(project.clips);
    const solid = Object.values(project.clips).find((c) => c.kind === "solid") as Project["clips"][string];
    const effects = [
      { id: "fx1", type: "colorAdjust", enabled: true, params: { exposure: 0.5, hue: -30 } },
      { id: "fx2", type: "chromaKey", enabled: true, params: { color: [0, 1, 0, 1], tolerance: 0.2 } },
      { id: "fx3", type: "lut", enabled: true, params: { file: "luts/warm.cube", intensity: 0.5 } },
    ];
    const keyframes = { "effects.fx3.intensity": [{ frame: 0, value: 0, ease: "linear" }, { frame: 5, value: 1, ease: "linear" }] };
    const withEffects = { ...project, clips: { ...project.clips, [solid.id]: { ...solid, effects, keyframes } } } as Project;
    expect(parseProjectFile(serializeProject(withEffects, STAMP)).clips[solid.id]).toMatchObject({ effects, keyframes });
    // A LUT path outside luts/, or not a .cube, is refused; so is a keyed file.
    for (const file of ["media/warm.cube", "luts/warm.png", "luts/../x.cube", 3]) {
      const bad = JSON.parse(serializeProject(withEffects, STAMP)) as { clips: Record<string, { effects: { params: Record<string, unknown> }[] }> };
      (bad.clips[solid.id]?.effects[2] as { params: Record<string, unknown> }).params.file = file;
      expect(() => parseProjectFile(JSON.stringify(bad))).toThrow(/file/);
    }
    const keyed = JSON.parse(serializeProject(withEffects, STAMP)) as { clips: Record<string, { keyframes: Record<string, unknown> }> };
    (keyed.clips[solid.id] as { keyframes: Record<string, unknown> }).keyframes["effects.fx3.file"] = [{ frame: 0, value: 1, ease: "linear" }];
    expect(() => parseProjectFile(JSON.stringify(keyed))).toThrow(/file/);
  });

  it("opens a schema 19 project (before Batch 76) unchanged; keeps an adjustment clip and the Effects III types through save and open", () => {
    const project = richProject();
    const raw = JSON.parse(serializeProject(project, STAMP)) as JsonObject;
    raw.schemaVersion = 19;
    const parsed = parseProjectFile(JSON.stringify(raw));
    expect(parsed.schemaVersion).toBe(22);
    expect(parsed.clips).toEqual(project.clips);
    const track = project.tracks.find((t) => t.kind === "video") as Project["tracks"][number];
    const effects = [
      { id: "a1", type: "colorAdjust", enabled: true, params: { saturation: -100 } },
      { id: "a2", type: "rgbSplit", enabled: true, params: { distance: 12, angle: 45 } },
      { id: "a3", type: "glitch", enabled: true, params: { amount: 0.4, seed: 7 } },
      { id: "a4", type: "mirror", enabled: false, params: { side: "top" } },
    ];
    const masks = [{ id: "m", shape: { kind: "ellipse", x: 100, y: 200, w: 500, h: 700 }, mode: "add", feather: 30, expansion: 0, opacity: 1, inverted: false }];
    const keyframes = { opacity: [{ frame: 0, value: 0, ease: "linear" }, { frame: 10, value: 1, ease: "linear" }], "effects.a2.distance": [{ frame: 0, value: 0, ease: "linear" }, { frame: 5, value: 20, ease: "linear" }] };
    const adjustment = { id: "adj", trackId: track.id, kind: "adjustment", name: "Adjustment", start: 0, duration: 30, enabled: true, effects, opacity: 0.8, masks, keyframes, fades: { in: 3, out: 0 } };
    const top = { id: "vt-adj", kind: "video", name: "V9", clipIds: ["adj"], locked: false, muted: false, hidden: false, solo: false };
    const added = { ...project, tracks: [{ ...track, ...top }, ...project.tracks], clips: { ...project.clips, adj: { ...adjustment, trackId: "vt-adj" } } } as unknown as Project;
    expect(parseProjectFile(serializeProject(added, STAMP)).clips.adj).toEqual({ ...adjustment, trackId: "vt-adj" });
    // Refused: a transform, a blend mode, an opacity past 1, a transform key, a matte that is an adjustment.
    const bad = (change: (clip: Record<string, unknown>, file: { clips: Record<string, Record<string, unknown>> }) => void, pattern: RegExp) => {
      const file = JSON.parse(serializeProject(added, STAMP)) as { clips: Record<string, Record<string, unknown>> };
      change(file.clips.adj as Record<string, unknown>, file);
      expect(() => parseProjectFile(JSON.stringify(file))).toThrow(pattern);
    };
    bad((clip) => (clip.transform = { x: 0, y: 0, scale: 1, rotation: 0 }), /no transform/);
    bad((clip) => (clip.blend = "screen"), /blend mode/);
    bad((clip) => (clip.opacity = 1.5), /opacity/);
    bad((clip) => (clip.keyframes = { "transform.x": [{ frame: 0, value: 1, ease: "linear" }] }), /adjustment clip/);
    bad((clip) => delete clip.effects, /effects/);
    const solid = Object.values(project.clips).find((c) => c.kind === "solid") as Project["clips"][string];
    bad((_, file) => ((file.clips[solid.id] as Record<string, unknown>).matte = { clipId: "adj", mode: "alpha" }), /draws no picture/);
  });

  it("keeps meta.generator and a clip's fallbackOf through save and open, and refuses malformed ones", () => {
    const project = richProject();
    const clip = Object.values(project.clips)[0] as Project["clips"][string];
    const fallbackOf = { kind: "shape", reason: "baked", schemaVersion: 4, headTrim: 3, data: { kind: "shape", free: [1.5] } };
    const stood = { ...project, meta: { ...project.meta, generator: { name: "tool", version: "1" } }, clips: { ...project.clips, [clip.id]: { ...clip, fallbackOf } } } as Project;
    const parsed = parseProjectFile(serializeProject(stood, STAMP));
    expect(parsed.meta.generator).toEqual({ name: "tool", version: "1" });
    expect(parsed.clips[clip.id]?.fallbackOf).toEqual(fallbackOf);
    const raw = JSON.parse(serializeProject(stood, STAMP)) as { clips: Record<string, { fallbackOf: { data: { kind: string } } }>; meta: { generator: unknown } };
    raw.clips[clip.id]!.fallbackOf.data.kind = "other";
    expect(() => parseProjectFile(JSON.stringify(raw))).toThrow(/fallbackOf\.data\.kind/);
    raw.clips[clip.id]!.fallbackOf.data.kind = "shape";
    raw.meta.generator = { version: "1" };
    expect(() => parseProjectFile(JSON.stringify(raw))).toThrow(/meta\.generator\.name/);
  });

  it("refuses a cue override with an unknown or invalid field", () => {
    const project = withClips(addCaptionTrack(richProject()), [makeCaptionClip({ id: "q1", trackId: "cc", start: 0, duration: 30, text: "Hello" })]);
    const raw = JSON.parse(serializeProject(project, STAMP)) as { clips: Record<string, Record<string, unknown>> };
    raw.clips.q1!.styleOverride = { text: { fontSize: -4, glow: true }, maxLines: 1.5 };
    expect(() => parseProjectFile(JSON.stringify(raw))).toThrow(/text\.fontSize[\s\S]*text\.glow[\s\S]*maxLines|maxLines[\s\S]*text/);
  });

  it("runs every step from the file's version to the target, in order, on a copy", () => {
    const calls: number[] = [];
    const migrations: Record<number, Migration> = {
      0: (raw) => {
        calls.push(0);
        return { ...raw, name: `${String(raw.title)} (migrated)` };
      },
      1: (raw) => {
        calls.push(1);
        return { ...raw, extra: true };
      },
    };
    const old = { ...v1(), schemaVersion: 0, title: "Old" } as JsonObject;
    delete old.name;
    const frozen = structuredClone(old);
    const migrated = migrateProject(old, migrations, 2);
    expect(calls).toEqual([0, 1]);
    expect(migrated).toMatchObject({ schemaVersion: 2, name: "Old (migrated)", extra: true });
    expect(old).toEqual(frozen);
  });

  it("parseProjectFile migrates before validating", () => {
    const old = { ...v1(), schemaVersion: 0 } as JsonObject;
    delete old.textPresetsLocal;
    const project = parseProjectFile(JSON.stringify(old), { 0: (raw) => ({ ...raw, textPresetsLocal: [] }) }, 1);
    expect(project.schemaVersion).toBe(1);
    expect(project.textPresetsLocal).toEqual([]);
  });

  it("refuses files from a newer app, a missing step, or no version", () => {
    expect(() => migrateProject({ ...v1(), schemaVersion: SCHEMA_VERSION + 1 })).toThrow(/newer version/);
    expect(() => migrateProject({ ...v1(), schemaVersion: 0 }, {})).toThrow(/No migration from schema version 0/);
    const unversioned = v1();
    delete unversioned.schemaVersion;
    expect(() => migrateProject(unversioned)).toThrow(/schemaVersion/);
    expect(() => migrateProject([1, 2])).toThrow(/project object/);
  });
});

// The fuzz runs take ~0.7 s alone, over 5 s in the full parallel run on a loaded machine: an explicit timeout.
describe("edge cases (Batch 47)", { timeout: 30_000 }, () => {
  /** Throws, and only a ProjectFileError: a broken file is reported, never a crash. */
  const refusal = (text: string): ProjectFileError => {
    try {
      parseProjectFile(text);
    } catch (error) {
      expect(error).toBeInstanceOf(ProjectFileError);
      return error as ProjectFileError;
    }
    throw new Error("expected a ProjectFileError");
  };

  it("round-trips random documents (links, transitions, keys, cues, offline media...), meta stamped", () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const project = fuzzRun({ seed, steps: 150 }).final;
      const text = serializeProject(project, STAMP);
      expect(parseProjectFile(text), `seed ${seed}`).toStrictEqual({ ...project, meta: { ...project.meta, modifiedAt: STAMP.now, appVersion: STAMP.appVersion } });
      expect(serializeProject(parseProjectFile(text), STAMP)).toBe(text);
    }
  });

  it("opens a file that starts with a UTF-8 byte order mark", () => {
    const project = richProject();
    const text = serializeProject(project, STAMP);
    expect(parseProjectFile(`\uFEFF${text}`)).toEqual(parseProjectFile(text));
    // Only a leading one: a BOM inside a string stays.
    const named = { ...project, name: "\uFEFFName" };
    expect(parseProjectFile(`\uFEFF${serializeProject(named, STAMP)}`).name).toBe("\uFEFFName");
  });

  it("reports a truncated file, wherever it was cut", () => {
    const text = serializeProject(fuzzRun({ seed: 11, steps: 60 }).final, STAMP);
    const rng = random(11);
    const cuts = [0, 1, 2, text.length - 2, ...Array.from({ length: 200 }, () => rng.int(0, text.length - 2))];
    for (const at of cuts) expect(refusal(text.slice(0, at)).message, `cut at ${at}`).toMatch(/not valid JSON|project object/);
    // The trailing newline is not part of the JSON.
    expect(parseProjectFile(text.slice(0, -1)).id).toBe("fuzz-project");
  });

  it("refuses a schemaVersion that is a string, negative or fractional", () => {
    const raw = JSON.parse(serializeProject(richProject(), STAMP)) as JsonObject;
    for (const schemaVersion of ["2", -1, 1.5, null, true]) {
      expect(refusal(JSON.stringify({ ...raw, schemaVersion })).message, String(schemaVersion)).toBe("project.json has no valid schemaVersion");
    }
    expect(refusal(JSON.stringify({ ...raw, schemaVersion: SCHEMA_VERSION + 0.5 })).message).toBe("project.json has no valid schemaVersion");
    expect(refusal("[]").message).toBe("project.json does not hold a project object");
    expect(refusal("null").message).toBe("project.json does not hold a project object");
  });

  it("keeps unknown top-level fields as they are (a file from a newer build of the same schema opens, and saves them back)", () => {
    const raw = JSON.parse(serializeProject(richProject(), STAMP)) as JsonObject;
    const text = JSON.stringify({ ...raw, futureField: { a: [1, 2] }, note: "x" });
    const parsed = parseProjectFile(text) as Project & { futureField?: unknown; note?: unknown };
    expect([parsed.futureField, parsed.note]).toEqual([{ a: [1, 2] }, "x"]);
    expect(JSON.parse(serializeProject(parsed, STAMP))).toMatchObject({ futureField: { a: [1, 2] }, note: "x" });
  });
});
