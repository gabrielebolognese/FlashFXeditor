import { afterEach, describe, expect, it, vi } from "vitest";
import { makeProject, makeSolidClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { Clip, SolidClip, Transform } from "../../core/document/types.js";
import { FrameScheduler } from "../../core/scheduler/FrameScheduler.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createLayoutStore } from "../../core/store/layoutStore.js";
import { selectClips } from "../../core/store/selection.js";
import { createSessionStore, setSelection } from "../../core/store/sessionStore.js";
import { readTheme } from "../../core/theme/theme.js";
import { IDENTITY_TRANSFORM } from "../../timeline/edit/transform.js";
import { CanvasEditInput } from "./CanvasEditInput.js";

const TOKENS: Record<string, string> = {
  "--gizmo-line-width": "1px",
  "--gizmo-handle-size": "8px",
  "--gizmo-handle-hit": "12px",
  "--gizmo-rotate-zone": "16px",
  "--gizmo-anchor-size": "12px",
  "--gizmo-snap-width": "2px",
  "--gizmo-min-edge": "28px",
  "--canvas-drag-threshold": "4px",
};
const theme = readTheme((name) => TOKENS[name] ?? name).theme;
const detaches: (() => void)[] = [];

const t = (fields: Partial<Transform> = {}): Transform => ({ ...IDENTITY_TRANSFORM, ...fields });

/** V1..V3, a 100 x 100 solid on each, stacked at the frame center (540, 960) unless moved; A1 with a linked partner of s1. */
function setup(transforms: Partial<Transform>[] = [{}, {}, {}]) {
  const p = makeProject();
  p.tracks = [makeTrack("v1"), makeTrack("v2"), makeTrack("v3"), makeTrack("a1", "audio")];
  const clips: Clip[] = transforms.map((fields, i) => ({ ...makeSolidClip({ id: `s${i + 1}`, trackId: `v${i + 1}`, start: 0, duration: 30 }), transform: t(fields) }));
  const session = createSessionStore();
  const doc = new DocumentStore(withClips(p, clips), { session, validate: true });
  const commits = vi.fn((command: Parameters<DocumentStore["dispatch"]>[0]) => doc.dispatch(command));
  const onDragStart = vi.fn();
  const onContextMenu = vi.fn();
  const scheduler = new FrameScheduler(() => 0, () => undefined);
  const input = new CanvasEditInput({
    document: doc,
    session,
    scheduler,
    theme: { theme, subscribe: () => () => undefined },
    layout: createLayoutStore(null),
    platform: "other",
    // 0.5 device px per project px, the frame's top-left at canvas (10, 20); dpr 1.
    placement: () => ({ transform: [0.5, 0, 0, 0.5, 10, 20], width: 600, height: 1000, dpr: 1 }),
    panning: () => false,
    commit: commits,
    onDragStart,
    onContextMenu,
  });
  const element = document.createElement("canvas");
  element.getBoundingClientRect = () => ({ left: 100, top: 50, right: 700, bottom: 1050, width: 600, height: 1000, x: 100, y: 50, toJSON: () => null });
  element.setPointerCapture = () => undefined;
  document.body.append(element);
  detaches.push(input.attach(element));
  element.dispatchEvent(new PointerEvent("pointerenter"));
  /** Client point of project point (x, y). */
  const client = (x: number, y: number) => ({ clientX: 100 + 10 + 0.5 * x, clientY: 50 + 20 + 0.5 * y });
  const pointer = (type: string, x: number, y: number, init: PointerEventInit = {}) => element.dispatchEvent(new PointerEvent(type, { ...client(x, y), pointerId: 1, button: 0, bubbles: true, cancelable: true, ...init }));
  const click = (x: number, y: number, init: PointerEventInit = {}) => {
    pointer("pointerdown", x, y, init);
    pointer("pointerup", x, y, init);
  };
  const drag = (from: [number, number], to: [number, number], init: PointerEventInit = {}) => {
    pointer("pointerdown", from[0], from[1], init);
    const steps = 4;
    for (let i = 1; i <= steps; i++) pointer("pointermove", from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps, init);
    pointer("pointerup", to[0], to[1], init);
  };
  const selected = () => {
    const selection = session.selection.getState();
    return selection.kind === "clips" ? [...selection.clipIds].sort() : [];
  };
  const transform = (id: string) => (doc.getState().clips[id] as SolidClip).transform;
  return { doc, session, input, element, pointer, click, drag, selected, transform, commits, onDragStart, onContextMenu };
}

describe("CanvasEditInput (spec §7.2, §7.3)", () => {
  afterEach(() => {
    for (const detach of detaches.splice(0)) detach();
    document.body.replaceChildren();
  });

  it("selects the top layer under a click, toggles with Shift and clears on empty space", () => {
    const s = setup([{ x: -300 }, {}, { x: 300 }]);
    s.click(540, 960);
    expect(s.selected()).toEqual(["s2"]);
    s.click(240, 960, { shiftKey: true });
    expect(s.selected()).toEqual(["s1", "s2"]);
    s.click(240, 960, { shiftKey: true });
    expect(s.selected()).toEqual(["s2"]);
    s.click(540, 300);
    expect(s.selected()).toEqual([]);
    expect(s.commits).not.toHaveBeenCalled();
  });

  it("cycles through stacked layers with Alt+click", () => {
    const s = setup();
    s.click(540, 960);
    expect(s.selected()).toEqual(["s3"]);
    s.click(540, 960, { altKey: true });
    expect(s.selected()).toEqual(["s2"]);
    s.click(540, 960, { altKey: true });
    expect(s.selected()).toEqual(["s1"]);
    s.click(540, 960, { altKey: true });
    expect(s.selected()).toEqual(["s3"]);
  });

  it("moves the selection with one command on release, live through ephemeral transforms", () => {
    const s = setup([{ x: -300 }, {}, { x: 300 }]);
    s.pointer("pointerdown", 540, 960);
    s.pointer("pointermove", 560, 960);
    s.pointer("pointermove", 640, 1000);
    expect(s.input.transforms?.get("s2")).toMatchObject({ x: 100, y: 40 });
    expect(s.transform("s2").x).toBe(0);
    expect(s.onDragStart).toHaveBeenCalledTimes(1);
    s.pointer("pointerup", 640, 1000);
    expect(s.commits).toHaveBeenCalledTimes(1);
    expect(s.input.transforms).toBeNull();
    expect(s.transform("s2")).toMatchObject({ x: 100, y: 40 });
    expect(s.doc.history.getState().undoLabel).toBe("Move layer");
    s.doc.undo();
    expect(s.transform("s2").x).toBe(0);
  });

  it("scales from a corner keeping the aspect, and per axis with Shift", () => {
    const s = setup([{}, { x: -300 }, { x: 300 }]);
    s.click(540, 960);
    expect(s.selected()).toEqual(["s1"]);
    // The se handle at (590, 1010) dragged to (640, 1060): twice the size from the nw corner.
    s.drag([590, 1010], [640, 1060]);
    expect(s.transform("s1").scale).toBeCloseTo(1.5, 9);
    expect(s.transform("s1").scaleY).toBeUndefined();
    s.drag([640, 1060], [740, 1060], { shiftKey: true });
    expect(s.transform("s1").scale).toBeCloseTo(2.5, 9);
    expect(s.transform("s1").scaleY).toBeCloseTo(1.5, 9);
    expect(s.commits).toHaveBeenCalledTimes(2);
  });

  it("selects the layers a marquee intersects, once on release", () => {
    const s = setup([{ x: -300 }, {}, { x: 300 }]);
    const writes = vi.fn();
    s.session.selection.subscribe(writes);
    s.drag([100, 800], [600, 1100]);
    expect(s.selected()).toEqual(["s1", "s2"]);
    expect(writes).toHaveBeenCalledTimes(1);
    s.drag([700, 800], [900, 1100], { shiftKey: true });
    expect(s.selected()).toEqual(["s1", "s2", "s3"]);
  });

  it("cancels a gesture with no document change", () => {
    const s = setup();
    setSelection(s.session, selectClips(["s3"]));
    s.pointer("pointerdown", 540, 960);
    s.pointer("pointermove", 600, 960);
    expect(s.input.transforms).not.toBeNull();
    expect(s.input.cancel()).toBe(true);
    expect(s.input.transforms).toBeNull();
    s.pointer("pointerup", 600, 960);
    expect(s.commits).not.toHaveBeenCalled();
    expect(s.input.cancel()).toBe(false);
  });

  it("opens the context menu on a layer, selecting it first", () => {
    const s = setup([{ x: -300 }, {}, {}]);
    s.element.dispatchEvent(new MouseEvent("contextmenu", { clientX: 100 + 10 + 120, clientY: 50 + 20 + 480, bubbles: true, cancelable: true }));
    expect(s.selected()).toEqual(["s1"]);
    expect(s.onContextMenu).toHaveBeenCalledWith({ x: 230, y: 550 });
    s.element.dispatchEvent(new MouseEvent("contextmenu", { clientX: 100 + 10 + 10, clientY: 50 + 20 + 10, bubbles: true, cancelable: true }));
    expect(s.selected()).toEqual([]);
    expect(s.onContextMenu).toHaveBeenCalledTimes(1);
  });

  it("describes the gizmo for the overlay: outlines, group box, hover and readout", () => {
    const s = setup([{ x: -300 }, {}, { x: 300 }]);
    s.pointer("pointermove", 240, 960);
    expect(s.input.scene().hover?.[0]).toEqual({ x: 190, y: 910 });
    setSelection(s.session, selectClips(["s1", "s3"]));
    const scene = s.input.scene();
    expect(scene.outlines).toHaveLength(2);
    expect(scene.group).toBe(true);
    expect(scene.box?.[0]).toEqual({ x: 190, y: 910 });
    expect(scene.box?.[2]).toEqual({ x: 890, y: 1010 });
    s.pointer("pointerdown", 240, 960);
    s.pointer("pointermove", 260, 980);
    expect(s.input.scene().readout?.text).toBe("ΔX +20 · ΔY +20");
    s.pointer("pointerup", 260, 980);
    expect(s.transform("s1")).toMatchObject({ x: -280, y: 20 });
    expect(s.transform("s3")).toMatchObject({ x: 320, y: 20 });
  });
});
