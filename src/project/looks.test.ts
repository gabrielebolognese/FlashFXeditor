import { describe, expect, it } from "vitest";
import type { Effect } from "../core/document/types.js";
import { identityLUT, writeCube } from "../core/effects/lut.js";
import type { KeyValueStore } from "./kv.js";
import { cleanLookName, lookFromEffects, LookStore, MAX_LOOK_NAME, nextLookName, sanitizeLook } from "./looks.js";

class MemoryKv implements KeyValueStore {
  readonly map = new Map<string, unknown>();
  async get(key: string) {
    return structuredClone(this.map.get(key));
  }
  async set(key: string, value: unknown) {
    this.map.set(key, structuredClone(value));
  }
  async del(key: string) {
    this.map.delete(key);
  }
}

const NOW = "2026-11-09T10:00:00.000Z";
const CUBE = writeCube(identityLUT(2), "id");
const stack: Effect[] = [
  { id: "fx1", type: "colorAdjust", enabled: true, params: { exposure: 0.5 } },
  { id: "fx2", type: "lut", enabled: true, params: { file: "luts/warm.cube", intensity: 0.5 } },
  { id: "fx3", type: "lut", enabled: true, params: { file: "luts/gone.cube", intensity: 1 } },
];

describe("looks (spec §21.19, Batch 75)", () => {
  it("names looks: cleaned, capped, the next free Look n", () => {
    expect(cleanLookName("  warm \n  sunset ")).toBe("warm sunset");
    expect(cleanLookName("   ")).toBeNull();
    expect(cleanLookName("x".repeat(80))?.length).toBe(MAX_LOOK_NAME);
    expect(nextLookName([])).toBe("Look 1");
    expect(nextLookName(["look 1", "Look 2", "Warm"])).toBe("Look 3");
  });

  it("keeps a copy of the stack and the text of the LUTs it knows", () => {
    const look = lookFromEffects(stack, { id: "a", name: "Warm", now: NOW }, (path) => (path === "luts/warm.cube" ? CUBE : null));
    expect(look).toMatchObject({ id: "a", name: "Warm", createdAt: NOW, luts: { "luts/warm.cube": CUBE } });
    expect(look?.effects).toEqual(stack);
    expect(look?.effects).not.toBe(stack);
    expect(lookFromEffects([], { id: "b", name: "x", now: NOW }, () => null)).toBeNull();
  });

  it("drops stored looks that are malformed, and LUT texts that do not parse", () => {
    expect(sanitizeLook(null, NOW)).toBeNull();
    expect(sanitizeLook({ id: "a", name: "x", effects: [] }, NOW)).toBeNull();
    expect(sanitizeLook({ id: "a", name: "x", effects: [{ id: "fx1", type: "nope", enabled: true, params: {} }] }, NOW)).toBeNull();
    expect(sanitizeLook({ id: "a", name: "x", effects: [{ id: "fx1", type: "vignette", enabled: true, params: { amount: 9 } }] }, NOW)).toBeNull();
    const ok = sanitizeLook({ id: "a", name: " Warm ", effects: stack, luts: { "luts/warm.cube": CUBE, "luts/bad.cube": "junk" } }, NOW);
    expect(ok).toMatchObject({ name: "Warm", createdAt: NOW, luts: { "luts/warm.cube": CUBE } });
    expect(Object.keys(ok?.luts ?? {})).toEqual(["luts/warm.cube"]);
  });

  it("stores looks newest first, replaces one of the same name, removes, and loads them back", async () => {
    const kv = new MemoryKv();
    const store = new LookStore(kv);
    const a = lookFromEffects(stack, { id: "a", name: "Warm", now: NOW }, () => null);
    const b = lookFromEffects(stack.slice(0, 1), { id: "b", name: "Cool", now: NOW }, () => null);
    const c = lookFromEffects(stack.slice(0, 1), { id: "c", name: "warm", now: NOW }, () => null);
    if (!a || !b || !c) throw new Error("looks");
    await store.save(a);
    await store.save(b);
    expect(store.list.getState().map((look) => look.id)).toEqual(["b", "a"]);
    await store.save(c);
    expect(store.list.getState().map((look) => look.id)).toEqual(["c", "b"]);
    expect(store.find("b")?.name).toBe("Cool");
    await store.remove("b");
    const again = new LookStore(kv);
    await again.load(NOW);
    expect(again.list.getState()).toEqual([c]);
  });
});
