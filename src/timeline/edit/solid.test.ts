import { describe, expect, it } from "vitest";
import { makeProject, makeSolidClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { Project, SolidClip } from "../../core/document/types.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createSessionStore } from "../../core/store/sessionStore.js";
import { addSolid, defaultSolid, drawnRadius, lineThickness, setSolids, SOLID_SECONDS, solidLook, withShape } from "./solid.js";
import { IDENTITY_TRANSFORM, layerContent } from "./transform.js";

function project(): Project {
  const p = makeProject();
  p.tracks = [makeTrack("v1"), makeTrack("v2"), makeTrack("a1", "audio")];
  return withClips(p, [makeSolidClip({ id: "s", trackId: "v1", start: 0, duration: 90 })]);
}

const store = (p: Project) => new DocumentStore(p, { session: createSessionStore(), validate: true });

let ids = 0;
const newId = () => `id${++ids}`;

describe("defaultSolid", () => {
  it("is a white rounded rectangle sized from the frame's short side", () => {
    expect(defaultSolid({ width: 1080, height: 1920 })).toEqual({ shape: "roundedRect", fill: { r: 1, g: 1, b: 1, a: 1 }, size: { w: 648, h: 324 }, cornerRadius: 54 });
    expect(defaultSolid({ width: 1920, height: 1080 }).size).toEqual({ w: 648, h: 324 });
    expect(defaultSolid({ width: 720, height: 1280 }).cornerRadius).toBe(36);
  });
});

describe("addSolid", () => {
  it("adds the default solid at the playhead on the free top video track, centered, 5 s long", () => {
    const p = project();
    const s = store(p);
    const result = addSolid(p, 120, newId);
    s.dispatch(result.command);
    const clip = s.getState().clips[result.clipId] as SolidClip;
    expect(clip).toMatchObject({ kind: "solid", trackId: "v2", start: 120, duration: SOLID_SECONDS * 30, shape: "roundedRect", transform: IDENTITY_TRANSFORM, opacity: 1, enabled: true });
    expect(s.history.getState().undoLabel).toBe("Add solid");
    expect(layerContent(s.getState(), clip)).toEqual({ width: 648, height: 324, left: 0, top: 0, right: 648, bottom: 324 });
  });

  it("puts it on a new video track above the others when the top one is taken, locked or hidden", () => {
    for (const blocked of ["taken", "locked", "hidden"] as const) {
      const p = project();
      const v2 = p.tracks[1] as Project["tracks"][number];
      if (blocked === "taken") Object.assign(p, withClips(p, [makeSolidClip({ id: "t", trackId: "v2", start: 100, duration: 30 })]));
      else v2[blocked] = true;
      const s = store(p);
      const result = addSolid(p, 50, newId);
      s.dispatch(result.command);
      const state = s.getState();
      const track = state.tracks.find((t) => t.id === state.clips[result.clipId]?.trackId);
      expect(track?.name).toBe("V3");
      expect(state.tracks.map((t) => t.kind)).toEqual(["video", "video", "video", "audio"]);
      expect(state.tracks[2]?.id).toBe(track?.id);
      s.undo();
      expect(s.getState().tracks).toHaveLength(3);
    }
  });
});

describe("withShape and drawnRadius", () => {
  const frame = { width: 1080, height: 1920 };
  const look = defaultSolid(frame);

  it("makes a line thin and a line back into a box half as tall as it is long", () => {
    expect(lineThickness(frame)).toBe(8);
    const line = withShape(look, "line", frame);
    expect(line).toEqual({ ...look, shape: "line", size: { w: 648, h: 8 } });
    expect(withShape(line, "ellipse", frame)).toEqual({ ...look, shape: "ellipse", size: { w: 648, h: 324 } });
    expect(withShape(look, "ellipse", frame)).toEqual({ ...look, shape: "ellipse" });
    expect(withShape({ ...look, size: { w: 600, h: 4 } }, "line", frame).size).toEqual({ w: 600, h: 4 });
  });

  it("rounds rounded rects and line ends only, by at most half the shorter side", () => {
    expect(drawnRadius(look)).toBe(54);
    expect(drawnRadius({ ...look, cornerRadius: 500 })).toBe(162);
    expect(drawnRadius({ ...look, shape: "rect" })).toBe(0);
    expect(drawnRadius({ ...look, shape: "ellipse" })).toBe(0);
    expect(drawnRadius({ shape: "line", size: { w: 600, h: 8 }, cornerRadius: 54 })).toBe(4);
  });
});

describe("setSolids", () => {
  it("writes shape, fill, size and radius as one undo step and redraws the timeline only for shape and fill", () => {
    const p = project();
    const s = store(p);
    const gradient = { from: { r: 1, g: 0, b: 0, a: 1 }, to: { r: 0, g: 0, b: 1, a: 1 } };
    const command = setSolids(p, new Map([["s", { shape: "roundedRect", fill: gradient, cornerRadius: 12.4 }]]), { label: "Change fill" });
    expect(command?.affects).toEqual(["composite", "clips"]);
    s.dispatch(command as NonNullable<typeof command>);
    expect(solidLook(s.getState().clips.s as SolidClip)).toEqual({ shape: "roundedRect", fill: gradient, size: { w: 100, h: 100 }, cornerRadius: 12 });
    const resize = setSolids(s.getState(), new Map([["s", { size: { w: 250.6, h: 0.2 } }]]), { label: "Change size" });
    expect(resize?.affects).toEqual(["composite"]);
    s.dispatch(resize as NonNullable<typeof resize>);
    expect((s.getState().clips.s as SolidClip).size).toEqual({ w: 251, h: 1 });
    s.undo();
    s.undo();
    expect(s.getState()).toEqual(p);
  });

  it("moves the transform with a size handle drag, and skips locked, unchanged, other and broken edits", () => {
    const p = project();
    const moved = { ...IDENTITY_TRANSFORM, x: 40, y: -12 };
    const command = setSolids(p, new Map([["s", { size: { w: 200, h: 100 }, transform: moved }]]), { label: "Resize shape" });
    const s = store(p);
    s.dispatch(command as NonNullable<typeof command>);
    expect(s.getState().clips.s).toMatchObject({ size: { w: 200, h: 100 }, transform: moved });
    expect(setSolids(s.getState(), new Map([["s", { size: { w: 200, h: 100 } }]]), { label: "x" })).toBeNull();
    expect(setSolids(p, new Map([["s", { size: { w: Number.NaN, h: 5 } }]]), { label: "x" })).toBeNull();
    expect(setSolids(p, new Map([["missing", { cornerRadius: 3 }]]), { label: "x" })).toBeNull();
    const locked = project();
    (locked.tracks[0] as Project["tracks"][number]).locked = true;
    expect(setSolids(locked, new Map([["s", { cornerRadius: 3 }]]), { label: "x" })).toBeNull();
  });

  it("coalesces arrow steps by key", () => {
    const p = project();
    const s = store(p);
    for (let i = 1; i <= 3; i++) s.dispatch(setSolids(s.getState(), new Map([["s", { cornerRadius: i }]]), { label: "Change radius", coalesceKey: "properties.solid.radius" }) as NonNullable<ReturnType<typeof setSolids>>);
    expect((s.getState().clips.s as SolidClip).cornerRadius).toBe(3);
    s.undo();
    expect(s.getState()).toEqual(p);
  });
});
