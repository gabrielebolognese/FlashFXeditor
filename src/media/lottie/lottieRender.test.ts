import { afterEach, describe, expect, it, vi } from "vitest";
import { LottieRenderer, lottieRasterSize, type LottieEngine, type LottiePlayer } from "./lottieRender.js";

const animation = (extra: Record<string, unknown> = {}) => ({ v: "5", fr: 60, ip: 0, op: 120, w: 200, h: 100, layers: [{}], ...extra });
const file = (json: unknown) => new File([JSON.stringify(json)], "a.json");

function setup() {
  const frames: number[] = [];
  const created: { data: Record<string, unknown>; width: number; height: number; player: LottiePlayer }[] = [];
  const engine: LottieEngine = {
    create(canvas, data) {
      const player: LottiePlayer = {
        setFrame: (frame) => void frames.push(frame),
        destroy: vi.fn(),
        addEventListener: (event, listener) => {
          if (event === "load") queueMicrotask(() => listener({}));
        },
      };
      created.push({ data: data as Record<string, unknown>, width: canvas.width, height: canvas.height, player });
      return player;
    },
  };
  class FakeCanvas {
    constructor(
      public width: number,
      public height: number,
    ) {}
  }
  vi.stubGlobal("OffscreenCanvas", FakeCanvas);
  vi.stubGlobal("createImageBitmap", async () => ({ close: () => undefined }));
  return { renderer: new LottieRenderer(async () => engine), frames, created };
}

afterEach(() => vi.unstubAllGlobals());

describe("LottieRenderer (spec §21.23, Batch 79)", () => {
  it("sizes the render by the long edge", () => {
    expect(lottieRasterSize(200, 100, 400)).toEqual({ width: 400, height: 200 });
    expect(lottieRasterSize(100, 200, 50)).toEqual({ width: 25, height: 50 });
    expect(lottieRasterSize(3, 1000, 10)).toEqual({ width: 1, height: 10 });
  });

  it("seeks to each asked time (frame = time x rate) and emits one bitmap per time", async () => {
    const { renderer, frames, created } = setup();
    const emitted: number[] = [];
    await renderer.render(file(animation()), "m1", [0, 500_000, 1_000_000], 400, (time) => emitted.push(time));
    expect(emitted).toEqual([0, 500_000, 1_000_000]);
    expect(frames).toEqual([0, 30, 60]);
    expect(created).toHaveLength(1);
    expect([created[0]?.width, created[0]?.height]).toEqual([400, 200]);
  });

  it("keeps a loaded animation for the same file and size, and reloads when the size changes", async () => {
    const { renderer, created } = setup();
    const f = file(animation());
    await renderer.render(f, "m1", [0], 400, () => undefined);
    await renderer.render(f, "m1", [1], 400, () => undefined);
    expect(created).toHaveLength(1);
    await renderer.render(f, "m1", [1], 800, () => undefined);
    expect(created).toHaveLength(2);
    expect(created[0]?.player.destroy).toHaveBeenCalled();
  });

  it("applies the variant's color overrides before loading, and closes by media", async () => {
    const { renderer, created } = setup();
    const json = animation({ layers: [{ shapes: [{ ty: "fl", c: { a: 0, k: [1, 0, 0, 1] } }] }] });
    await renderer.render(file(json), "m1~lc:ff0000ff>0000ffff", [0], 100, () => undefined);
    const layers = created[0]?.data.layers as { shapes: { c: { k: number[] } }[] }[];
    expect(layers[0]?.shapes[0]?.c.k).toEqual([0, 0, 1, 1]);
    renderer.close("m1");
    expect(created[0]?.player.destroy).toHaveBeenCalled();
  });

  it("stops when aborted", async () => {
    const { renderer } = setup();
    const controller = new AbortController();
    controller.abort(new Error("stop"));
    await expect(renderer.render(file(animation()), "m1", [0], 100, () => undefined, controller.signal)).rejects.toThrow("stop");
  });
});
