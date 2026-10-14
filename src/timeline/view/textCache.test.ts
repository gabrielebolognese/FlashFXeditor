import { describe, expect, it } from "vitest";
import { TextCache, type Measurer } from "./textCache.js";

function measurer() {
  const calls: string[] = [];
  const ctx: Measurer = {
    font: "11px ui",
    measureText(text) {
      calls.push(text);
      return { width: text.length * 10 };
    },
  };
  return { ctx, calls };
}

describe("TextCache", () => {
  it("measures each string once per font", () => {
    const { ctx, calls } = measurer();
    const cache = new TextCache();
    expect(cache.width(ctx, "abc")).toBe(30);
    expect(cache.width(ctx, "abc")).toBe(30);
    ctx.font = "12px ui";
    cache.width(ctx, "abc");
    expect(calls).toEqual(["abc", "abc"]);
  });

  it("ellipsizes to the longest prefix that fits", () => {
    const { ctx } = measurer();
    const cache = new TextCache();
    expect(cache.fit(ctx, "clip name", 90)).toBe("clip name");
    expect(cache.fit(ctx, "clip name", 60)).toBe("clip…");
    expect(cache.fit(ctx, "clip name", 25)).toBe("c…");
    expect(cache.fit(ctx, "clip name", 10)).toBe("…");
    expect(cache.fit(ctx, "clip name", 5)).toBe("");
  });

  it("stays within its cap", () => {
    const { ctx, calls } = measurer();
    const cache = new TextCache(3);
    for (const text of ["a", "b", "c", "d"]) cache.width(ctx, text);
    cache.width(ctx, "a");
    expect(calls).toEqual(["a", "b", "c", "d", "a"]);
  });
});
