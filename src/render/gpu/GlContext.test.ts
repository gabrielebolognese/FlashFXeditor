import { describe, expect, it, vi } from "vitest";
import type { GpuState } from "./GpuDevice.js";
import { GL_ATTRIBUTES, GlContext } from "./GlContext.js";

/** An OffscreenCanvas stand-in whose WebGL2 context can be lost and restored like a real one. */
class FakeCanvas extends EventTarget {
  width = 1;
  height = 1;
  readonly extension = {
    loseContext: vi.fn(() => {
      const event = new Event("webglcontextlost", { cancelable: true });
      this.dispatchEvent(event);
      this.prevented = event.defaultPrevented;
    }),
    restoreContext: vi.fn(() => {
      if (this.prevented) this.dispatchEvent(new Event("webglcontextrestored"));
    }),
  };
  prevented = false;
  readonly gl = { getExtension: (name: string) => (name === "WEBGL_lose_context" ? this.extension : null) };
  constructor(private readonly available = true) {
    super();
  }
  getContext = vi.fn((kind: string, attributes: WebGLContextAttributes) => (kind === "webgl2" && attributes === GL_ATTRIBUTES && this.available ? this.gl : null));
}

function context(options: { available?: boolean; recover?: boolean } = {}) {
  const canvas = new FakeCanvas(options.available ?? true);
  const gl = new GlContext({ canvas: canvas as unknown as OffscreenCanvas, ...(options.recover !== undefined && { recover: options.recover }) });
  const states: GpuState[] = [];
  gl.subscribe((state) => states.push(state));
  return { canvas, gl, states };
}

describe("GlContext", () => {
  it("creates the context on its canvas", async () => {
    const { canvas, gl, states } = context();
    await expect(gl.start()).resolves.toBe(true);
    expect(gl.gl).toBe(canvas.gl);
    expect(gl.generation).toBe(1);
    expect(gl.backend).toBe("webgl2");
    expect(states).toEqual(["ready"]);
    await expect(gl.start()).resolves.toBe(true);
    expect(canvas.getContext).toHaveBeenCalledTimes(1);
  });

  it("fails when the browser gives no WebGL2 context", async () => {
    const { gl, states } = context({ available: false });
    await expect(gl.start()).resolves.toBe(false);
    expect(gl.gl).toBeNull();
    expect(states).toEqual(["failed"]);
  });

  it("keeps a lost context for the browser to restore, as a new generation", async () => {
    vi.useFakeTimers();
    try {
      const { canvas, gl, states } = context();
      await gl.start();
      gl.loseForTest(50);
      expect(canvas.prevented).toBe(true);
      expect(gl.state).toBe("lost");
      expect(gl.gl).toBeNull();
      vi.advanceTimersByTime(50);
      expect(states).toEqual(["ready", "lost", "ready"]);
      expect(gl.generation).toBe(2);
      expect(gl.restores).toBe(1);
      expect(gl.gl).toBe(canvas.gl);
    } finally {
      vi.useRealTimers();
    }
  });

  it("fails on a loss without recovery (the export)", async () => {
    vi.useFakeTimers();
    try {
      const { canvas, gl, states } = context({ recover: false });
      await gl.start();
      gl.loseForTest();
      vi.runAllTimers();
      expect(canvas.prevented).toBe(false);
      expect(canvas.extension.restoreContext).not.toHaveBeenCalled();
      expect(states).toEqual(["ready", "lost", "failed"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("frees the context on dispose and ignores its loss event", async () => {
    const { canvas, gl, states } = context();
    await gl.start();
    gl.dispose();
    expect(canvas.extension.loseContext).toHaveBeenCalledTimes(1);
    expect(gl.state).toBe("disposed");
    expect(canvas.prevented).toBe(false);
    expect(states).toEqual(["ready", "disposed"]);
  });
});
