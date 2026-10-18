import { describe, expect, it, vi } from "vitest";
import type { TextPreset } from "../../core/document/types.js";
import { IdleQueue } from "../../core/scheduler/IdleQueue.js";
import { DEFAULT_TEXT_STYLE } from "../../text/style.js";
import { MAX_THUMBNAILS, PresetThumbService } from "./PresetThumbService.js";

const NOW = "2026-10-19T10:00:00.000Z";
const preset = (id: string, patch: Partial<TextPreset> = {}): TextPreset => ({
  id,
  name: id,
  style: { ...structuredClone(DEFAULT_TEXT_STYLE), fontFamily: "Cinzel" },
  box: { mode: "auto", width: 900 },
  applyPosition: false,
  tags: [],
  favorite: false,
  createdAt: NOW,
  updatedAt: NOW,
  ...patch,
});

/** A bitmap stand-in that counts its close. */
const bitmap = () => ({ close: vi.fn() }) as unknown as ImageBitmap & { close: ReturnType<typeof vi.fn> };

function setup() {
  const slices: ((deadline: { timeRemaining(): number }) => void)[] = [];
  const idle = new IdleQueue(
    (cb) => slices.push(cb),
    () => undefined,
  );
  const runIdle = () => {
    while (slices.length > 0) slices.shift()?.({ timeRemaining: () => 50 });
  };
  let fontListener: (families: ReadonlySet<string>) => void = () => undefined;
  const ready = { value: true };
  const fontsReady = vi.fn(() => ready.value);
  const render = vi.fn(() => bitmap());
  const service = new PresetThumbService({
    idle,
    fontsReady,
    render,
    subscribeFonts: (listener) => {
      fontListener = listener;
      return () => undefined;
    },
  });
  const fonts = (...families: string[]) => fontListener(new Set(families));
  return { service, idle, runIdle, ready, fontsReady, render, fonts };
}

describe("PresetThumbService", () => {
  it("makes a thumbnail in idle time, once, and answers from the cache after", () => {
    const { service, runIdle, render } = setup();
    const listener = vi.fn();
    service.subscribe(listener);
    const p = preset("a", { sampleText: "Luxury" });
    expect(service.get(p, 168, 80, 8)).toBeNull();
    expect(service.get(p, 168, 80, 8)).toBeNull();
    expect(render).not.toHaveBeenCalled();
    runIdle();
    expect(render).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledWith(p, 168, 80, 8);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith("a");
    expect(service.get(p, 168, 80, 8)?.bitmap).toBe(render.mock.results[0]?.value);
    // A rename (with a sample text of its own) or a star is not a new look: the same bitmap.
    expect(service.get({ ...p, name: "renamed", favorite: true }, 168, 80, 8)?.bitmap).toBe(render.mock.results[0]?.value);
  });

  it("keys by look and size: a changed preset or another size is made again", () => {
    const { service, runIdle, render } = setup();
    const p = preset("a");
    service.get(p, 168, 80, 8);
    service.get(p, 336, 160, 16);
    service.get({ ...p, style: { ...p.style, fontWeight: 400 } }, 168, 80, 8);
    service.get({ ...p, sampleText: "Luxury" }, 168, 80, 8);
    runIdle();
    expect(render).toHaveBeenCalledTimes(4);
  });

  it("waits while its fonts load, and is made when its family reports a change", () => {
    const { service, runIdle, ready, render, fonts } = setup();
    ready.value = false;
    const p = preset("a");
    service.get(p, 168, 80, 8);
    runIdle();
    expect(render).not.toHaveBeenCalled();
    expect(service.stats.waits).toBe(1);
    // Another family's load changes nothing.
    fonts("anton");
    runIdle();
    expect(service.stats.waits).toBe(1);
    ready.value = true;
    fonts("cinzel");
    runIdle();
    expect(render).toHaveBeenCalledTimes(1);
    expect(service.get(p, 168, 80, 8)?.bitmap).not.toBeNull();
  });

  it("draws anyway after a few waits (a font that never loads draws in the fallback)", () => {
    const { service, runIdle, ready, render, fonts } = setup();
    ready.value = false;
    service.get(preset("a"), 168, 80, 8);
    let rounds = 0;
    while (render.mock.calls.length === 0 && rounds < 10) {
      runIdle();
      if (render.mock.calls.length === 0) fonts("cinzel");
      rounds += 1;
    }
    expect(render).toHaveBeenCalledTimes(1);
    expect(rounds).toBe(5);
  });

  it("makes a family's thumbnails again when it changes, keeping the old bitmap until the new one lands", () => {
    const { service, runIdle, render, fonts } = setup();
    const p = preset("a");
    service.get(p, 168, 80, 8);
    runIdle();
    const first = service.get(p, 168, 80, 8)?.bitmap as ImageBitmap & { close: ReturnType<typeof vi.fn> };
    const listener = vi.fn();
    service.subscribe(listener);
    fonts("cinzel");
    expect(service.get(p, 168, 80, 8)?.bitmap).toBe(first);
    runIdle();
    expect(render).toHaveBeenCalledTimes(2);
    // The painter hears the remake (the canvases showing "a" draw the new bitmap).
    expect(listener.mock.calls).toEqual([["a"]]);
    expect(first.close).toHaveBeenCalled();
    expect(service.get(p, 168, 80, 8)?.bitmap).not.toBe(first);
  });

  it("keeps at most MAX_THUMBNAILS, closing the evicted ones, and never makes an evicted one", () => {
    const { service, runIdle, render } = setup();
    service.get(preset("first"), 10, 10, 0);
    runIdle();
    const first = render.mock.results[0]?.value as { close: ReturnType<typeof vi.fn> };
    for (let i = 0; i < MAX_THUMBNAILS + 5; i++) service.get(preset(`p${i}`), 10, 10, 0);
    expect(service.size).toBe(MAX_THUMBNAILS);
    expect(first.close).toHaveBeenCalled();
    runIdle();
    // The 5 oldest of the new ones were evicted before their task ran.
    expect(render).toHaveBeenCalledTimes(1 + MAX_THUMBNAILS);
  });

  it("knows a made thumbnail with nothing to draw", () => {
    const { service, runIdle, render } = setup();
    render.mockReturnValueOnce(null as never);
    service.get(preset("empty"), 10, 10, 0);
    runIdle();
    expect(service.get(preset("empty"), 10, 10, 0)).toEqual({ bitmap: null });
  });

  it("dispose closes every bitmap", () => {
    const { service, runIdle, render } = setup();
    service.get(preset("a"), 10, 10, 0);
    runIdle();
    service.dispose();
    expect((render.mock.results[0]?.value as { close: ReturnType<typeof vi.fn> }).close).toHaveBeenCalled();
    expect(service.size).toBe(0);
  });
});
