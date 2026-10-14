import { describe, expect, it } from "vitest";
import { DEFAULT_RATIOS, MIN_SIZES, clampRatio, createLayoutStore, effectiveRatios } from "./layoutStore.js";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    data,
  };
}

describe("clampRatio", () => {
  it("keeps ratios inside the minimums", () => {
    expect(clampRatio(0.5, 1000, 100, 100)).toBe(0.5);
    expect(clampRatio(0.01, 1000, 100, 100)).toBe(0.1);
    expect(clampRatio(0.99, 1000, 100, 100)).toBe(0.9);
  });

  it("splits proportionally when both minimums cannot fit", () => {
    expect(clampRatio(0.9, 100, 300, 100)).toBe(0.75);
  });

  it("returns the ratio unchanged before the size is known", () => {
    expect(clampRatio(0.3, 0, 100, 100)).toBe(0.3);
  });
});

describe("effectiveRatios", () => {
  it("keeps the spec defaults at 1920x1080 and 1600x900", () => {
    expect(effectiveRatios(DEFAULT_RATIOS, { width: 1920, height: 1040 })).toEqual(DEFAULT_RATIOS);
    expect(effectiveRatios(DEFAULT_RATIOS, { width: 1600, height: 860 })).toEqual(DEFAULT_RATIOS);
  });

  it("respects every panel minimum", () => {
    const workspace = { width: 1600, height: 860 };
    const r = effectiveRatios({ left: 0.99, top: 0.99, media: 0.01 }, workspace);
    expect(workspace.width * (1 - r.left)).toBeGreaterThanOrEqual(MIN_SIZES.preview - 1e-9);
    expect(workspace.height * (1 - r.top)).toBeGreaterThanOrEqual(MIN_SIZES.timeline - 1e-9);
    expect(workspace.width * r.left * r.media).toBeGreaterThanOrEqual(MIN_SIZES.media - 1e-9);

    const s = effectiveRatios({ left: 0.01, top: 0.01, media: 0.99 }, workspace);
    expect(workspace.width * s.left).toBeGreaterThanOrEqual(MIN_SIZES.media + MIN_SIZES.properties - 1e-9);
    expect(workspace.height * s.top).toBeGreaterThanOrEqual(MIN_SIZES.topRow - 1e-9);
    expect(workspace.width * s.left * (1 - s.media)).toBeGreaterThanOrEqual(MIN_SIZES.properties - 1e-9);
  });
});

describe("createLayoutStore", () => {
  it("starts from the defaults and loads persisted ratios", () => {
    expect(createLayoutStore(null).getState().ratios).toEqual(DEFAULT_RATIOS);
    const storage = memoryStorage({ "layout.v1": JSON.stringify({ left: 0.6, top: 0.4, media: 0.5 }) });
    expect(createLayoutStore(storage).getState().ratios).toEqual({ left: 0.6, top: 0.4, media: 0.5 });
  });

  it("ignores corrupt or out-of-range persisted values", () => {
    const corrupt = memoryStorage({ "layout.v1": "{nope" });
    expect(createLayoutStore(corrupt).getState().ratios).toEqual(DEFAULT_RATIOS);
    const outOfRange = memoryStorage({ "layout.v1": JSON.stringify({ left: 4, top: "x", media: 0.3 }) });
    expect(createLayoutStore(outOfRange).getState().ratios).toEqual({ ...DEFAULT_RATIOS, media: 0.3 });
  });

  it("clamps dragged ratios and persists only on request", () => {
    const storage = memoryStorage();
    const store = createLayoutStore(storage);
    store.setWorkspace({ width: 1600, height: 860 });
    store.setRatio("left", 0.99);
    expect(store.getState().ratios.left).toBeCloseTo(1 - MIN_SIZES.preview / 1600);
    expect(storage.data.size).toBe(0);
    store.persist();
    expect(JSON.parse(storage.data.get("layout.v1")!).left).toBeCloseTo(1 - MIN_SIZES.preview / 1600);
    const reloaded = createLayoutStore(storage);
    expect(reloaded.getState().ratios.left).toBeCloseTo(1 - MIN_SIZES.preview / 1600);
  });

  it("resets a splitter to its default", () => {
    const store = createLayoutStore(null);
    store.setRatio("top", 0.3);
    store.resetRatio("top");
    expect(store.getState().ratios.top).toBe(DEFAULT_RATIOS.top);
  });

  it("does not notify for identical panel sizes", () => {
    const store = createLayoutStore(null);
    let calls = 0;
    store.subscribe(() => calls++);
    store.setPanelSize("preview", { width: 600, height: 1000 });
    store.setPanelSize("preview", { width: 600, height: 1000 });
    expect(calls).toBe(1);
  });
});
