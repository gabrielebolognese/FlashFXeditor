import { describe, expect, it, vi } from "vitest";
import { chooseBackend, forcedBackend, type BackendProbe } from "./backend.js";

const ADAPTER = { name: "adapter" } as unknown as GPUAdapter;

function probe(adapter: GPUAdapter | null, webgl2: boolean) {
  return { requestAdapter: vi.fn(async () => adapter), webgl2: vi.fn(() => webgl2) } satisfies BackendProbe;
}

describe("forcedBackend", () => {
  it("reads the renderer flag of the URL", () => {
    expect(forcedBackend("?renderer=webgl2")).toBe("webgl2");
    expect(forcedBackend("?a=1&renderer=webgpu")).toBe("webgpu");
    expect(forcedBackend("?renderer=canvas")).toBeNull();
    expect(forcedBackend("")).toBeNull();
  });
});

describe("chooseBackend", () => {
  it("prefers WebGPU and does not probe WebGL2 when it has an adapter", async () => {
    const p = probe(ADAPTER, true);
    await expect(chooseBackend(null, p)).resolves.toEqual({ backend: "webgpu", adapter: ADAPTER });
    expect(p.webgl2).not.toHaveBeenCalled();
  });

  it("falls back to WebGL2 without a WebGPU adapter", async () => {
    await expect(chooseBackend(null, probe(null, true))).resolves.toEqual({ backend: "webgl2", adapter: null });
  });

  it("gives nothing when neither is available", async () => {
    await expect(chooseBackend(null, probe(null, false))).resolves.toBeNull();
  });

  it("puts WebGL2 first with the dev flag, WebGPU staying the fallback", async () => {
    const p = probe(ADAPTER, true);
    await expect(chooseBackend("webgl2", p)).resolves.toEqual({ backend: "webgl2", adapter: null });
    expect(p.requestAdapter).not.toHaveBeenCalled();
    await expect(chooseBackend("webgl2", probe(ADAPTER, false))).resolves.toEqual({ backend: "webgpu", adapter: ADAPTER });
  });

  it("allows WebGPU only with ?renderer=webgpu", async () => {
    await expect(chooseBackend("webgpu", probe(null, true))).resolves.toBeNull();
    await expect(chooseBackend("webgpu", probe(ADAPTER, true))).resolves.toEqual({ backend: "webgpu", adapter: ADAPTER });
  });
});
