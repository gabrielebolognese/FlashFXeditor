import { describe, expect, it } from "vitest";
import { makeTrack } from "../../core/document/fixtures.js";
import type { Track } from "../../core/document/types.js";
import { METRICS } from "./fixtures.js";
import { TimelineGeometry, type GeometryInput } from "./geometry.js";

function geometry(tracks: Track[], patch: Partial<GeometryInput> = {}): TimelineGeometry {
  return new TimelineGeometry({ width: 1000, height: 428, tracks, pxPerFrame: 4, scrollFrame: 0, scrollY: 0, metrics: METRICS, ...patch });
}

// Track area: y 28..428 (400 px); the divider rests at 28 + 200 = 228.
const tracks = () => [makeTrack("v1"), { ...makeTrack("v2"), height: "S" as const }, makeTrack("a1", "audio"), { ...makeTrack("a2", "audio"), height: "L" as const }];

describe("TimelineGeometry", () => {
  it("stacks video tracks upward from the divider and audio tracks downward", () => {
    const g = geometry(tracks());
    expect(g.area).toEqual({ x: 176, y: 28, width: 824, height: 400 });
    expect(g.divider.y).toBe(228);
    expect(g.rows.map((row) => [row.trackId, row.y, row.height])).toEqual([
      ["v2", 228 - 56 - 32, 32],
      ["v1", 228 - 56, 56],
      ["a1", 232, 56],
      ["a2", 288, 88],
    ]);
    expect(g.addVideo.y).toBe(228 - 56 - 32 - 24);
    expect(g.addAudio.y).toBe(376);
  });

  it("keeps the divider in place when tracks are added", () => {
    const before = geometry(tracks());
    const after = geometry([makeTrack("v1"), makeTrack("v2"), makeTrack("v3"), makeTrack("a1", "audio"), makeTrack("a2", "audio"), makeTrack("a3", "audio")]);
    expect(after.divider.y).toBe(before.divider.y);
    expect(after.rowOf("v1")!.y).toBe(before.rowOf("v1")!.y);
    expect(after.rowOf("a1")!.y).toBe(before.rowOf("a1")!.y);
  });

  it("draws the caption track at S height above the video tracks", () => {
    const g = geometry([makeTrack("v1"), { ...makeTrack("cc", "caption"), height: "L" }, makeTrack("a1", "audio")]);
    expect(g.rows.map((row) => row.trackId)).toEqual(["cc", "v1", "a1"]);
    expect(g.rowOf("cc")!.height).toBe(32);
  });

  it("maps frames to x and back, with the visible range", () => {
    const g = geometry(tracks(), { pxPerFrame: 2.5, scrollFrame: 100.4 });
    expect(g.frameToX(100.4)).toBeCloseTo(176);
    expect(g.xToFrame(g.frameToX(1234))).toBeCloseTo(1234);
    expect(g.visibleFrames.from).toBe(100.4);
    expect(g.visibleFrames.to).toBeCloseTo(100.4 + 824 / 2.5);
    expect(g.isFrameVisible(100)).toBe(false);
    expect(g.isFrameVisible(200)).toBe(true);
  });

  it("finds the row at a y and scrolls everything with scrollY", () => {
    const g = geometry(tracks());
    expect(g.rowAt(140)?.trackId).toBe("v2");
    expect(g.rowAt(171)?.trackId).toBe("v2");
    expect(g.rowAt(172)?.trackId).toBe("v1");
    expect(g.rowAt(229)).toBeNull(); // the divider
    expect(g.rowAt(375)?.trackId).toBe("a2");
    expect(g.rowAt(376)).toBeNull();
    expect(g.rowAt(10)).toBeNull();
    const scrolled = geometry(tracks(), { scrollY: -50 });
    expect(scrolled.rowOf("v1")!.y).toBe(172 + 50);
  });

  it("allows scrolling only as far as the content needs, and always to 0", () => {
    expect(geometry(tracks()).scrollYRange).toEqual({ min: 0, max: 0 });
    const tall = geometry(Array.from({ length: 6 }, (_, i) => makeTrack(`v${i}`)).concat([makeTrack("a1", "audio")]));
    // Video block 6 * 56 + 24 = 360 above a divider resting 200 px down: 160 px hidden above.
    expect(tall.scrollYRange.min).toBe(-160);
    expect(tall.scrollYRange.max).toBe(0);
    const audio = geometry([makeTrack("v1")].concat(Array.from({ length: 6 }, (_, i) => makeTrack(`a${i}`, "audio"))));
    // Below the divider: 4 + 6 * 56 + 24 = 364 px against 200 px of room.
    expect(audio.scrollYRange).toEqual({ min: 0, max: 164 });
  });

  it("lays out each kind's header toggles right-aligned on the first line, with the name before them", () => {
    const g = geometry([makeTrack("v1"), makeTrack("cc", "caption"), makeTrack("a1", "audio")]);
    const v1 = g.rowOf("v1")!;
    // Header 176 wide, 8 px padding, 16 px toggles 4 apart: x 72, 92, 112, 132, 152; centered on the 32 px first line.
    expect(g.headerToggles(v1).map(({ toggle, rect }) => [toggle, rect.x, rect.y - v1.y])).toEqual([
      ["target", 72, 8],
      ["lock", 92, 8],
      ["mute", 112, 8],
      ["hide", 132, 8],
      ["height", 152, 8],
    ]);
    expect(g.headerToggles(g.rowOf("a1")!).map(({ toggle }) => toggle)).toEqual(["target", "lock", "mute", "solo", "height"]);
    const cc = g.rowOf("cc")!;
    expect(g.headerToggles(cc).map(({ toggle, rect }) => [toggle, rect.x])).toEqual([
      ["target", 112],
      ["lock", 132],
      ["hide", 152],
    ]);
    expect(g.headerToggle(cc, "solo")).toBeNull();
    // The name: after the 14 px icon and a 6 px gap, up to 6 px before the first toggle.
    expect(g.headerName(v1, 14, 6)).toEqual({ x: 28, y: v1.y, width: 72 - 6 - 28, height: 32 });
    expect(g.headerName(cc, 14, 6).width).toBe(112 - 6 - 28);
  });

  it("finds the lane a dragged header lands on: the row under it, the outermost lane beyond, lane 0 toward the divider", () => {
    const g = geometry([makeTrack("v1"), makeTrack("v2"), makeTrack("v3"), makeTrack("a1", "audio"), makeTrack("a2", "audio")]);
    const mid = (id: string) => g.rowOf(id)!.y + 10;
    expect(["v1", "v2", "v3"].map((id) => g.reorderLane("video", mid(id)))).toEqual([0, 1, 2]);
    expect(g.reorderLane("video", g.rowOf("v3")!.y - 50)).toBe(2);
    expect(g.reorderLane("video", mid("a2"))).toBe(0);
    expect(["a1", "a2"].map((id) => g.reorderLane("audio", mid(id)))).toEqual([0, 1]);
    expect(g.reorderLane("audio", g.rowOf("a2")!.y + 500)).toBe(1);
    expect(g.reorderLane("audio", mid("v3"))).toBe(0);
  });
});
