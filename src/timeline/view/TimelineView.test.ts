// The view's invalidation contract (P3): what redraws the content canvas and what only the overlay.
// jsdom has no canvas, so a recording stand-in for the 2D context counts the draws.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addClip, addTrack, removeClips, updateClip, updateTrack } from "../../core/commands/basicCommands.js";
import { makeMedia, makeMediaClip, makeProject, makeTrack } from "../../core/document/fixtures.js";
import type { TrackKind } from "../../core/document/types.js";
import type { InvalidationFlag, RenderView } from "../../core/scheduler/FrameScheduler.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createLayoutStore } from "../../core/store/layoutStore.js";
import { selectClips } from "../../core/store/selection.js";
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
  const idle = { pause: vi.fn(), resume: vi.fn() };
  const view = new TimelineView({ scheduler, document, session, layout, theme: { theme: testTheme(), subscribe: () => () => {} }, onAddTrack, onToggleTrack, onMoveClips, idle, platform: "other" });
  const host = window.document.createElement("div");
  window.document.body.append(host);
  const unmount = view.mount(host);
  scheduler.flush();
  const overlay = host.querySelectorAll("canvas")[1] as HTMLCanvasElement;
  const pointer = (type: string, x: number, y: number, init: PointerEventInit = {}) =>
    overlay.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, button: 0, bubbles: true, ...init }));
  /** A key event on the window (modifier changes during a drag). */
  const key = (type: "keydown" | "keyup", keyName: string, init: KeyboardEventInit = {}) => window.dispatchEvent(new KeyboardEvent(type, { key: keyName, bubbles: true, ...init }));
  return { view, session, document, layout, scheduler, overlay, pointer, key, onAddTrack, onToggleTrack, onMoveClips, idle, unmount };
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
});
