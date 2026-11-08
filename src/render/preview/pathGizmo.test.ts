import { describe, expect, it } from "vitest";
import { makeProject, makeShapeClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { KeyData, NullClip, Project, ShapeClip, Transform } from "../../core/document/types.js";
import { setPathKeys } from "../../timeline/edit/rig.js";
import { hitPath, liveByFrame, pathDragEdit, pathScene } from "./pathGizmo.js";

const T = (patch: Partial<Transform> = {}): Transform => ({ x: 0, y: 0, scale: 1, rotation: 0, anchor: { x: 0.5, y: 0.5 }, flipH: false, flipV: false, ...patch });
const key = (frame: number, value: number[], extra: Partial<KeyData> = {}): KeyData => ({ frame, value, ease: "linear", ...extra });

function build(parent?: Partial<NullClip>): { project: Project; clip: ShapeClip } {
  const p = makeProject();
  p.tracks = [makeTrack("v1"), makeTrack("v2")];
  const clip = makeShapeClip({
    id: "s",
    trackId: "v1",
    start: 0,
    duration: 100,
    ...(parent ? { parentId: "n" } : {}),
    keyframes: { "transform.position": [key(0, [0, 0], { spatialOut: [50, 0] }), key(60, [200, 100], { spatialIn: [-50, 0] })] },
  });
  const clips = [clip as never];
  if (parent) clips.push({ id: "n", trackId: "v2", kind: "null", name: "n", start: 0, duration: 100, enabled: true, size: { w: 100, h: 100 }, transform: T(parent.transform), } as never);
  return { project: withClips(p, clips), clip };
}

describe("path gizmo", () => {
  it("draws keys and handles in project points around the frame center", () => {
    const { project, clip } = build();
    const scene = pathScene(project, clip, 0);
    const cx = project.settings.width / 2;
    const cy = project.settings.height / 2;
    expect(scene?.keys.map((k) => [k.x, k.y])).toEqual([[cx, cy], [cx + 200, cy + 100]]);
    expect(scene?.handles.map((h) => [h.side, h.x, h.y])).toEqual([["out", cx + 50, cy], ["in", cx + 150, cy + 100]]);
    expect(scene?.line.length).toBeGreaterThan(40);
  });

  it("follows the parent's space", () => {
    const { project, clip } = build({ transform: T({ x: 10, y: 20 }) });
    const cx = project.settings.width / 2;
    const cy = project.settings.height / 2;
    expect(pathScene(project, clip, 0)?.keys[0]).toMatchObject({ x: cx + 10, y: cy + 20 });
  });

  it("hits handles before keys, within the reach", () => {
    const { project, clip } = build();
    const scene = pathScene(project, clip, 0)!;
    const cx = project.settings.width / 2;
    const cy = project.settings.height / 2;
    expect(hitPath(scene, cx + 1, cy + 1, 5)).toEqual({ kind: "key", index: 0 });
    expect(hitPath(scene, cx + 52, cy, 5)).toEqual({ kind: "handle", index: 0, side: "out" });
    expect(hitPath(scene, cx + 100, cy + 300, 5)).toBeNull();
  });

  it("a key drag moves the point; Alt pulls tangents; a handle drag sets the offset, mirrored with Alt", () => {
    const { project, clip } = build();
    const cx = project.settings.width / 2;
    const cy = project.settings.height / 2;
    const moved = pathDragEdit(project, clip, 0, { kind: "key", index: 1 }, { x: cx + 200, y: cy + 100 }, { x: cx + 230, y: cy + 90 }, false);
    expect(moved?.get(1)).toEqual({ value: [230, 90] });
    const pulled = pathDragEdit(project, clip, 0, { kind: "key", index: 0 }, { x: cx, y: cy }, { x: cx + 40, y: cy }, true);
    expect(pulled?.get(0)).toMatchObject({ spatialOut: [40, 0], spatialIn: [-40, 0] });
    const handle = pathDragEdit(project, clip, 0, { kind: "handle", index: 0, side: "out" }, { x: 0, y: 0 }, { x: cx + 0, y: cy + 80 }, true);
    expect(handle?.get(0)).toMatchObject({ spatialOut: [0, 80], spatialIn: [0, -80] });
    const command = setPathKeys(project, "s", liveByFrame(clip, moved!), "Move");
    expect(command).not.toBeNull();
  });
});
