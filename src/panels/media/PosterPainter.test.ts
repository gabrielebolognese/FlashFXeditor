import { describe, expect, it, vi } from "vitest";
import type { MediaId } from "../../core/document/types.js";
import { FrameScheduler } from "../../core/scheduler/FrameScheduler.js";
import type { CardImage, CardListener } from "../../media/ThumbnailStore.js";
import { PosterPainter, wholeImage, type PosterSource, type PosterTarget } from "./PosterPainter.js";

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

/** A picture source like the app's: replays the current picture on observe, then emits changes. */
function fakePosters() {
  const bitmaps = new Map<MediaId, CardImage>();
  const listeners = new Map<MediaId, Set<CardListener>>();
  const source: PosterSource & { emit(id: MediaId, bitmap: ImageBitmap | CardImage | null): void; observers(id: MediaId): number } = {
    observe(id, listener) {
      const set = listeners.get(id) ?? new Set();
      listeners.set(id, set);
      set.add(listener);
      const bitmap = bitmaps.get(id);
      if (bitmap) listener(bitmap);
      return () => set.delete(listener);
    },
    emit(id, picture) {
      const image = picture && "bitmap" in picture ? picture : wholeImage(picture);
      if (image) bitmaps.set(id, image);
      else bitmaps.delete(id);
      for (const listener of listeners.get(id) ?? []) listener(image);
    },
    observers: (id) => listeners.get(id)?.size ?? 0,
  };
  return source;
}

function fakeCanvas() {
  const drawImage = vi.fn();
  const canvas = { width: 300, height: 150, dataset: {} as DOMStringMap, getContext: vi.fn(() => ({ drawImage, clearRect: vi.fn() })) };
  return { canvas: canvas as unknown as PosterTarget & { dataset: DOMStringMap }, drawImage };
}

const bitmapOf = (width: number, height: number) => ({ width, height }) as ImageBitmap;
const A = "media-a" as MediaId;
const B = "media-b" as MediaId;

function setup() {
  const frames = fakeFrames();
  const scheduler = new FrameScheduler(frames.request, frames.cancel);
  const painter = new PosterPainter(scheduler);
  return { frames, scheduler, painter, posters: fakePosters() };
}

describe("PosterPainter", () => {
  it("draws nothing outside the frame loop and each canvas once per frame", () => {
    const { frames, painter, posters } = setup();
    const a = fakeCanvas();
    const b = fakeCanvas();
    painter.attach(a.canvas, posters, A);
    painter.attach(b.canvas, posters, B);

    const first = bitmapOf(320, 180);
    const latest = bitmapOf(180, 320);
    posters.emit(A, first);
    posters.emit(A, latest);
    posters.emit(B, bitmapOf(320, 240));
    expect(a.drawImage).not.toHaveBeenCalled();
    expect(b.drawImage).not.toHaveBeenCalled();
    expect(frames.pending()).toBe(1);

    frames.tick();
    expect(a.drawImage).toHaveBeenCalledTimes(1);
    expect(a.drawImage).toHaveBeenCalledWith(latest, 0, 0, 180, 320, 0, 0, 180, 320);
    expect(a.canvas.width).toBe(180);
    expect(a.canvas.height).toBe(320);
    expect(a.canvas.dataset.ready).toBe("");
    expect(b.drawImage).toHaveBeenCalledTimes(1);

    // Clean frames draw nothing again.
    frames.tick();
    expect(frames.pending()).toBe(0);
    expect(a.drawImage).toHaveBeenCalledTimes(1);
  });

  it("draws a poster that already exists at the next frame after attaching", () => {
    const { frames, painter, posters } = setup();
    const bitmap = bitmapOf(320, 180);
    posters.emit(A, bitmap);
    const a = fakeCanvas();
    painter.attach(a.canvas, posters, A);
    expect(a.drawImage).not.toHaveBeenCalled();
    frames.tick();
    expect(a.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 320, 180, 0, 0, 320, 180);
  });

  it("draws a region of a sheet (a video's first thumbnail)", () => {
    const { frames, painter, posters } = setup();
    const sheet = bitmapOf(4 * 284, 640);
    const a = fakeCanvas();
    painter.attach(a.canvas, posters, A);
    posters.emit(A, { bitmap: sheet, sx: 0, sy: 0, sw: 284, sh: 160 });
    frames.tick();
    expect(a.drawImage).toHaveBeenCalledWith(sheet, 0, 0, 284, 160, 0, 0, 284, 160);
    expect([a.canvas.width, a.canvas.height]).toEqual([284, 160]);
  });

  it("hides the canvas when the poster goes away or its bitmap was closed", () => {
    const { frames, painter, posters } = setup();
    const a = fakeCanvas();
    painter.attach(a.canvas, posters, A);
    posters.emit(A, bitmapOf(320, 180));
    frames.tick();
    expect(a.canvas.dataset.ready).toBe("");

    posters.emit(A, null);
    frames.tick();
    expect(a.canvas.dataset.ready).toBeUndefined();

    const b = fakeCanvas();
    painter.attach(b.canvas, posters, B);
    posters.emit(B, bitmapOf(0, 0)); // closed before the frame
    frames.tick();
    expect(b.drawImage).not.toHaveBeenCalled();
    expect(b.canvas.dataset.ready).toBeUndefined();
  });

  it("detaching stops observing and drops a pending draw", () => {
    const { frames, painter, posters } = setup();
    const a = fakeCanvas();
    const detach = painter.attach(a.canvas, posters, A);
    posters.emit(A, bitmapOf(320, 180));
    detach();
    expect(posters.observers(A)).toBe(0);
    frames.tick();
    expect(a.drawImage).not.toHaveBeenCalled();
  });

  it("shows hover-scrub frames until the scrub ends, then the latest poster (spec §12)", () => {
    const { frames, painter, posters } = setup();
    const a = fakeCanvas();
    painter.attach(a.canvas, posters, A);
    const sheet = bitmapOf(4 * 284, 640);
    posters.emit(A, { bitmap: sheet, sx: 0, sy: 0, sw: 284, sh: 160 });
    frames.tick();
    painter.scrub(a.canvas, { bitmap: sheet, sx: 284, sy: 160, sw: 284, sh: 160 });
    frames.tick();
    expect(a.drawImage).toHaveBeenLastCalledWith(sheet, 284, 160, 284, 160, 0, 0, 284, 160);
    // A poster arriving meanwhile waits for the end of the scrub.
    const next = bitmapOf(4 * 284, 640);
    posters.emit(A, { bitmap: next, sx: 0, sy: 0, sw: 284, sh: 160 });
    frames.tick();
    expect(a.drawImage).toHaveBeenCalledTimes(2);
    painter.endScrub(a.canvas);
    painter.endScrub(a.canvas);
    frames.tick();
    expect(a.drawImage).toHaveBeenCalledTimes(3);
    expect(a.drawImage).toHaveBeenLastCalledWith(next, 0, 0, 284, 160, 0, 0, 284, 160);
  });

  it("dispose unregisters the view", () => {
    const { frames, scheduler, painter, posters } = setup();
    const a = fakeCanvas();
    painter.attach(a.canvas, posters, A);
    painter.dispose();
    posters.emit(A, bitmapOf(320, 180));
    expect(scheduler.isScheduled()).toBe(true);
    frames.tick();
    expect(a.drawImage).not.toHaveBeenCalled();
  });
});
