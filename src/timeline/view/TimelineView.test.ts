// The view's invalidation contract (P3): what redraws the content canvas and what only the overlay.
// jsdom has no canvas, so a recording stand-in for the 2D context counts the draws.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addClip, addTrack, removeClips, updateClip, updateTrack } from "../../core/commands/basicCommands.js";
import { makeMedia, makeMediaClip, makeProject, makeTrack } from "../../core/document/fixtures.js";
import { FPS_30, frameToUs } from "../../core/document/time.js";
import type { TrackKind } from "../../core/document/types.js";
import type { InvalidationFlag, RenderView } from "../../core/scheduler/FrameScheduler.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createLayoutStore } from "../../core/store/layoutStore.js";
import { selectClips } from "../../core/store/selection.js";
import { createSessionStore, setPlayhead } from "../../core/store/sessionStore.js";
import { trimCursors } from "./cursors.js";
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
/** Every fillText of every canvas, with its fill style. */
const texts: { style: unknown; text: string }[] = [];

/** A 2D context that accepts every call; text is 6 px per character. */
function fakeContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const state: Record<string | symbol, unknown> = {
    canvas,
    font: "",
    measureText: (text: string) => ({ width: text.length * 6 }),
    fillRect: (_x: number, _y: number, width: number) => void fills.push({ style: state.fillStyle, width }),
    fillText: (text: string) => void texts.push({ style: state.fillStyle, text }),
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
  readonly tickers = new Set<(time: number) => void>();
  private time = 0;

  addTicker(ticker: (time: number) => void): () => void {
    this.tickers.add(ticker);
    return () => this.tickers.delete(ticker);
  }

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

  /** Runs one frame (tickers first); returns the flags that were dirty. */
  flush(): InvalidationFlag[] {
    this.time += 1000 / 60;
    for (const ticker of [...this.tickers]) ticker(this.time);
    const dirty = [...this.dirty];
    this.dirty = new Set();
    for (const flag of dirty) for (const view of this.views.get(flag) ?? []) view.render(0);
    this.invalidated.length = 0;
    return dirty.sort();
  }
}

/** Unmount functions of the views set up by the current test. */
const mounted: (() => void)[] = [];

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
  const onToggleTrack = vi.fn();
  const onMoveClips = vi.fn();
  const onTrimEdge = vi.fn();
  const onTrimPreview = vi.fn();
  const idle = { pause: vi.fn(), resume: vi.fn() };
  const view = new TimelineView({
    scheduler,
    document,
    session,
    layout,
    theme: { theme: testTheme(), subscribe: () => () => {} },
    onAddTrack,
    onToggleTrack,
    onMoveClips,
    onTrimEdge,
    onTrimPreview,
    idle,
    platform: "other",
  });
  const host = window.document.createElement("div");
  window.document.body.append(host);
  const unmount = view.mount(host);
  mounted.push(unmount);
  scheduler.flush();
  const overlay = host.querySelectorAll("canvas")[1] as HTMLCanvasElement;
  const pointer = (type: string, x: number, y: number, init: PointerEventInit = {}) =>
    overlay.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, button: 0, bubbles: true, ...init }));
  /** A key event on the window (modifier changes during a drag). */
  const key = (type: "keydown" | "keyup", keyName: string, init: KeyboardEventInit = {}) => window.dispatchEvent(new KeyboardEvent(type, { key: keyName, bubbles: true, ...init }));
  return { view, session, document, layout, scheduler, overlay, pointer, key, onAddTrack, onToggleTrack, onMoveClips, onTrimEdge, onTrimPreview, idle, unmount };
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
    // A drag left open would keep its window key listeners into the next test.
    for (const unmount of mounted.splice(0)) unmount();
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

  it("follows the playhead: pages exactly when it leaves the right edge, until the user scrolls, then again after resume", () => {
    const { view, session, overlay } = setup(500);
    const scroll = () => session.state.getState().timeline.scrollFrame;
    // 824 px of track area at 4 px/frame: frames [0, 206) are in view.
    view.follow(205);
    expect(scroll()).toBe(0);
    view.follow(206);
    expect(scroll()).toBeCloseTo(206 * 0.9, 9);
    // A vertical wheel does not count as a manual scroll; a horizontal one stops following.
    overlay.dispatchEvent(new WheelEvent("wheel", { clientX: 300, clientY: 200, deltaY: 40, cancelable: true }));
    view.follow(1000);
    expect(scroll()).toBe(1000 - 206 * 0.1);
    overlay.dispatchEvent(new WheelEvent("wheel", { clientX: 300, clientY: 200, deltaY: 40, shiftKey: true, cancelable: true }));
    const scrolled = scroll();
    view.follow(3000);
    expect(view.isFollowing).toBe(false);
    expect(scroll()).toBe(scrolled);
    view.resumeFollowing();
    view.follow(3000);
    expect(scroll()).toBeCloseTo(3000 - 206 * 0.1, 9);
    // Keyboard jumps page the view whether following or not.
    overlay.dispatchEvent(new WheelEvent("wheel", { clientX: 300, clientY: 200, deltaX: 40, cancelable: true }));
    view.reveal(10);
    expect(scroll()).toBe(0);
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
    pointer("pointerup", 176 + 5 * 4, 200);
    pointer("pointerdown", 176 + 25 * 4, 200, { shiftKey: true });
    pointer("pointerup", 176 + 25 * 4, 200, { shiftKey: true });
    expect([...session.selection.getState().clipIds]).toEqual(["c0", "c2"]);
    // Empty space clears on release (a drag from there is a marquee).
    pointer("pointerdown", 176 + 200 * 4, 200);
    expect(session.selection.getState().kind).toBe("clips");
    pointer("pointerup", 176 + 200 * 4, 200);
    expect(session.selection.getState().kind).toBe("none");
    // The + video row sits right above V1 (172 - 24 = 148), in the header column.
    pointer("pointerdown", 20, 150);
    expect(onAddTrack).toHaveBeenCalledWith("video");
  });

  it("toggles mute and solo from the audio track header with a pointer cursor", () => {
    const { overlay, pointer, onToggleTrack } = setup();
    // A1 232..288: mute 132..148 x 240..256, solo 152..168.
    pointer("pointermove", 140, 248);
    expect(overlay.style.cursor).toBe("pointer");
    pointer("pointerdown", 140, 248);
    pointer("pointerdown", 160, 248);
    expect(onToggleTrack.mock.calls).toEqual([
      ["a1", "mute"],
      ["a1", "solo"],
    ]);
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

  it("drags a clip past the dead zone with ghosts on the overlay only, and asks for one move at the drop", () => {
    const { view, document, scheduler, pointer, onMoveClips, idle } = setup(5);
    const before = document.getState();
    // c1 spans frames 10..20: x 216..256.
    pointer("pointerdown", 236, 200);
    pointer("pointermove", 239, 200);
    expect(view.dragging).toBeNull();
    scheduler.flush();
    const contentDraws = view.stats.contentDraws;
    pointer("pointermove", 276, 200);
    expect(view.dragging).not.toBeNull();
    expect(idle.pause).toHaveBeenCalledWith("gesture");
    expect(scheduler.flush()).toEqual(["timelineOverlay"]);
    const proposal = view.dragging?.proposal;
    expect(proposal).toMatchObject({ deltaFrames: 10, laneDelta: { video: 0, audio: 0 }, mode: "overwrite", duplicate: false, refused: null });
    // c1 lands on 20..30 over c2: that whole span is hatched.
    expect(proposal?.ghosts[0]?.hatch).toEqual([[20, 30]]);
    const overlayScene = vi.mocked(drawOverlay).mock.lastCall?.[0];
    expect(overlayScene?.tooltip?.text).toBe("Δ +00:00:10");
    expect(view.stats.contentDraws).toBe(contentDraws);
    expect(document.getState()).toBe(before);
    pointer("pointerup", 276, 200);
    expect(onMoveClips).toHaveBeenCalledTimes(1);
    expect(onMoveClips).toHaveBeenCalledWith({ clipIds: ["c1"], primary: "c1", deltaFrames: 10, laneDelta: { video: 0, audio: 0 }, mode: "overwrite", duplicate: false });
    expect(idle.resume).toHaveBeenCalledWith("gesture");
    expect(view.dragging).toBeNull();
  });

  it("cancels a drag with Esc: no move, no document change", () => {
    const { view, document, pointer, onMoveClips } = setup(5);
    const before = document.getState();
    pointer("pointerdown", 236, 200);
    pointer("pointermove", 300, 200);
    expect(view.cancelGesture()).toBe(true);
    pointer("pointerup", 300, 200);
    expect(onMoveClips).not.toHaveBeenCalled();
    expect(document.getState()).toBe(before);
    // Nothing left to cancel: Esc goes to whoever else wants it.
    expect(view.cancelGesture()).toBe(false);
  });

  it("follows modifier keys during a drag: Alt duplicates, Mod inserts, Shift keeps the tracks", () => {
    const { view, pointer, key, onMoveClips } = setup(5);
    pointer("pointerdown", 236, 200);
    pointer("pointermove", 276, 120);
    expect(view.dragging?.proposal?.laneDelta.video).toBe(1);
    key("keydown", "Alt", { altKey: true });
    expect(view.dragging?.proposal?.duplicate).toBe(true);
    key("keyup", "Alt");
    key("keydown", "Control", { ctrlKey: true });
    expect(view.dragging?.proposal).toMatchObject({ mode: "insert", insertFrame: 20, duplicate: false });
    key("keyup", "Control");
    key("keydown", "Shift", { shiftKey: true });
    expect(view.dragging?.proposal?.laneDelta.video).toBe(0);
    pointer("pointerup", 276, 120, { shiftKey: true });
    expect(onMoveClips.mock.lastCall?.[0]).toMatchObject({ deltaFrames: 10, laneDelta: { video: 0, audio: 0 }, mode: "overwrite" });
  });

  it("proposes a new track row when dragged above the top video track", () => {
    const { view, pointer, scheduler } = setup(5);
    pointer("pointerdown", 236, 200);
    // V1 is 172..228; above it (the + row and beyond) means a new track.
    pointer("pointermove", 236, 100);
    const proposal = view.dragging?.proposal;
    expect(proposal?.laneDelta.video).toBe(1);
    expect(proposal?.newLanes).toEqual([{ kind: "video", lane: 1, name: "V2" }]);
    expect(proposal?.ghosts[0]?.target.track).toBeNull();
    scheduler.flush();
    expect(vi.mocked(drawOverlay).mock.lastCall?.[0].move?.proposal).toBe(proposal);
    // Into the audio area: back to V1 (lane 0), never an audio track.
    pointer("pointermove", 236, 260);
    expect(view.dragging?.proposal?.laneDelta.video).toBe(0);
  });

  it("auto-scrolls near the top edge into room for the proposed track row, and settles back after a cancel", () => {
    const { view, session, pointer, scheduler } = setup(5);
    pointer("pointerdown", 236, 200);
    // y 30: inside the 24 px band under the ruler (28), above V1: a new track is proposed.
    pointer("pointermove", 236, 30);
    for (let i = 0; i < 20; i++) scheduler.flush();
    const scrolled = session.state.getState().timeline.scrollY;
    // Everything fits (normal range: 0 only), the new row (56 px) gives room up to -56.
    expect(scrolled).toBeLessThan(0);
    expect(scrolled).toBeGreaterThanOrEqual(-56);
    expect(view.dragging?.proposal?.newLanes).toHaveLength(1);
    view.cancelGesture();
    expect(session.state.getState().timeline.scrollY).toBe(0);
  });

  it("shows a refused ghost over a locked track", () => {
    const { view, document, pointer } = setup(5);
    const locked = { ...makeTrack("v2"), locked: true };
    document.dispatch(addTrack(locked, 1));
    pointer("pointerdown", 236, 200);
    // V2 sits above V1: 116..172.
    pointer("pointermove", 236, 140);
    expect(view.dragging?.proposal?.refused).toEqual({ reason: "lockedTarget", trackId: "v2" });
  });

  it("marquee: selects the clips it touches, drawn without touching the session until release", () => {
    const { session, pointer, scheduler } = setup(5);
    // Empty space after the clips (frame 100), dragged back into c1 (frame 15).
    pointer("pointerdown", 176 + 100 * 4, 190);
    pointer("pointermove", 176 + 15 * 4, 205);
    expect(scheduler.flush()).toEqual(["timelineContent", "timelineOverlay"]);
    expect(session.selection.getState().kind).toBe("none");
    expect(vi.mocked(drawOverlay).mock.lastCall?.[0].marquee).not.toBeNull();
    pointer("pointerup", 176 + 15 * 4, 205);
    expect([...session.selection.getState().clipIds]).toEqual(["c1", "c2", "c3", "c4"]);
    // Shift+marquee adds.
    pointer("pointerdown", 176 + 100 * 4, 190, { shiftKey: true });
    pointer("pointermove", 176 + 2 * 4, 205, { shiftKey: true });
    pointer("pointerup", 176 + 2 * 4, 205, { shiftKey: true });
    expect([...session.selection.getState().clipIds].sort()).toEqual(["c0", "c1", "c2", "c3", "c4"]);
  });

  it("marquee: stays inside the track area once the view scrolls past its start, the clips there still selected", () => {
    const { view, session, pointer, scheduler } = setup(100);
    const { area } = view.geometry();
    const a1 = view.geometry().rowOf("a1");
    const v1 = view.geometry().rowOf("v1");
    if (!a1 || !v1) throw new Error("rows");
    // Empty A1 space at frame 20, then up into V1 and past the right edge: the view auto-scrolls.
    pointer("pointerdown", area.x + 20 * 4, a1.y + a1.height / 2);
    pointer("pointermove", area.x + area.width + 10, v1.y + v1.height / 2);
    for (let i = 0; i < 120; i++) scheduler.flush();
    expect(view.geometry().scrollFrame).toBeGreaterThan(20);
    const rect = vi.mocked(drawOverlay).mock.lastCall?.[0].marquee;
    expect(rect).toEqual({ x: area.x, y: v1.y + v1.height / 2, width: area.width, height: a1.y + a1.height / 2 - (v1.y + v1.height / 2) });
    pointer("pointerup", area.x + area.width + 10, v1.y + v1.height / 2);
    const selected = session.selection.getState().clipIds;
    expect(selected.has("c2")).toBe(true);
    expect(selected.has("c1")).toBe(false);
  });

  it("keeps a multi-selection on a press for the drag, and collapses it on a click", () => {
    const { session, pointer, onMoveClips } = setup(5);
    session.selection.set(selectClips(["c0", "c2"], "c0"));
    pointer("pointerdown", 176 + 25 * 4, 200);
    expect([...session.selection.getState().clipIds]).toEqual(["c0", "c2"]);
    pointer("pointermove", 176 + 35 * 4, 200);
    pointer("pointerup", 176 + 35 * 4, 200);
    expect(onMoveClips.mock.lastCall?.[0]).toMatchObject({ clipIds: ["c0", "c2"], primary: "c2", deltaFrames: 10 });
    pointer("pointerdown", 176 + 25 * 4, 200);
    pointer("pointerup", 176 + 25 * 4, 200);
    expect([...session.selection.getState().clipIds]).toEqual(["c2"]);
  });

  it("selects linked partners on a click, only the clip with Alt, and nothing on a locked track", () => {
    const { session, document, pointer } = setup();
    const project = document.getState();
    document.dispatch(addClip({ ...makeMediaClip(project, { id: "v", trackId: "v1", start: 0, duration: 10, mediaId: "m" }), linkGroup: "L" }));
    document.dispatch(addClip({ ...makeMediaClip(project, { id: "a", trackId: "a1", start: 0, duration: 10, mediaId: "m", kind: "audio" }), linkGroup: "L" }));
    pointer("pointerdown", 180, 200);
    pointer("pointerup", 180, 200);
    expect([...session.selection.getState().clipIds]).toEqual(["v", "a"]);
    pointer("pointerdown", 180, 200, { altKey: true });
    pointer("pointerup", 180, 200, { altKey: true });
    expect([...session.selection.getState().clipIds]).toEqual(["v"]);
    document.dispatch(updateTrack("a1", { locked: true }));
    pointer("pointerdown", 180, 250);
    pointer("pointerup", 180, 250);
    expect(session.selection.getState().kind).toBe("none");
  });

  describe("trimming", () => {
    /** V1: a [0, 20) linked to A1's au [0, 20), and b [100, 140); 4 px/frame from x = 176. V1 rows 172..228, A1 232..288. */
    function trimSetup() {
      const t = setup();
      const add = (id: string, trackId: string, start: number, duration: number, extra: object = {}) =>
        t.document.dispatch(addClip({ ...makeMediaClip(t.document.getState(), { id, trackId, start, duration, mediaId: "m", kind: trackId === "a1" ? "audio" : "video" }), ...extra }));
      add("a", "v1", 0, 20, { linkGroup: "L", in: 1_000_000, out: 1_000_000 + 666_667 });
      add("au", "a1", 0, 20, { linkGroup: "L", in: 1_000_000, out: 1_000_000 + 666_667 });
      add("b", "v1", 100, 40);
      t.scheduler.flush();
      return t;
    }
    const x = (frame: number) => 176 + frame * 4;
    const scene = () => vi.mocked(drawOverlay).mock.lastCall?.[0];
    const cursors = trimCursors(testTheme());

    it("shows the bracket cursors on edges, the ripple variant with Ripple mode on or Mod held", () => {
      const { session, overlay, pointer, key } = trimSetup();
      pointer("pointermove", x(140) - 2, 200);
      expect(overlay.style.cursor).toBe(cursors.out);
      pointer("pointermove", x(100) + 2, 200);
      expect(overlay.style.cursor).toBe(cursors.in);
      pointer("pointermove", x(120), 200);
      expect(overlay.style.cursor).toBe("default");
      pointer("pointermove", x(100) + 2, 200);
      session.state.set((state) => ({ ...state, ripple: true }));
      expect(overlay.style.cursor).toBe(cursors.rippleIn);
      session.state.set((state) => ({ ...state, ripple: false }));
      expect(overlay.style.cursor).toBe(cursors.in);
      key("keydown", "Control", { ctrlKey: true });
      expect(overlay.style.cursor).toBe(cursors.rippleIn);
      key("keyup", "Control");
      expect(overlay.style.cursor).toBe(cursors.in);
    });

    it("drags an out point: the overlay draws the trim, the preview gets the last included frame, one request at the release", () => {
      const { view, document, scheduler, pointer, onTrimEdge, onTrimPreview, idle } = trimSetup();
      const before = document.getState();
      pointer("pointerdown", x(140) - 2, 200);
      pointer("pointermove", x(140) - 4, 200);
      expect(view.trimming).toBe(false);
      scheduler.flush();
      const contentDraws = view.stats.contentDraws;
      pointer("pointermove", x(130) - 2, 200);
      expect(view.trimming).toBe(true);
      expect(idle.pause).toHaveBeenCalledWith("gesture");
      expect(view.trim?.proposal?.result.delta).toBe(-10);
      // The new edge frame: b now ends at 130, so 129 is its last frame.
      expect(view.trimPreview?.frame).toBe(129);
      expect(view.trimPreview?.project.clips.b).toMatchObject({ start: 100, duration: 30 });
      expect(onTrimPreview).toHaveBeenCalled();
      expect(scheduler.flush()).toEqual(["timelineOverlay"]);
      expect(view.stats.contentDraws).toBe(contentDraws);
      expect(scene()?.trim?.proposal.result.delta).toBe(-10);
      expect(scene()?.tooltip).toMatchObject({ text: "Δ -00:00:10 · 00:01:00", alert: null });
      expect(document.getState()).toBe(before);
      onTrimPreview.mockClear();
      pointer("pointerup", x(130) - 2, 200);
      expect(onTrimEdge).toHaveBeenCalledTimes(1);
      expect(onTrimEdge).toHaveBeenCalledWith({ kind: "trim", clipId: "b", edge: "out", rightId: null, deltaFrames: -10, ripple: false, linked: true });
      expect(view.trimming).toBe(false);
      expect(view.trimPreview).toBeNull();
      expect(onTrimPreview).toHaveBeenCalledTimes(1);
      expect(idle.resume).toHaveBeenCalledWith("gesture");
    });

    it("ripples with Mod or Ripple mode, trims the clip alone with Alt", () => {
      const { view, session, pointer, key, onTrimEdge } = trimSetup();
      pointer("pointerdown", x(20) - 2, 200);
      pointer("pointermove", x(30) - 2, 200, { ctrlKey: true });
      expect(view.trim?.proposal).toMatchObject({ ripple: true, linked: true });
      expect(view.trim?.proposal?.result.plan.trimmed.map((clip) => clip.id)).toEqual(["a", "au"]);
      // The ripple pushes b: the overlay redraws V1 from the edit point on.
      expect(view.trim?.proposal?.project.clips.b?.start).toBe(110);
      expect(view.trim?.proposal?.repaint.get("v1")).toEqual({ from: 0, to: Infinity });
      key("keydown", "Alt", { altKey: true, ctrlKey: true });
      expect(view.trim?.proposal).toMatchObject({ ripple: true, linked: false });
      key("keyup", "Control", { altKey: true });
      expect(view.trim?.proposal).toMatchObject({ ripple: false, linked: false });
      session.state.set((state) => ({ ...state, ripple: true }));
      expect(view.trim?.proposal?.ripple).toBe(true);
      pointer("pointerup", x(30) - 2, 200, { altKey: true });
      expect(onTrimEdge).toHaveBeenCalledWith({ kind: "trim", clipId: "a", edge: "out", rightId: null, deltaFrames: 10, ripple: true, linked: false });
    });

    it("turns the edge red at the media start, says so in the tooltip and clamps", () => {
      const { view, scheduler, pointer } = trimSetup();
      // a starts 30 frames into its media (in = 1 s): an in trim can extend it by 30, but frame 0 stops it first.
      // b starts at its media start: the in point cannot move left at all.
      pointer("pointerdown", x(100) + 2, 200);
      pointer("pointermove", x(90) + 2, 200);
      expect(view.trim?.proposal?.result).toMatchObject({ delta: 0, requested: -10, mediaBound: "start" });
      fills.length = 0;
      scheduler.flush();
      expect(scene()?.tooltip).toMatchObject({ alert: "Media start" });
      expect(fills.some((fill) => fill.style === testTheme().color.danger)).toBe(true);
      // Back inside the media: no longer red.
      pointer("pointermove", x(105) + 2, 200);
      expect(view.trim?.proposal?.result).toMatchObject({ delta: 5, mediaBound: null });
      scheduler.flush();
      expect(scene()?.tooltip?.alert).toBeNull();
      pointer("pointerup", x(105) + 2, 200);
    });

    it("snaps the dragged edge to the playhead, not to the clips it moves", () => {
      const { view, session, pointer } = trimSetup();
      setPlayhead(session, 131);
      pointer("pointerdown", x(140) - 2, 200);
      // The edge at 131.5 + 1 frame: within 8 px of the playhead.
      pointer("pointermove", x(132.5) - 2, 200);
      expect(view.trim?.proposal).toMatchObject({ snap: { kind: "playhead", frame: 131 } });
      expect(view.trim?.proposal?.result.delta).toBe(-9);
      pointer("pointerup", x(132.5) - 2, 200);
      // a's in edge near its own out edge: the trimmed clip is no candidate.
      pointer("pointerdown", x(0) + 2, 200);
      pointer("pointermove", x(18) + 2, 200);
      expect(view.trim?.proposal?.snap?.ref ?? null).not.toBe("a");
      pointer("pointerup", x(18) + 2, 200);
    });

    it("cancels with Esc and on a document change; a click on an edge selects the clip", () => {
      const { view, document, session, pointer, onTrimEdge, onTrimPreview } = trimSetup();
      pointer("pointerdown", x(140) - 2, 200);
      pointer("pointermove", x(130), 200);
      onTrimPreview.mockClear();
      expect(view.cancelGesture()).toBe(true);
      expect(onTrimPreview).toHaveBeenCalledTimes(1);
      pointer("pointerup", x(130), 200);
      pointer("pointerdown", x(140) - 2, 200);
      pointer("pointermove", x(130), 200);
      document.dispatch(updateClip("b", { name: "renamed" }));
      expect(view.trimming).toBe(false);
      pointer("pointerup", x(130), 200);
      expect(onTrimEdge).not.toHaveBeenCalled();
      // A press and release on a's edge: a click, which selects a with its linked partner.
      pointer("pointerdown", x(20) - 2, 200);
      pointer("pointerup", x(20) - 2, 200);
      const selection = session.selection.getState();
      expect([...selection.clipIds].sort()).toEqual(["a", "au"]);
      expect(onTrimEdge).not.toHaveBeenCalled();
    });

    it("draws the sync badge on an offset linked clip", () => {
      const { document, scheduler } = trimSetup();
      texts.length = 0;
      scheduler.flush();
      expect(texts.some((text) => text.style === testTheme().color.danger)).toBe(false);
      document.dispatch(updateClip("au", { start: 3 }));
      scheduler.flush();
      expect(texts).toContainEqual({ style: testTheme().color.danger, text: "-3" });
      expect(texts).toContainEqual({ style: testTheme().color.danger, text: "+3" });
    });

    describe("rolls, slips, slides, rate stretches and edit points (Batch 14)", () => {
      /** V1: a [0, 50) at its media start, b [50, 90) 100 frames into its media, c [90, 120); all abutting. */
      function cutSetup() {
        const t = setup();
        const add = (id: string, start: number, duration: number, inFrames: number) =>
          t.document.dispatch(
            addClip({ ...makeMediaClip(t.document.getState(), { id, trackId: "v1", start, duration, mediaId: "m" }), in: frameToUs(inFrames, FPS_30), out: frameToUs(inFrames + duration, FPS_30) }),
          );
        add("a", 0, 50, 0);
        add("b", 50, 40, 100);
        add("c", 90, 30, 0);
        t.scheduler.flush();
        return t;
      }

      it("shows the roll cursor on a cut with Mod+Alt and rolls it: both sides in the preview, one request", () => {
        const { view, document, overlay, pointer, key, onTrimEdge } = cutSetup();
        const before = document.getState();
        pointer("pointermove", x(50) - 1, 200);
        expect(overlay.style.cursor).toBe(cursors.out);
        key("keydown", "Alt", { ctrlKey: true, altKey: true });
        expect(overlay.style.cursor).toBe(cursors.roll);
        key("keyup", "Alt", { ctrlKey: true });
        expect(overlay.style.cursor).toBe(cursors.rippleOut);
        pointer("pointerdown", x(50) - 1, 200, { ctrlKey: true, altKey: true });
        pointer("pointermove", x(60) - 1, 200, { ctrlKey: true, altKey: true });
        expect(view.trim?.kind).toBe("roll");
        expect(overlay.style.cursor).toBe(cursors.roll);
        expect(view.trim?.proposal?.result.delta).toBe(10);
        expect(view.trimPreview?.previewSplit).toEqual({ leftFrame: 59, rightFrame: 60 });
        expect(view.trimPreview?.project.clips.a).toMatchObject({ start: 0, duration: 60 });
        expect(view.trimPreview?.project.clips.b).toMatchObject({ start: 60, duration: 30 });
        expect(document.getState()).toBe(before);
        // Releasing Alt mid-drag keeps the roll (Mod+Alt only starts it).
        pointer("pointermove", x(62) - 1, 200, { ctrlKey: true });
        expect(view.trim?.proposal?.result.delta).toBe(12);
        pointer("pointerup", x(62) - 1, 200);
        expect(onTrimEdge).toHaveBeenCalledWith({ kind: "roll", clipId: "a", edge: "out", rightId: "b", deltaFrames: 12, ripple: false, linked: true });
      });

      it("a click on a cut selects its edit point (a roll's, or a ripple side's), drawn as brackets; clicks elsewhere drop it", () => {
        const { session, scheduler, pointer } = cutSetup();
        pointer("pointerdown", x(25), 200);
        pointer("pointerup", x(25), 200);
        expect([...session.selection.getState().clipIds]).toEqual(["a"]);
        pointer("pointerdown", x(50) + 1, 200);
        pointer("pointerup", x(50) + 1, 200);
        expect(session.editPoint.getState()).toEqual({ left: "a", right: "b", side: "both" });
        expect(session.selection.getState().kind).toBe("none");
        scheduler.flush();
        expect(scene()?.editPoints).toEqual([{ trackId: "v1", frame: 50, side: "both" }]);
        // With Ripple mode on, the side under the pointer.
        session.state.set((state) => ({ ...state, ripple: true }));
        pointer("pointerdown", x(90) - 1, 200);
        pointer("pointerup", x(90) - 1, 200);
        expect(session.editPoint.getState()).toEqual({ left: "b", right: "c", side: "left" });
        // A click on a clip selects it and drops the edit point; so does a click on empty space.
        pointer("pointerdown", x(100), 200);
        pointer("pointerup", x(100), 200);
        expect(session.editPoint.getState()).toBeNull();
        pointer("pointerdown", x(50), 200);
        pointer("pointerup", x(50), 200);
        expect(session.editPoint.getState()).not.toBeNull();
        pointer("pointerdown", x(300), 200);
        pointer("pointerup", x(300), 200);
        expect(session.editPoint.getState()).toBeNull();
        scheduler.flush();
        expect(scene()?.editPoints).toEqual([]);
      });

      it("Slip tool: the content moves with the pointer under the clip, both new edge frames side by side", () => {
        const { view, session, document, scheduler, overlay, pointer, onTrimEdge } = cutSetup();
        session.state.set((state) => ({ ...state, activeTool: "slip" }));
        pointer("pointermove", x(70), 200);
        expect(overlay.style.cursor).toBe(cursors.slip);
        const before = document.getState();
        pointer("pointerdown", x(70), 200);
        pointer("pointermove", x(65), 200);
        expect(view.trim?.kind).toBe("slip");
        // Dragged 5 frames left: the source moves 5 frames later.
        expect(view.trim?.proposal?.result.delta).toBe(5);
        expect(view.trimPreview?.previewSplit).toEqual({ leftFrame: 50, rightFrame: 89 });
        expect(view.trimPreview?.project.clips.b).toMatchObject({ start: 50, duration: 40, in: frameToUs(105, FPS_30) });
        scheduler.flush();
        expect(scene()?.tooltip?.text).toBe("Δ +00:00:05 · In 00:03:15");
        expect(document.getState()).toBe(before);
        pointer("pointerup", x(65), 200);
        expect(onTrimEdge).toHaveBeenCalledWith({ kind: "slip", clipId: "b", edge: "in", rightId: null, deltaFrames: 5, ripple: false, linked: true });
        // The press selected the clip.
        expect([...session.selection.getState().clipIds]).toEqual(["b"]);
      });

      it("Slide tool: the clip follows the pointer, its neighbors trim, their new edges side by side", () => {
        const { view, session, overlay, pointer, onTrimEdge } = cutSetup();
        session.state.set((state) => ({ ...state, activeTool: "slide" }));
        pointer("pointermove", x(50) + 1, 200);
        expect(overlay.style.cursor).toBe(cursors.slide);
        pointer("pointerdown", x(70), 200);
        pointer("pointermove", x(75), 200);
        expect(view.trim?.kind).toBe("slide");
        expect(view.trimPreview?.project.clips.a).toMatchObject({ start: 0, duration: 55 });
        expect(view.trimPreview?.project.clips.b).toMatchObject({ start: 55, duration: 40 });
        expect(view.trimPreview?.project.clips.c).toMatchObject({ start: 95, duration: 25, in: frameToUs(5, FPS_30) });
        expect(view.trimPreview?.previewSplit).toEqual({ leftFrame: 54, rightFrame: 95 });
        pointer("pointerup", x(75), 200);
        expect(onTrimEdge).toHaveBeenCalledWith({ kind: "slide", clipId: "b", edge: "in", rightId: null, deltaFrames: 5, ripple: false, linked: true });
      });

      it("draws the speed badge on video and audio clips whose speed is not 1", () => {
        const { document, scheduler } = cutSetup();
        texts.length = 0;
        scheduler.flush();
        expect(texts.some((text) => text.style === testTheme().color.textSecondary && text.text.endsWith("x"))).toBe(false);
        document.dispatch(updateClip("c", { speed: 0.5 }));
        scheduler.flush();
        expect(texts).toContainEqual({ style: testTheme().color.textSecondary, text: "0.5x" });
      });

      it("Rate stretch tool: edges stretch with the new speed in the tooltip, bodies only select", () => {
        const { view, session, scheduler, overlay, pointer, onTrimEdge, onMoveClips } = cutSetup();
        session.state.set((state) => ({ ...state, activeTool: "rateStretch" }));
        pointer("pointermove", x(120) - 2, 200);
        expect(overlay.style.cursor).toBe(cursors.stretchOut);
        pointer("pointermove", x(105), 200);
        expect(overlay.style.cursor).toBe("default");
        pointer("pointerdown", x(120) - 2, 200);
        pointer("pointermove", x(150) - 2, 200);
        expect(view.trim?.kind).toBe("stretch");
        expect(view.trimPreview?.project.clips.c).toMatchObject({ start: 90, duration: 60, speed: 0.5, in: 0, out: frameToUs(30, FPS_30) });
        scheduler.flush();
        expect(scene()?.tooltip?.text).toBe("Δ +00:01:00 · 00:02:00 · 0.5x");
        pointer("pointerup", x(150) - 2, 200);
        expect(onTrimEdge).toHaveBeenCalledWith({ kind: "stretch", clipId: "c", edge: "out", rightId: null, deltaFrames: 30, ripple: false, linked: true });
        // A body drag does nothing with this tool.
        pointer("pointerdown", x(105), 200);
        pointer("pointermove", x(130), 200);
        expect(view.trimming).toBe(false);
        expect(view.dragging).toBeNull();
        pointer("pointerup", x(130), 200);
        expect(onMoveClips).not.toHaveBeenCalled();
      });
    });
  });

  it("Mod+Shift+. centers the view on the playhead, within the scroll range", () => {
    const { view, session } = setup(100);
    setPlayhead(session, 500);
    view.centerPlayhead();
    // 824 px of track area at 4 px/frame: 103 frames left of the playhead.
    expect(session.state.getState().timeline.scrollFrame).toBe(397);
    setPlayhead(session, 10);
    view.centerPlayhead();
    expect(session.state.getState().timeline.scrollFrame).toBe(0);
  });

  it("stops drawing and listening once unmounted", () => {
    const { view, session, scheduler, pointer, idle, unmount } = setup(5);
    // Unmounted mid-scrub: the drag's ticker and idle pause end with it.
    pointer("pointerdown", 176 + 40, 10);
    scheduler.flush();
    unmount();
    expect(scheduler.tickers.size).toBe(0);
    expect(idle.resume).toHaveBeenCalledWith("gesture");
    setPlayhead(session, 40);
    view.zoomBy(2);
    expect(scheduler.flush()).toEqual([]);
    expect(view.mounted).toBe(false);
  });

  describe("snapping (spec §6.9)", () => {
    /** V1: a [0, 20) and b [100, 140), at 4 px/frame from x = 176. */
    function snapSetup() {
      const t = setup();
      t.document.dispatch(addClip(makeMediaClip(t.document.getState(), { id: "a", trackId: "v1", start: 0, duration: 20, mediaId: "m" })));
      t.document.dispatch(addClip(makeMediaClip(t.document.getState(), { id: "b", trackId: "v1", start: 100, duration: 40, mediaId: "m" })));
      t.scheduler.flush();
      return t;
    }
    const scene = () => vi.mocked(drawOverlay).mock.lastCall?.[0];
    const zoom = (session: ReturnType<typeof setup>["session"], pxPerFrame: number) =>
      session.state.set((state) => ({ ...state, timeline: { ...state.timeline, pxPerFrame, scrollFrame: 0 } }));
    const sKey = (type: "keydown" | "keyup", init: KeyboardEventInit = {}) => window.dispatchEvent(new KeyboardEvent(type, { key: "s", code: "KeyS", bubbles: true, ...init }));

    it("snaps a clip's edge to another clip's end within 8 px at any zoom, with the line and the name, and lets go beyond", () => {
      const { view, session, scheduler, pointer } = snapSetup();
      // 4 px/frame: b pressed at frame 120 (x 656). x 344 puts its start at 22, 8 px from a's end.
      pointer("pointerdown", 656, 200);
      pointer("pointermove", 344, 200);
      expect(view.dragging?.proposal).toMatchObject({ deltaFrames: -80, snap: { frame: 20, kind: "clipEnd", ref: "a" } });
      scheduler.flush();
      expect(scene()?.snapFrame).toBe(20);
      expect(scene()?.tooltip).toMatchObject({ text: "Δ -00:02:20", target: "End of a" });
      // The ghost sticks: anywhere within the threshold gives the same drop.
      pointer("pointermove", 340, 200);
      expect(view.dragging?.proposal?.deltaFrames).toBe(-80);
      // 9 px away: free, rounded to the frame under the pointer.
      pointer("pointermove", 345, 200);
      expect(view.dragging?.proposal).toMatchObject({ deltaFrames: -78, snap: null });
      scheduler.flush();
      expect(scene()?.snapFrame).toBeNull();
      expect(scene()?.tooltip?.target).toBeNull();
      pointer("pointerup", 345, 200);

      // 1 px/frame: b at x 276..316; 8 px is now 8 frames.
      zoom(session, 1);
      scheduler.flush();
      pointer("pointerdown", 296, 200);
      pointer("pointermove", 224, 200);
      expect(view.dragging?.proposal).toMatchObject({ deltaFrames: -80, snap: { frame: 20 } });
      pointer("pointermove", 225, 200);
      expect(view.dragging?.proposal).toMatchObject({ deltaFrames: -71, snap: null });
      pointer("pointerup", 225, 200);
    });

    it("tests the trailing edge too, snaps to the playhead (following it while dragging), never to the dragged clip itself", () => {
      const { view, session, pointer } = snapSetup();
      setPlayhead(session, 300);
      pointer("pointerdown", 656, 200);
      // Start at 258, end at 298: the end is 2 frames from the playhead.
      pointer("pointermove", 656 + 158 * 4, 200);
      expect(view.dragging?.proposal).toMatchObject({ deltaFrames: 160, snap: { kind: "playhead", frame: 300 } });
      // The playhead moves (playback) under a still pointer: the drag follows it.
      setPlayhead(session, 400);
      expect(view.dragging?.proposal).toMatchObject({ deltaFrames: 158, snap: null });
      // b's own edges are no candidates: 1 frame left of where it started.
      pointer("pointermove", 652, 200);
      expect(view.dragging?.proposal).toMatchObject({ deltaFrames: -1, snap: null });
      pointer("pointerup", 652, 200);
    });

    it("lets an Alt duplicate snap to its original", () => {
      const { view, pointer, key } = snapSetup();
      pointer("pointerdown", 656, 200);
      // Start at 142: 2 frames past b's end.
      pointer("pointermove", 656 + 42 * 4, 200);
      expect(view.dragging?.proposal?.snap).toBeNull();
      key("keydown", "Alt", { altKey: true });
      expect(view.dragging?.proposal).toMatchObject({ duplicate: true, deltaFrames: 40, snap: { frame: 140, kind: "clipEnd", ref: "b" } });
      key("keyup", "Alt");
      pointer("pointerup", 656 + 42 * 4, 200);
    });

    it("with snapping off, holding S snaps for the drag and releasing it stops at once; S never reaches the shortcuts mid-drag", () => {
      const { view, session, pointer } = snapSetup();
      session.state.set((state) => ({ ...state, snap: false }));
      const shortcuts = vi.fn();
      window.addEventListener("keydown", shortcuts);
      pointer("pointerdown", 656, 200);
      pointer("pointermove", 344, 200);
      expect(view.dragging?.proposal).toMatchObject({ deltaFrames: -78, snap: null });
      sKey("keydown");
      expect(view.snapping).toBe(true);
      expect(view.dragging?.proposal).toMatchObject({ deltaFrames: -80, snap: { frame: 20 } });
      sKey("keyup");
      expect(view.dragging?.proposal).toMatchObject({ deltaFrames: -78, snap: null });
      // With Shift held too (keep tracks), S still holds: it is not Shift+S.
      sKey("keydown", { shiftKey: true });
      expect(view.dragging?.proposal?.snap).not.toBeNull();
      expect(shortcuts).not.toHaveBeenCalled();
      pointer("pointerup", 344, 200, { shiftKey: true });
      // The drop ends the hold; the setting never changed.
      expect(view.snapping).toBe(false);
      expect(session.state.getState().snap).toBe(false);
      // Outside a drag S goes to the shortcuts (the toggle).
      sKey("keydown");
      expect(shortcuts).toHaveBeenCalledTimes(1);
      window.removeEventListener("keydown", shortcuts);
    });

    it("reads S as the shortcuts do: by the letter, by the key position when Option gives another character", () => {
      const { view, session, pointer } = snapSetup();
      session.state.set((state) => ({ ...state, snap: false }));
      pointer("pointerdown", 656, 200);
      pointer("pointermove", 344, 200);
      // A Dvorak layout types "o" on the S position: not S.
      sKey("keydown", { key: "o" });
      expect(view.dragging?.proposal?.snap).toBeNull();
      sKey("keyup", { key: "o" });
      // Option+S on macOS types "ß".
      sKey("keydown", { key: "ß", altKey: true });
      expect(view.dragging?.proposal?.snap).not.toBeNull();
      sKey("keyup", { key: "ß", altKey: true });
      expect(view.dragging?.proposal?.snap).toBeNull();
      // "s" from another key position (Dvorak).
      sKey("keydown", { key: "s", code: "Semicolon" });
      expect(view.dragging?.proposal?.snap).not.toBeNull();
      pointer("pointerup", 344, 200);
    });

    it("does not hold S for a press made before the drag (its repeats arrive during the drag)", () => {
      const { view, session, pointer } = snapSetup();
      session.state.set((state) => ({ ...state, snap: false }));
      pointer("pointerdown", 656, 200);
      pointer("pointermove", 344, 200);
      sKey("keydown", { repeat: true });
      expect(view.dragging?.proposal?.snap).toBeNull();
      pointer("pointerup", 344, 200);
    });

    it("inverts the other way too: snapping on, holding S drags freely", () => {
      const { view, pointer } = snapSetup();
      pointer("pointerdown", 656, 200);
      pointer("pointermove", 344, 200);
      expect(view.dragging?.proposal?.deltaFrames).toBe(-80);
      sKey("keydown");
      expect(view.dragging?.proposal).toMatchObject({ deltaFrames: -78, snap: null });
      sKey("keyup");
      expect(view.dragging?.proposal?.deltaFrames).toBe(-80);
      pointer("pointerup", 344, 200);
    });

    it("snaps a ruler scrub only while Shift is held, to every candidate but the playhead", () => {
      const { session, scheduler, pointer, key } = snapSetup();
      // Frame 98, 2 frames (8 px) before b's start.
      pointer("pointerdown", 176 + 98 * 4, 10);
      expect(session.state.getState().playhead).toBe(98);
      scheduler.flush();
      expect(scene()?.snapFrame).toBeNull();
      expect(scene()?.tooltip).toBeNull();
      pointer("pointermove", 176 + 98 * 4, 12, { shiftKey: true });
      expect(session.state.getState().playhead).toBe(100);
      scheduler.flush();
      expect(scene()?.snapFrame).toBe(100);
      expect(scene()?.tooltip).toMatchObject({ text: null, target: "Start of b" });
      // Shift released mid-drag: free again at once.
      key("keyup", "Shift");
      expect(session.state.getState().playhead).toBe(98);
      scheduler.flush();
      expect(scene()?.snapFrame).toBeNull();
      // Snapping off: Shift alone does nothing, Shift with S held snaps.
      session.state.set((state) => ({ ...state, snap: false }));
      key("keydown", "Shift", { shiftKey: true });
      expect(session.state.getState().playhead).toBe(98);
      sKey("keydown", { shiftKey: true });
      expect(session.state.getState().playhead).toBe(100);
      pointer("pointerup", 176 + 98 * 4, 12, { shiftKey: true });
      expect(session.state.getState().playhead).toBe(100);
    });

    it("rebuilds the snap index only on the first query after the document changed", () => {
      const { view, document, pointer } = snapSetup();
      const first = view.snapCandidates();
      pointer("pointerdown", 656, 200);
      pointer("pointermove", 344, 200);
      pointer("pointermove", 400, 200);
      expect(view.snapCandidates()).toBe(first);
      pointer("pointerup", 400, 200);
      document.dispatch(updateClip("a", { name: "Intro" }));
      expect(view.snapCandidates()).not.toBe(first);
    });
  });
});
