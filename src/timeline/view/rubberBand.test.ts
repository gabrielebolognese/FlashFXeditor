import { describe, expect, it } from "vitest";
import { makeMediaClip, makeProject, makeTrack } from "../../core/document/fixtures.js";
import type { MediaClip } from "../../core/document/types.js";
import { METRICS, testTheme } from "./fixtures.js";
import { TimelineGeometry } from "./geometry.js";
import { bandAt, bandBox, gainToUnit, gainY, lineY, unitToGain, yGain } from "./rubberBand.js";

const theme = (() => {
  const base = testTheme();
  // The keyframe diamond's size (8 px) for the key hits.
  return { ...base, timeline: { ...base.timeline, keyframeSize: 8 } };
})();

describe("rubber band scale (Batch 37)", () => {
  it("maps -60..+12 dB onto the band on a cube-root amplitude scale", () => {
    expect(gainToUnit(-60)).toBeCloseTo(0, 9);
    expect(gainToUnit(12)).toBeCloseTo(1, 9);
    expect(gainToUnit(0)).toBeCloseTo(0.606, 3);
    expect(gainToUnit(-6)).toBeLessThan(gainToUnit(0));
    expect(gainToUnit(-100)).toBe(gainToUnit(-60));
    for (const db of [-60, -24, -12, -6, -1, 0, 3, 6, 12]) expect(unitToGain(gainToUnit(db))).toBeCloseTo(db, 9);
    expect(unitToGain(1.5)).toBe(12);
  });

  it("puts the band in the body of M/L audio rows, inside the waveform's margin", () => {
    const row = { trackId: "a1", kind: "audio" as const, index: 0, lane: 0, y: 100, height: 56 };
    // Body: 100 + 2 (inset) + 16 (label) .. 156 - 2; margin 2 px.
    expect(bandBox(row, { kind: "audio", height: "M" }, theme)).toEqual({ top: 120, bottom: 152 });
    expect(bandBox(row, { kind: "audio", height: "S" }, theme)).toBeNull();
    expect(bandBox(row, { kind: "video", height: "M" }, theme)).toBeNull();
    const box = { top: 120, bottom: 152 };
    expect(gainY(box, 12)).toBe(120);
    expect(gainY(box, -60)).toBe(152);
    expect(yGain(box, gainY(box, -6))).toBeCloseTo(-6, 9);
  });

  it("hits keys first, then the line within its zone", () => {
    const project = makeProject();
    const tracks = [makeTrack("v1"), makeTrack("a1", "audio")];
    const geometry = new TimelineGeometry({ width: 1000, height: 428, tracks, pxPerFrame: 4, scrollFrame: 0, scrollY: 0, metrics: METRICS });
    const clip: MediaClip = {
      ...makeMediaClip(project, { id: "a", trackId: "a1", start: 10, duration: 60, mediaId: "m", kind: "audio" }),
      keyframes: {
        "volume.gainDb": [
          { frame: 10, value: 0, ease: "linear" },
          { frame: 40, value: -12, ease: "linear" },
        ],
      },
    };
    const box = { top: 120, bottom: 152 };
    const keyX = geometry.frameToX(20);
    expect(bandAt(geometry, theme, clip, box, keyX + 3, gainY(box, 0) - 2)).toEqual({ key: 10 });
    // The line halfway between the keys (-6 dB), 3 px off: the line; 6 px off: nothing.
    const midX = geometry.frameToX(35);
    expect(lineY(geometry, clip, box, midX)).toBeCloseTo(gainY(box, -6), 9);
    expect(bandAt(geometry, theme, clip, box, midX, gainY(box, -6) + 3)).toEqual({ key: null });
    expect(bandAt(geometry, theme, clip, box, midX, gainY(box, -6) + 6)).toBeNull();
  });
});
