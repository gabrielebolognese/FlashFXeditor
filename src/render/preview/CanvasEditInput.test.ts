import { afterEach, describe, expect, it, vi } from "vitest";
import { makeProject, makeSolidClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { Clip, SolidClip, Track, Transform } from "../../core/document/types.js";
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
  "--canvas-snap-threshold": "6px",
};
const theme = readTheme((name) => TOKENS[name] ?? name).theme;
const detaches: (() => void)[] = [];

const t = (fields: Partial<Transform> = {}): Transform => ({ ...IDENTITY_TRANSFORM, ...fields });

/**
 * V1..V3, a 100 x 100 solid on each, stacked at the frame center (540, 960) unless moved; A1 with a
 * linked partner of s1. Snapping is off unless `snap` (6 CSS px are 12 project px at this placement);
 * `tracks` sets fields of V1..V3 (locked, muted).
 */
function setup(transforms: Partial<Transform>[] = [{}, {}, {}], { snap = false, tracks = [] as Partial<Track>[] } = {}) {
  const p = makeProject();
  p.tracks = [...["v1", "v2", "v3"].map((id, i) => ({ ...makeTrack(id), ...tracks[i] })), makeTrack("a1", "audio")];
  const clips: Clip[] = transforms.map((fields, i) => ({ ...makeSolidClip({ id: `s${i + 1}`, trackId: `v${i + 1}`, start: 0, duration: 30 }), transform: t(fields) }));
  const session = createSessionStore();
  session.state.set((state) => ({ ...state, snap }));
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

  it("sizes a solid from a corner keeping the aspect, and per axis with Shift (its size, not its scale)", () => {
    const s = setup([{}, { x: -300 }, { x: 300 }]);
    const size = (id: string) => (s.doc.getState().clips[id] as SolidClip).size;
    s.click(540, 960);
    expect(s.selected()).toEqual(["s1"]);
    // The se handle at (590, 1010) dragged to (640, 1060): 1.5 times the size from the nw corner.
    s.pointer("pointerdown", 590, 1010);
    s.pointer("pointermove", 615, 1035);
    s.pointer("pointermove", 640, 1060);
    expect(s.input.solids?.get("s1")?.size).toEqual({ w: 150, h: 150 });
    expect(s.input.scene().readout?.text).toBe("150 × 150 px");
    s.pointer("pointerup", 640, 1060);
    expect(size("s1")).toEqual({ w: 150, h: 150 });
    expect(s.transform("s1")).toEqual(t({ x: 25, y: 25 }));
    expect(s.doc.history.getState().undoLabel).toBe("Resize shape");
    s.drag([640, 1060], [740, 1060], { shiftKey: true });
    expect(size("s1")).toEqual({ w: 250, h: 150 });
    expect(s.transform("s1")).toEqual(t({ x: 75, y: 25 }));
    expect(s.commits).toHaveBeenCalledTimes(2);
    expect(s.input.solids).toBeNull();
  });

  it("scales several layers as a group (solids too)", () => {
    const s = setup([{}, { x: -300 }, { x: 300 }]);
    s.click(540, 960);
    s.click(240, 960, { shiftKey: true });
    expect(s.selected()).toEqual(["s1", "s2"]);
    // The group box (190..590 x 910..1010): its se handle dragged 50 px right and down, projected on the diagonal.
    s.drag([590, 1010], [640, 1060]);
    expect(s.transform("s1").scale).toBeCloseTo(195 / 170, 9);
    expect((s.doc.getState().clips.s1 as SolidClip).size).toEqual({ w: 100, h: 100 });
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

describe("CanvasEditInput snapping and smart guides (spec §7.4)", () => {
  afterEach(() => {
    for (const detach of detaches.splice(0)) detach();
    document.body.replaceChildren();
  });

  const key = (type: "keydown" | "keyup", init: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init });
    window.dispatchEvent(event);
    return event;
  };

  it("snaps a moved layer to the frame center on both axes with crossing guides", () => {
    const s = setup([{ x: -300 }, { y: 400 }, { x: 300 }], { snap: true });
    s.pointer("pointerdown", 540, 1360);
    s.pointer("pointermove", 545, 1100);
    s.pointer("pointermove", 545, 963);
    expect(s.input.transforms?.get("s2")).toMatchObject({ x: 0, y: 0 });
    const lines = s.input.scene().guides?.lines;
    expect(lines).toContainEqual({ vertical: true, at: 540, from: 0, to: 1920 });
    expect(lines).toContainEqual({ vertical: false, at: 960, from: 0, to: 1080 });
    s.pointer("pointerup", 545, 963);
    expect(s.transform("s2")).toMatchObject({ x: 0, y: 0 });
    expect(s.input.scene().guides).toBeNull();
  });

  it("snaps to another layer's edge and shows the distance between them", () => {
    const s = setup([{ x: -300 }, { y: 400 }, { x: 300 }], { snap: true });
    s.pointer("pointerdown", 540, 1360);
    s.pointer("pointermove", 244, 1360);
    expect(s.input.transforms?.get("s2")).toMatchObject({ x: -300, y: 400 });
    const guides = s.input.scene().guides;
    expect(guides?.lines).toContainEqual({ vertical: true, at: 190, from: 910, to: 1410 });
    expect(guides?.spans).toEqual([{ vertical: true, at: 190, from: 1010, to: 1310, distance: 300 }]);
  });

  it("snaps the middle of three layers in a column to equal spacing", () => {
    const s = setup([{ y: -400 }, { y: 200 }, { y: 340 }], { snap: true });
    s.pointer("pointerdown", 540, 1160);
    s.pointer("pointermove", 540, 935);
    expect(s.input.transforms?.get("s2")).toMatchObject({ x: 0, y: -30 });
    const spans = s.input.scene().guides?.spans;
    expect(spans).toContainEqual({ vertical: true, at: 540, from: 610, to: 880, distance: 270 });
    expect(spans).toContainEqual({ vertical: true, at: 540, from: 980, to: 1250, distance: 270 });
  });

  it("snaps the dragged edge of a scale", () => {
    const s = setup([{ x: -300 }, {}, { x: 300 }], { snap: true });
    s.click(540, 960);
    expect(s.selected()).toEqual(["s2"]);
    // The w handle at x 490 dragged to 296: the left edge snaps to s1's right edge (290).
    s.pointer("pointerdown", 490, 960);
    s.pointer("pointermove", 400, 960);
    s.pointer("pointermove", 296, 960);
    expect(s.input.scene().guides?.lines).toContainEqual({ vertical: true, at: 290, from: 910, to: 1010 });
    s.pointer("pointerup", 296, 960);
    expect((s.doc.getState().clips.s2 as SolidClip).size).toEqual({ w: 300, h: 100 });
    expect(s.transform("s2").scale).toBe(1);
    expect(s.transform("s2").x).toBeCloseTo(-100, 9);
  });

  it("inverts snapping while S is held during a drag, without toggling the setting", () => {
    const s = setup([{ x: -300 }, { y: 400 }, { x: 300 }], { snap: true });
    s.pointer("pointerdown", 540, 1360);
    s.pointer("pointermove", 244, 1360);
    expect(s.input.transforms?.get("s2")?.x).toBe(-300);
    const down = key("keydown", { key: "s", code: "KeyS" });
    expect(down.defaultPrevented).toBe(true);
    expect(s.input.transforms?.get("s2")?.x).toBe(-296);
    expect(s.input.scene().guides).toBeNull();
    key("keyup", { key: "s", code: "KeyS" });
    expect(s.input.transforms?.get("s2")?.x).toBe(-300);
    expect(s.session.state.getState().snap).toBe(true);
    // Snapping off: a held S turns it on.
    s.pointer("pointerup", 244, 1360);
    s.session.state.set((state) => ({ ...state, snap: false }));
    s.pointer("pointerdown", 240, 1360);
    s.pointer("pointermove", 236, 1300);
    s.pointer("pointermove", 244, 1360);
    expect(s.input.transforms?.get("s2")?.x).toBe(-296);
    key("keydown", { key: "s", code: "KeyS" });
    expect(s.input.transforms?.get("s2")?.x).toBe(-300);
  });

  it("shows the distances to the nearest layers and the frame edges with Alt (no drag)", () => {
    const s = setup([{ x: -300 }, {}, { x: 300 }]);
    setSelection(s.session, selectClips(["s2"]));
    expect(s.input.scene().guides).toBeNull();
    key("keydown", { key: "Alt", altKey: true });
    expect(s.input.scene().guides?.spans).toEqual([
      { vertical: false, at: 960, from: 290, to: 490, distance: 200 },
      { vertical: false, at: 960, from: 590, to: 790, distance: 200 },
      { vertical: true, at: 540, from: 0, to: 910, distance: 910 },
      { vertical: true, at: 540, from: 1010, to: 1920, distance: 910 },
    ]);
    // Smart guides off: no measure mode.
    s.session.state.set((state) => ({ ...state, preview: { ...state.preview, guides: false } }));
    expect(s.input.scene().guides).toBeNull();
    key("keyup", { key: "Alt" });
  });

  it("snaps to and measures layers on locked tracks (in the picture), not muted ones", () => {
    // s1 on a locked V1: not selectable, still composited, so a snap target.
    const s = setup([{ x: -300 }, { y: 400 }, { x: 300 }], { snap: true, tracks: [{ locked: true }] });
    s.pointer("pointerdown", 540, 1360);
    s.pointer("pointermove", 244, 1360);
    expect(s.input.transforms?.get("s2")).toMatchObject({ x: -300, y: 400 });
    const guides = s.input.scene().guides;
    expect(guides?.lines).toContainEqual({ vertical: true, at: 190, from: 910, to: 1410 });
    expect(guides?.spans).toEqual([{ vertical: true, at: 190, from: 1010, to: 1310, distance: 300 }]);
    s.pointer("pointerup", 244, 1360);
    expect(s.transform("s1")).toMatchObject({ x: -300, y: 0 });
    // Alt measures to the locked layer too.
    const m = setup([{ x: -300 }, {}, { x: 300 }], { tracks: [{ locked: true }] });
    setSelection(m.session, selectClips(["s2"]));
    key("keydown", { key: "Alt", altKey: true });
    expect(m.input.scene().guides?.spans).toContainEqual({ vertical: false, at: 960, from: 290, to: 490, distance: 200 });
    key("keyup", { key: "Alt" });
    // A muted V1 is out of the picture: no snap.
    const u = setup([{ x: -300 }, { y: 400 }, { x: 300 }], { snap: true, tracks: [{ muted: true }] });
    u.pointer("pointerdown", 540, 1360);
    u.pointer("pointermove", 244, 1360);
    expect(u.input.transforms?.get("s2")).toMatchObject({ x: -296, y: 400 });
    expect(u.input.scene().guides).toEqual({ lines: [], spans: [] });
    u.pointer("pointerup", 244, 1360);
  });

  it("rebuilds the snap candidates only when the other layers change", () => {
    const s = setup([{ x: -300 }, { y: 400 }, { x: 300 }], { snap: true });
    s.drag([540, 1360], [600, 1300]);
    expect(s.input.snapStats.rebuilds).toBe(1);
    expect(s.input.snapStats.queries).toBe(4);
    // The same layer again: the others did not change.
    s.drag([600, 1300], [700, 1200]);
    expect(s.input.snapStats.rebuilds).toBe(1);
    // Another layer: s2 becomes a target, s1 is held.
    s.drag([240, 960], [260, 1000]);
    expect(s.input.snapStats.rebuilds).toBe(2);
  });
});
