import { describe, expect, it } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeSolidClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import { animatedTransform } from "../../core/document/keyframes.js";
import { framesToSourceUs, frameToUs } from "../../core/document/time.js";
import type { Clip, MediaClip, Project, Track } from "../../core/document/types.js";
import { validateProject } from "../../core/document/validate.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createSessionStore } from "../../core/store/sessionStore.js";
import { sourceTimeUs } from "../../render/compositor/Compositor.js";
import { BUILT_IN_EDIT_DEFAULTS } from "./editDefaults.js";
import { freezeFrame, punchZoom, PUNCH_ZOOM_FRAMES, type FreezeResult, type PunchZoomResult } from "./freeze.js";
import { splitClips } from "./split.js";
import { planSlip, planStretch, planTrim, resolveTrim } from "./trim.js";

const fps = makeProject().settings.fps;
const MEDIA_US = 20_000_000;
const FREEZE = (BUILT_IN_EDIT_DEFAULTS.freezeMs / 1000) * 30;

function clip(id: string, trackId: string, start: number, duration: number, inFrames = 0, extra: Partial<MediaClip> = {}): MediaClip {
  const base = makeMediaClip(makeProject(), { id, trackId, start, duration, mediaId: "m", kind: trackId.startsWith("a") ? "audio" : "video" });
  return { ...base, in: frameToUs(inFrames, fps), out: frameToUs(inFrames + duration, fps), ...extra };
}

const TRACKS = () => [makeTrack("v1"), makeTrack("v2"), makeTrack("a1", "audio"), makeTrack("a2", "audio")];

function project(clips: Clip[], tracks: Track[] = TRACKS()): Project {
  const p = makeProject();
  p.media.m = makeMedia("m", "video", MEDIA_US);
  p.tracks.push(...tracks.map((track) => ({ ...track, targeted: true })));
  return withClips(p, clips);
}

let counter = 0;
const newId = () => `n${++counter}`;

function run<T extends FreezeResult | PunchZoomResult>(p: Project, result: T | string): { next: Project; doc: DocumentStore; result: T } {
  if (typeof result === "string") throw new Error(`expected a command, got ${result}`);
  const doc = new DocumentStore(p, { session: createSessionStore(), validate: true });
  doc.dispatch(result.command);
  return { next: doc.getState(), doc, result };
}

const get = (p: Project, id: string) => p.clips[id] as MediaClip;
const span = (p: Project, id: string) => [get(p, id).start, get(p, id).duration];
/** The clips of a track, as [id, start, duration]. */
const row = (p: Project, trackId: string) => p.tracks.find((t) => t.id === trackId)?.clipIds.map((id) => [id, get(p, id).start, get(p, id).duration]);

describe("freezeFrame", () => {
  it("splits at the playhead, holds that frame for 2 s between the halves and ripples the rest (acceptance 2)", () => {
    const p = project([
      clip("v", "v1", 0, 300, 30, { linkGroup: "g", color: "blue" }),
      clip("a", "a1", 0, 300, 30, { linkGroup: "g" }),
      clip("next", "v1", 300, 60, 400),
      clip("bed", "a2", 0, 600),
      clip("later", "a2", 600, 30),
    ]);
    const { next, doc, result } = run(p, freezeFrame(p, 100, [], newId));
    const freezeId = result.freezeIds[0] as string;
    const freeze = get(next, freezeId);
    expect(result.freezeIds).toHaveLength(1);
    expect(freeze).toMatchObject({ kind: "video", trackId: "v1", start: 100, duration: FREEZE, speed: 0, color: "blue", enabled: true });
    expect(freeze.linkGroup).toBeUndefined();
    // It holds the source time the clip showed at the playhead, on every frame.
    const shown = sourceTimeUs(get(p, "v"), 100, fps);
    expect(freeze.in).toBe(shown);
    expect(freeze.out).toBe(shown + frameToUs(1, fps));
    for (const frame of [100, 130, 159]) expect(sourceTimeUs(freeze, frame, fps)).toBe(shown);
    // The halves: the right one continues from the frozen frame after the freeze.
    const rows = row(next, "v1") as [string, number, number][];
    expect(rows.map(([, start, duration]) => [start, duration])).toEqual([[0, 100], [100, FREEZE], [160, 200], [360, 60]]);
    const right = get(next, rows[2]?.[0] as string);
    expect(right.in).toBe(shown);
    // The sound is split and rippled the same way: silent during the freeze.
    expect(row(next, "a1")?.map(([, start, duration]) => [start, duration])).toEqual([[0, 100], [160, 200]]);
    // A clip spanning the playhead plays on under the freeze; what follows it moves.
    expect(span(next, "bed")).toEqual([0, 600]);
    expect(span(next, "later")).toEqual([660, 30]);
    expect(validateProject(next)).toEqual([]);
    expect(doc.history.getState().undoLabel).toBe("Freeze frame");
    doc.undo();
    expect(doc.getState()).toEqual(p);
  });

  it("takes the selected video under the playhead, else the topmost on a targeted visible track", () => {
    const tracks = [makeTrack("v1"), makeTrack("v2"), makeTrack("v3"), makeTrack("a1", "audio")];
    const p = project([clip("low", "v1", 0, 300), clip("mid", "v2", 0, 300), clip("top", "v3", 0, 300)], tracks);
    const hidden = { ...p, tracks: p.tracks.map((t) => (t.id === "v3" ? { ...t, hidden: true } : t)) };
    expect(get(run(hidden, freezeFrame(hidden, 50, [], newId)).next, "mid").duration).toBe(50);
    const picked = run(p, freezeFrame(p, 50, ["low"], newId));
    expect(get(picked.next, "low").duration).toBe(50);
    expect(get(picked.next, "top").duration).toBe(300);
    // Selected but not under the playhead; nothing to freeze.
    expect(freezeFrame(p, 400, ["low"], newId)).toBe("notUnderPlayhead");
    expect(freezeFrame(p, 400, [], newId)).toBe("none");
    const solid = withClips(project([], tracks), [makeSolidClip({ id: "s", trackId: "v1", start: 0, duration: 100 })]);
    expect(freezeFrame(solid, 10, [], newId)).toBe("none");
  });

  it("at a clip's start: no split, the freeze goes before it; locked tracks do not move", () => {
    const tracks = [makeTrack("v1"), { ...makeTrack("v2"), locked: true }, makeTrack("a1", "audio")];
    const p = project([clip("a", "v1", 0, 100), clip("b", "v1", 100, 100, 200), clip("l", "v2", 150, 30)], tracks);
    const { next, result } = run(p, freezeFrame(p, 100, [], newId));
    expect(span(next, "a")).toEqual([0, 100]);
    expect(span(next, result.freezeIds[0] as string)).toEqual([100, FREEZE]);
    expect(get(next, result.freezeIds[0] as string).in).toBe(frameToUs(200, fps));
    expect(span(next, "b")).toEqual([160, 100]);
    expect(span(next, "l")).toEqual([150, 30]);
  });

  it("freeze frames trim with no media bound, never slip, stretch as a trim and split into two holds", () => {
    const freeze = clip("f", "v1", 0, 60, 0, { speed: 0, in: frameToUs(299, fps), out: frameToUs(300, fps) });
    const p = project([freeze, clip("b", "v1", 100, 30)]);
    const longer = resolveTrim(planTrim(p, ["f"], "out", { ripple: false }), 40);
    expect(longer.delta).toBe(40);
    expect(longer.mediaBound).toBeNull();
    expect([longer.changes.get("f")?.duration, (longer.changes.get("f") as MediaClip).in]).toEqual([100, frameToUs(299, fps)]);
    const earlier = resolveTrim(planTrim({ ...p, clips: { ...p.clips, f: { ...freeze, start: 50 } }, tracks: p.tracks }, ["f"], "in", { ripple: false }), -50);
    expect((earlier.changes.get("f") as MediaClip).in).toBe(frameToUs(299, fps));
    expect(planSlip(p, "f").moves.size).toBe(0);
    expect(resolveTrim(planStretch(p, "f", "out"), 10).changes.get("f")).toMatchObject({ duration: 70, speed: 0 });
    const split = splitClips(p, ["f"], 20, newId);
    const halves = [...(split?.pieces ?? [])].flat();
    const doc = new DocumentStore(p, { session: createSessionStore(), validate: true });
    doc.dispatch(split?.command as NonNullable<typeof split>["command"]);
    for (const id of halves) expect([get(doc.getState(), id).in, get(doc.getState(), id).out]).toEqual([frameToUs(299, fps), frameToUs(300, fps)]);
  });

  it("is a valid document only for video clips", () => {
    const audio = project([clip("a", "a1", 0, 60, 0, { speed: 0, out: frameToUs(1, fps) })]);
    expect(validateProject(audio).join()).toMatch(/speed 0 must be > 0/);
    const video = project([clip("v", "v1", 0, 60, 0, { speed: 0, out: framesToSourceUs(1, 1, fps) })]);
    expect(validateProject(video)).toEqual([]);
  });
});

describe("punchZoom", () => {
  it("splits at the playhead and zooms the right piece 1.2x; undo restores (acceptance 3)", () => {
    const p = project([clip("v", "v1", 0, 300, 0, { linkGroup: "g", transform: { x: 40, y: 0, scale: 0.5, scaleY: 0.6, rotation: 0, anchor: { x: 0.5, y: 0.5 }, flipH: false, flipV: false } }), clip("a", "a1", 0, 300, 0, { linkGroup: "g" })]);
    const { next, doc, result } = run(p, punchZoom(p, 120, [], 1.2, newId, { linked: true }));
    const zoomed = get(next, result.zoomedIds[0] as string);
    expect(span(next, "v")).toEqual([0, 120]);
    expect(get(next, "v").transform.scale).toBe(0.5);
    expect([zoomed.start, zoomed.duration]).toEqual([120, 180]);
    expect(zoomed.transform).toMatchObject({ x: 40, scale: 0.6, rotation: 0 });
    expect(zoomed.transform.scaleY).toBeCloseTo(0.72, 10);
    // The sound is split with it (Linked selection), unchanged.
    expect(row(next, "a1")).toHaveLength(2);
    expect(doc.history.getState().undoLabel).toBe("Punch zoom");
    doc.undo();
    expect(doc.getState()).toEqual(p);
  });

  it("zooms a selected layer of any kind, the whole clip when it starts at the playhead; misses report why", () => {
    const solid = makeSolidClip({ id: "s", trackId: "v2", start: 100, duration: 50 });
    const p = project([clip("v", "v1", 0, 300), solid]);
    const whole = run(p, punchZoom(p, 100, ["s"], 1.5, newId, { linked: true }));
    expect(whole.result.zoomedIds).toEqual(["s"]);
    expect(get(whole.next, "s").transform.scale).toBe(1.5);
    expect(get(whole.next, "v").duration).toBe(300);
    expect(punchZoom(p, 200, ["s"], 1.2, newId, { linked: true })).toBe("notUnderPlayhead");
    expect(punchZoom(p, 400, [], 1.2, newId, { linked: true })).toBe("none");
  });

  it("animated (Batch 35): the right piece zooms from its scale to 1.2x over 6 frames with ease out", () => {
    const p = project([clip("v", "v1", 0, 300, 0, { transform: { x: 40, y: 0, scale: 0.5, rotation: 0, anchor: { x: 0.5, y: 0.5 }, flipH: false, flipV: false } })]);
    const { next, doc, result } = run(p, punchZoom(p, 120, [], 1.2, newId, { linked: true, animated: true }));
    const zoomed = get(next, result.zoomedIds[0] as string);
    expect(zoomed.transform.scale).toBe(0.5);
    expect(zoomed.keyframes?.["transform.scale"]).toEqual([
      { frame: 0, value: 0.5, ease: "easeOut" },
      { frame: PUNCH_ZOOM_FRAMES, value: 0.6, ease: "linear" },
    ]);
    const scales = [0, 1, 3, 6, 100].map((rel) => animatedTransform(zoomed, rel).scale);
    expect(scales[0]).toBe(0.5);
    expect(scales[1]).toBeGreaterThan(0.5 + 0.1 / 6);
    expect(scales[3]).toBeCloseTo(0.6);
    expect(scales[4]).toBeCloseTo(0.6);
    expect(animatedTransform(zoomed, 3).x).toBe(40);
    // The left piece is untouched; undo restores.
    expect(get(next, "v").keyframes).toBeUndefined();
    doc.undo();
    expect(doc.getState()).toEqual(p);
    // A piece with Transform keys gets the cut-in zoom on its scale keys.
    const keyed = project([clip("k", "v1", 0, 300, 0, { keyframes: { "transform.scale": [{ frame: 0, value: 1, ease: "linear" }, { frame: 200, value: 2, ease: "linear" }] } })]);
    const cut = run(keyed, punchZoom(keyed, 100, [], 1.2, newId, { linked: true, animated: true }));
    const values = get(cut.next, cut.result.zoomedIds[0] as string).keyframes?.["transform.scale"]?.map((key) => key.value) ?? [];
    expect(values).toHaveLength(2);
    expect(values[0]).toBeCloseTo(1.8, 10);
    expect(values[1]).toBeCloseTo(2.4, 10);
  });
});
