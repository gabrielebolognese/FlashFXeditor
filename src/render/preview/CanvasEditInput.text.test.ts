// Text layers on the canvas (spec §7.3, §7.7): the text box handles and inline editing's presses.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { makeProject, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { TextClip, TextStyle } from "../../core/document/types.js";
import { FrameScheduler } from "../../core/scheduler/FrameScheduler.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createLayoutStore } from "../../core/store/layoutStore.js";
import { selectClips } from "../../core/store/selection.js";
import { createSessionStore, setSelection } from "../../core/store/sessionStore.js";
import { readTheme } from "../../core/theme/theme.js";
import { DEFAULT_TEXT_STYLE } from "../../text/style.js";
import { newTextClip } from "../../timeline/edit/text.js";
import { approximateMeasurer, setTextMeasurer } from "../text/layoutCache.js";
import { CanvasEditInput, type CanvasTextEditing } from "./CanvasEditInput.js";

beforeAll(() => setTextMeasurer(approximateMeasurer));
afterAll(() => setTextMeasurer(null));

const TOKENS: Record<string, string> = { "--gizmo-handle-hit": "12px", "--gizmo-rotate-zone": "16px", "--gizmo-min-edge": "28px", "--canvas-drag-threshold": "4px", "--canvas-snap-threshold": "6px" };
const theme = readTheme((name) => TOKENS[name] ?? name).theme;
const style = (patch: Partial<TextStyle> = {}): TextStyle => ({ ...structuredClone(DEFAULT_TEXT_STYLE), fontSize: 100, lineHeight: 1.2, ...patch });
const detaches: (() => void)[] = [];

/** "ab cd" (275 x 120 px) centered on the frame, from (402.5, 900) to (677.5, 1020), selected. */
function setup() {
  const p = makeProject();
  p.tracks = [makeTrack("v1"), makeTrack("a1", "audio")];
  const session = createSessionStore();
  const doc = new DocumentStore(withClips(p, [newTextClip({ id: "t", trackId: "v1", start: 0, duration: 30, value: "ab cd", style: style() })]), { session, validate: true });
  setSelection(session, selectClips(["t"]));
  let editing: string | null = null;
  const editor: CanvasTextEditing & { calls: string[] } = {
    calls: [],
    get editing() {
      return editing;
    },
    begin: vi.fn((clipId: string) => {
      editing = clipId;
      return true;
    }),
    end: vi.fn(() => {
      const was = editing !== null;
      editing = null;
      return was;
    }),
    contains: (point) => point.x >= 402.5 && point.x <= 677.5 && point.y >= 900 && point.y <= 1020,
    press: vi.fn(),
    drag: vi.fn(),
    release: vi.fn(),
    scene: () => ({ caret: [{ x: 500, y: 910 }, { x: 500, y: 1010 }], underline: [] }),
  };
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
    commit: (command) => doc.dispatch(command),
    onDragStart: () => undefined,
    onContextMenu: () => undefined,
    textEditor: editor,
  });
  const element = document.createElement("canvas");
  element.getBoundingClientRect = () => ({ left: 100, top: 50, right: 700, bottom: 1050, width: 600, height: 1000, x: 100, y: 50, toJSON: () => null });
  element.setPointerCapture = () => undefined;
  document.body.append(element);
  detaches.push(input.attach(element));
  element.dispatchEvent(new PointerEvent("pointerenter"));
  const client = (x: number, y: number) => ({ clientX: 100 + 10 + 0.5 * x, clientY: 50 + 20 + 0.5 * y });
  const pointer = (type: string, x: number, y: number, init: PointerEventInit = {}) => element.dispatchEvent(new PointerEvent(type, { ...client(x, y), pointerId: 1, button: 0, bubbles: true, cancelable: true, ...init }));
  const drag = (from: [number, number], to: [number, number]) => {
    pointer("pointerdown", from[0], from[1]);
    for (let i = 1; i <= 4; i++) pointer("pointermove", from[0] + ((to[0] - from[0]) * i) / 4, from[1] + ((to[1] - from[1]) * i) / 4);
    pointer("pointerup", to[0], to[1]);
  };
  const clip = () => doc.getState().clips.t as TextClip;
  return { doc, session, input, element, editor, pointer, drag, clip, setEditing: (id: string | null) => (editing = id) };
}

describe("text layers on the canvas", () => {
  afterEach(() => {
    for (const detach of detaches.splice(0)) detach();
    document.body.replaceChildren();
  });

  it("shows a text box with corner and side handles only", () => {
    const { input, pointer, clip } = setup();
    expect(input.scene().textBox).toBe(true);
    // The bottom handle (540, 1020) is not one: a press there moves the text.
    pointer("pointerdown", 540, 1020);
    for (let i = 1; i <= 4; i++) pointer("pointermove", 540, 1020 + 10 * i);
    pointer("pointerup", 540, 1060);
    expect(clip().style.fontSize).toBe(100);
    expect(clip().transform.y).toBe(40);
  });

  it("sizes the font from a corner handle, live, then one command", () => {
    const { clip, doc, input, pointer } = setup();
    pointer("pointerdown", 677.5, 1020);
    for (let i = 1; i <= 4; i++) pointer("pointermove", 677.5 + (137.5 * i) / 4, 1020 + (60 * i) / 4);
    expect(input.texts?.get("t")?.style.fontSize).toBe(150);
    expect(clip().style.fontSize).toBe(100);
    pointer("pointerup", 815, 1080);
    expect(clip().style.fontSize).toBe(150);
    expect(clip().transform.scale).toBe(1);
    expect(doc.history.getState().undoLabel).toBe("Resize text");
    expect(input.texts).toBeNull();
  });

  it("sets the box width from a side handle, the text reflowing", () => {
    const { drag, clip, doc } = setup();
    drag([677.5, 960], [402.5 + 150, 960]);
    expect(clip().text.box).toEqual({ mode: "fixed", width: 150 });
    expect(doc.history.getState().undoLabel).toBe("Change text box width");
  });

  it("snaps a side handle's edge to the frame's edge (Batch 46)", () => {
    const { drag, clip, session } = setup();
    session.state.set((state) => ({ ...state, snap: true }));
    // 5 px short of the frame's right edge (1080): the edge snaps there, the left edge stays at 402.5.
    drag([677.5, 960], [1075, 960]);
    const box = clip().text.box;
    expect(box.mode).toBe("fixed");
    expect(Math.abs((box.mode === "fixed" ? box.width : 0) - (1080 - 402.5))).toBeLessThanOrEqual(0.5);
  });

  it("edits text inline on a double-click, the caret where clicked", () => {
    const { element, editor, session } = setup();
    element.dispatchEvent(new MouseEvent("dblclick", { ...{ clientX: 110 + 0.5 * 460, clientY: 70 + 0.5 * 960 }, button: 0, bubbles: true }));
    expect(editor.begin).toHaveBeenCalledWith("t", { x: 460, y: 960 });
    const selection = session.selection.getState();
    expect(selection.kind === "clips" && [...selection.clipIds]).toEqual(["t"]);
  });

  it("while editing: a press on the text places the caret, a press elsewhere commits first", () => {
    const { pointer, editor, setEditing, input } = setup();
    setEditing("t");
    expect(input.scene()).toMatchObject({ box: null, textBox: false, text: { caret: [{ x: 500, y: 910 }, { x: 500, y: 1010 }] } });
    pointer("pointerdown", 500, 960, { shiftKey: true });
    pointer("pointermove", 600, 960);
    pointer("pointerup", 600, 960);
    expect(editor.press).toHaveBeenCalledWith({ x: 500, y: 960 }, true);
    expect(editor.drag).toHaveBeenCalledWith({ x: 600, y: 960 });
    expect(editor.release).toHaveBeenCalled();
    expect(editor.end).not.toHaveBeenCalled();
    pointer("pointerdown", 100, 100);
    pointer("pointerup", 100, 100);
    expect(editor.end).toHaveBeenCalledWith(true);
    expect(input.scene().textBox).toBe(false);
  });
});
