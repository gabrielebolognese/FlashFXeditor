import { afterEach, describe, expect, it, vi } from "vitest";
import { makeProject, makeSolidClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { Clip, Mask } from "../../core/document/types.js";
import { maskPathPoints } from "../../core/masks/maskPath.js";
import { createStore } from "../../core/store/createStore.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createLayoutStore } from "../../core/store/layoutStore.js";
import { createSessionStore } from "../../core/store/sessionStore.js";
import { selectClips } from "../../core/store/selection.js";
import { readTheme } from "../../core/theme/theme.js";
import { mutableIdentity, setMat } from "../mat3.js";
import { CanvasEditInput } from "./CanvasEditInput.js";
import { hitMask, maskDrag, maskFeatherGap, maskScene, NO_MASK_MODE, type MaskModeState, type MaskSpace } from "./maskGizmo.js";

const TOKENS: Record<string, string> = {
  "--gizmo-line-width": "1px",
  "--gizmo-handle-size": "8px",
  "--gizmo-handle-hit": "12px",
  "--gizmo-rotate-zone": "16px",
  "--gizmo-anchor-size": "12px",
  "--gizmo-snap-width": "2px",
  "--gizmo-min-edge": "28px",
  "--canvas-drag-threshold": "4px",
  "--canvas-snap-threshold": "6px",
};
const theme = readTheme((name) => TOKENS[name] ?? name).theme;
const detaches: (() => void)[] = [];

const rect = (fields: Partial<Mask> = {}): Mask => ({ id: "r", shape: { kind: "rect", x: 100, y: 100, w: 400, h: 200, radius: 0 }, mode: "add", feather: 0, expansion: 0, opacity: 1, inverted: false, ...fields });
const path: Mask = { id: "p", shape: { kind: "path", d: "M100 100L500 100L500 400L100 400Z" }, mode: "add", feather: 0, expansion: 0, opacity: 1, inverted: false };
/** Content px = project px shifted by (40, 60) (a clip whose content box starts there). */
const SPACE: MaskSpace = { model: setMat(mutableIdentity(), 1, 0, 0, 1, 40, 60), width: 1000, height: 1000 };

describe("mask gizmo (spec §21.18, Batch 73)", () => {
  it("lays out a box mask's outline and 8 handles in project px; a path's anchors", () => {
    const scene = maskScene("s", [rect(), path], SPACE, 12);
    const box = scene.masks[0];
    expect(box?.line.slice(0, 4)).toEqual([140, 160, 540, 160]);
    expect(box?.box.find((h) => h.id === "se")).toEqual({ id: "se", x: 540, y: 360 });
    expect(scene.masks[1]?.anchors.map((a) => [a.x, a.y])).toEqual([
      [140, 160],
      [540, 160],
      [540, 460],
      [140, 460],
    ]);
    expect(scene.masks[1]?.box).toEqual([]);
  });

  it("hits handles first, then the topmost mask's body", () => {
    const masks = [rect(), path];
    const scene = maskScene("s", masks, SPACE, 12);
    expect(hitMask(scene, masks, SPACE, 541, 361, 6)).toEqual({ kind: "box", mask: 0, handle: "se" });
    expect(hitMask(scene, masks, SPACE, 140, 460, 6)).toEqual({ kind: "point", mask: 1, pair: 3 });
    expect(hitMask(scene, masks, SPACE, 300, 300, 6)).toEqual({ kind: "body", mask: 1 });
    expect(hitMask(scene, masks, SPACE, 5, 5, 6)).toBeNull();
  });

  it("drags: a corner resizes (Shift keeps the aspect), the body moves, a point moves alone, the feather handle sets the feather", () => {
    const start = [rect()];
    const se = maskDrag(start, 0, { kind: "box", mask: 0, handle: "se" }, { x: 500, y: 300 }, { x: 600, y: 320 }, false)[0]?.shape;
    expect(se).toMatchObject({ x: 100, y: 100, w: 500, h: 220 });
    const kept = maskDrag(start, 0, { kind: "box", mask: 0, handle: "se" }, { x: 500, y: 300 }, { x: 900, y: 320 }, true)[0]?.shape as { w: number; h: number };
    expect(kept.w / kept.h).toBeCloseTo(2, 6);
    expect(maskDrag(start, 0, { kind: "body", mask: 0 }, { x: 0, y: 0 }, { x: 10, y: -5 }, false)[0]?.shape).toMatchObject({ x: 110, y: 95 });
    const moved = maskDrag([path], 0, { kind: "point", mask: 0, pair: 2 }, { x: 0, y: 0 }, { x: 20, y: 30 }, false)[0]?.shape as { d: string };
    expect(maskPathPoints(moved.d)).toEqual([100, 100, 500, 100, 520, 430, 100, 400]);
    const feather = maskDrag(start, 0, { kind: "feather", mask: 0, gap: 12 }, { x: 0, y: 0 }, { x: 552, y: 0 }, false)[0];
    expect(feather?.feather).toBe(40);
    // The start is not touched.
    expect(start[0]?.shape).toMatchObject({ w: 400 });
  });

  it("the feather handle of a feather-0 mask clears the box handles at small preview scales", () => {
    // The default ellipse of a 1080 x 1920 clip (x 108, w 864, feather 0); the gap and reach come from the
    // gizmo tokens in device px, as CanvasEditInput sizes them.
    const ellipse: Mask = { id: "e", shape: { kind: "ellipse", x: 108, y: 192, w: 864, h: 1536 }, mode: "add", feather: 0, expansion: 0, opacity: 1, inverted: false };
    const cases = [
      // [device px per project px, dpr, content px per project px]
      [0.36, 1, 1],
      [0.5, 2, 1],
      [0.25, 1, 1],
      // A 4K picture shown at 1080 x 1920: content larger than its shown size.
      [0.36, 1, 0.5],
    ] as const;
    for (const [scale, dpr, content] of cases) {
      const space: MaskSpace = { model: setMat(mutableIdentity(), content, 0, 0, content, 0, 0), width: 1080 / content, height: 1920 / content };
      const masks = [{ ...ellipse, shape: { ...ellipse.shape, x: 108 / content, y: 192 / content, w: 864 / content, h: 1536 / content } } as Mask];
      const scene = maskScene("s", masks, space, maskFeatherGap(space, theme.gizmo.rotateZone * dpr, scale));
      const reach = (theme.gizmo.handleHit * dpr) / 2 / scale;
      const diamond = scene.masks[0]?.feather as { x: number; y: number };
      const east = scene.masks[0]?.box.find((h) => h.id === "e") as { x: number; y: number };
      // On screen the diamond is `rotateZone` device px right of the east handle.
      expect((diamond.x - east.x) * scale).toBeCloseTo(theme.gizmo.rotateZone * dpr, 6);
      const hit = hitMask(scene, masks, space, diamond.x, diamond.y, reach);
      expect(hit?.kind).toBe("feather");
      expect(hitMask(scene, masks, space, east.x, east.y, reach)).toEqual({ kind: "box", mask: 0, handle: "e" });
      // Dragging the diamond 40 content px right sets feather 40 (the gap the scene used is in the hit).
      const from = { x: diamond.x / content, y: diamond.y / content };
      const dragged = maskDrag(masks, 0, hit as Parameters<typeof maskDrag>[2], from, { x: from.x + 40, y: from.y }, false)[0];
      expect(dragged?.feather).toBeCloseTo(40, 2);
    }
  });
});

/** A 1080 x 1920 frame; solid `s` with a rectangle mask; the content box maps content px to project px 1:1. */
function setup() {
  const p = makeProject();
  p.tracks = [makeTrack("v1")];
  const solid = { ...makeSolidClip({ id: "s", trackId: "v1", start: 0, duration: 30 }), masks: [rect()] } as Clip;
  const session = createSessionStore();
  session.state.set((state) => ({ ...state, snap: false }));
  const doc = new DocumentStore(withClips(p, [solid]), { session, validate: true });
  const commits = vi.fn((command: Parameters<DocumentStore["dispatch"]>[0]) => doc.dispatch(command));
  const maskMode = createStore<MaskModeState>(NO_MASK_MODE);
  const invalidations: string[] = [];
  const input = new CanvasEditInput({
    document: doc,
    session,
    scheduler: { invalidate: (view: string) => invalidations.push(view) } as never,
    theme: { theme, subscribe: () => () => undefined },
    layout: createLayoutStore(null),
    platform: "other",
    placement: () => ({ transform: [0.5, 0, 0, 0.5, 10, 20], width: 600, height: 1000, dpr: 1 }),
    panning: () => false,
    commit: commits,
    onDragStart: () => undefined,
    onContextMenu: () => undefined,
    maskMode,
    contentBox: () => ({ model: setMat(mutableIdentity(), 1, 0, 0, 1, 0, 0), width: 1080, height: 1920 }),
  });
  const element = document.createElement("canvas");
  element.getBoundingClientRect = () => ({ left: 100, top: 50, right: 700, bottom: 1050, width: 600, height: 1000, x: 100, y: 50, toJSON: () => null });
  element.setPointerCapture = () => undefined;
  document.body.append(element);
  detaches.push(input.attach(element));
  element.dispatchEvent(new PointerEvent("pointerenter"));
  const client = (x: number, y: number) => ({ clientX: 100 + 10 + 0.5 * x, clientY: 50 + 20 + 0.5 * y });
  const pointer = (type: string, x: number, y: number, init: PointerEventInit = {}) => element.dispatchEvent(new PointerEvent(type, { ...client(x, y), pointerId: 1, button: 0, bubbles: true, cancelable: true, ...init }));
  const masks = () => (doc.getState().clips.s as Clip & { masks?: Mask[] }).masks ?? [];
  return { doc, session, input, element, pointer, commits, maskMode, masks, invalidations };
}

describe("CanvasEditInput mask mode (Batch 73)", () => {
  afterEach(() => {
    for (const detach of detaches.splice(0)) detach();
    document.body.replaceChildren();
  });

  it("enters on the one selected visual clip; leaves when the selection changes", () => {
    const s = setup();
    s.session.selection.set(selectClips(["s"]));
    expect(s.input.enterMaskMode("s")).toBe(true);
    const scene = s.input.scene();
    expect(scene.mask?.masks[0]?.box.length).toBe(8);
    // The transform box gives way to the mask handles.
    expect(scene.box).toBeNull();
    s.session.selection.set(selectClips([]));
    expect(s.maskMode.getState().target).toBeNull();
  });

  it("a drag edits live masks (no commit) and commits one command on release; Esc drops it", () => {
    const s = setup();
    s.session.selection.set(selectClips(["s"]));
    s.input.enterMaskMode("s");
    s.pointer("pointerdown", 500, 300);
    for (let i = 1; i <= 4; i++) s.pointer("pointermove", 500 + 25 * i, 300 + 5 * i);
    expect(s.commits).not.toHaveBeenCalled();
    expect(s.input.maskEdits?.get("s")?.[0]?.shape).toMatchObject({ w: 500, h: 220 });
    expect(s.invalidations).toContain("preview");
    s.pointer("pointerup", 600, 320);
    expect(s.commits).toHaveBeenCalledTimes(1);
    expect(s.commits.mock.calls[0]?.[0].id).toBe("clip.mask.edit");
    expect(s.masks()[0]?.shape).toMatchObject({ w: 500, h: 220 });
    expect(s.input.maskEdits).toBeNull();
    // One undo step.
    s.doc.undo();
    expect(s.masks()[0]?.shape).toMatchObject({ w: 400, h: 200 });
    s.pointer("pointerdown", 300, 200);
    s.pointer("pointermove", 350, 250);
    expect(s.input.cancel()).toBe(true);
    s.pointer("pointerup", 350, 250);
    expect(s.commits).toHaveBeenCalledTimes(1);
    expect(s.masks()[0]?.shape).toMatchObject({ x: 100, y: 100 });
  });

  it("a drag on the feather diamond of a feather-0 mask sets the feather (it is not the east box handle)", () => {
    const s = setup();
    s.session.selection.set(selectClips(["s"]));
    s.input.enterMaskMode("s");
    // 0.5 device px per project px: the diamond is rotateZone / 0.5 project px right of the box (x 100, w 400).
    const featherX = 500 + theme.gizmo.rotateZone / 0.5;
    const diamond = s.input.scene().mask?.masks[0]?.feather;
    expect(diamond?.x).toBeCloseTo(featherX, 6);
    expect(diamond?.y).toBeCloseTo(200, 6);
    s.pointer("pointerdown", featherX, 200);
    for (let i = 1; i <= 4; i++) s.pointer("pointermove", featherX + 10 * i, 200);
    s.pointer("pointerup", featherX + 40, 200);
    expect(s.commits).toHaveBeenCalledTimes(1);
    expect(s.commits.mock.calls[0]?.[0].id).toBe("clip.mask.edit");
    expect(s.masks()[0]).toMatchObject({ feather: 40, shape: { x: 100, y: 100, w: 400, h: 200 } });
  });

  it("outside mask mode a press on the mask is a normal canvas press", () => {
    const s = setup();
    s.session.selection.set(selectClips(["s"]));
    s.pointer("pointerdown", 500, 300);
    s.pointer("pointerup", 500, 300);
    expect(s.input.maskEdits).toBeNull();
    expect(s.commits).not.toHaveBeenCalled();
  });
});
