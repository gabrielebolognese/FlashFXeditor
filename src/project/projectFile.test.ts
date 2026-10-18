import { describe, expect, it } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeSolidClip, makeTrack, withClips } from "../core/document/fixtures.js";
import { SCHEMA_VERSION, type JsonObject, type Project } from "../core/document/types.js";
import { fuzzRun, random } from "../timeline/edit/fuzzKit.js";
import { migrateProject, parseProjectFile, ProjectFileError, serializeProject, type Migration } from "./projectFile.js";

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
    expect(SCHEMA_VERSION).toBe(2);
  });

  it("opens a schema 1 project (Batch 41): no bins yet, media without sizes", () => {
    const project = richProject();
    const raw = JSON.parse(serializeProject(project, STAMP)) as JsonObject;
    delete raw.bins;
    raw.schemaVersion = 1;
    const parsed = parseProjectFile(JSON.stringify(raw));
    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.bins).toEqual([]);
    expect(parsed.media.m1).toEqual(project.media.m1);
    expect(parsed.clips).toEqual(project.clips);
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

describe("edge cases (Batch 47)", () => {
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
