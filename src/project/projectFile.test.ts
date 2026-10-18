import { describe, expect, it } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeSolidClip, makeTrack, withClips } from "../core/document/fixtures.js";
import { SCHEMA_VERSION, type JsonObject, type Project } from "../core/document/types.js";
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
