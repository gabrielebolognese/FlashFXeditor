// WebGPU adapter and device (spec §3.1). Owns the one GPUDevice of the app and replaces it when it is
// lost (driver reset, GPU process crash, `device.destroy()` from the console): a new adapter and device
// are requested at once, then with growing delays. Listeners rebuild their GPU objects on "ready".

export type GpuState = "idle" | "ready" | "lost" | "failed" | "disposed";

export type GpuListener = (state: GpuState, device: GPUDevice | null) => void;

/** Delays before each recovery attempt (ms). The first is immediate; the sum stays under 4 s. */
export const RECOVERY_DELAYS_MS: readonly number[] = [0, 50, 200, 500, 1000, 2000];

export interface GpuDeviceOptions {
  gpu?: GPU | undefined;
  recoveryDelaysMs?: readonly number[];
  wait?: (ms: number) => Promise<void>;
  /**
   * False: a lost device is not replaced; the state goes from "lost" to "failed" (the export, Batch 47:
   * textures of the old device would be skipped silently, so the job fails instead).
   */
  recover?: boolean;
}

const defaultWait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The adapter, or null when the browser has WebGPU but no usable GPU (startup check, spec §1.4). */
export async function requestGpuAdapter(gpu: GPU | undefined = navigator.gpu): Promise<GPUAdapter | null> {
  try {
    return (await gpu?.requestAdapter({ powerPreference: "high-performance" })) ?? null;
  } catch (error) {
    console.error("[gpu] requestAdapter failed", error);
    return null;
  }
}

export class GpuDevice {
  private current: GPUDevice | null = null;
  private stateValue: GpuState = "idle";
  private readonly listeners = new Set<GpuListener>();
  private readonly gpu: GPU | undefined;
  private readonly delays: readonly number[];
  private readonly wait: (ms: number) => Promise<void>;
  private readonly recovers: boolean;
  /** Devices created so far; texture handles remember theirs to know when they went stale. */
  generation = 0;
  /** Successful recoveries after a loss (dev stats). */
  restores = 0;
  /** When the last loss was noticed (performance.now), for the recovery time. */
  lostAt = 0;
  /** Milliseconds from the last loss to the new device. */
  lastRecoveryMs = 0;

  constructor(options: GpuDeviceOptions = {}) {
    this.gpu = options.gpu ?? (typeof navigator !== "undefined" ? navigator.gpu : undefined);
    this.delays = options.recoveryDelaysMs ?? RECOVERY_DELAYS_MS;
    this.wait = options.wait ?? defaultWait;
    this.recovers = options.recover ?? true;
  }

  get device(): GPUDevice | null {
    return this.current;
  }

  get state(): GpuState {
    return this.stateValue;
  }

  /** Creates the first device, from the adapter of the startup check when given. */
  async start(adapter?: GPUAdapter | null): Promise<boolean> {
    if (this.stateValue !== "idle") return this.stateValue === "ready";
    try {
      const resolved = adapter ?? (await requestGpuAdapter(this.gpu));
      if (!resolved) throw new Error("No WebGPU adapter");
      this.adopt(await resolved.requestDevice({ label: "shorts-editor" }));
      return true;
    } catch (error) {
      console.error("[gpu] device creation failed", error);
      this.setState("failed");
      return false;
    }
  }

  subscribe(listener: GpuListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Destroys the device on purpose: no recovery. */
  dispose(): void {
    const device = this.current;
    this.current = null;
    this.setState("disposed");
    device?.destroy();
    this.listeners.clear();
  }

  private adopt(device: GPUDevice): void {
    this.current = device;
    this.generation += 1;
    device.addEventListener("uncapturederror", (event) => {
      console.error("[gpu] uncaptured error:", (event as GPUUncapturedErrorEvent).error.message);
    });
    void device.lost.then((info) => this.onLost(device, info));
    this.setState("ready");
  }

  private onLost(device: GPUDevice, info: GPUDeviceLostInfo): void {
    if (device !== this.current || this.stateValue === "disposed") return;
    console.warn(`[gpu] device lost (${info.reason}): ${info.message}`);
    this.current = null;
    this.lostAt = performance.now();
    this.setState("lost");
    if (this.recovers) void this.recover();
    else this.setState("failed");
  }

  private async recover(): Promise<void> {
    for (const delay of this.delays) {
      await this.wait(delay);
      if (this.stateValue !== "lost") return;
      try {
        // A lost device's adapter cannot make another device: always ask for a new one.
        const adapter = await requestGpuAdapter(this.gpu);
        if (!adapter) continue;
        const device = await adapter.requestDevice({ label: "shorts-editor" });
        if (this.stateValue !== "lost") {
          device.destroy();
          return;
        }
        this.restores += 1;
        this.lastRecoveryMs = performance.now() - this.lostAt;
        console.info(`[gpu] device restored in ${Math.round(this.lastRecoveryMs)} ms`);
        this.adopt(device);
        return;
      } catch (error) {
        console.warn("[gpu] recovery attempt failed", error);
      }
    }
    console.error("[gpu] could not recover the GPU device");
    this.setState("failed");
  }

  private setState(state: GpuState): void {
    this.stateValue = state;
    for (const listener of [...this.listeners]) {
      try {
        listener(state, this.current);
      } catch (error) {
        console.error("[gpu] listener failed", error);
      }
    }
  }
}
