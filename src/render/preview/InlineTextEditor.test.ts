import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { makeProject, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { Command } from "../../core/commands/command.js";
import type { TextClip, TextStyle, Transform } from "../../core/document/types.js";
import { FrameScheduler } from "../../core/scheduler/FrameScheduler.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { EMPTY_SELECTION, selectClips } from "../../core/store/selection.js";
import { createSessionStore, setPlayhead, setSelection } from "../../core/store/sessionStore.js";
import { readTheme } from "../../core/theme/theme.js";
import { DEFAULT_TEXT_STYLE } from "../../text/style.js";
import { newTextClip } from "../../timeline/edit/text.js";
import { IDENTITY_TRANSFORM } from "../../timeline/edit/transform.js";
import { approximateMeasurer, setTextMeasurer } from "../text/layoutCache.js";
import { InlineTextEditor, projectToText, textToProject } from "./InlineTextEditor.js";

// The approximate measurer: 55 px per character at 100 px, lines 120 px tall (line height 1.2).
beforeAll(() => setTextMeasurer(approximateMeasurer));
afterAll(() => setTextMeasurer(null));

const theme = readTheme((name) => ({ "--text-caret-blink": "0ms", "--text-selection": "gold", "--text-caret-width": "2px" })[name] ?? name).theme;
const style = (patch: Partial<TextStyle> = {}): TextStyle => ({ ...structuredClone(DEFAULT_TEXT_STYLE), fontSize: 100, lineHeight: 1.2, align: "left", verticalAnchor: "top", ...patch });
const mounts: (() => void)[] = [];

/** "ab\ncd" (110 x 240 px, left / top anchored) centered on the 1080 x 1920 frame at 0..90, selected, playhead 10. */
function setup(value = "ab\ncd") {
  const p = makeProject();
  p.tracks = [makeTrack("v1"), makeTrack("a1", "audio")];
  const session = createSessionStore();
  const doc = new DocumentStore(withClips(p, [newTextClip({ id: "t", trackId: "v1", start: 0, duration: 90, value, style: style() })]), { session, validate: true });
  setSelection(session, selectClips(["t"]));
  setPlayhead(session, 10);
  const commits = vi.fn((command: Command) => doc.dispatch(command));
  const editing = vi.fn();
  const keep = document.createElement("div");
  const editor = new InlineTextEditor({
    document: doc,
    session,
    scheduler: new FrameScheduler(() => 0, () => undefined),
    theme: { theme, subscribe: () => () => undefined },
    platform: "other",
    placement: () => ({ transform: [0.5, 0, 0, 0.5, 10, 20], width: 600, height: 1000, dpr: 1 }),
    textScale: () => 0.5,
    shown: (id) => {
      const clip = doc.getState().clips[id];
      return clip?.kind === "text" ? { text: clip.text, style: clip.style, transform: clip.transform } : null;
    },
    commit: commits,
    keeps: (target) => target instanceof Node && keep.contains(target),
    onEditing: editing,
  });
  const host = document.createElement("div");
  document.body.append(host, keep);
  mounts.push(editor.mount(host, "inline"));
  const textarea = editor.element as HTMLTextAreaElement;
  /** Types: the textarea's value and caret as the browser leaves them, then its input event. */
  const type = (next: string, caret = next.length) => {
    textarea.value = next;
    textarea.setSelectionRange(caret, caret);
    textarea.dispatchEvent(new Event("input"));
  };
  const key = (key: string, init: KeyboardEventInit = {}) => textarea.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }));
  const clip = () => doc.getState().clips.t as TextClip;
  return { doc, session, editor, textarea, type, key, clip, commits, editing, keep, host };
}

describe("InlineTextEditor (spec §7.7)", () => {
  afterEach(() => {
    for (const unmount of mounts.splice(0)) unmount();
    document.body.replaceChildren();
  });

  it("starts with the whole text selected in a focused, placed textarea of the textEditing scope", () => {
    const { editor, textarea, editing } = setup();
    expect(editor.begin("t", "all")).toBe(true);
    expect(editor.editing).toBe("t");
    expect(document.activeElement).toBe(textarea);
    expect(textarea.getAttribute("data-scope")).toBe("textEditing");
    expect(textarea.value).toBe("ab\ncd");
    expect([textarea.selectionStart, textarea.selectionEnd]).toEqual([0, 5]);
    expect(editing).toHaveBeenCalledWith("t");
    // Content px to canvas CSS px: half size, the block's top-left at project (485, 840).
    expect(textarea.style.transform).toBe("matrix(0.5, 0, 0, 0.5, 252.5, 440)");
    expect(textarea.style.whiteSpace).toBe("pre");
    // Nothing typed: the draft is the clip's own content (its raster stays shared).
    const draft = editor.live();
    expect(draft?.text).toBe(editor.live()?.text);
    expect(draft?.highlight?.rects).toHaveLength(2);
  });

  it("shows the draft live, its box anchored, and commits it as one step at the end", () => {
    const { editor, type, clip, commits, doc } = setup();
    editor.begin("t", "all");
    type("abcd\nef\ngh");
    const draft = editor.live();
    expect(draft?.text.value).toBe("abcd\nef\ngh");
    expect(clip().text.value).toBe("ab\ncd");
    // Left / top anchored: the box's top-left stays at (485, 840) as it grows to 220 x 360.
    expect(draft?.transform).toMatchObject({ x: 55, y: 60 });
    expect(draft?.highlight).toBeNull();
    expect(editor.state.getState()).toEqual({ clipId: "t", value: "abcd\nef\ngh" });
    expect(editor.end()).toBe(true);
    expect(commits).toHaveBeenCalledTimes(1);
    expect(clip().text.value).toBe("abcd\nef\ngh");
    expect(clip().transform).toMatchObject({ x: 55, y: 60 });
    expect(doc.history.getState().undoLabel).toBe("Edit text");
    expect(editor.editing).toBeNull();
    expect(editor.end()).toBe(false);
  });

  it("commits nothing when nothing changed or when asked not to", () => {
    const { editor, type, commits } = setup();
    editor.begin("t", "all");
    editor.end();
    editor.begin("t", "all");
    type("zz");
    editor.end(false);
    expect(commits).not.toHaveBeenCalled();
  });

  it("moves Up / Down / Home / End along the drawn lines, Shift extending", () => {
    const { editor, textarea, key } = setup("abc\nabcde");
    editor.begin("t", "all");
    textarea.setSelectionRange(1, 1);
    textarea.dispatchEvent(new Event("select"));
    key("ArrowDown");
    expect([textarea.selectionStart, textarea.selectionEnd]).toEqual([5, 5]);
    key("End");
    expect(textarea.selectionStart).toBe(9);
    key("ArrowUp", { shiftKey: true });
    expect([textarea.selectionStart, textarea.selectionEnd, textarea.selectionDirection]).toEqual([3, 9, "backward"]);
    key("Home");
    expect([textarea.selectionStart, textarea.selectionEnd]).toEqual([0, 0]);
  });

  it("places the caret where pressed, a word on a double press, everything on a triple one", () => {
    const { editor, textarea } = setup("ab cd");
    editor.begin("t", "all");
    // The 275 x 120 box from (402.5, 900): 70 px in is nearest to the 55 px stop (after "a").
    editor.press({ x: 402.5 + 70, y: 960 }, false);
    expect([textarea.selectionStart, textarea.selectionEnd]).toEqual([1, 1]);
    editor.press({ x: 402.5 + 70, y: 960 }, false);
    expect([textarea.selectionStart, textarea.selectionEnd]).toEqual([0, 2]);
    editor.press({ x: 402.5 + 70, y: 960 }, false);
    expect([textarea.selectionStart, textarea.selectionEnd]).toEqual([0, 5]);
    expect(editor.contains({ x: 400, y: 960 }, 4)).toBe(true);
    expect(editor.contains({ x: 390, y: 960 }, 4)).toBe(false);
  });

  it("selects by dragging from a press", () => {
    const { editor, textarea } = setup("ab cd");
    editor.begin("t", "all");
    editor.press({ x: 402.5 + 220, y: 960 }, false);
    editor.drag({ x: 402.5 + 50, y: 960 });
    editor.release();
    expect([textarea.selectionStart, textarea.selectionEnd, textarea.selectionDirection]).toEqual([1, 4, "backward"]);
  });

  it("draws the caret only with no selection", () => {
    const { editor, textarea } = setup();
    editor.begin("t", "all");
    expect(editor.scene()?.caret).toBeNull();
    textarea.setSelectionRange(1, 1);
    textarea.dispatchEvent(new Event("select"));
    const caret = editor.scene()?.caret;
    // After "a" on the first line: x 485 + 55, the em box around the baseline.
    expect(caret?.[0].x).toBeCloseTo(540);
    expect(caret?.[1].x).toBeCloseTo(540);
    expect((caret?.[1].y ?? 0) - (caret?.[0].y ?? 0)).toBeCloseTo(115);
  });

  it("commits on a press elsewhere, keeps editing on a press in a kept area", () => {
    const { editor, type, keep, clip } = setup();
    editor.begin("t", "all");
    type("kept");
    keep.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(editor.editing).toBe("t");
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(editor.editing).toBeNull();
    expect(clip().text.value).toBe("kept");
  });

  it("ends when the clip leaves the selection or the playhead, without a command when the clip goes", () => {
    const a = setup();
    a.editor.begin("t", "all");
    a.type("one");
    setSelection(a.session, EMPTY_SELECTION);
    expect(a.editor.editing).toBeNull();
    expect(a.clip().text.value).toBe("one");
    for (const unmount of mounts.splice(0)) unmount();

    const b = setup();
    b.editor.begin("t", "all");
    b.type("two");
    setPlayhead(b.session, 200);
    expect(b.editor.editing).toBeNull();
    expect(b.clip().text.value).toBe("two");
    for (const unmount of mounts.splice(0)) unmount();

    const c = setup();
    c.editor.begin("t", "all");
    c.type("three");
    c.doc.dispatch({ id: "test.remove", label: "Remove", affects: ["clips"], run: (draft) => {
      delete draft.clips.t;
      for (const track of draft.tracks) track.clipIds = track.clipIds.filter((id) => id !== "t");
    } });
    expect(c.editor.editing).toBeNull();
    expect(c.commits).not.toHaveBeenCalled();
  });

  it("refuses clips it cannot edit", () => {
    const { editor, doc } = setup();
    expect(editor.begin("nope", "all")).toBe(false);
    doc.dispatch({ id: "test.hide", label: "Hide", affects: ["tracks"], run: (draft) => {
      (draft.tracks[0] as { hidden: boolean }).hidden = true;
    } });
    expect(editor.begin("t", "all")).toBe(false);
    doc.dispatch({ id: "test.lock", label: "Lock", affects: ["tracks"], run: (draft) => {
      (draft.tracks[0] as { hidden: boolean; locked: boolean }).hidden = false;
      (draft.tracks[0] as { locked: boolean }).locked = true;
    } });
    expect(editor.begin("t", "all")).toBe(false);
  });
});

describe("text layer points", () => {
  it("maps content px to project px and back, flips and turns included", () => {
    const transform: Transform = { ...IDENTITY_TRANSFORM, x: 12, y: -30, rotation: 30, scale: 1.5, scaleY: 0.75, flipH: true };
    const size = { width: 200, height: 100 };
    const frame = { width: 1080, height: 1920 };
    const p = textToProject(transform, size, frame, 20, 70);
    const back = projectToText(transform, size, frame, p);
    expect(back?.x).toBeCloseTo(20);
    expect(back?.y).toBeCloseTo(70);
    // Flipped: content x 0 is the box's right side.
    expect(textToProject({ ...IDENTITY_TRANSFORM, flipH: true }, size, frame, 0, 0)).toEqual({ x: 640, y: 910 });
  });
});
