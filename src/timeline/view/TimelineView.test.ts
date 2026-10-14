// The view's invalidation contract (P3): what redraws the content canvas and what only the overlay.
// jsdom has no canvas, so a recording stand-in for the 2D context counts the draws.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addClip, addTrack, removeClips, updateClip } from "../../core/commands/basicCommands.js";
import { makeMedia, makeMediaClip, makeProject, makeTrack } from "../../core/document/fixtures.js";
import type { TrackKind } from "../../core/document/types.js";
import type { InvalidationFlag, RenderView } from "../../core/scheduler/FrameScheduler.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createLayoutStore } from "../../core/store/layoutStore.js";
import { createSessionStore, setPlayhead } from "../../core/store/sessionStore.js";
import { drawOverlay } from "./drawOverlay.js";
import { testTheme } from "./fixtures.js";
import { TimelineView } from "./TimelineView.js";

// The real overlay drawing, recorded so tests can read the hover it was given.
vi.mock("./drawOverlay.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./drawOverlay.js")>();
  return { ...actual, drawOverlay: vi.fn(actual.drawOverlay) };
});

/** The hover passed to the last overlay draw. */
function lastHover() {
  const scene = vi.mocked(drawOverlay).mock.lastCall?.[0];
  return { clipId: scene?.hoverClip?.clip.id ?? null, addRow: scene?.hoverAddRow ?? null };
}

/** Every fillRect of every canvas: its fill style and width in CSS px. */
const fills: { style: unknown; width: number }[] = [];

/** A 2D context that accepts every call; text is 6 px per character. */
function fakeContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const state: Record<string | symbol, unknown> = {
    canvas,
    font: "",
    measureText: (text: string) => ({ width: text.length * 6 }),
    fillRect: (_x: number, _y: number, width: number) => void fills.push({ style: state.fillStyle, width }),
  };
  return new Proxy(state, {
    get: (target, key) => (key in target ? target[key] : () => {}),
    set: (target, key, value) => {
      target[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

class FakeScheduler {
  readonly invalidated: InvalidationFlag[] = [];
  private readonly views = new Map<InvalidationFlag, Set<RenderView>>();
  private dirty = new Set<InvalidationFlag>();

  register(flag: InvalidationFlag, view: RenderView): () => void {
    const set = this.views.get(flag) ?? new Set();
    set.add(view);
    this.views.set(flag, set);
    return () => set.delete(view);
  }

  invalidate(flag: InvalidationFlag): void {
    this.invalidated.push(flag);
    this.dirty.add(flag);
  }

  /** Runs one frame; returns the flags that were dirty. */
  flush(): InvalidationFlag[] {
    const dirty = [...this.dirty];
    this.dirty = new Set();
    for (const flag of dirty) for (const view of this.views.get(flag) ?? []) view.render(0);
    this.invalidated.length = 0;
    return dirty.sort();
  }
}

function setup(clipCount = 0) {
  const project = makeProject();
  project.media.m = makeMedia("m");
  project.tracks.push(makeTrack("v1"), makeTrack("a1", "audio"));
  const session = createSessionStore();
  const document = new DocumentStore(project, { session, validate: false });
  for (let i = 0; i < clipCount; i++) {
    document.dispatch(addClip(makeMediaClip(document.getState(), { id: `c${i}`, trackId: "v1", start: i * 10, duration: 10, mediaId: "m" })));
  }
  const layout = createLayoutStore(null);
  layout.setPanelSize("timeline", { width: 1000, height: 428 });
  const scheduler = new FakeScheduler();
  const onAddTrack = vi.fn();
  const view = new TimelineView({ scheduler, document, session, layout, theme: { theme: testTheme(), subscribe: () => () => {} }, onAddTrack });
  const host = window.document.createElement("div");
  window.document.body.append(host);
  const unmount = view.mount(host);
  scheduler.flush();
  const overlay = host.querySelectorAll("canvas")[1] as HTMLCanvasElement;
  const pointer = (type: string, x: number, y: number, init: PointerEventInit = {}) =>
    overlay.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, button: 0, bubbles: true, ...init }));
  return { view, session, document, layout, scheduler, overlay, pointer, onAddTrack, unmount };
}

describe("TimelineView", () => {
  beforeEach(() => {
    fills.length = 0;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
      return fakeContext(this);
    } as unknown as HTMLCanvasElement["getContext"]);
    HTMLCanvasElement.prototype.setPointerCapture = () => {};
    vi.stubGlobal("Path2D", class {});
  });
  afterEach(() => {
    window.document.body.replaceChildren();
    vi.unstubAllGlobals();
  });

  it("draws both canvases once when mounted, sized to the panel", () => {
    const { view, overlay } = setup();
    expect(view.stats.contentDraws).toBe(1);
    expect(view.stats.overlayDraws).toBe(1);
    expect(overlay.width).toBe(1000);
    expect(overlay.style.height).toBe("428px");
  });

  it("redraws only the overlay while the playhead is dragged on the ruler", () => {
    const { view, session, scheduler, pointer } = setup(20);
    const contentDraws = view.stats.contentDraws;
    // Ruler at y < 28; 4 px/frame from x = 176.
    pointer("pointerdown", 176 + 40, 10);
    expect(session.state.getState().playhead).toBe(10);
    for (let x = 220; x < 600; x += 20) {
      pointer("pointermove", x, 12);
      expect(scheduler.flush()).toEqual(["timelineOverlay"]);
    }
    pointer("pointerup", 600, 12);
    scheduler.flush();
    expect(session.state.getState().playhead).toBe((580 - 176) / 4);
    expect(view.stats.contentDraws).toBe(contentDraws);
    expect(view.stats.overlayDraws).toBeGreaterThan(19);
    // Keyboard and timecode moves go the same way.
    setPlayhead(session, 3);
    expect(scheduler.flush()).toEqual(["timelineOverlay"]);
  });

  it("redraws the content for zoom, scroll, selection and document changes", () => {
    const { view, session, document, scheduler, pointer } = setup(5);
    view.zoomBy(2);
    expect(scheduler.flush()).toEqual(["timelineContent", "timelineOverlay"]);
    // Hovered first: a pointer down where the pointer was not known yet also lights the hover.
    pointer("pointermove", 176 + 15 * 8, 200);
    scheduler.flush();
    pointer("pointerdown", 176 + 15 * 8, 200);
    expect(session.selection.getState().primary).toBe("c1");
    expect(scheduler.flush()).toEqual(["timelineContent"]);
    document.dispatch(updateClip("c2", { name: "renamed" }));
    expect(scheduler.flush()).toEqual(["timelineContent", "timelineOverlay"]);
    // Media-only changes do not touch the timeline.
    document.dispatch({ id: "test", label: "Rename media", affects: ["media"], run: (draft) => void (draft.media.m!.name = "x") });
    expect(scheduler.flush()).toEqual([]);
  });

  it("draws only the clips in the visible range", () => {
    const { view, scheduler } = setup(500);
    // 824 px of track area at 4 px/frame: 206 frames, about 21 clips of 10 frames.
    expect(view.stats.clipsTotal).toBe(500);
    expect(view.stats.clipsDrawn).toBeLessThanOrEqual(22);
    expect(view.stats.clipsDrawn).toBeGreaterThan(19);
    view.fit();
    scheduler.flush();
    expect(view.stats.clipsDrawn).toBe(500);
  });

  it("zooms at the cursor with Mod+wheel and scrolls with the wheel", () => {
    const { view, session, overlay, scheduler } = setup(200);
    const before = session.state.getState().timeline;
    const cursorX = 500;
    const frameAt = (x: number) => view.geometry().xToFrame(x);
    const anchor = frameAt(cursorX);
    overlay.dispatchEvent(new WheelEvent("wheel", { clientX: cursorX, deltaY: -100, ctrlKey: true, cancelable: true }));
    const zoomed = session.state.getState().timeline;
    expect(zoomed.pxPerFrame).toBeCloseTo(before.pxPerFrame * 1.25);
    expect(frameAt(cursorX)).toBeCloseTo(anchor);
    overlay.dispatchEvent(new WheelEvent("wheel", { clientX: cursorX, deltaY: 100, shiftKey: true, cancelable: true }));
    expect(session.state.getState().timeline.scrollFrame).toBeCloseTo(zoomed.scrollFrame + 100 / zoomed.pxPerFrame);
    overlay.dispatchEvent(new WheelEvent("wheel", { clientX: cursorX, deltaX: -1000, cancelable: true }));
    expect(session.state.getState().timeline.scrollFrame).toBe(0);
    expect(scheduler.flush()).toEqual(["timelineContent", "timelineOverlay"]);
  });

  it("previews the slider zoom without touching the session, then commits once", () => {
    const { view, session, scheduler } = setup(50);
    const writes = vi.fn();
    session.state.subscribe(writes);
    view.previewZoom(10);
    view.previewZoom(12);
    expect(writes).not.toHaveBeenCalled();
    expect(view.viewport().pxPerFrame).toBe(12);
    expect(scheduler.flush()).toEqual(["timelineContent", "timelineOverlay"]);
    view.commitPreviewZoom();
    expect(writes).toHaveBeenCalledTimes(1);
    expect(session.state.getState().timeline.pxPerFrame).toBe(12);
  });

  it("selects with click and Shift+click, clears on empty space, adds tracks from the + rows", () => {
    const { session, pointer, onAddTrack } = setup(5);
    pointer("pointerdown", 176 + 5 * 4, 200);
    pointer("pointerdown", 176 + 25 * 4, 200, { shiftKey: true });
    expect([...session.selection.getState().clipIds]).toEqual(["c0", "c2"]);
    pointer("pointerdown", 176 + 200 * 4, 200);
    expect(session.selection.getState().kind).toBe("none");
    // The + video row sits right above V1 (172 - 24 = 148), in the header column.
    pointer("pointerdown", 20, 150);
    expect(onAddTrack).toHaveBeenCalledWith("video");
  });

  it("highlights hover on the overlay only when the hovered target changes", () => {
    const { overlay, pointer, scheduler } = setup(5);
    pointer("pointermove", 176 + 5 * 4, 200);
    expect(scheduler.flush()).toEqual(["timelineOverlay"]);
    pointer("pointermove", 176 + 6 * 4, 201);
    expect(scheduler.flush()).toEqual([]);
    pointer("pointermove", 20, 150);
    expect(scheduler.flush()).toEqual(["timelineOverlay"]);
    expect(overlay.style.cursor).toBe("pointer");
    overlay.dispatchEvent(new PointerEvent("pointerleave"));
    expect(scheduler.flush()).toEqual(["timelineOverlay"]);
    expect(overlay.style.cursor).toBe("default");
  });

  it("keeps the hover on what lies under a still pointer when the wheel scrolls the view", () => {
    const { session, document, overlay, pointer, scheduler } = setup(50);
    pointer("pointermove", 176 + 5 * 4, 200);
    scheduler.flush();
    expect(lastHover().clipId).toBe("c0");
    // 40 px at 4 px/frame: frame 15 is under the pointer now, inside c1.
    overlay.dispatchEvent(new WheelEvent("wheel", { clientX: 176 + 5 * 4, clientY: 200, deltaY: 40, shiftKey: true, cancelable: true }));
    expect(session.state.getState().timeline.scrollFrame).toBe(10);
    expect(scheduler.flush()).toEqual(["timelineContent", "timelineOverlay"]);
    expect(lastHover().clipId).toBe("c1");
    // A document change under the still pointer (a delete, an undo) too.
    document.dispatch(removeClips(["c1"]));
    scheduler.flush();
    expect(lastHover().clipId).toBeNull();
  });

  it("drops the + row hover once a click on it adds the track that moves the row away", () => {
    const { document, overlay, pointer, scheduler, onAddTrack } = setup(5);
    onAddTrack.mockImplementation((kind: TrackKind) => document.dispatch(addTrack(makeTrack("v2", kind))));
    pointer("pointermove", 20, 150);
    scheduler.flush();
    expect(overlay.style.cursor).toBe("pointer");
    expect(lastHover().addRow).not.toBeNull();
    pointer("pointerdown", 20, 150);
    expect(document.getState().tracks).toHaveLength(3);
    expect(overlay.style.cursor).toBe("default");
    scheduler.flush();
    expect(lastHover().addRow).toBeNull();
    // V2 (56 px) sits between V1 and the + row now; the row lights up again where it went.
    pointer("pointermove", 20, 150 - 56);
    scheduler.flush();
    expect(overlay.style.cursor).toBe("pointer");
    expect(lastHover().addRow).not.toBeNull();
  });

  it("hit-tests again where a ruler scrub ends", () => {
    const { overlay, pointer, scheduler } = setup(5);
    pointer("pointerdown", 176 + 40, 10);
    pointer("pointermove", 20, 150);
    expect(overlay.style.cursor).toBe("ew-resize");
    scheduler.flush();
    expect(lastHover().addRow).toBeNull();
    pointer("pointerup", 20, 150);
    expect(overlay.style.cursor).toBe("pointer");
    scheduler.flush();
    expect(lastHover().addRow).not.toBeNull();
  });

  it("fills clips narrower than 6 px with their body color", () => {
    const { view, scheduler } = setup(500);
    const colors = testTheme().timeline.clip.video;
    view.fit();
    fills.length = 0;
    scheduler.flush();
    // Fit puts 5060 frames in 824 px: every 10-frame clip is under 2 px wide.
    const clipFills = fills.filter((fill) => fill.style === colors.body || fill.style === colors.label);
    expect(clipFills).toHaveLength(500);
    expect(clipFills.every((fill) => fill.style === colors.body && fill.width < 6)).toBe(true);
  });

  it("stops drawing and listening once unmounted", () => {
    const { view, session, scheduler, unmount } = setup(5);
    unmount();
    setPlayhead(session, 40);
    view.zoomBy(2);
    expect(scheduler.flush()).toEqual([]);
    expect(view.mounted).toBe(false);
  });
});
