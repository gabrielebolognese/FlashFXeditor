// The preview's redraw contract around playback: a pause redraws at idle priority, so a layer that
// playback held (its frame was not decoded yet) is requested and replaced by the exact frame.
// jsdom has no WebGPU: the renderer is a stand-in that accepts every draw.
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeTrack, withClips } from "../../core/document/fixtures.js";
import type { InvalidationFlag, RenderView } from "../../core/scheduler/FrameScheduler.js";
import { DocumentStore } from "../../core/store/DocumentStore.js";
import { createLayoutStore } from "../../core/store/layoutStore.js";
import { frameToUs } from "../../core/document/time.js";
import type { Project } from "../../core/document/types.js";
import { createSessionStore, setPlayhead } from "../../core/store/sessionStore.js";
import { readTheme } from "../../core/theme/theme.js";
import { TexturePool } from "../../media/cache/TexturePool.js";
import type { FrameRequestOptions, FrameResult } from "../../media/decode/FrameService.js";
import type { FramePriority, VideoInfo } from "../../media/workers/protocol.js";
import type { Renderer, TextureHandle } from "../gpu/renderer.js";
import { PreviewView, type PreviewViewDeps } from "./PreviewView.js";

class FakeScheduler {
  private readonly views = new Map<InvalidationFlag, Set<RenderView>>();
  private dirty = new Set<InvalidationFlag>();

  register(flag: InvalidationFlag, view: RenderView): () => void {
    const set = this.views.get(flag) ?? new Set();
    set.add(view);
    this.views.set(flag, set);
    return () => set.delete(view);
  }

  invalidate(flag: InvalidationFlag): void {
    this.dirty.add(flag);
  }

  /** Runs one frame; returns the flags that were dirty. */
  flush(): InvalidationFlag[] {
    const dirty = [...this.dirty];
    this.dirty = new Set();
    for (const flag of dirty) for (const view of this.views.get(flag) ?? []) view.render(0);
    return dirty;
  }
}

function texture(): TextureHandle {
  return { width: 4, height: 4, mipLevels: 1, bytes: 64, valid: true, destroy: () => undefined };
}

interface Request {
  timeUs: number;
  options: FrameRequestOptions;
  resolve(result: FrameResult): void;
}

/** Frame times of a 30 fps video. */
const TIMES = Float64Array.from({ length: 300 }, (_, i) => Math.round((i * 1_000_000) / 30));
const timeOf = (frame: number) => TIMES[frame] as number;

function setup(extra: Partial<PreviewViewDeps> = {}) {
  let doc = makeProject();
  doc.media.m = { ...makeMedia("m"), width: 1920, height: 1080 };
  doc.tracks = [makeTrack("v1")];
  doc = withClips(doc, [makeMediaClip(doc, { id: "c1", trackId: "v1", start: 0, duration: 300, mediaId: "m" })]);
  const session = createSessionStore();
  const document = new DocumentStore(doc, { session, validate: false });
  const layout = createLayoutStore(null);
  layout.setPanelSize("preview", { width: 400, height: 600 });
  const scheduler = new FakeScheduler();
  const pool = new TexturePool();
  const info: VideoInfo = { frameTimesUs: TIMES, codec: "avc1.64001f", codedWidth: 1920, codedHeight: 1080, rotation: 0, decodable: true, indexFromCache: true };
  const requests: Request[] = [];
  const frames = {
    info: () => info,
    video: vi.fn(async () => info),
    getFrame: vi.fn((_mediaId: string, timeUs: number, options: FrameRequestOptions = {}) => {
      return new Promise<FrameResult>((resolve) => requests.push({ timeUs, options, resolve }));
    }),
    prefetch: vi.fn(async () => 0),
  };
  const images = { get: () => null, load: vi.fn(() => new Promise<TextureHandle | null>(() => undefined)) };
  const renderer = {
    maxTextureSize: 8192,
    ready: true,
    draw: vi.fn(() => true),
    drawPanes: vi.fn(() => true),
    resize: () => undefined,
    createCanvasTarget: () => ({ kind: "canvas" }),
    releaseTarget: () => undefined,
    subscribe: () => () => undefined,
  } as unknown as Renderer;
  // The engine as the preview sees it: `playing` and its play/pause notifications.
  const engine = { playing: false, listeners: new Set<() => void>() };
  const notify = () => {
    for (const listener of engine.listeners) listener();
  };
  const view = new PreviewView({
    renderer,
    scheduler,
    layout,
    session: session.state,
    document,
    theme: { theme: readTheme((name) => name).theme, subscribe: () => () => undefined },
    frames,
    images,
    pool,
    priority: (): FramePriority => (engine.playing ? "playback" : "idle"),
    watchPriority: (listener) => {
      engine.listeners.add(listener);
      return () => engine.listeners.delete(listener);
    },
    ...extra,
  });
  const host = window.document.createElement("div");
  window.document.body.append(host);
  view.mount(host);
  /** A delivered frame, as the playback engine's windows put them in the pool. */
  const cache = (frame: number) => {
    const tex = texture();
    pool.put({ mediaId: "m", lod: "full", timeUs: timeOf(frame) }, tex);
    return tex;
  };
  const drawn = () => (renderer.draw as ReturnType<typeof vi.fn>).mock.lastCall?.[0].layers[0]?.texture as TextureHandle | undefined;
  return { view, session, document, scheduler, engine, notify, frames, requests, cache, drawn, renderer };
}

describe("PreviewView", () => {
  afterEach(() => {
    window.document.body.replaceChildren();
  });

  it("shows the override's document at its frame while there is one (a trim's new edge frame)", () => {
    let override: { project: Project; frame: number } | null = null;
    const { session, document, scheduler, frames, requests } = setup({ override: () => override, priority: () => (override ? "scrub" : "idle") });
    setPlayhead(session, 200);
    scheduler.flush();
    expect(requests.at(-1)?.timeUs).toBe(timeOf(200));
    // An in trim of 30 frames: c1 starts at 30 and shows its media from 1 s there.
    const doc = document.getState();
    const trimmed = { ...doc, clips: { ...doc.clips, c1: { ...doc.clips.c1!, start: 30, duration: 270, in: frameToUs(30, doc.settings.fps) } } } as Project;
    override = { project: trimmed, frame: 30 };
    scheduler.invalidate("preview");
    scheduler.flush();
    expect(requests.at(-1)?.timeUs).toBe(timeOf(30));
    expect(requests.at(-1)?.options.priority).toBe("scrub");
    // Without it, back to the playhead.
    const count = frames.getFrame.mock.calls.length;
    override = null;
    scheduler.invalidate("preview");
    scheduler.flush();
    expect(frames.getFrame.mock.calls.length).toBeGreaterThanOrEqual(count);
    expect(requests.at(-1)?.timeUs).toBe(timeOf(200));
  });

  it("shows a split override's two frames side by side, each in its half; back to one frame after it", () => {
    let override: { project: Project; frame: number; previewSplit: { leftFrame: number; rightFrame: number } | null } | null = null;
    const { view, document, scheduler, requests, cache, renderer } = setup({ override: () => override, priority: () => (override ? "scrub" : "idle") });
    scheduler.flush();
    const draw = renderer.draw as ReturnType<typeof vi.fn>;
    const drawPanes = renderer.drawPanes as ReturnType<typeof vi.fn>;
    expect(drawPanes).not.toHaveBeenCalled();
    // A roll at frame 120: the left side's last frame and the right side's first.
    const left = cache(119);
    const right = cache(120);
    override = { project: document.getState(), frame: 119, previewSplit: { leftFrame: 119, rightFrame: 120 } };
    scheduler.invalidate("preview");
    scheduler.flush();
    expect(drawPanes).toHaveBeenCalledTimes(1);
    const [panes] = drawPanes.mock.lastCall as [{ list: { layers: { texture: unknown }[] }; bounds: object; viewport: { transform: number[] } }[]];
    expect(panes.map((pane) => pane.list.layers[0]?.texture)).toEqual([left, right]);
    // 400 x 600 css px at dpr 1: two 200 px halves; each frame (1080 x 1920) fitted with the 16 px margin.
    expect(panes.map((pane) => pane.bounds)).toEqual([
      { x: 0, y: 0, width: 200, height: 600 },
      { x: 200, y: 0, width: 200, height: 600 },
    ]);
    expect((panes[1]?.viewport.transform[4] ?? 0) - (panes[0]?.viewport.transform[4] ?? 0)).toBe(200);
    // The same frames again: no redraw.
    scheduler.invalidate("preview");
    scheduler.flush();
    expect(drawPanes).toHaveBeenCalledTimes(1);
    expect(view.stats.textures).toMatchObject({ layers: 2, exact: 2 });
    // The edit ends: the single frame is drawn again even though the left pane's list matches it.
    const draws = draw.mock.calls.length;
    override = { project: document.getState(), frame: 119, previewSplit: null };
    scheduler.invalidate("preview");
    scheduler.flush();
    expect(draw.mock.calls.length).toBe(draws + 1);
    expect(requests.every((request) => request.options.priority !== "playback")).toBe(true);
  });

  it("requests the playhead's frame when playback pauses on a held layer", async () => {
    const { view, session, scheduler, engine, notify, frames, requests, cache, drawn } = setup();
    const delivered = cache(8);
    engine.playing = true;
    notify();
    setPlayhead(session, 8);
    scheduler.flush();
    expect(drawn()).toBe(delivered);

    // A shuttle speed delivered frame 8 but not 9: playback holds frame 8 and requests nothing.
    setPlayhead(session, 9);
    scheduler.flush();
    expect(drawn()).toBe(delivered);
    expect(view.stats.textures).toMatchObject({ layers: 1, exact: 0, held: 1 });
    expect(frames.getFrame).not.toHaveBeenCalled();

    // A notification while still playing (a dropped-frame count) redraws nothing.
    notify();
    expect(scheduler.flush()).toEqual([]);

    // K: the playhead stays on 9. The pause alone redraws, at idle priority.
    engine.playing = false;
    notify();
    expect(scheduler.flush()).toEqual(["preview"]);
    expect(frames.getFrame).toHaveBeenCalledTimes(1);
    expect(requests[0]?.timeUs).toBe(timeOf(9));
    expect(requests[0]?.options.priority).toBe("idle");

    // The exact frame arrives and replaces the held one.
    const exact = cache(9);
    requests[0]?.resolve({ texture: exact, key: { mediaId: "m", lod: "full", timeUs: timeOf(9) }, timeUs: timeOf(9), approximate: false });
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(scheduler.flush()).toEqual(["preview"]);
    expect(drawn()).toBe(exact);
    expect(view.stats.textures).toMatchObject({ exact: 1, held: 0 });
  });
});
