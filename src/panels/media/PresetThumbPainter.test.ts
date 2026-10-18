import { describe, expect, it, vi } from "vitest";
import type { TextPreset } from "../../core/document/types.js";
import { FrameScheduler } from "../../core/scheduler/FrameScheduler.js";
import { IdleQueue } from "../../core/scheduler/IdleQueue.js";
import { PresetThumbService } from "../../render/text/PresetThumbService.js";
import { DEFAULT_TEXT_STYLE } from "../../text/style.js";
import { PresetThumbPainter, type DrawPresetThumb } from "./PresetThumbPainter.js";

function fakeFrames() {
  const queue: ((time: number) => void)[] = [];
  return {
    request: (cb: (time: number) => void) => queue.push(cb),
    cancel: vi.fn(),
    pending: () => queue.length,
    tick(time = 16) {
      for (const cb of queue.splice(0)) cb(time);
    },
  };
}

const NOW = "2026-10-16T10:00:00.000Z";
const preset = (id: string): TextPreset => ({
  id,
  name: id,
  style: structuredClone(DEFAULT_TEXT_STYLE),
  box: { mode: "auto", width: 900 },
  applyPosition: false,
  tags: [],
  favorite: false,
  createdAt: NOW,
  updatedAt: NOW,
});
const canvas = () => ({}) as HTMLCanvasElement;

function setup(ready = true) {
  const frames = fakeFrames();
  const scheduler = new FrameScheduler(frames.request, frames.cancel);
  const draw = vi.fn<DrawPresetThumb>(() => ready);
  const painter = new PresetThumbPainter(scheduler, draw);
  return { frames, scheduler, draw, painter };
}

describe("PresetThumbPainter", () => {
  it("draws nothing outside the frame loop and each canvas once per frame at its latest size", () => {
    const { frames, draw, painter } = setup();
    const a = canvas();
    const b = canvas();
    const red = preset("red");
    painter.show(a, red, 6);
    painter.show(b, preset("blue"));
    // A splitter drag: a burst of sizes within one frame.
    for (const width of [100, 110, 120, 130]) {
      painter.resize(a, width, 66);
      painter.resize(b, width, 66);
    }
    expect(draw).not.toHaveBeenCalled();
    expect(frames.pending()).toBe(1);

    frames.tick();
    expect(draw).toHaveBeenCalledTimes(2);
    expect(draw).toHaveBeenCalledWith(a, red, 130, 66, 6);

    // Clean frames draw nothing; the same size and margin again are not a change.
    painter.resize(a, 130, 66);
    painter.show(a, red, 6);
    frames.tick();
    expect(frames.pending()).toBe(0);
    expect(draw).toHaveBeenCalledTimes(2);
    // Another margin is.
    painter.show(a, red, 4);
    frames.tick();
    expect(draw).toHaveBeenLastCalledWith(a, red, 130, 66, 4);
  });

  it("waits for both the preset and a size, and skips hidden canvases", () => {
    const { frames, draw, painter } = setup();
    const a = canvas();
    painter.resize(a, 118, 66);
    frames.tick();
    expect(draw).not.toHaveBeenCalled();
    const look = preset("a");
    painter.show(a, look);
    frames.tick();
    expect(draw).toHaveBeenCalledWith(a, look, 118, 66, 0);

    // The tab hid (0 x 0): nothing drawn until it has a size again.
    painter.resize(a, 0, 0);
    frames.tick();
    expect(draw).toHaveBeenCalledTimes(1);
    painter.resize(a, 118, 66);
    frames.tick();
    expect(draw).toHaveBeenCalledTimes(2);
  });

  it("draws a canvas whose bitmap was not made yet again when new bitmaps arrive, and only those", () => {
    const { frames, draw, painter } = setup(false);
    const a = canvas();
    const b = canvas();
    painter.show(a, preset("a"));
    painter.resize(a, 118, 66);
    frames.tick();
    expect(draw).toHaveBeenCalledTimes(1);
    // No bitmap yet: nothing happens until the service reports new ones.
    frames.tick();
    expect(draw).toHaveBeenCalledTimes(1);
    draw.mockReturnValue(true);
    painter.bitmapMade("other");
    frames.tick();
    expect(draw).toHaveBeenCalledTimes(2);
    // Drawn now: a report for another preset leaves it alone.
    painter.show(b, preset("b"));
    painter.resize(b, 118, 66);
    frames.tick();
    draw.mockClear();
    painter.bitmapMade("other");
    frames.tick();
    expect(draw).not.toHaveBeenCalled();
  });

  it("draws the canvases that show a preset again when its bitmap is made again, and only those", () => {
    const { frames, draw, painter } = setup();
    const a = canvas();
    const a2 = canvas();
    const b = canvas();
    const look = preset("a");
    painter.show(a, look);
    painter.show(a2, look, 4);
    painter.show(b, preset("b"));
    for (const item of [a, a2, b]) painter.resize(item, 118, 66);
    frames.tick();
    draw.mockClear();

    // A font change made "a" again: both its canvases (the bar's button, the tab's card) draw.
    painter.bitmapMade("a");
    painter.bitmapMade("a");
    frames.tick();
    expect(draw.mock.calls).toEqual([
      [a, look, 118, 66, 0],
      [a2, look, 118, 66, 4],
    ]);
  });

  it("draws a changed preset, and every canvas on redrawAll", () => {
    const { frames, draw, painter } = setup();
    const a = canvas();
    const b = canvas();
    painter.show(a, preset("a"));
    painter.show(b, preset("b"));
    painter.resize(a, 118, 66);
    painter.resize(b, 118, 66);
    frames.tick();
    draw.mockClear();

    const updated = preset("a");
    painter.show(a, updated);
    frames.tick();
    expect(draw.mock.calls).toEqual([[a, updated, 118, 66, 0]]);

    draw.mockClear();
    painter.redrawAll();
    painter.redrawAll();
    frames.tick();
    expect(draw).toHaveBeenCalledTimes(2);
  });

  it("no longer draws a detached canvas, even with a draw pending", () => {
    const { frames, draw, painter } = setup(false);
    const a = canvas();
    painter.show(a, preset("a"));
    painter.resize(a, 118, 66);
    frames.tick();
    painter.detach(a);
    painter.bitmapMade("a");
    painter.redrawAll();
    frames.tick();
    expect(draw).toHaveBeenCalledTimes(1);
  });

  it("dispose unregisters the view", () => {
    const { frames, scheduler, draw, painter } = setup();
    const a = canvas();
    painter.show(a, preset("a"));
    painter.resize(a, 118, 66);
    painter.dispose();
    scheduler.invalidate("mediaThumbs");
    frames.tick();
    expect(draw).not.toHaveBeenCalled();
  });
});

describe("PresetThumbPainter following the PresetThumbService", () => {
  /** The real service and painter, wired as the app wires them (`follow`), with a draw like the app's. */
  function wired() {
    const frames = fakeFrames();
    const scheduler = new FrameScheduler(frames.request, frames.cancel);
    const slices: ((deadline: { timeRemaining(): number }) => void)[] = [];
    const idle = new IdleQueue(
      (cb) => slices.push(cb),
      () => undefined,
    );
    const runIdle = () => {
      while (slices.length > 0) slices.shift()?.({ timeRemaining: () => 50 });
    };
    let fontListener: (families: ReadonlySet<string>) => void = () => undefined;
    const service = new PresetThumbService({
      idle,
      fontsReady: () => true,
      render: () => ({ close: vi.fn() }) as unknown as ImageBitmap,
      subscribeFonts: (listener) => {
        fontListener = listener;
        return () => undefined;
      },
    });
    /** The bitmap each canvas shows (what the app copies onto it). */
    const shown = new Map<HTMLCanvasElement, ImageBitmap | null>();
    const draw = vi.fn<DrawPresetThumb>((target, look, width, height, margin) => {
      const thumb = service.get(look, width, height, margin);
      if (!thumb) return false;
      shown.set(target, thumb.bitmap);
      return true;
    });
    const painter = new PresetThumbPainter(scheduler, draw);
    const stop = painter.follow(service);
    const fonts = (...families: string[]) => fontListener(new Set(families));
    return { frames, runIdle, service, shown, draw, painter, stop, fonts };
  }
  const inFamily = (id: string, fontFamily: string): TextPreset => {
    const look = preset(id);
    return { ...look, style: { ...look.style, fontFamily } };
  };

  it("puts the new bitmap on the canvas when a font change makes its preset's thumbnail again", () => {
    const { frames, runIdle, service, shown, draw, stop, painter, fonts } = wired();
    const a = canvas();
    const b = canvas();
    const zorblax = inFamily("zorblax", "Zorblax");
    const other = inFamily("other", "Inter");
    painter.show(a, zorblax);
    painter.show(b, other);
    painter.resize(a, 82, 38);
    painter.resize(b, 82, 38);
    frames.tick();
    expect(shown.size).toBe(0);
    runIdle();
    frames.tick();
    const first = shown.get(a);
    expect(first).toBeTruthy();
    expect(first).toBe(service.get(zorblax, 82, 38, 0)?.bitmap);
    const otherFirst = shown.get(b);

    // The user adds the family (My fonts): the service makes the bitmap again, and the canvas gets it.
    fonts("zorblax");
    runIdle();
    draw.mockClear();
    frames.tick();
    const second = shown.get(a);
    expect(second).not.toBe(first);
    expect(second).toBe(service.get(zorblax, 82, 38, 0)?.bitmap);
    expect((first as unknown as { close: ReturnType<typeof vi.fn> }).close).toHaveBeenCalled();
    // The other family's canvas keeps its bitmap and is not drawn again.
    expect(draw.mock.calls.map(([target]) => target)).toEqual([a]);
    expect(shown.get(b)).toBe(otherFirst);

    // Stopped: a later remake no longer draws.
    stop();
    fonts("zorblax");
    runIdle();
    frames.tick();
    expect(shown.get(a)).toBe(second);
  });
});
