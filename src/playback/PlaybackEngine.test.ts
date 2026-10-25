import { describe, expect, it, vi } from "vitest";
import { makeMedia, makeMediaClip, makeProject, makeTrack, withClips } from "../core/document/fixtures.js";
import type { Project } from "../core/document/types.js";
import type { Ticker } from "../core/scheduler/FrameScheduler.js";
import { createSessionStore, setPlayhead, type PreviewQuality } from "../core/store/sessionStore.js";
import { TexturePool, type Lod, type TextureKey } from "../media/cache/TexturePool.js";
import type { FrameResult, PrefetchOptions } from "../media/decode/FrameService.js";
import { mediaTimePosition } from "../media/demux/sampleIndex.js";
import type { VideoInfo } from "../media/workers/protocol.js";
import type { PlayMapping } from "../audio/scheduler/AudioScheduler.js";
import type { TextureHandle } from "../render/gpu/renderer.js";
import { CHUNK_DECODES, LOOKAHEAD_SECONDS, PlaybackEngine, PREROLL_SECONDS, TARGET_READY, type PlaybackAudio, type ShownFrame } from "./PlaybackEngine.js";

const US = 1_000_000;

function texture(): TextureHandle {
  let destroyed = false;
  return {
    width: 4,
    height: 4,
    mipLevels: 1,
    bytes: 64,
    get valid() {
      return !destroyed;
    },
    destroy() {
      destroyed = true;
    },
  };
}

/** A video of `seconds` at `fps` frames per second, frame times from 0. */
function videoInfo(seconds = 60, fps = 30): VideoInfo {
  return {
    frameTimesUs: Float64Array.from({ length: seconds * fps }, (_, i) => Math.round((i * US) / fps)),
    codec: "avc1.64001f",
    codedWidth: 1920,
    codedHeight: 1080,
    rotation: 0,
    decodable: true,
    indexFromCache: true,
  };
}

interface Window {
  mediaId: string;
  fromUs: number;
  toUs: number;
  options: PrefetchOptions;
  done: boolean;
  resolve(count: number): void;
  reject(error: unknown): void;
}

/** One video track: clips of media a, b, c... back to back as given (frames). */
function project(clips: { id: string; media: string; start: number; duration: number; in?: number }[], extraTracks = 0): Project {
  let doc = makeProject();
  doc.tracks = [makeTrack("v1"), ...Array.from({ length: extraTracks }, (_, i) => makeTrack(`v${i + 2}`))];
  for (const clip of clips) doc.media[clip.media] ??= makeMedia(clip.media);
  doc = withClips(
    doc,
    clips.map((clip) => {
      const made = makeMediaClip(doc, { id: clip.id, trackId: "v1", start: clip.start, duration: clip.duration, mediaId: clip.media });
      const inUs = Math.round(((clip.in ?? 0) * US) / 30);
      return { ...made, in: inUs, out: inUs + made.out };
    }),
  );
  return doc;
}

function setup(doc: Project, options: { infos?: Record<string, VideoInfo>; audio?: PlaybackAudio; quality?: PreviewQuality; proxies?: Set<string> } = {}) {
  let now = 100;
  const tickers = new Set<Ticker>();
  const scheduler = { addTicker: (ticker: Ticker) => (tickers.add(ticker), () => void tickers.delete(ticker)) };
  const session = createSessionStore();
  let current = doc;
  const pool = new TexturePool();
  /** Opened videos by `mediaId` (full) or `mediaId|proxy`. */
  const infos = new Map<string, VideoInfo>(Object.entries(options.infos ?? { a: videoInfo(), b: videoInfo(), c: videoInfo() }));
  const infoKey = (mediaId: string, lod: Lod = "full") => (lod === "full" ? mediaId : `${mediaId}|${lod}`);
  const windows: Window[] = [];
  const onBehind = vi.fn();
  const frames = {
    info: (mediaId: string, lod: Lod = "full") => infos.get(infoKey(mediaId, lod)) ?? null,
    video: vi.fn(async (mediaId: string, lod: Lod = "full") => {
      const value = videoInfo();
      infos.set(infoKey(mediaId, lod), value);
      return value;
    }),
    lodFor: (mediaId: string, wanted: Lod): Lod => (wanted === "proxy" && options.proxies?.has(mediaId) ? "proxy" : "full"),
    frameKeyInto: (out: TextureKey, mediaId: string, mediaTimeUs: number, lod: Lod = "full") => {
      const times = infos.get(infoKey(mediaId, lod))?.frameTimesUs;
      if (!times) return -1;
      const position = mediaTimePosition(times, mediaTimeUs);
      out.mediaId = mediaId;
      out.lod = lod;
      out.timeUs = times[position] as number;
      return position;
    },
    prefetch: vi.fn(
      (mediaId: string, fromUs: number, toUs: number, opts: PrefetchOptions = {}) =>
        new Promise<number>((resolve, reject) => {
          windows.push({ mediaId, fromUs, toUs, options: opts, done: false, resolve, reject });
          opts.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
        }),
    ),
  };
  const firstShown: { -readonly [K in keyof ShownFrame]: ShownFrame[K] } = { frame: -1, layers: 0, exact: 0 };
  const idle = { pause: vi.fn(), resume: vi.fn() };
  let scrubbing = false;
  const engine = new PlaybackEngine({
    scheduler,
    clock: { now: () => now },
    document: { getState: () => current },
    session,
    frames,
    images: { get: () => null, load: vi.fn(async () => null) },
    pool,
    preview: { firstShown },
    scrubbing: () => scrubbing,
    idle,
    ...(options.audio && { audio: options.audio }),
    ...(options.quality && { quality: () => options.quality as PreviewQuality }),
    onBehind,
  });
  const flush = async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  };
  const live = () => windows.filter((w) => !w.done && !w.options.signal?.aborted);
  const positionsOf = (w: Window) => {
    const times = infos.get(infoKey(w.mediaId, w.options.lod))?.frameTimesUs as Float64Array;
    const from = mediaTimePosition(times, w.fromUs);
    const to = mediaTimePosition(times, w.toUs);
    const stride = w.options.stride ?? 1;
    const out: number[] = [];
    for (let p = from; p <= to; p += stride) out.push(p);
    return out;
  };
  /** Delivers a window's frames into the pool, as the frame service does, and completes it. */
  const deliver = async (w: Window) => {
    const times = infos.get(infoKey(w.mediaId, w.options.lod))?.frameTimesUs as Float64Array;
    const positions = positionsOf(w);
    for (const p of positions) {
      const key: TextureKey = { mediaId: w.mediaId, lod: w.options.lod ?? "full", timeUs: times[p] as number };
      const tex = texture();
      pool.put(key, tex);
      w.options.onFrame?.({ texture: tex, key, timeUs: key.timeUs, approximate: false } satisfies FrameResult);
    }
    w.done = true;
    w.resolve(positions.length);
    await flush();
  };
  /** Delivers windows until none is pending (completed windows are topped up at once). */
  const deliverAll = async () => {
    for (let i = 0; i < 100 && live().length > 0; i++) await deliver(live()[0] as Window);
  };
  /** One animation frame: the engine's tick, then the preview's first render of the new playhead. */
  const frame = (render: { exact: boolean } = { exact: true }) => {
    for (const ticker of [...tickers]) ticker(0);
    const playhead = session.state.getState().playhead;
    if (firstShown.frame !== playhead) {
      firstShown.frame = playhead;
      firstShown.layers = 1;
      firstShown.exact = render.exact ? 1 : 0;
    }
  };
  /** Plays and runs the preroll with every window delivered: the clock runs from `now`. */
  const startPlaying = async (speed = 1) => {
    engine.play(speed);
    frame();
    await deliverAll();
    frame();
  };
  return {
    engine,
    session,
    pool,
    windows,
    live,
    positionsOf,
    deliver,
    deliverAll,
    frame,
    startPlaying,
    idle,
    frames,
    infos,
    tickers,
    onBehind,
    flush,
    playhead: () => session.state.getState().playhead,
    advance: (seconds: number) => {
      now += seconds;
    },
    setScrubbing: (value: boolean) => {
      scrubbing = value;
    },
    setDoc: (next: Project) => {
      current = next;
    },
  };
}

const ONE_CLIP = () => project([{ id: "c1", media: "a", start: 0, duration: 900 }]);

describe("PlaybackEngine clock", () => {
  it("moves the playhead to start + floor(elapsed * speed * fps) from the clock, one write per new frame", async () => {
    const t = setup(ONE_CLIP());
    setPlayhead(t.session, 10);
    await t.startPlaying();
    expect(t.engine.playing).toBe(true);
    const writes: number[] = [];
    const stop = t.session.state.select((state) => state.playhead, (frame) => writes.push(frame));
    for (let i = 0; i < 4; i++) {
      t.advance(1 / 60);
      t.frame();
    }
    expect(writes).toEqual([11, 12]);
    t.advance(1 - 4 / 60);
    t.frame();
    expect(t.playhead()).toBe(40);
    stop();
  });

  it("starts half a vsync early, so vsync jitter neither repeats nor skips frames", async () => {
    const t = setup(ONE_CLIP());
    await t.startPlaying();
    // 30 fps on a 60 Hz screen, each vsync up to 3 ms early or late.
    const jitter = [3, -3, 2.5, -1, -3, 3, 0, -2.5, 1, 3];
    const seen: number[] = [];
    let previous = 0;
    for (let i = 1; i <= 120; i++) {
      const target = i / 60 + (jitter[i % jitter.length] as number) / 1000;
      t.advance(target - previous);
      previous = target;
      t.frame();
      seen.push(t.playhead());
    }
    // Every frame is on screen for exactly two vsyncs.
    expect(seen).toEqual(Array.from({ length: 120 }, (_, i) => Math.floor((i + 1) / 2)));
    expect(t.engine.stats.dropped).toBe(0);
  });

  it("waits for the first frames before the clock runs, at most the preroll time", () => {
    const t = setup(ONE_CLIP());
    t.engine.play();
    t.frame();
    t.advance(PREROLL_SECONDS / 2);
    t.frame();
    expect(t.playhead()).toBe(0);
    // Nothing arrived: it starts anyway once the preroll is over, from that moment.
    t.advance(PREROLL_SECONDS);
    t.frame();
    expect(t.playhead()).toBe(0);
    t.advance(0.1);
    t.frame();
    expect(t.playhead()).toBe(3);
  });

  it("starts the clock once the window under the playhead is full, not at its first frames", async () => {
    const t = setup(ONE_CLIP());
    t.engine.play();
    t.frame();
    // Three windows (6 frames) in: still waiting.
    for (let i = 0; i < 3; i++) await t.deliver(t.live()[0] as Window);
    t.advance(0.05);
    t.frame();
    t.advance(0.05);
    t.frame();
    expect(t.playhead()).toBe(0);
    // The whole window (15 frames at 30 fps): the clock runs from this frame on.
    await t.deliverAll();
    t.frame();
    t.advance(2 / 30 + 0.001);
    t.frame();
    expect(t.playhead()).toBe(2);
  });

  it("does nothing on an empty timeline", () => {
    const t = setup(project([]));
    t.engine.play();
    expect(t.engine.playing).toBe(false);
    expect(t.tickers.size).toBe(0);
  });

  it("pauses the idle queue while playing", async () => {
    const t = setup(ONE_CLIP());
    await t.startPlaying();
    expect(t.idle.pause).toHaveBeenCalledTimes(1);
    expect(t.idle.resume).not.toHaveBeenCalled();
    t.engine.pause();
    expect(t.idle.resume).toHaveBeenCalledTimes(1);
    expect(t.tickers.size).toBe(0);
  });
});

describe("PlaybackEngine transport", () => {
  it("reaches 8x after L four times and advances the playhead proportionally; K stops at once; K+L steps", async () => {
    const t = setup(ONE_CLIP());
    t.engine.shuttle(1);
    t.frame();
    await t.deliverAll();
    t.frame();
    expect(t.engine.speed).toBe(1);
    t.advance(1);
    t.frame();
    expect(t.playhead()).toBe(30);
    for (const speed of [2, 4, 8]) {
      t.engine.shuttle(1);
      expect(t.engine.speed).toBe(speed);
    }
    t.engine.shuttle(1);
    expect(t.engine.speed).toBe(8);
    t.advance(1);
    t.frame();
    expect(t.playhead()).toBe(30 + 240);
    t.advance(0.5);
    t.frame();
    expect(t.playhead()).toBe(30 + 240 + 120);

    // K: paused on the frame on screen, even with clock time gone by since the last frame.
    t.advance(0.01);
    t.engine.holdStop(true);
    expect(t.engine.playing).toBe(false);
    expect(t.playhead()).toBe(390);
    t.engine.shuttle(1);
    t.engine.shuttle(1);
    expect(t.playhead()).toBe(392);
    t.engine.shuttle(-1);
    expect(t.playhead()).toBe(391);
    expect(t.engine.playing).toBe(false);
    t.engine.holdStop(false);
    t.engine.shuttle(1);
    expect(t.engine.speed).toBe(1);
  });

  it("plays backward with J, faster on each press, and stops on frame 0", async () => {
    const t = setup(ONE_CLIP());
    setPlayhead(t.session, 100);
    t.engine.shuttle(-1);
    t.frame();
    await t.deliverAll();
    t.frame();
    t.advance(1);
    t.frame();
    expect(t.playhead()).toBe(70);
    t.engine.shuttle(-1);
    expect(t.engine.speed).toBe(-2);
    t.advance(2);
    t.frame();
    expect(t.playhead()).toBe(0);
    expect(t.engine.playing).toBe(false);
    // L while going backward: 1x forward.
    t.engine.shuttle(-1);
    expect(t.engine.playing).toBe(false);
  });

  it("stops on the last frame at the end, restarts from the start, and wraps when loop is on", async () => {
    const t = setup(project([{ id: "c1", media: "a", start: 0, duration: 60 }]));
    setPlayhead(t.session, 50);
    await t.startPlaying();
    t.advance(1);
    t.frame();
    expect(t.engine.playing).toBe(false);
    expect(t.playhead()).toBe(59);
    // Space at the end plays from the start.
    t.engine.toggle();
    expect(t.playhead()).toBe(0);
    t.engine.pause();

    t.session.state.set((state) => ({ ...state, loop: true }));
    setPlayhead(t.session, 50);
    await t.startPlaying();
    t.advance(10 / 30 + 0.001);
    t.frame();
    expect(t.engine.playing).toBe(true);
    expect(t.playhead()).toBe(0);
    t.advance(5 / 30);
    t.frame();
    expect(t.playhead()).toBe(5);
  });

  it("loops the in/out range frame-exactly: a play outside it starts at the in point, the out point wraps to it", async () => {
    const t = setup(ONE_CLIP());
    t.session.state.set((state) => ({ ...state, loop: true, inPoint: 30, outPoint: 60 }));
    setPlayhead(t.session, 200);
    await t.startPlaying();
    expect(t.playhead()).toBe(30);
    const shown: number[] = [];
    for (let i = 0; i < 75; i++) {
      t.advance(1 / 30);
      t.frame();
      shown.push(t.playhead());
    }
    expect(t.engine.playing).toBe(true);
    // Every frame of the range once per pass, in order, the out point (60) never shown.
    const expected = Array.from({ length: 75 }, (_, i) => 30 + ((i + 1) % 30));
    expect(shown).toEqual(expected);
  });

  it("wraps backward from the in point to the last frame before the out point", async () => {
    const t = setup(ONE_CLIP());
    t.session.state.set((state) => ({ ...state, loop: true, inPoint: 30, outPoint: 60 }));
    setPlayhead(t.session, 35);
    await t.startPlaying(-1);
    t.advance(5 / 30 + 0.001);
    t.frame();
    expect(t.playhead()).toBe(30);
    t.advance(1 / 30);
    t.frame();
    expect(t.playhead()).toBe(59);
  });

  it("plays in to out once and stops on the last frame of the range; with loop on it loops the range", async () => {
    const t = setup(ONE_CLIP());
    t.session.state.set((state) => ({ ...state, inPoint: 30, outPoint: 60 }));
    setPlayhead(t.session, 400);
    t.engine.playInToOut();
    expect(t.playhead()).toBe(30);
    t.frame();
    await t.deliverAll();
    t.frame();
    t.advance(29 / 30 + 0.001);
    t.frame();
    expect(t.playhead()).toBe(59);
    t.advance(1 / 30);
    t.frame();
    expect(t.engine.playing).toBe(false);
    expect(t.playhead()).toBe(59);

    t.session.state.set((state) => ({ ...state, loop: true }));
    t.engine.playInToOut();
    t.frame();
    await t.deliverAll();
    t.frame();
    t.advance(30 / 30 + 0.001);
    t.frame();
    expect(t.engine.playing).toBe(true);
    expect(t.playhead()).toBe(30);
    // Neither point set: the whole timeline.
    t.engine.pause();
    t.session.state.set((state) => ({ ...state, loop: false, inPoint: null, outPoint: null }));
    setPlayhead(t.session, 500);
    t.engine.playInToOut();
    expect(t.playhead()).toBe(0);
  });

  it("plays around the playhead (2 s before to 2 s after) and puts it back", async () => {
    const t = setup(ONE_CLIP());
    setPlayhead(t.session, 300);
    t.engine.playAround();
    expect(t.playhead()).toBe(240);
    t.frame();
    await t.deliverAll();
    t.frame();
    t.advance(2);
    t.frame();
    expect(t.playhead()).toBe(300);
    expect(t.engine.playing).toBe(true);
    t.advance(2);
    t.frame();
    expect(t.engine.playing).toBe(false);
    expect(t.playhead()).toBe(300);
  });

  it("plays on from where someone else puts the playhead, and pauses for a ruler scrub", async () => {
    const t = setup(ONE_CLIP());
    await t.startPlaying();
    t.advance(1);
    t.frame();
    expect(t.playhead()).toBe(30);
    setPlayhead(t.session, 600);
    t.frame();
    t.advance(1);
    t.frame();
    expect(t.playhead()).toBe(630);
    t.setScrubbing(true);
    t.frame();
    expect(t.engine.playing).toBe(false);
  });

  it("steps pause playback", async () => {
    const t = setup(ONE_CLIP());
    await t.startPlaying();
    t.advance(1);
    t.frame();
    t.engine.step(5);
    expect(t.engine.playing).toBe(false);
    expect(t.playhead()).toBe(35);
  });

  it("notifies on play and pause", async () => {
    const t = setup(ONE_CLIP());
    const seen: boolean[] = [];
    t.engine.subscribe(() => seen.push(t.engine.playing));
    t.engine.toggle();
    t.engine.toggle();
    expect(seen).toEqual([true, false]);
  });
});

describe("PlaybackEngine prefetch windows", () => {
  it("keeps 15 frames decoded in 2-frame windows at playback priority, one at a time, the next asked for as soon as one completes", async () => {
    const t = setup(ONE_CLIP());
    t.engine.play();
    t.frame();
    expect(t.live()).toHaveLength(1);
    const first = t.live()[0] as Window;
    expect(first.options.priority).toBe("playback");
    expect(t.positionsOf(first)).toEqual([0, 1]);
    // One window at a time.
    t.frame();
    expect(t.live()).toHaveLength(1);
    // Topped up when it completes, without waiting for the next animation frame.
    await t.deliver(first);
    expect(t.positionsOf(t.live()[0] as Window)).toEqual([2, 3]);
    await t.deliverAll();
    const requested = t.windows.flatMap((w) => t.positionsOf(w));
    expect(requested).toEqual(Array.from({ length: TARGET_READY }, (_, i) => i));
    expect(t.windows.every((w) => t.positionsOf(w).length <= CHUNK_DECODES)).toBe(true);
    t.frame();
    t.advance(1 / 30 + 0.001);
    t.frame();
    expect(t.playhead()).toBe(1);
    expect(t.positionsOf(t.live()[0] as Window)).toEqual([15]);
  });

  it("pins the frames it decoded until the playhead passes them, and lets all go on pause", async () => {
    const t = setup(ONE_CLIP());
    await t.startPlaying();
    const key = (p: number): TextureKey => ({ mediaId: "a", lod: "full", timeUs: Math.round((p * US) / 30) });
    expect(t.pool.isPinned(key(0))).toBe(true);
    expect(t.pool.isPinned(key(14))).toBe(true);
    t.advance(5 / 30 + 0.001);
    t.frame();
    expect(t.pool.isPinned(key(4))).toBe(false);
    expect(t.pool.isPinned(key(5))).toBe(true);
    const inFlight = t.live();
    t.engine.pause();
    expect(t.pool.stats.pinned).toBe(0);
    expect(inFlight.every((w) => w.options.signal?.aborted)).toBe(true);
  });

  it("decodes backward windows that end at the playhead", async () => {
    const t = setup(ONE_CLIP());
    setPlayhead(t.session, 300);
    t.engine.play(-1);
    t.frame();
    const first = t.live()[0] as Window;
    expect(t.positionsOf(first)).toEqual(Array.from({ length: TARGET_READY }, (_, i) => 286 + i));
    await t.deliver(first);
    t.frame();
    t.advance(8 / 30 + 0.001);
    t.frame();
    expect(t.playhead()).toBe(292);
    const next = t.live()[0] as Window;
    expect(Math.max(...t.positionsOf(next))).toBe(285);
  });

  it("delivers only the frames the screen can show at shuttle speeds, and every other frame of 60 fps media at 1x in 30 fps", async () => {
    const t = setup(ONE_CLIP());
    t.engine.play(8);
    t.frame();
    // 240 frames/s on a 60 Hz screen: every 4th.
    expect(t.live()[0]?.options.stride).toBe(4);
    t.engine.pause();

    const u = setup(ONE_CLIP(), { infos: { a: videoInfo(60, 60) } });
    u.engine.play(1);
    u.frame();
    const window = u.live()[0] as Window;
    expect(window.options.stride).toBe(2);
    // Two decoded frames per window: one delivered.
    expect(u.positionsOf(window)).toEqual([0]);
    await u.deliver(window);
    expect(u.positionsOf(u.live()[0] as Window)).toEqual([2]);
  });

  it("warms clips starting within 2 s at idle priority (P7), then carries on after their first window", async () => {
    const doc = project([
      { id: "c1", media: "a", start: 0, duration: 90 },
      { id: "c2", media: "b", start: 90, duration: 90, in: 300 },
      { id: "c3", media: "c", start: 180, duration: 90 },
    ]);
    const t = setup(doc);
    setPlayhead(t.session, 20);
    t.engine.play();
    t.frame();
    // c2 starts 70 frames (2.33 s) ahead: not warmed yet.
    expect(t.live().map((w) => w.mediaId)).toEqual(["a"]);
    await t.deliverAll();
    t.frame();
    t.advance(0.4);
    t.frame();
    expect(t.playhead()).toBe(32);
    const warm = t.live().find((w) => w.mediaId === "b") as Window;
    expect(warm.options.priority).toBe("idle");
    // From c2's in point (media frame 300).
    expect(t.positionsOf(warm)).toEqual([300, 301, 302, 303]);
    expect(t.live().some((w) => w.mediaId === "c")).toBe(false);
    expect(LOOKAHEAD_SECONDS).toBe(2);
    await t.deliver(warm);
    // Keep the playhead fed past the cut.
    for (let i = 0; i < 100 && t.playhead() < 92; i++) {
      await t.deliverAll();
      t.advance(1 / 30 + 1e-6);
      t.frame();
    }
    expect(t.playhead()).toBe(92);
    // c2's playback windows carry on after the warmed frames 300..303: no second seek.
    const bWindows = t.windows.filter((w) => w.mediaId === "b");
    expect(bWindows[1]?.options.priority).toBe("playback");
    expect(t.positionsOf(bWindows[1] as Window)[0]).toBe(304);
    // Each media frame asked for once, in order, up to 15 frames ahead of frame 92 (media frame 302).
    expect(bWindows.flatMap((w) => t.positionsOf(w))).toEqual(Array.from({ length: 17 }, (_, i) => 300 + i));
    // Only the 0.4 s jump above skipped frames; the cut itself showed every frame.
    expect(t.engine.stats.dropped).toBe(11);
  });
});

describe("PlaybackEngine dropped frames", () => {
  it("counts frames the clock skipped and frames first drawn without their exact frame, at 1x; resets on play", async () => {
    const t = setup(ONE_CLIP());
    await t.startPlaying();
    t.advance(1 / 30 + 0.001);
    t.frame();
    expect(t.engine.stats).toMatchObject({ dropped: 0, frames: 1 });
    // A long main-thread frame: 3 frames at once, 2 never shown.
    t.advance(3 / 30);
    t.frame();
    expect(t.engine.stats).toMatchObject({ dropped: 2, frames: 4 });
    // Frame 5 is first drawn with a held layer.
    t.advance(1 / 30);
    t.frame({ exact: false });
    t.advance(1 / 30);
    t.frame();
    expect(t.engine.stats).toMatchObject({ dropped: 3, frames: 6 });
    // Shuttle speeds skip frames by design.
    t.engine.play(2);
    t.advance(1);
    t.frame({ exact: false });
    expect(t.engine.stats.dropped).toBe(3);
    t.engine.pause();
    await t.startPlaying();
    expect(t.engine.stats).toMatchObject({ dropped: 0, frames: 0 });
  });

  it("flags media whose frames are late on more than 2 frames in a row for proxy playback", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const t = setup(ONE_CLIP());
    await t.startPlaying();
    // Nothing more is delivered: frames 15.. are never ready.
    for (let i = 0; i < 18; i++) {
      t.advance(1 / 30 + 0.0001);
      t.frame();
    }
    expect(t.playhead()).toBe(18);
    expect(t.engine.autoProxy.has("a")).toBe(true);
    expect(t.onBehind).toHaveBeenCalledWith("a");
  });
});

describe("PlaybackEngine proxies (spec §7.5, §8, §9.5)", () => {
  const TWO_CLIPS = () =>
    project([
      { id: "c1", media: "a", start: 0, duration: 30 },
      { id: "c2", media: "b", start: 30, duration: 30 },
    ]);

  it("plays Auto from the proxy of media that have one, the full file of the others", async () => {
    const t = setup(TWO_CLIPS(), { quality: "auto", proxies: new Set(["a"]) });
    t.engine.play(1);
    t.frame();
    await t.flush();
    expect(t.frames.video).toHaveBeenCalledWith("a", "proxy");
    t.frame();
    await t.deliverAll();
    expect(t.windows.filter((w) => w.mediaId === "a").every((w) => w.options.lod === "proxy")).toBe(true);
    expect(t.windows.filter((w) => w.mediaId === "b").every((w) => w.options.lod === "full")).toBe(true);
    // The preroll waits for the proxy frames, then the clock runs.
    t.frame();
    t.advance(1 / 30 + 0.0001);
    t.frame();
    expect(t.playhead()).toBe(1);
  });

  it("plays Full from the full file even when a proxy is ready", async () => {
    const t = setup(ONE_CLIP(), { quality: "full", proxies: new Set(["a"]) });
    await t.startPlaying();
    expect(t.windows.length).toBeGreaterThan(0);
    expect(t.windows.every((w) => w.options.lod === "full")).toBe(true);
  });

  it("1/2 switches a media that falls behind to its proxy for the rest of the playback", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const t = setup(ONE_CLIP(), { quality: "half", proxies: new Set(["a"]) });
    await t.startPlaying();
    expect(t.windows.every((w) => w.options.lod === "full")).toBe(true);
    const before = t.windows.length;
    for (let i = 0; i < 18; i++) {
      t.advance(1 / 30 + 0.0001);
      t.frame();
    }
    expect(t.onBehind).toHaveBeenCalledWith("a");
    await t.flush();
    t.frame();
    const after = t.windows.slice(before).filter((w) => !w.options.signal?.aborted);
    expect(after.at(-1)?.options.lod).toBe("proxy");
    // The next playback starts on the full file again.
    t.engine.pause();
    await t.startPlaying();
    expect(t.windows.at(-1)?.options.lod).toBe("full");
  });
});

/** An audio scheduler stand-in that records what the engine hands it. */
function fakeAudio(lead = 0.05) {
  let ready = false;
  const mappings: PlayMapping[] = [];
  const audio = {
    lead: vi.fn(() => lead),
    prepare: vi.fn(() => ready),
    prefetch: vi.fn(),
    sync: vi.fn((mapping: PlayMapping) => void mappings.push({ ...mapping })),
    stop: vi.fn(),
  };
  return { audio, mappings, setReady: (value: boolean) => (ready = value), last: () => mappings.at(-1) };
}

describe("PlaybackEngine audio", () => {
  it("waits in the preroll for the audio under the playhead, then starts the clock its lead ahead", async () => {
    const a = fakeAudio(0.05);
    const t = setup(ONE_CLIP(), { audio: a.audio });
    setPlayhead(t.session, 30);
    t.engine.play(1);
    t.frame();
    await t.deliverAll();
    t.frame();
    // The video is ready, the audio is not: still in the preroll.
    expect(a.audio.sync).not.toHaveBeenCalled();
    expect(a.audio.prepare).toHaveBeenLastCalledWith(expect.anything(), 30);
    a.setReady(true);
    t.frame();
    const mapping = a.last();
    expect(mapping).toMatchObject({ frame: 30, speed: 1, end: 900, loop: false });
    // 100 is the clock: the lead, less half a display frame (frame boundaries between vsyncs).
    expect(mapping?.clock).toBeCloseTo(100 + 0.05 - 0.5 / 60, 9);
    // The playhead holds until the anchor, then runs from it.
    t.advance(0.04);
    t.frame();
    expect(t.playhead()).toBe(30);
    t.advance(1);
    t.frame();
    expect(t.playhead()).toBe(30 + Math.floor((0.04 + 1 - 0.05 + 0.5 / 60) * 30));
  });

  it("gives up waiting for audio after the preroll time", async () => {
    const a = fakeAudio(0);
    const t = setup(ONE_CLIP(), { audio: a.audio });
    t.engine.play(1);
    t.frame();
    await t.deliverAll();
    t.advance(PREROLL_SECONDS + 0.01);
    t.frame();
    expect(a.audio.sync).toHaveBeenCalled();
  });

  it("re-anchors a seek with the lead, loads audio ahead, and stops the audio on pause", async () => {
    const a = fakeAudio(0.04);
    a.setReady(true);
    const t = setup(ONE_CLIP(), { audio: a.audio });
    await t.startPlaying();
    t.advance(1);
    t.frame();
    expect(a.audio.prefetch).toHaveBeenCalled();
    setPlayhead(t.session, 600);
    t.frame();
    expect(a.last()).toMatchObject({ frame: 600 });
    expect(a.last()?.clock).toBeCloseTo(101 + 0.04 - 0.5 / 60, 9);
    t.engine.pause();
    expect(a.audio.stop).toHaveBeenCalledTimes(1);
  });

  it("wraps a loop at the exact time the end frame would have started", async () => {
    const a = fakeAudio(0);
    a.setReady(true);
    const t = setup(project([{ id: "c1", media: "a", start: 0, duration: 60 }]), { audio: a.audio });
    t.session.state.set((state) => ({ ...state, loop: true }));
    setPlayhead(t.session, 50);
    await t.startPlaying();
    const before = a.last() as PlayMapping;
    expect(before).toMatchObject({ frame: 50, loop: true, end: 60 });
    // The tick that sees the wrap comes 20 ms late.
    t.advance(10 / 30 + 0.02);
    t.frame();
    const after = a.last() as PlayMapping;
    expect(after.frame).toBe(0);
    expect(after.clock).toBeCloseTo(before.clock + 10 / 30, 9);
    expect(t.playhead()).toBe(0);
  });

  it("hands the loop range to the audio and re-anchors on the in point at the wrap", async () => {
    const a = fakeAudio(0);
    a.setReady(true);
    const t = setup(ONE_CLIP(), { audio: a.audio });
    t.session.state.set((state) => ({ ...state, loop: true, inPoint: 30, outPoint: 60 }));
    setPlayhead(t.session, 50);
    await t.startPlaying();
    const before = a.last() as PlayMapping;
    expect(before).toMatchObject({ frame: 50, start: 30, end: 60, loop: true });
    t.advance(10 / 30 + 0.02);
    t.frame();
    const after = a.last() as PlayMapping;
    expect(after.frame).toBe(30);
    expect(after.clock).toBeCloseTo(before.clock + 10 / 30, 9);
  });

  it("hands shuttle speeds over (the scheduler is silent at them) with no clock lead", async () => {
    const a = fakeAudio(0.05);
    a.setReady(true);
    const t = setup(ONE_CLIP(), { audio: a.audio });
    await t.startPlaying();
    a.audio.lead.mockClear();
    t.engine.play(2);
    t.frame();
    expect(a.last()).toMatchObject({ speed: 2 });
    expect(a.audio.lead).not.toHaveBeenCalled();
  });
});
