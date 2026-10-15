// The view's invalidation contract (P3): what redraws the content canvas and what only the overlay.
// jsdom has no canvas, so a recording stand-in for the 2D context counts the draws.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addClip, addTrack, removeClips, updateClip, updateTrack } from "../../core/commands/basicCommands.js";
import { addMarker, removeMarker } from "../../core/commands/markerCommands.js";
import { makeMedia, makeMediaClip, makeProject, makeTrack } from "../../core/document/fixtures.js";
import { FPS_30, frameToUs } from "../../core/document/time.js";
import type { TrackKind } from "../../core/document/types.js";
import type { InvalidationFlag, RenderView } from "../../core/scheduler/FrameScheduler.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createLayoutStore } from "../../core/store/layoutStore.js";
import { selectClips } from "../../core/store/selection.js";
import { createSessionStore, setPlayhead } from "../../core/store/sessionStore.js";
import type { Theme } from "../../core/theme/theme.js";
import { thumbLayout, type ThumbLayout } from "../../media/cache/thumbSheets.js";
import type { ClipVisualsSource } from "./clipVisuals.js";
import { trimCursors } from "./cursors.js";
import { drawOverlay } from "./drawOverlay.js";
import { testTheme } from "./fixtures.js";
import { NO_MODIFIERS as NO_MODS } from "./gestures/moveClips.js";
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
/** Every drawImage of every canvas: the image and the destination x and width. */
const images: { image: unknown; x: number; width: number }[] = [];

/** A 2D context that accepts every call; text is 6 px per character. */
function fakeContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const state: Record<string | symbol, unknown> = {
    canvas,
    font: "",
    measureText: (text: string) => ({ width: text.length * 6 }),
    fillRect: (_x: number, _y: number, width: number) => void fills.push({ style: state.fillStyle, width }),
    fillText: (text: string) => void texts.push({ style: state.fillStyle, text }),
    drawImage: (image: unknown, ...args: number[]) => void images.push({ image, x: args.at(-4) as number, width: args.at(-2) as number }),
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

function setup(clipCount = 0, theme: Theme = testTheme()) {
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
  const onRazor = vi.fn();
  const onContextMenu = vi.fn();
  const onReorderTrack = vi.fn();
  const onRenameTrack = vi.fn();
  const onSpaceTap = vi.fn();
  const onMoveMarker = vi.fn();
  const onEditMarker = vi.fn();
  const onDropFiles = vi.fn();
  const idle = { pause: vi.fn(), resume: vi.fn() };
  const view = new TimelineView({
    scheduler,
    document,
    session,
    layout,
    theme: { theme, subscribe: () => () => {} },
    onAddTrack,
    onToggleTrack,
    onMoveClips,
    onTrimEdge,
    onTrimPreview,
    onRazor,
    onContextMenu,
    onReorderTrack,
    onRenameTrack,
    onSpaceTap,
    onMoveMarker,
    onEditMarker,
    onDropFiles,
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
  return { view, session, document, layout, scheduler, overlay, pointer, key, onAddTrack, onToggleTrack, onMoveClips, onTrimEdge, onTrimPreview, onRazor, onContextMenu, onReorderTrack, onRenameTrack, onSpaceTap, onMoveMarker, onEditMarker, onDropFiles, idle, unmount };
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
    // A1 232..288: target 72..88, lock 92..108, mute 112..128, solo 132..148, height 152..168 x 240..256.
    pointer("pointermove", 140, 248);
    expect(overlay.style.cursor).toBe("pointer");
    pointer("pointerdown", 120, 248);
    pointer("pointerdown", 140, 248);
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

  it("shows media dragged in from the Media panel as ghosts (video on V2, its audio on a new A2) and gives one request at the drop", () => {
    const { view, document, scheduler, idle } = setup(5);
    document.dispatch(addTrack(makeTrack("v2"), 1));
    scheduler.flush();
    const before = document.getState();
    const media = before.media.m!;
    const range = { inUs: 0, outUs: 1_000_000 };
    // Frame 60 (x 176 + 4 * 60), V2 (y 116..172).
    view.dragMedia([{ media, range }], 416, 140, NO_MODS);
    expect(idle.pause).toHaveBeenCalledWith("gesture");
    const proposal = view.mediaDrop?.proposal;
    expect(proposal?.ghosts.map((g) => [g.clip.kind, g.start, g.clip.duration, g.target.number, g.target.track?.id ?? null])).toEqual([
      ["video", 60, 30, 1, "v2"],
      ["audio", 60, 30, 1, null],
    ]);
    expect(proposal?.newLanes).toEqual([{ kind: "audio", lane: 1, name: "A2" }]);
    expect(scheduler.flush()).toEqual(["timelineOverlay"]);
    const scene = vi.mocked(drawOverlay).mock.lastCall?.[0];
    expect(scene?.move?.proposal).toBe(proposal);
    expect(scene?.tooltip?.text).toBe("00:02:00 · 00:01:00");
    // Mod (held during the drag) inserts.
    view.dragMedia([{ media, range }], 416, 140, { ...NO_MODS, mod: true });
    expect(view.mediaDrop?.proposal?.insertFrame).toBe(60);
    expect(view.endMediaDrag()).toEqual({ items: [{ mediaId: "m", range }], start: 60, lanes: { video: 1, audio: 1 }, mode: "insert" });
    expect(view.mediaDrop).toBeNull();
    expect(idle.resume).toHaveBeenCalledWith("gesture");
    expect(document.getState()).toBe(before);
    // Leaving the timeline drops the ghosts: nothing to drop then.
    view.dragMedia([{ media, range }], 416, 140, NO_MODS);
    view.leaveMediaDrag();
    expect(view.endMediaDrag()).toBeNull();
  });

  it("takes files dropped from the OS: the drop frame follows the pointer, the controller gets the transfer and the request", () => {
    const { view, overlay, onDropFiles } = setup(5);
    const transfer = { types: ["Files"], dropEffect: "none" };
    const drag = (type: string, x: number, y: number) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.assign(event, { dataTransfer: transfer, offsetX: x, offsetY: y, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
      overlay.dispatchEvent(event);
      return event;
    };
    expect(drag("dragenter", 300, 200).defaultPrevented).toBe(true);
    drag("dragover", 316, 200);
    expect(transfer.dropEffect).toBe("copy");
    // Frame 35 (x 176 + 4 * 35): no snap target within 8 px.
    expect([view.mediaDrop?.proposal?.ghosts.length, view.mediaDrop?.proposal?.insertFrame]).toEqual([0, 35]);
    drag("dragleave", 316, 200);
    expect(view.mediaDrop).toBeNull();
    drag("dragover", 336, 200);
    drag("drop", 336, 200);
    expect(onDropFiles).toHaveBeenCalledWith(transfer, { items: [], start: 40, lanes: { video: 0, audio: 0 }, mode: "overwrite" });
    expect(view.mediaDrop).toBeNull();
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

  describe("navigation (Batch 18)", () => {
    /** The test theme with 12 px scrollbars (36 px shortest thumb) and the DS keyboard zoom easing. */
    function navTheme(): Theme {
      const theme = testTheme();
      theme.timeline.scrollbarSize = 12;
      theme.timeline.scrollbarMinThumb = 36;
      theme.motion.micro = 120;
      theme.ease.out = [0.2, 0, 0, 1];
      return theme;
    }
    const timeline = (session: ReturnType<typeof setup>["session"]) => session.state.getState().timeline;

    it("draws the scrollbars under and beside the track area, which ends where they begin", () => {
      const { view, scheduler } = setup(500, navTheme());
      fills.length = 0;
      view.fit();
      scheduler.flush();
      // 1000 x 428 panel: track area 176..988 x 28..416.
      expect(view.geometry().area).toEqual({ x: 176, y: 28, width: 812, height: 388 });
      // The vertical trough (its thumb is a filled pill, not a rect).
      expect(fills.some((fill) => fill.style === "--surface-1" && fill.width === 12)).toBe(true);
      const layout = view.scrollbars();
      expect(layout?.h.trough).toEqual({ x: 176, y: 416, width: 812, height: 12 });
      // Two tracks fit in 388 px: no vertical thumb.
      expect(layout?.v.thumb).toBeNull();
    });

    it("scrolls with a thumb drag; the right zoom handle zooms with the left edge fixed; the overlay lights the dragged part", () => {
      const { view, session, scheduler, pointer, overlay } = setup(500, navTheme());
      const thumb = () => view.scrollbars()?.h.thumb ?? { x: 0, y: 0, width: 0, height: 0 };
      const start = thumb();
      // 5000 frames of content at 4 px/frame.
      pointer("pointermove", start.x + start.width / 2, 422);
      scheduler.flush();
      expect(overlay.style.cursor).not.toBe("ew-resize");
      pointer("pointerdown", start.x + start.width / 2, 422);
      pointer("pointermove", start.x + start.width / 2 + 100, 422);
      scheduler.flush();
      expect(thumb().x).toBeCloseTo(start.x + 100, 6);
      expect(timeline(session).scrollFrame).toBeGreaterThan(0);
      expect(timeline(session).pxPerFrame).toBe(4);
      expect(vi.mocked(drawOverlay).mock.lastCall?.[0].scrollbar).toMatchObject({ hit: { axis: "x", part: "thumb" }, active: true });
      pointer("pointerup", start.x + start.width / 2 + 100, 422);
      scheduler.flush();

      const scrolled = timeline(session).scrollFrame;
      const end = thumb().x + thumb().width;
      pointer("pointermove", end - 2, 422);
      scheduler.flush();
      expect(overlay.style.cursor).toBe("ew-resize");
      pointer("pointerdown", end - 2, 422);
      pointer("pointermove", end - 2 - 10, 422);
      scheduler.flush();
      // The thumb is at its 36 px minimum (203 of 5051 frames): its end moves by the pointer's travel.
      expect(timeline(session).pxPerFrame).toBeGreaterThan(4);
      expect(timeline(session).pxPerFrame).toBeLessThan(400);
      expect(timeline(session).scrollFrame).toBe(scrolled);
      pointer("pointermove", end - 2 + 300, 422);
      expect(timeline(session).pxPerFrame).toBeLessThan(4);
      expect(timeline(session).scrollFrame).toBe(scrolled);
      pointer("pointerup", end - 2 + 300, 422);
    });

    it("jumps to a trough press (the thumb's middle under the pointer) and keeps dragging", () => {
      const { view, session, pointer } = setup(500, navTheme());
      pointer("pointerdown", 900, 422);
      const thumb = view.scrollbars()?.h.thumb;
      expect(timeline(session).scrollFrame).toBeGreaterThan(0);
      expect((thumb?.x ?? 0) + (thumb?.width ?? 0) / 2).toBeCloseTo(900, 4);
      pointer("pointermove", 800, 422);
      expect(((view.scrollbars()?.h.thumb.x ?? 0) + (thumb?.width ?? 0) / 2)).toBeCloseTo(800, 4);
      pointer("pointerup", 800, 422);
    });

    it("scrolls the tracks with the vertical thumb", () => {
      const { view, session, document, pointer } = setup(0, navTheme());
      for (let i = 2; i <= 9; i++) document.dispatch(addTrack(makeTrack(`v${i}`)));
      const thumb = view.scrollbars()?.v.thumb;
      expect(thumb).not.toBeNull();
      const y = (thumb?.y ?? 0) + 5;
      pointer("pointerdown", 994, y);
      pointer("pointermove", 994, y - 60);
      pointer("pointerup", 994, y - 60);
      expect(timeline(session).scrollY).toBeLessThan(0);
      expect(view.scrollbars()?.v.thumb?.y).toBeCloseTo((thumb?.y ?? 0) - 60, 4);
    });

    it("Hand tool: a press on a clip pans both ways instead of selecting it; the ruler still scrubs", () => {
      const { view, session, document, pointer, overlay, onMoveClips } = setup(500);
      for (let i = 2; i <= 9; i++) document.dispatch(addTrack(makeTrack(`v${i}`)));
      session.state.set((state) => ({ ...state, activeTool: "hand" }));
      const scrollY = timeline(session).scrollY;
      pointer("pointermove", 176 + 15 * 8, 200);
      expect(overlay.style.cursor).toBe("grab");
      pointer("pointerdown", 176 + 15 * 8, 200);
      expect(overlay.style.cursor).toBe("grabbing");
      pointer("pointermove", 176 + 15 * 8 - 40, 230);
      pointer("pointerup", 176 + 15 * 8 - 40, 230);
      expect(timeline(session).scrollFrame).toBe(10);
      expect(timeline(session).scrollY).toBe(scrollY - 30);
      expect(session.selection.getState().kind).toBe("none");
      expect(onMoveClips).not.toHaveBeenCalled();
      pointer("pointerdown", 176 + 40, 10);
      pointer("pointerup", 176 + 40, 10);
      expect(session.state.getState().playhead).toBe(20);
      expect(view.isFollowing).toBe(false);
    });

    it("middle drag pans with any tool, from the ruler too", () => {
      const { session, pointer } = setup(500);
      pointer("pointerdown", 400, 10, { button: 1 });
      pointer("pointermove", 320, 10, { button: 1 });
      pointer("pointerup", 320, 10, { button: 1 });
      expect(timeline(session).scrollFrame).toBe(20);
      expect(session.state.getState().playhead).toBe(0);
    });

    it("Space on empty track space arms a pan the shortcuts never see; released without a drag it plays", () => {
      const { view, session, pointer, overlay, onSpaceTap } = setup(5);
      const reached = vi.fn();
      window.addEventListener("keydown", reached);
      try {
        const space = (type: "keydown" | "keyup") => window.dispatchEvent(new KeyboardEvent(type, { key: " ", code: "Space", bubbles: true, cancelable: true }));
        // Over a1's empty row (no clip on it).
        pointer("pointermove", 600, 260);
        space("keydown");
        expect(reached).not.toHaveBeenCalled();
        expect(overlay.style.cursor).toBe("grab");
        space("keyup");
        expect(onSpaceTap).toHaveBeenCalledTimes(1);
        expect(overlay.style.cursor).toBe("default");
        // Held with a drag: a pan, and no play on release.
        space("keydown");
        pointer("pointerdown", 600, 260);
        pointer("pointermove", 560, 260);
        pointer("pointerup", 560, 260);
        space("keyup");
        expect(onSpaceTap).toHaveBeenCalledTimes(1);
        expect(timeline(session).scrollFrame).toBe(0);
        // Over a clip, or while playing: Space goes on to the shortcuts at once.
        pointer("pointermove", 176 + 15 * 4, 200);
        space("keydown");
        space("keyup");
        view.playing = true;
        pointer("pointermove", 600, 260);
        space("keydown");
        space("keyup");
        expect(reached).toHaveBeenCalledTimes(2);
        expect(onSpaceTap).toHaveBeenCalledTimes(1);
      } finally {
        window.removeEventListener("keydown", reached);
      }
    });

    it("Space+drag pans the view (scroll limits apply)", () => {
      const { session, pointer } = setup(500);
      pointer("pointermove", 600, 260);
      window.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true }));
      pointer("pointerdown", 600, 260);
      pointer("pointermove", 520, 260);
      pointer("pointerup", 520, 260);
      window.dispatchEvent(new KeyboardEvent("keyup", { key: " ", code: "Space", bubbles: true }));
      expect(timeline(session).scrollFrame).toBe(20);
    });

    it("eases keyboard zoom steps over 120 ms with the playhead held in place; fast presses add up", () => {
      const { view, session, scheduler } = setup(500, navTheme());
      setPlayhead(session, 50);
      view.zoomBy(1.25);
      // Nothing moves before the first frame.
      expect(timeline(session).pxPerFrame).toBe(4);
      scheduler.flush();
      const first = timeline(session).pxPerFrame;
      expect(first).toBeGreaterThan(4);
      expect(first).toBeLessThan(5);
      // The playhead stays at x = 200 in the track area.
      expect((50 - timeline(session).scrollFrame) * first).toBeCloseTo(200, 6);
      view.zoomBy(1.25);
      for (let i = 0; i < 10; i++) scheduler.flush();
      expect(timeline(session).pxPerFrame).toBeCloseTo(6.25, 9);
      expect(scheduler.tickers.size).toBe(0);
      // A wheel zoom during a step ends the step where the wheel puts it.
      view.zoomBy(0.8);
      scheduler.flush();
      view.fit();
      const fitted = timeline(session).pxPerFrame;
      scheduler.flush();
      expect(timeline(session).pxPerFrame).toBe(fitted);
      expect(scheduler.tickers.size).toBe(0);
    });

    it("zooms to a span with 10% of the view free on each side", () => {
      const { view, session } = setup(500);
      // 824 px of track area: 100 frames in 659.2 px, 82.4 px (12.5 frames) of margin each side.
      view.zoomToFrames(100, 200);
      expect(timeline(session).pxPerFrame).toBeCloseTo(6.592, 9);
      expect(timeline(session).scrollFrame).toBeCloseTo(87.5, 9);
    });
  });

  describe("markers and the in/out range (Batch 19)", () => {
    /** V1: a [0, 20) and b [100, 140); marker m at 50; 4 px/frame from x = 176 (ruler y < 28, markers at y >= 18). */
    function markerSetup() {
      const t = setup();
      t.document.dispatch(addClip(makeMediaClip(t.document.getState(), { id: "a", trackId: "v1", start: 0, duration: 20, mediaId: "m" })));
      t.document.dispatch(addClip(makeMediaClip(t.document.getState(), { id: "b", trackId: "v1", start: 100, duration: 40, mediaId: "m" })));
      t.document.dispatch(addMarker({ id: "mk", frame: 50, color: "green", label: "Drop" }));
      t.scheduler.flush();
      return t;
    }
    const x = (frame: number) => 176 + frame * 4;
    const scene = () => vi.mocked(drawOverlay).mock.lastCall?.[0];

    it("selects a marker on the press; a drag moves it with snapping (its own frame excluded), one request on release", () => {
      const { session, scheduler, pointer, onMoveMarker, view } = markerSetup();
      pointer("pointerdown", x(50) + 1, 24);
      expect(session.marker.getState()).toBe("mk");
      pointer("pointermove", x(60) + 1, 24);
      const contentDraws = view.stats.contentDraws;
      scheduler.flush();
      // The ruler redraws once without the dragged marker; the overlay draws it at its new frame.
      expect(view.stats.contentDraws).toBe(contentDraws + 1);
      expect(scene()?.markers?.dragged).toMatchObject({ frame: 60 });
      // 2 frames (8 px) before b's start: snaps there, with the line and the name in the tooltip.
      pointer("pointermove", x(98) + 1, 24);
      scheduler.flush();
      expect(scene()?.markers?.dragged?.frame).toBe(100);
      expect(scene()?.snapFrame).toBe(100);
      expect(scene()?.tooltip).toMatchObject({ name: "Drop", text: "00:03:10", target: "Start of b" });
      pointer("pointermove", x(80), 24);
      scheduler.flush();
      expect(scene()?.snapFrame).toBeNull();
      pointer("pointermove", x(98) + 1, 24);
      pointer("pointerup", x(98) + 1, 24);
      expect(onMoveMarker).toHaveBeenCalledTimes(1);
      expect(onMoveMarker).toHaveBeenCalledWith("mk", 100);
    });

    it("a click selects without moving; Esc cancels a drag; a deleted marker ends its drag", () => {
      const { document, session, scheduler, pointer, key, onMoveMarker } = markerSetup();
      pointer("pointerdown", x(50), 24);
      pointer("pointerup", x(50), 24);
      expect(session.marker.getState()).toBe("mk");
      expect(onMoveMarker).not.toHaveBeenCalled();
      // Clips drop the marker selection.
      pointer("pointerdown", x(10), 200);
      pointer("pointerup", x(10), 200);
      expect(session.marker.getState()).toBeNull();
      pointer("pointerdown", x(50), 24);
      pointer("pointermove", x(70), 24);
      key("keydown", "Escape");
      expect(document.getState().markers[0]?.frame).toBe(50);
      pointer("pointermove", x(80), 24);
      scheduler.flush();
      document.dispatch(removeMarker("mk"));
      pointer("pointerup", x(80), 24);
      expect(onMoveMarker).not.toHaveBeenCalled();
    });

    it("asks for the inline editor on a double-click and for the ruler menu on a right-click", () => {
      const { session, overlay, onEditMarker, onContextMenu } = markerSetup();
      overlay.dispatchEvent(new MouseEvent("dblclick", { clientX: x(50), clientY: 24, bubbles: true }));
      expect(onEditMarker).toHaveBeenCalledWith("mk");
      overlay.dispatchEvent(new MouseEvent("contextmenu", { clientX: x(50), clientY: 24, button: 2, bubbles: true, cancelable: true }));
      expect(session.marker.getState()).toBe("mk");
      expect(onContextMenu).toHaveBeenLastCalledWith({ kind: "ruler", frame: 50, markerId: "mk", x: x(50), y: 24 });
      overlay.dispatchEvent(new MouseEvent("contextmenu", { clientX: x(75), clientY: 10, button: 2, bubbles: true, cancelable: true }));
      expect(onContextMenu).toHaveBeenLastCalledWith({ kind: "ruler", frame: 75, markerId: null, x: x(75), y: 10 });
    });

    it("shows a hovered marker's label and timecode, and its edge on the overlay", () => {
      const { scheduler, pointer, overlay } = markerSetup();
      pointer("pointermove", x(50), 24);
      scheduler.flush();
      expect(scene()?.markers?.hover?.id).toBe("mk");
      expect(scene()?.tooltip).toMatchObject({ name: "Drop", text: "00:01:20" });
      expect(overlay.style.cursor).toBe("pointer");
      pointer("pointermove", x(75), 24);
      scheduler.flush();
      expect(scene()?.tooltip ?? null).toBeNull();
    });

    it("draws the range on the overlay; a handle drag snaps (not to its own point) and writes the session once on release", () => {
      const { session, scheduler, pointer, overlay } = markerSetup();
      session.state.set((state) => ({ ...state, inPoint: 30, outPoint: 60 }));
      expect(scheduler.flush()).toEqual(["timelineOverlay"]);
      expect(scene()?.range).toMatchObject({ inPoint: 30, outPoint: 60, active: null });
      const writes = vi.fn();
      session.state.select((state) => [state.inPoint, state.outPoint].join(), writes);
      pointer("pointermove", x(30), 4);
      scheduler.flush();
      expect(overlay.style.cursor).toBe("ew-resize");
      expect(scene()?.range?.active).toBe("in");
      pointer("pointerdown", x(30), 4);
      // 6 px right of a's end (20): snaps there.
      pointer("pointermove", x(21) + 2, 6);
      scheduler.flush();
      expect(scene()?.range).toMatchObject({ inPoint: 20, active: "in" });
      expect(scene()?.snapFrame).toBe(20);
      expect(scene()?.tooltip?.text).toBe("In 00:00:20 · 00:01:10");
      // Never past the out point: at least one frame stays.
      pointer("pointermove", x(90), 6);
      scheduler.flush();
      expect(scene()?.range?.inPoint).toBe(59);
      expect(writes).not.toHaveBeenCalled();
      pointer("pointermove", x(21) + 2, 6);
      pointer("pointerup", x(21) + 2, 6);
      expect(writes).toHaveBeenCalledTimes(1);
      expect(session.state.getState()).toMatchObject({ inPoint: 20, outPoint: 60 });
      // The out handle: the tooltip names the last frame of the range.
      pointer("pointerdown", x(60), 4);
      pointer("pointermove", x(70), 4);
      scheduler.flush();
      expect(scene()?.tooltip?.text).toBe("Out 00:02:09 · 00:01:20");
      pointer("pointerup", x(70), 4);
      expect(session.state.getState()).toMatchObject({ inPoint: 20, outPoint: 70 });
    });
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
  describe("cutting and gaps (Batch 15)", () => {
    /** V1: a [0, 20), b [40, 80) linked to A1's au [40, 80); V2 locked with l [0, 100); 4 px/frame from x = 176. */
    function cutSetup() {
      const t = setup();
      t.document.dispatch(addTrack({ ...makeTrack("v2"), locked: true }, 1));
      const add = (id: string, trackId: string, start: number, duration: number, extra: object = {}) =>
        t.document.dispatch(addClip({ ...makeMediaClip(t.document.getState(), { id, trackId, start, duration, mediaId: "m", kind: trackId === "a1" ? "audio" : "video" }), ...extra }));
      add("a", "v1", 0, 20);
      add("b", "v1", 40, 40, { linkGroup: "L" });
      add("au", "a1", 40, 40, { linkGroup: "L" });
      add("l", "v2", 0, 100);
      t.scheduler.flush();
      const row = (trackId: string) => (t.view.geometry().rowOf(trackId)?.y ?? 0) + 30;
      return { ...t, row };
    }
    const x = (frame: number) => 176 + frame * 4;
    const scene = () => vi.mocked(drawOverlay).mock.lastCall?.[0];
    const cursors = trimCursors(testTheme());
    const contextMenu = (overlay: HTMLCanvasElement, clientX: number, clientY: number) =>
      overlay.dispatchEvent(new MouseEvent("contextmenu", { clientX, clientY, button: 2, bubbles: true, cancelable: true }));

    it("Razor: the cut line follows the pointer over the clip (all unlocked tracks with Shift), a click cuts at the snapped frame", () => {
      const { session, scheduler, overlay, pointer, key, onRazor, row } = cutSetup();
      session.state.set((state) => ({ ...state, activeTool: "razor", snap: false }));
      pointer("pointermove", x(60), row("v1"));
      scheduler.flush();
      expect(overlay.style.cursor).toBe(cursors.razor);
      // b and its linked partner au (Linked selection on).
      expect(scene()?.razor).toMatchObject({ frame: 60 });
      expect(scene()?.razor?.clips.map((clip) => clip.id)).toEqual(["b", "au"]);
      pointer("pointermove", x(65), row("v1"));
      scheduler.flush();
      expect(scene()?.razor?.frame).toBe(65);
      // Shift: every unlocked track there (V2 is locked).
      key("keydown", "Shift", { shiftKey: true });
      scheduler.flush();
      expect(scene()?.razor?.clips.map((clip) => clip.id)).toEqual(["b", "au"]);
      key("keyup", "Shift");
      // Over a gap without Shift: no line, and no gap hover with the Razor.
      pointer("pointermove", x(30), row("v1"));
      scheduler.flush();
      expect(scene()?.razor?.clips).toEqual([]);
      expect(scene()?.hoverGap ?? null).toBeNull();
      pointer("pointerdown", x(65), row("v1"));
      pointer("pointerup", x(65), row("v1"));
      expect(onRazor).toHaveBeenLastCalledWith({ frame: 65, clipId: "b", all: false });
      // Snapping on: the cut snaps to the playhead, with the snap line.
      session.state.set((state) => ({ ...state, snap: true }));
      setPlayhead(session, 50);
      pointer("pointermove", x(51), row("v1"));
      scheduler.flush();
      expect(scene()?.razor?.frame).toBe(50);
      expect(scene()?.snapFrame).toBe(50);
      pointer("pointerdown", x(51), row("v1"), { shiftKey: true });
      expect(onRazor).toHaveBeenLastCalledWith({ frame: 50, clipId: "b", all: true });
      // A plain click on empty space or a locked clip cuts nothing; Shift+click there cuts all tracks.
      onRazor.mockClear();
      pointer("pointerdown", x(30), row("v1"));
      pointer("pointerdown", x(30), row("v2"));
      expect(onRazor).not.toHaveBeenCalled();
      pointer("pointerdown", x(30), row("v2"), { shiftKey: true });
      expect(onRazor).toHaveBeenLastCalledWith({ frame: 30, clipId: null, all: true });
    });

    it("a click on a gap selects it (dashed outline), hovering lights it; a click elsewhere or on a clip drops it", () => {
      const { session, scheduler, pointer, row } = cutSetup();
      pointer("pointermove", x(30), row("v1"));
      scheduler.flush();
      expect(scene()?.hoverGap).toEqual({ trackId: "v1", start: 20, end: 40 });
      pointer("pointerdown", x(30), row("v1"));
      pointer("pointerup", x(30), row("v1"));
      expect(session.gap.getState()).toEqual({ trackId: "v1", start: 20, end: 40 });
      scheduler.flush();
      expect(scene()?.gap).toEqual({ trackId: "v1", start: 20, end: 40 });
      // After the last clip: empty space, the gap goes.
      pointer("pointerdown", x(200), row("v1"));
      pointer("pointerup", x(200), row("v1"));
      expect(session.gap.getState()).toBeNull();
      // The leading gap of A1; then a clip click drops it.
      pointer("pointerdown", x(10), row("a1"));
      pointer("pointerup", x(10), row("a1"));
      expect(session.gap.getState()).toEqual({ trackId: "a1", start: 0, end: 40 });
      pointer("pointerdown", x(10), row("v1"));
      pointer("pointerup", x(10), row("v1"));
      expect(session.gap.getState()).toBeNull();
      expect([...session.selection.getState().clipIds]).toEqual(["a"]);
      // A drag from a gap is a marquee, not a gap click.
      pointer("pointerdown", x(30), row("v1"));
      pointer("pointermove", x(30) + 40, row("v1") + 5);
      pointer("pointerup", x(30) + 40, row("v1") + 5);
      expect(session.gap.getState()).toBeNull();
    });

    it("a right-click selects the clip (or keeps a selection holding it) or the gap, then asks for the menu", () => {
      const { session, overlay, pointer, onContextMenu, row } = cutSetup();
      contextMenu(overlay, x(60), row("v1"));
      expect([...session.selection.getState().clipIds].sort()).toEqual(["au", "b"]);
      expect(onContextMenu).toHaveBeenLastCalledWith({ kind: "clip", clipId: "b", x: x(60), y: row("v1") });
      // A selection holding the clip stays.
      pointer("pointerdown", x(10), row("v1"), { shiftKey: true });
      pointer("pointerup", x(10), row("v1"), { shiftKey: true });
      contextMenu(overlay, x(60), row("a1"));
      expect([...session.selection.getState().clipIds].sort()).toEqual(["a", "au", "b"]);
      expect(onContextMenu).toHaveBeenLastCalledWith({ kind: "clip", clipId: "au", x: x(60), y: row("a1") });
      contextMenu(overlay, x(30), row("v1"));
      expect(session.gap.getState()).toEqual({ trackId: "v1", start: 20, end: 40 });
      expect(session.selection.getState().kind).toBe("none");
      expect(onContextMenu).toHaveBeenLastCalledWith({ kind: "gap", gap: { trackId: "v1", start: 20, end: 40 }, x: x(30), y: row("v1") });
      // Locked clips and empty space open nothing.
      onContextMenu.mockClear();
      contextMenu(overlay, x(50), row("v2"));
      contextMenu(overlay, x(300), row("v1"));
      expect(onContextMenu).not.toHaveBeenCalled();
    });

    it("places the rename field over a clip's label bar, paging the view to it when off screen", () => {
      const { view, session } = cutSetup();
      expect(view.clipLabelRect("b", 100)).toEqual({ x: x(40), y: (view.geometry().rowOf("v1")?.y ?? 0) + 2, width: 160, height: 16 });
      // A narrow clip gets the minimum width.
      expect(view.clipLabelRect("a", 168)?.width).toBe(168);
      session.state.set((state) => ({ ...state, timeline: { ...state.timeline, scrollFrame: 500 } }));
      expect(view.clipLabelRect("b", 100)).not.toBeNull();
      expect(session.state.getState().timeline.scrollFrame).toBeLessThanOrEqual(40);
      expect(view.clipLabelRect("missing", 100)).toBeNull();
    });

    it("draws a clip with a label color in that color (body and label bar), others in their kind's", () => {
      const { document, scheduler } = cutSetup();
      fills.length = 0;
      document.dispatch(updateClip("a", { color: "teal" }));
      scheduler.flush();
      expect(fills.filter((fill) => fill.style === "--label-teal")).toHaveLength(2);
      expect(fills.some((fill) => fill.style === "--clip-video")).toBe(true);
    });
  });

  describe("track headers, links and groups (Batch 16)", () => {
    /** V1 c0..c2 (10 frames each) at 172..228, V2 at 116..172, V3 at 60..116, A1 at 232..288; header 176 wide. */
    function headerSetup() {
      const t = setup(3);
      t.document.dispatch(addTrack(makeTrack("v2"), 1));
      t.document.dispatch(addTrack(makeTrack("v3"), 2));
      t.scheduler.flush();
      return t;
    }
    const scene = () => vi.mocked(drawOverlay).mock.lastCall?.[0];
    const trackIds = (selection: { trackIds?: ReadonlySet<string> }) => [...(selection.trackIds ?? [])];

    it("selects a track with a header click (Shift adds), and its clips with Mod+Shift", () => {
      const { session, scheduler, pointer } = headerSetup();
      pointer("pointerdown", 40, 200);
      pointer("pointerup", 40, 200);
      expect(session.selection.getState().kind).toBe("track");
      expect(trackIds(session.selection.getState())).toEqual(["v1"]);
      expect(scheduler.flush()).toContain("timelineContent");
      pointer("pointerdown", 40, 250, { shiftKey: true });
      pointer("pointerup", 40, 250, { shiftKey: true });
      expect(trackIds(session.selection.getState())).toEqual(["v1", "a1"]);
      pointer("pointerdown", 40, 200, { ctrlKey: true, shiftKey: true });
      pointer("pointerup", 40, 200, { ctrlKey: true, shiftKey: true });
      expect(session.selection.getState().kind).toBe("clips");
      expect([...session.selection.getState().clipIds]).toEqual(["c0", "c1", "c2"]);
    });

    it("reorders a track by dragging its header vertically: a ghost and an insert line, one request on release", () => {
      const { view, session, scheduler, overlay, pointer, onReorderTrack } = headerSetup();
      const contentDraws = view.stats.contentDraws;
      pointer("pointerdown", 40, 200);
      pointer("pointermove", 40, 190);
      expect(overlay.style.cursor).toBe("grabbing");
      pointer("pointermove", 40, 80);
      scheduler.flush();
      // Onto V3 (60..116), coming from below: the line at V3's top; the ghost keeps the 28 px grab offset.
      expect(scene()?.trackDrag).toMatchObject({ track: { id: "v1" }, insertY: 60, y: 80 - 28, height: 56 });
      expect(view.stats.contentDraws).toBe(contentDraws);
      pointer("pointerup", 40, 80);
      expect(onReorderTrack).toHaveBeenCalledWith("v1", 2);
      // A drag is not a click: the selection did not change.
      expect(session.selection.getState().kind).toBe("none");
      scheduler.flush();
      expect(scene()?.trackDrag).toBeNull();
      // Back over its own row: nothing to do.
      pointer("pointerdown", 40, 200);
      pointer("pointermove", 40, 150);
      pointer("pointermove", 40, 210);
      scheduler.flush();
      expect(scene()?.trackDrag?.insertY).toBeNull();
      pointer("pointerup", 40, 210);
      expect(onReorderTrack).toHaveBeenCalledTimes(1);
    });

    it("asks to rename a track on a double-click of its header, and opens the track menu on a right-click", () => {
      const { session, overlay, onRenameTrack, onContextMenu } = headerSetup();
      overlay.dispatchEvent(new MouseEvent("dblclick", { clientX: 40, clientY: 130, bubbles: true }));
      expect(onRenameTrack).toHaveBeenCalledWith("v2");
      overlay.dispatchEvent(new MouseEvent("contextmenu", { clientX: 40, clientY: 250, button: 2, bubbles: true, cancelable: true }));
      expect(trackIds(session.selection.getState())).toEqual(["a1"]);
      expect(onContextMenu).toHaveBeenLastCalledWith({ kind: "track", trackId: "a1", x: 40, y: 250 });
    });

    it("lights the header under the pointer and its toggles", () => {
      const { scheduler, pointer } = headerSetup();
      pointer("pointermove", 40, 200);
      scheduler.flush();
      expect(scene()?.hoverHeader).toEqual({ x: 0, y: 172, width: 176, height: 56 });
      pointer("pointermove", 80, 188);
      scheduler.flush();
      expect(scene()?.hoverHeader).toBeNull();
      expect(scene()?.hoverToggle).toMatchObject({ x: 72, width: 16 });
    });

    it("selects a whole group with a click on one member (and Alt still picks the clip alone)", () => {
      const { document, session, pointer } = headerSetup();
      document.dispatch(updateClip("c0", { group: "G" }));
      document.dispatch(updateClip("c2", { group: "G" }));
      pointer("pointerdown", 176 + 5 * 4, 200);
      pointer("pointerup", 176 + 5 * 4, 200);
      expect([...session.selection.getState().clipIds]).toEqual(["c0", "c2"]);
      pointer("pointerdown", 176 + 25 * 4, 200, { altKey: true });
      pointer("pointerup", 176 + 25 * 4, 200, { altKey: true });
      expect([...session.selection.getState().clipIds]).toEqual(["c2"]);
    });
  });
});

describe("TimelineView clip visuals", () => {
  beforeEach(() => {
    images.length = 0;
    vi.useFakeTimers();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
      return fakeContext(this);
    } as unknown as HTMLCanvasElement["getContext"]);
    vi.stubGlobal("Path2D", class {});
  });
  afterEach(() => {
    for (const unmount of mounted.splice(0)) unmount();
    window.document.body.replaceChildren();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  /** A 300-frame video clip on V1 (1080p 30 fps media) and an audio clip on A1, with a fake visuals source. */
  function visualsSetup() {
    const project = makeProject();
    project.media.m = { ...makeMedia("m", "video", 60_000_000), width: 1920, height: 1080, fps: FPS_30 };
    project.media.s = makeMedia("s", "audio", 60_000_000);
    project.tracks.push(makeTrack("v1"), makeTrack("a1", "audio"));
    const session = createSessionStore();
    const document = new DocumentStore(project, { session, validate: false });
    document.dispatch(addClip(makeMediaClip(document.getState(), { id: "v", trackId: "v1", start: 0, duration: 300, mediaId: "m" })));
    document.dispatch(addClip(makeMediaClip(document.getState(), { id: "a", trackId: "a1", start: 0, duration: 300, mediaId: "s", kind: "audio" })));
    const layoutStore = createLayoutStore(null);
    layoutStore.setPanelSize("timeline", { width: 1000, height: 428 });
    const scheduler = new FakeScheduler();
    const thumbs = thumbLayout(document.getState().media.m as never) as ThumbLayout;
    const sheets = new Map<string, ImageBitmap>();
    const arrivals: (() => void)[] = [];
    const want = vi.fn();
    const visuals: ClipVisualsSource = {
      thumbLayout: (id) => (id === "m" ? thumbs : null),
      sheet: (id, level, sheet) => sheets.get(`${id}/${level}/${sheet}`) ?? null,
      poster: () => null,
      peaks: () => null,
      want,
      subscribe: (listener) => {
        arrivals.push(listener);
        return () => arrivals.splice(arrivals.indexOf(listener), 1);
      },
    };
    const pauseListeners: ((paused: boolean) => void)[] = [];
    const idle = {
      pause: vi.fn(),
      resume: vi.fn(),
      isPaused: false,
      onPauseChange: (listener: (paused: boolean) => void) => {
        pauseListeners.push(listener);
        return () => undefined;
      },
    };
    const view = new TimelineView({
      scheduler,
      document,
      session,
      layout: layoutStore,
      theme: { theme: testTheme(), subscribe: () => () => {} },
      onAddTrack: vi.fn(),
      onToggleTrack: vi.fn(),
      onMoveClips: vi.fn(),
      onTrimEdge: vi.fn(),
      idle,
      visuals,
      platform: "other",
    });
    const host = window.document.createElement("div");
    window.document.body.append(host);
    mounted.push(view.mount(host));
    scheduler.flush();
    const arrive = () => arrivals.forEach((listener) => listener());
    const setPaused = (paused: boolean) => {
      idle.isPaused = paused;
      pauseListeners.forEach((listener) => listener(paused));
    };
    return { view, scheduler, sheets, want, arrive, setPaused, session };
  }

  it("hands what each content pass wanted to the visuals, and draws the sheets in memory", () => {
    const { scheduler, sheets, want, arrive } = visualsSetup();
    const wants = want.mock.lastCall?.[0] as { sheets: { mediaId: string; level: number; sheet: number }[]; peaks: string[] };
    expect(wants.peaks).toEqual(["s"]);
    expect(wants.sheets.length).toBeGreaterThan(0);
    expect(wants.sheets.every((key) => key.mediaId === "m")).toBe(true);
    expect(images).toHaveLength(0);
    const bitmap = { width: 4 * 284, height: 640 } as ImageBitmap;
    for (const key of wants.sheets) sheets.set(`${key.mediaId}/${key.level}/${key.sheet}`, bitmap);
    arrive();
    expect(scheduler.flush()).toContain("timelineContent");
    expect(images.length).toBeGreaterThan(0);
    expect(images.every((call) => call.image === bitmap)).toBe(true);
    // Tiles touch: each starts where the previous one ended.
    for (let i = 1; i < images.length; i++) expect((images[i] as { x: number }).x).toBeCloseTo((images[i - 1] as { x: number; width: number }).x + (images[i - 1] as { width: number }).width, 5);
  });

  it("redraws for arrivals at most every 100 ms", () => {
    const { scheduler, arrive } = visualsSetup();
    arrive();
    expect(scheduler.flush()).toEqual(["timelineContent"]);
    arrive();
    arrive();
    expect(scheduler.flush()).toEqual([]);
    vi.advanceTimersByTime(100);
    expect(scheduler.flush()).toEqual(["timelineContent"]);
  });

  it("holds arrivals while playing or dragging and draws them on resume", () => {
    const { scheduler, arrive, setPaused } = visualsSetup();
    setPaused(true);
    arrive();
    vi.advanceTimersByTime(500);
    expect(scheduler.flush()).toEqual([]);
    setPaused(false);
    expect(scheduler.flush()).toEqual(["timelineContent"]);
  });

  it("asks nothing for the playhead: moving it redraws the overlay only (P3)", () => {
    const { scheduler, want, session } = visualsSetup();
    const calls = want.mock.calls.length;
    setPlayhead(session, 120);
    expect(scheduler.flush()).toEqual(["timelineOverlay"]);
    expect(want.mock.calls.length).toBe(calls);
  });
});
