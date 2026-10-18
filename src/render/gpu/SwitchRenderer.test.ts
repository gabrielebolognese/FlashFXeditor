import { describe, expect, it, vi } from "vitest";
import type { BackendRenderer, RenderDevice } from "./backend.js";
import type { GpuState } from "./GpuDevice.js";
import type { DeviceEvent, RenderTarget } from "./renderer.js";
import { SwitchRenderer } from "./SwitchRenderer.js";

function fakeBackend() {
  const events = new Set<(event: DeviceEvent) => void>();
  const states = new Set<(state: GpuState) => void>();
  const renderer = {
    backend: "webgl2",
    ready: true,
    maxTextureSize: 4096,
    textureCounts: { live: 3, bytes: 300 },
    subscribe: (listener: (event: DeviceEvent) => void) => {
      events.add(listener);
      return () => events.delete(listener);
    },
    draw: vi.fn(() => true),
    drawPanes: vi.fn(() => true),
    createTexture: vi.fn(),
    uploadVideoFrame: vi.fn(),
    uploadImageBitmap: vi.fn(),
    resize: vi.fn(),
    createCanvasTarget: vi.fn(),
    createOffscreenTarget: vi.fn(),
    readBitmap: vi.fn(),
    releaseTarget: vi.fn(),
    releaseCaches: vi.fn(),
  } as unknown as BackendRenderer;
  const device = {
    backend: "webgl2",
    state: "ready",
    generation: 2,
    restores: 1,
    lastRecoveryMs: 40,
    subscribe: (listener: (state: GpuState) => void) => {
      states.add(listener);
      return () => states.delete(listener);
    },
    start: vi.fn(async () => true),
    dispose: vi.fn(),
    loseForTest: vi.fn(),
  } satisfies RenderDevice;
  return { renderer, device, emit: (event: DeviceEvent) => events.forEach((l) => l(event)), setState: (state: GpuState) => states.forEach((l) => l(state)) };
}

const target: RenderTarget = { kind: "canvas", width: 10, height: 10 };
const list = { width: 10, height: 10, background: { r: 0, g: 0, b: 0, a: 1 }, layers: [] };

describe("SwitchRenderer", () => {
  it("draws nothing and refuses uploads before a backend is chosen", () => {
    const renderer = new SwitchRenderer();
    expect(renderer.ready).toBe(false);
    expect(renderer.backend).toBeNull();
    expect(renderer.draw(list, target)).toBe(false);
    expect(() => renderer.createOffscreenTarget(4, 4)).toThrow(/not ready/);
    const frame = { close: vi.fn() } as unknown as VideoFrame;
    expect(() => renderer.uploadVideoFrame(frame)).toThrow(/not ready/);
    expect(frame.close).toHaveBeenCalled();
    expect(renderer.device.state).toBe("idle");
  });

  it("forwards to the chosen backend and relays its events to earlier listeners", async () => {
    const renderer = new SwitchRenderer();
    const events: DeviceEvent[] = [];
    const states: GpuState[] = [];
    renderer.subscribe((event) => events.push(event));
    renderer.device.subscribe((state) => states.push(state));
    const backend = fakeBackend();
    renderer.select(backend.renderer, backend.device);
    expect(renderer.backend).toBe("webgl2");
    expect(renderer.maxTextureSize).toBe(4096);
    expect(renderer.textureCounts).toEqual({ live: 3, bytes: 300 });
    expect(renderer.draw(list, target)).toBe(true);
    expect(backend.renderer.draw).toHaveBeenCalledWith(list, target, undefined);
    renderer.releaseCaches();
    expect(backend.renderer.releaseCaches).toHaveBeenCalled();
    await renderer.device.start(null);
    expect(backend.device.start).toHaveBeenCalledWith(null);
    expect([renderer.device.backend, renderer.device.generation, renderer.device.restores]).toEqual(["webgl2", 2, 1]);
    backend.emit("lost");
    backend.setState("lost");
    expect(events).toEqual(["lost"]);
    expect(states).toEqual(["lost"]);
    expect(() => renderer.select(backend.renderer, backend.device)).toThrow(/once/);
  });
});
