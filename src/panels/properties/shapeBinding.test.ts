import { act, createElement, Profiler } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { NumberField } from "../../ui/NumberField.js";
import { makeProject, makeShapeClip, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { ShapeClip } from "../../core/document/types.js";
import { defaultShape, editedShapes, setShapeField } from "../../timeline/edit/shape.js";
import { createStore } from "../../core/store/createStore.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createSessionStore } from "../../core/store/sessionStore.js";
import { NO_LIVE_EDIT, type LiveEdit } from "../../app/liveEdit.js";
import { liveShapeBinding, shapeBinding, type ShapeNumberProp } from "./shapeBinding.js";

const INNER: ShapeNumberProp = { field: "primitive.inner", label: "Inner radius", scale: 1, min: 0, max: 16384, precision: 1 };
const TRIM_END: ShapeNumberProp = { field: "trim.end", label: "Trim end", scale: 100, min: 0, max: 100, precision: 1 };

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let n = 0;
function setup() {
  const spec = defaultShape("star", { width: 1080, height: 1920 }, () => `p${++n}`);
  const p = makeProject();
  p.tracks.push(makeTrack("v1"));
  const clip = makeShapeClip({ id: "s", trackId: "v1", start: 0, duration: 90, size: spec.size, paths: spec.paths });
  const document = new DocumentStore(withClips(p, [clip]), { session: createSessionStore(), validate: true });
  const live = createStore<LiveEdit>(NO_LIVE_EDIT);
  const playhead = { get: () => 0, subscribe: () => () => {} };
  return { document, live, deps: { document, live, playhead }, clip: () => document.getState().clips["s"] as ShapeClip };
}

describe("shape bindings (spec §11 Shape section, P2, Batch 66)", () => {
  it("scrubs a primitive parameter live without touching the document, then commits one step on release", () => {
    const { deps, document, live, clip } = setup();
    const inner = shapeBinding(deps, INNER, ["s"], 0);
    const start = inner.read() as number;
    const changed = vi.fn();
    document.subscribe(changed);
    inner.change(5, "scrub");
    inner.change(20, "scrub");
    const shown = live.getState().shapes?.get("s");
    expect(shown?.paths[0]?.primitive).toMatchObject({ inner: start + 20 });
    expect(shown?.paths[0]?.d).not.toBe(clip().paths[0]?.d);
    expect(inner.read()).toBe(start + 20);
    expect(changed).not.toHaveBeenCalled();
    expect(clip().paths[0]?.primitive).toMatchObject({ inner: start });
    inner.change(20, "commit");
    expect(live.getState()).toBe(NO_LIVE_EDIT);
    expect(clip().paths[0]?.primitive).toMatchObject({ inner: start + 20 });
    expect(changed).toHaveBeenCalledTimes(1);
    expect(document.history.getState().undoLabel).toBe("Inner radius");
    document.undo();
    expect(clip().paths[0]?.primitive).toMatchObject({ inner: start });
  });

  it("Esc drops the live values and leaves no undo step", () => {
    const { deps, document, live } = setup();
    const inner = shapeBinding(deps, INNER, ["s"], 0);
    inner.change(10, "scrub");
    expect(live.getState().shapes).not.toBeNull();
    inner.change(10, "cancel");
    expect(live.getState()).toBe(NO_LIVE_EDIT);
    expect(document.history.getState().undoLabel).toBeNull();
  });

  it("a scrub of a keyed field shows the value at the playhead", () => {
    const { deps, document, live } = setup();
    const end = shapeBinding(deps, TRIM_END, ["s"], 0);
    expect(end.read()).toBe(100);
    end.change(-40, "scrub");
    expect(live.getState().shapes?.get("s")?.paths[0]?.trim?.end).toBeCloseTo(0.6);
    expect(end.read()).toBeCloseTo(60);
    expect(document.history.getState().undoLabel).toBeNull();
  });

  it("editedShapes copies only the clips that change and a color preview leaves the document alone", () => {
    const { document, clip } = setup();
    const red = [1, 0, 0, 1] as const;
    const shown = editedShapes(document.getState(), ["s"], (draft, rel) => void setShapeField(draft, draft.paths[0]?.id ?? "", "fill", [...red], rel), 0);
    expect(shown?.get("s")?.paths[0]?.fill).toMatchObject({ r: 1, g: 0, b: 0 });
    expect(clip().paths[0]?.fill).toMatchObject({ r: 1, g: 1, b: 1 });
    expect(editedShapes(document.getState(), ["s"], () => {}, 0)).toBeNull();
  });

  it("a live binding's typed value is one command", () => {
    const { deps, document, clip } = setup();
    const field = liveShapeBinding(
      deps,
      { read: (project) => (project.clips["s"] as ShapeClip).paths.length, clamp: (v) => v, edit: () => (draft) => { draft.paths[0]!.fillRule = "evenodd"; }, label: "Rule", coalesceKey: "k" },
      ["s"],
    );
    field.set(1);
    expect(clip().paths[0]?.fillRule).toBe("evenodd");
    expect(document.history.getState().undoLabel).toBe("Rule");
  });

  it("P2: a label scrub of a Shape field commits no React render, shows live in the preview store, and lands as one undo step", () => {
    const { deps, document, live, clip } = setup();
    const host = document_host();
    const root = createRoot(host);
    let renders = 0;
    act(() => root.render(createElement(Profiler, { id: "f", onRender: () => void (renders += 1) }, createElement(NumberField, { ariaLabel: "Inner", label: "I", precision: 1, binding: shapeBinding(deps, INNER, ["s"], 0) }))));
    const before = renders;
    const start = (clip().paths[0]?.primitive as { inner: number }).inner;
    const handle = host.querySelector("span") as HTMLElement;
    const fire = (type: string, x: number) => act(() => void handle.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, button: 0, clientX: x })));
    fire("pointerdown", 100);
    fire("pointermove", 106);
    for (let x = 110; x <= 200; x += 10) {
      fire("pointermove", x);
      expect((live.getState().shapes?.get("s")?.paths[0]?.primitive as { inner: number }).inner).toBeGreaterThan(start);
    }
    expect(clip().paths[0]?.primitive).toMatchObject({ inner: start });
    expect(renders).toBe(before);
    fire("pointerup", 200);
    expect(renders).toBe(before);
    expect(live.getState()).toBe(NO_LIVE_EDIT);
    expect((clip().paths[0]?.primitive as { inner: number }).inner).toBeGreaterThan(start);
    document.undo();
    expect(clip().paths[0]?.primitive).toMatchObject({ inner: start });
    act(() => root.unmount());
    host.remove();
  });
});

function document_host(): HTMLElement {
  const host = globalThis.document.createElement("div");
  globalThis.document.body.append(host);
  return host;
}
