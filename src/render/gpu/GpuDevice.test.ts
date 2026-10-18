import { describe, expect, it, vi } from "vitest";
import { GpuDevice, type GpuState } from "./GpuDevice.js";

/** A fake device whose `lost` promise resolves on destroy(), like a real one. */
function fakeDevice(name: string) {
  let resolveLost: (info: GPUDeviceLostInfo) => void = () => {};
  const lost = new Promise<GPUDeviceLostInfo>((resolve) => (resolveLost = resolve));
  const device = {
    name,
    lost,
    destroyed: false,
    addEventListener: vi.fn(),
    destroy() {
      device.destroyed = true;
      resolveLost({ reason: "destroyed", message: "destroyed" } as GPUDeviceLostInfo);
    },
    loseUnexpectedly() {
      resolveLost({ reason: "unknown", message: "driver reset" } as GPUDeviceLostInfo);
    },
  };
  return device;
}

type FakeDevice = ReturnType<typeof fakeDevice>;

function fakeGpu(adapters: (null | "ok" | "throws")[]) {
  const devices: FakeDevice[] = [];
  const gpu = {
    requestAdapter: vi.fn(async () => {
      const next = adapters.length > 0 ? adapters.shift() : "ok";
      if (next === null) return null;
      return {
        requestDevice: async () => {
          if (next === "throws") throw new Error("no device");
          const device = fakeDevice(`device-${devices.length + 1}`);
          devices.push(device);
          return device;
        },
      };
    }),
  };
  return { gpu: gpu as unknown as GPU, devices, requestAdapter: gpu.requestAdapter };
}

const flush = async () => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
};

describe("GpuDevice", () => {
  it("creates a device and reports ready", async () => {
    const { gpu, devices } = fakeGpu(["ok"]);
    const gpuDevice = new GpuDevice({ gpu, wait: async () => {} });
    const states: GpuState[] = [];
    gpuDevice.subscribe((state) => states.push(state));
    await expect(gpuDevice.start()).resolves.toBe(true);
    expect(gpuDevice.device).toBe(devices[0]);
    expect(gpuDevice.generation).toBe(1);
    expect(states).toEqual(["ready"]);
  });

  it("fails without an adapter", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { gpu } = fakeGpu([null]);
    const gpuDevice = new GpuDevice({ gpu, wait: async () => {} });
    await expect(gpuDevice.start()).resolves.toBe(false);
    expect(gpuDevice.state).toBe("failed");
  });

  it("replaces a destroyed device with a new one from a new adapter", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    const { gpu, devices, requestAdapter } = fakeGpu(["ok", "ok"]);
    const gpuDevice = new GpuDevice({ gpu, wait: async () => {} });
    const states: [GpuState, unknown][] = [];
    gpuDevice.subscribe((state, device) => states.push([state, device]));
    await gpuDevice.start();
    devices[0]?.destroy();
    await flush();
    expect(states.map(([state]) => state)).toEqual(["ready", "lost", "ready"]);
    expect(states[1]?.[1]).toBeNull();
    expect(gpuDevice.device).toBe(devices[1]);
    expect(gpuDevice.generation).toBe(2);
    expect(gpuDevice.restores).toBe(1);
    expect(requestAdapter).toHaveBeenCalledTimes(2);
  });

  it("loses its device on purpose for the dev checks, as a RenderDevice (Batch 48)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    const { gpu, devices } = fakeGpu(["ok", "ok"]);
    const gpuDevice = new GpuDevice({ gpu, wait: async () => {} });
    expect(gpuDevice.backend).toBe("webgpu");
    await gpuDevice.start();
    gpuDevice.loseForTest();
    await flush();
    expect(devices[0]?.destroyed).toBe(true);
    expect(gpuDevice.device).toBe(devices[1]);
    expect(gpuDevice.restores).toBe(1);
  });

  it("retries with the delays until an adapter comes back", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    const { gpu, devices } = fakeGpu(["ok", null, "throws", "ok"]);
    const waits: number[] = [];
    const gpuDevice = new GpuDevice({ gpu, recoveryDelaysMs: [0, 10, 20, 30], wait: async (ms) => void waits.push(ms) });
    await gpuDevice.start();
    devices[0]?.loseUnexpectedly();
    await flush();
    expect(waits).toEqual([0, 10, 20]);
    expect(gpuDevice.state).toBe("ready");
    expect(gpuDevice.device).toBe(devices[1]);
  });

  it("gives up after the last delay", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { gpu, devices } = fakeGpu(["ok", null, null]);
    const gpuDevice = new GpuDevice({ gpu, recoveryDelaysMs: [0, 10], wait: async () => {} });
    await gpuDevice.start();
    devices[0]?.loseUnexpectedly();
    await flush();
    expect(gpuDevice.state).toBe("failed");
    expect(gpuDevice.device).toBeNull();
  });

  it("goes to failed without a new device when it must not recover (the export's device, Batch 47)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { gpu, devices, requestAdapter } = fakeGpu(["ok", "ok"]);
    const gpuDevice = new GpuDevice({ gpu, wait: async () => {}, recover: false });
    const states: GpuState[] = [];
    gpuDevice.subscribe((state) => states.push(state));
    await gpuDevice.start();
    devices[0]?.loseUnexpectedly();
    await flush();
    expect(states).toEqual(["ready", "lost", "failed"]);
    expect(gpuDevice.device).toBeNull();
    expect(requestAdapter).toHaveBeenCalledTimes(1);
  });

  it("does not recover after dispose", async () => {
    const { gpu, devices, requestAdapter } = fakeGpu(["ok"]);
    const gpuDevice = new GpuDevice({ gpu, wait: async () => {} });
    await gpuDevice.start();
    gpuDevice.dispose();
    await flush();
    expect(devices[0]?.destroyed).toBe(true);
    expect(gpuDevice.state).toBe("disposed");
    expect(requestAdapter).toHaveBeenCalledTimes(1);
  });

  it("ignores the loss of a device it already replaced", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    const { gpu, devices } = fakeGpu(["ok", "ok"]);
    const gpuDevice = new GpuDevice({ gpu, wait: async () => {} });
    await gpuDevice.start();
    devices[0]?.loseUnexpectedly();
    await flush();
    devices[0]?.destroy();
    await flush();
    expect(gpuDevice.device).toBe(devices[1]);
    expect(gpuDevice.restores).toBe(1);
  });
});
