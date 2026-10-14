import { describe, expect, it, vi } from "vitest";
import type { MediaId } from "../../core/document/types.js";
import { FrameScheduler } from "../../core/scheduler/FrameScheduler.js";
import type { PosterListener } from "../../media/PosterStore.js";
import { PosterPainter, type PosterSource, type PosterTarget } from "./PosterPainter.js";

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

/** A poster source like PosterStore: replays the current bitmap on observe, then emits changes. */
function fakePosters() {
  const bitmaps = new Map<MediaId, ImageBitmap>();
  const listeners = new Map<MediaId, Set<PosterListener>>();
  const source: PosterSource & { emit(id: MediaId, bitmap: ImageBitmap | null): void; observers(id: MediaId): number } = {
    observe(id, listener) {
      const set = listeners.get(id) ?? new Set();
      listeners.set(id, set);
      set.add(listener);
      const bitmap = bitmaps.get(id);
      if (bitmap) listener(bitmap);
      return () => set.delete(listener);
    },
    emit(id, bitmap) {
      if (bitmap) bitmaps.set(id, bitmap);
      else bitmaps.delete(id);
      for (const listener of listeners.get(id) ?? []) listener(bitmap);
    },
    observers: (id) => listeners.get(id)?.size ?? 0,
  };
  return source;
}

function fakeCanvas() {
  const drawImage = vi.fn();
  const canvas = { width: 300, height: 150, dataset: {} as DOMStringMap, getContext: vi.fn(() => ({ drawImage })) };
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
    expect(a.drawImage).toHaveBeenCalledWith(latest, 0, 0);
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
    expect(a.drawImage).toHaveBeenCalledWith(bitmap, 0, 0);
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
