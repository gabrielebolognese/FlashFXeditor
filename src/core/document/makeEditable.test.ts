import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DocumentStore } from "../store/DocumentStore.js";
import { createSessionStore } from "../store/sessionStore.js";
import { splitClips } from "../../timeline/edit/split.js";
import { convertAll, convertStandIn, makeEditableCommand, standIns } from "./makeEditable.js";
import { normalizeProject } from "./normalize.js";
import { validateStrict } from "./strict.js";
import type { Clip, Project, SolidClip } from "./types.js";

const OPTIONS = { now: "2026-11-07T08:00:00.000Z", appVersion: "test" };
const read = (path: string) => JSON.parse(readFileSync(join(process.cwd(), path), "utf8")) as unknown;
const standInsProject = () => validateStrict(read("fixtures/interop/standins/project.json")).project as Project;

/** Every field of a clip but its id. */
const shape = (clip: Clip) => {
  const rest: Record<string, unknown> = { ...clip };
  delete rest.id;
  return rest;
};

describe("convertStandIn", () => {
  it("turns a sparse solid written at schema 3 into that solid, in place, completed with the defaults", () => {
    const project = standInsProject();
    const result = convertStandIn(project, "b-solid", OPTIONS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const stand = project.clips["b-solid"] as Clip;
    const native = result.project.clips["b-solid"] as SolidClip;
    expect(native.kind).toBe("solid");
    expect(native.fallbackOf).toBeUndefined();
    expect([native.trackId, native.start, native.duration]).toEqual([stand.trackId, stand.start, stand.duration]);
    expect(native.fill).toEqual({ r: 0.9, g: 0.2, b: 0.2, a: 1 });
    expect(native.size).toEqual({ w: 600, h: 160 });
    expect(native.shape).toBe("roundedRect");
    expect(native.opacity).toBe(0.8);
    expect(native.transform.anchor).toEqual({ x: 0.5, y: 0.5 });
    expect(validateStrict(JSON.parse(JSON.stringify(result.project))).ok).toBe(true);
  });

  it("is one undo step", () => {
    const project = standInsProject();
    const store = new DocumentStore(project, { session: createSessionStore(), validate: true });
    const result = convertStandIn(project, "b-solid", OPTIONS);
    if (!result.ok) throw new Error(result.reason);
    store.dispatch(makeEditableCommand("clip.makeEditable", "Make editable", result.changes));
    expect(store.getState().clips["b-solid"]?.fallbackOf).toBeUndefined();
    expect(store.undo()).toBe(true);
    expect(store.getState().clips["b-solid"]?.fallbackOf?.kind).toBe("solid");
    expect(store.undo()).toBe(false);
  });

  it("keeps a stand-in whose data names an unknown kind, with the reason", () => {
    const result = convertStandIn(standInsProject(), "b-unknown", OPTIONS);
    expect(result).toEqual({ ok: false, reason: 'This editor has no "hologram" clip yet' });
  });

  it("refuses data from a newer schema and a clip that is not a stand-in", () => {
    const project = standInsProject();
    const newer = { ...project, clips: { ...project.clips, "b-solid": { ...(project.clips["b-solid"] as Clip), fallbackOf: { ...(project.clips["b-solid"] as Clip).fallbackOf!, schemaVersion: 99 } } } } as Project;
    expect(convertStandIn(newer, "b-solid", OPTIONS)).toMatchObject({ ok: false });
    const basic = validateStrict(read("fixtures/interop/basic/project.json")).project as Project;
    expect(convertStandIn(basic, "c-text", OPTIONS)).toEqual({ ok: false, reason: "The clip is not a baked stand-in" });
  });

  it("converts a stand-in split in two, half by half, into the frames of converting it whole and splitting after", () => {
    const project = standInsProject();
    const halves = convertAll(
      { ...project, clips: Object.fromEntries(Object.entries(project.clips).filter(([id]) => id.startsWith("b-split"))) as Project["clips"], tracks: project.tracks.map((t) => ({ ...t, clipIds: t.clipIds.filter((id) => id.startsWith("b-split")) })) },
      OPTIONS,
    );
    expect(halves.converted.sort()).toEqual(["b-split-a", "b-split-b"]);
    const left = halves.project.clips["b-split-a"] as Clip;
    const right = halves.project.clips["b-split-b"] as Clip;

    // The whole stand-in (the two halves joined), converted, then split at the same frame.
    const a = project.clips["b-split-a"] as Clip;
    const whole = { ...a, id: "whole", duration: 60 } as Clip;
    const solo: Project = { ...project, clips: { whole }, tracks: project.tracks.map((t) => ({ ...t, clipIds: t.id === "v2" ? ["whole"] : [] })) };
    const converted = convertStandIn(solo, "whole", OPTIONS);
    if (!converted.ok) throw new Error(converted.reason);
    const split = splitClips(converted.project, ["whole"], 24, () => "right");
    expect(split).not.toBeNull();
    const store = new DocumentStore(converted.project, { session: createSessionStore() });
    store.dispatch(split!.command);
    expect(shape(left)).toEqual(shape(store.getState().clips["whole"] as Clip));
    expect(shape(right)).toEqual(shape(store.getState().clips["right"] as Clip));
  });
});

describe("convertAll", () => {
  it("reports what was converted and what remains with its reason", () => {
    const project = standInsProject();
    const result = convertAll(project, OPTIONS);
    expect(result.converted.sort()).toEqual(["b-solid", "b-split-a", "b-split-b"]);
    expect(result.remaining).toEqual([{ clipId: "b-unknown", reason: 'This editor has no "hologram" clip yet' }]);
    expect(standIns(result.project).map((clip) => clip.id)).toEqual(["b-unknown"]);
    expect(validateStrict(JSON.parse(JSON.stringify(result.project))).ok).toBe(true);
  });
});

describe("stand-in data from an older schema and with media", () => {
  it("starts the native clip headTrim frames in (a head trim of a media clip moves `in`) and brings its media", () => {
    const base = normalizeProject(
      {
        schemaVersion: 4,
        name: "m",
        settings: { width: 1080, height: 1920, fps: { num: 30, den: 1 } },
        tracks: [{ id: "v1", kind: "video" }],
        clips: {
          s: {
            id: "s",
            kind: "solid",
            trackId: "v1",
            start: 40,
            duration: 20,
            fill: { r: 1, g: 1, b: 1, a: 1 },
            size: { w: 10, h: 10 },
            fallbackOf: {
              kind: "video",
              reason: "baked",
              schemaVersion: 4,
              headTrim: 10,
              data: {
                kind: "video",
                mediaId: "m1",
                media: { m1: { id: "m1", kind: "video", name: "x.mp4", file: { relPath: "media/x.mp4" }, durationUs: 4_000_000, width: 270, height: 480, fps: { num: 30, den: 1 }, hasAudio: false } },
              },
            },
          },
        },
      },
      OPTIONS,
    ).project as unknown as Project;
    const result = convertStandIn(base, "s", OPTIONS);
    if (!result.ok) throw new Error(result.reason);
    const clip = result.project.clips["s"] as Clip & { in: number; out: number };
    expect(clip.kind).toBe("video");
    expect([clip.start, clip.duration]).toEqual([40, 20]);
    expect(clip.in).toBe(333_333);
    expect(clip.out).toBe(clip.in + 666_667);
    expect(result.project.media["m1"]?.name).toBe("x.mp4");
  });
});
