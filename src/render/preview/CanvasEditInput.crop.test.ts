import { afterEach, describe, expect, it, vi } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeSolidClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { ClipId, Crop, MediaClip } from "../../core/document/types.js";
import { FrameScheduler } from "../../core/scheduler/FrameScheduler.js";
import { createStore } from "../../core/store/createStore.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createLayoutStore } from "../../core/store/layoutStore.js";
import { createSessionStore } from "../../core/store/sessionStore.js";
import { readTheme } from "../../core/theme/theme.js";
import { NO_CROP } from "../../timeline/edit/crop.js";
import { CanvasEditInput } from "./CanvasEditInput.js";
import { NO_CROP_MODE, type CropModeState } from "./cropGizmo.js";

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

/**
 * A 1920 x 1080 video `c` on V1 at scale 0.5, centered in the 1080 x 1920 frame: shown 960 x 540 from
 * (60, 690) to (1020, 1230); a solid `s` on V2 off to the side. Snapping off unless `snap` (6 CSS px are
 * 12 project px at this placement).
 */
function setup({ snap = false } = {}) {
  const p = makeProject();
  p.media.m = { ...makeMedia("m", "video"), width: 1920, height: 1080 };
  p.tracks = [makeTrack("v1"), makeTrack("v2"), makeTrack("a1", "audio")];
  const video: MediaClip = { ...makeMediaClip(p, { id: "c", trackId: "v1", start: 0, duration: 30, mediaId: "m" }), transform: { x: 0, y: 0, scale: 0.5, rotation: 0, anchor: { x: 0.5, y: 0.5 }, flipH: false, flipV: false } };
  const solid = { ...makeSolidClip({ id: "s", trackId: "v2", start: 0, duration: 30 }), transform: { x: 0, y: -700, scale: 1, rotation: 0, anchor: { x: 0.5, y: 0.5 }, flipH: false, flipV: false } };
  const session = createSessionStore();
  session.state.set((state) => ({ ...state, snap }));
  const doc = new DocumentStore(withClips(p, [video, solid]), { session, validate: true });
  const commits = vi.fn((command: Parameters<DocumentStore["dispatch"]>[0]) => doc.dispatch(command));
  let live: ReadonlyMap<ClipId, Crop> | null = null;
  const writes: (ReadonlyMap<ClipId, Crop> | null)[] = [];
  const cropMode = createStore<CropModeState>(NO_CROP_MODE);
  const input = new CanvasEditInput({
    document: doc,
    session,
    scheduler: new FrameScheduler(() => 0, () => undefined),
    theme: { theme, subscribe: () => () => undefined },
    layout: createLayoutStore(null),
    platform: "other",
    // 0.5 device px per project px, the frame's top-left at canvas (10, 20); dpr 1.
    placement: () => ({ transform: [0.5, 0, 0, 0.5, 10, 20], width: 600, height: 1000, dpr: 1 }),
    panning: () => false,
    commit: commits,
    onDragStart: () => undefined,
    onContextMenu: () => undefined,
    crops: {
      read: () => live,
      write: (crops) => {
        live = crops;
        writes.push(crops);
      },
    },
    cropMode,
  });
  const element = document.createElement("canvas");
  element.getBoundingClientRect = () => ({ left: 100, top: 50, right: 700, bottom: 1050, width: 600, height: 1000, x: 100, y: 50, toJSON: () => null });
  element.setPointerCapture = () => undefined;
  document.body.append(element);
  detaches.push(input.attach(element));
  element.dispatchEvent(new PointerEvent("pointerenter"));
  const client = (x: number, y: number) => ({ clientX: 100 + 10 + 0.5 * x, clientY: 50 + 20 + 0.5 * y });
  const pointer = (type: string, x: number, y: number, init: PointerEventInit = {}) => element.dispatchEvent(new PointerEvent(type, { ...client(x, y), pointerId: 1, button: 0, bubbles: true, cancelable: true, ...init }));
  const click = (x: number, y: number, init: PointerEventInit = {}) => {
    pointer("pointerdown", x, y, init);
    pointer("pointerup", x, y, init);
  };
  const doubleClick = (x: number, y: number) => {
    click(x, y);
    click(x, y);
    element.dispatchEvent(new MouseEvent("dblclick", { ...client(x, y), button: 0, bubbles: true }));
  };
  /** Press at `from`, move in 4 steps to `to` (not released). */
  const press = (from: [number, number], to: [number, number], init: PointerEventInit = {}) => {
    pointer("pointerdown", from[0], from[1], init);
    for (let i = 1; i <= 4; i++) pointer("pointermove", from[0] + ((to[0] - from[0]) * i) / 4, from[1] + ((to[1] - from[1]) * i) / 4, init);
  };
  const crop = () => (doc.getState().clips.c as MediaClip).crop;
  const selected = () => {
    const selection = session.selection.getState();
    return selection.kind === "clips" ? [...selection.clipIds].sort() : [];
  };
  return { doc, session, input, element, pointer, click, doubleClick, press, crop, selected, commits, cropMode, live: () => live, writes };
}

describe("CanvasEditInput crop mode (spec §7.3, Batch 26)", () => {
  afterEach(() => {
    for (const detach of detaches.splice(0)) detach();
    document.body.replaceChildren();
  });

  it("enters crop mode with a double-click on a video layer, leaves it with another; solids have none", () => {
    const s = setup();
    s.doubleClick(540, 960);
    expect(s.cropMode.getState().target).toBe("c");
    expect(s.selected()).toEqual(["c"]);
    const scene = s.input.scene();
    expect(scene.crop?.media).toEqual([
      { x: 60, y: 690 },
      { x: 1020, y: 690 },
      { x: 1020, y: 1230 },
      { x: 60, y: 1230 },
    ]);
    expect(scene.anchor).toBeNull();
    s.doubleClick(540, 960);
    expect(s.cropMode.getState().target).toBeNull();
    expect(s.input.scene().crop).toBeNull();
    s.doubleClick(540, 260);
    expect(s.selected()).toEqual(["s"]);
    expect(s.cropMode.getState().target).toBeNull();
  });

  it("crops live while a handle is dragged, then commits one clip.crop step on release", () => {
    const s = setup();
    s.doubleClick(540, 960);
    // The west handle (60, 960) to x = 300: 480 media px off the left.
    s.press([60, 960], [300, 960]);
    expect(s.live()?.get("c")?.left).toBeCloseTo(0.25, 9);
    expect(s.crop()).toEqual(NO_CROP);
    expect(s.input.layers().find((layer) => layer.clipId === "c")?.quad[0]).toEqual({ x: 300, y: 690 });
    expect(s.input.scene().readout?.text).toBe("L 480 · 1440 × 1080");
    expect(s.input.transforms).toBeNull();
    s.pointer("pointerup", 300, 960);
    expect(s.commits).toHaveBeenCalledTimes(1);
    expect(s.commits.mock.calls[0]?.[0].id).toBe("clip.crop");
    expect(s.crop().left).toBeCloseTo(0.25, 9);
    expect(s.live()).toBeNull();
    expect(s.doc.history.getState().undoLabel).toBe("Crop layer");
    s.doc.undo();
    expect(s.crop()).toEqual(NO_CROP);
    expect(s.cropMode.getState().target).toBe("c");
  });

  it("drops a crop drag with no change on Esc (cancel), and leaves crop mode next", () => {
    const s = setup();
    s.doubleClick(540, 960);
    s.press([60, 960], [300, 960]);
    expect(s.input.cancel()).toBe(true);
    expect(s.live()).toBeNull();
    expect(s.crop()).toEqual(NO_CROP);
    expect(s.commits).not.toHaveBeenCalled();
    expect(s.input.exitCropMode()).toBe(true);
    expect(s.input.exitCropMode()).toBe(false);
  });

  it("snaps crop edges to the frame's thirds while snapping is on", () => {
    const s = setup({ snap: true });
    s.doubleClick(540, 960);
    // x = 355 is 5 px from the first third (360): the edge lands on it.
    s.press([60, 960], [355, 960]);
    expect(s.live()?.get("c")?.left).toBeCloseTo(600 / 1920, 9);
    expect(s.input.scene().guides?.lines).toContainEqual({ vertical: true, at: 360, from: 0, to: 1920 });
    s.pointer("pointerup", 355, 960);
    expect(s.crop().left).toBeCloseTo(600 / 1920, 9);
    // Snapping off: where the pointer is (once past the 4 px dead zone).
    s.session.state.set((state) => ({ ...state, snap: false }));
    s.press([360, 960], [362, 960]);
    s.pointer("pointermove", 365, 960);
    expect(s.live()).toBeNull();
    s.pointer("pointermove", 370, 960);
    expect(s.live()?.get("c")?.left).toBeCloseTo(620 / 1920, 9);
    s.pointer("pointerup", 370, 960);
  });

  it("keeps the aspect with Shift, or with the lock (Shift then frees it)", () => {
    const s = setup();
    s.doubleClick(540, 960);
    const aspect = (crop: Crop | undefined) => (crop ? (1 - crop.left - crop.right) / (1 - crop.top - crop.bottom) : Number.NaN);
    // The south-east corner up and well left: free, the corner follows the pointer.
    s.press([1020, 1230], [780, 1180]);
    expect(aspect(s.live()?.get("c"))).not.toBeCloseTo(1, 3);
    s.input.cancel();
    s.press([1020, 1230], [780, 1180], { shiftKey: true });
    expect(aspect(s.live()?.get("c"))).toBeCloseTo(1, 9);
    s.input.cancel();
    s.cropMode.set((state) => ({ ...state, aspectLock: true }));
    s.press([1020, 1230], [780, 1180]);
    expect(aspect(s.live()?.get("c"))).toBeCloseTo(1, 9);
    s.input.cancel();
    s.press([1020, 1230], [780, 1180], { shiftKey: true });
    expect(aspect(s.live()?.get("c"))).not.toBeCloseTo(1, 3);
  });

  it("has crop handles instead of scale and rotate zones; a body drag still moves the layer", () => {
    const s = setup();
    s.click(540, 960);
    // Outside the north-west corner: the rotate zone, until crop mode.
    s.pointer("pointermove", 40, 670);
    expect(s.input.cursor()).not.toBe("");
    s.doubleClick(540, 960);
    s.pointer("pointermove", 40, 670);
    expect(s.input.cursor()).toBe("");
    s.pointer("pointermove", 62, 692);
    expect(s.input.cursor()).toBe("nwse-resize");
    s.press([540, 960], [600, 960]);
    s.pointer("pointerup", 600, 960);
    expect((s.doc.getState().clips.c as MediaClip).transform.x).toBe(60);
    expect(s.crop()).toEqual(NO_CROP);
    expect(s.cropMode.getState().target).toBe("c");
  });

  it("ends crop mode when the selection moves on or the clip goes away", () => {
    const s = setup();
    s.doubleClick(540, 960);
    s.click(540, 260);
    expect(s.cropMode.getState().target).toBeNull();
    expect(s.input.enterCropMode("s")).toBe(false);
    s.doubleClick(540, 960);
    s.doc.dispatch({
      id: "test.remove",
      label: "Remove",
      affects: ["clips"],
      run(draft) {
        delete draft.clips.c;
        const track = draft.tracks.find((candidate) => candidate.id === "v1");
        if (track) track.clipIds = track.clipIds.filter((id) => id !== "c");
      },
    });
    expect(s.cropMode.getState().target).toBeNull();
  });
});
