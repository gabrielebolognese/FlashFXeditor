import { describe, expect, it } from "vitest";
import type { Composite, MediaLayer } from "../compositor/drawList.js";
import { DETAIL_MAX_SIZE, exportLongEdge, fullScale, layerDetail, qualityLabel, renderScale, sourceDetail, uploadLongEdge, vectorDetailSize, vectorLongEdge, wantedLod } from "./detail.js";

function mediaLayer(mediaId: string, transform: MediaLayer["transform"], crop = { u0: 0, v0: 0, u1: 1, v1: 1 }): MediaLayer {
  return { kind: "media", trackId: "v1", clipId: "c", mediaId, still: false, timeUs: 0, transform, opacity: 1, crop };
}

const composite = (layers: Composite["layers"]): Composite => ({ width: 1080, height: 1920, background: { r: 0, g: 0, b: 0, a: 1 }, layers });
const SIZES: Record<string, { width: number; height: number }> = { uhd: { width: 3840, height: 2160 }, hd: { width: 1920, height: 1080 } };
const size = (id: string) => SIZES[id] ?? null;

describe("sourceDetail", () => {
  it("is the source px per project px of the most detailed media layer", () => {
    // A 4K frame fitted to the 1080 px width: 3840 px over 1080.
    const fitted = mediaLayer("uhd", [1080, 0, 0, 607.5, 0, 656.25]);
    expect(sourceDetail(composite([fitted]), size)).toBeCloseTo(3840 / 1080, 6);
    const hd = mediaLayer("hd", [1080, 0, 0, 607.5, 0, 0]);
    expect(sourceDetail(composite([hd, fitted]), size)).toBeCloseTo(3840 / 1080, 6);
  });

  it("counts the crop and rotation, and is at least 1", () => {
    // The left half of a 4K frame over 1080 x 1215: 1920 source px over 1080.
    const cropped = mediaLayer("uhd", [1080, 0, 0, 1215, 0, 0], { u0: 0, v0: 0, u1: 0.5, v1: 1 });
    expect(sourceDetail(composite([cropped]), size)).toBeCloseTo(Math.sqrt((1920 * 2160) / (1080 * 1215)), 6);
    const turned = mediaLayer("uhd", [0, 1080, -607.5, 0, 0, 0]);
    expect(sourceDetail(composite([turned]), size)).toBeCloseTo(3840 / 1080, 6);
    const huge = mediaLayer("hd", [5000, 0, 0, 3000, 0, 0]);
    expect(sourceDetail(composite([huge, { kind: "solid", transform: [10, 0, 0, 10, 0, 0], opacity: 1, color: { r: 1, g: 0, b: 0, a: 1 } }]), size)).toBe(1);
    expect(sourceDetail(composite([mediaLayer("missing", [1, 0, 0, 1, 0, 0])]), size)).toBe(1);
  });
});

describe("render scales", () => {
  it("renders at the view scale up to 100%, then at most at the source detail", () => {
    expect(fullScale(0.5, 3.5)).toBe(0.5);
    expect(fullScale(1, 3.5)).toBe(1);
    expect(fullScale(2, 3.5)).toBe(2);
    expect(fullScale(4, 3.5)).toBe(3.5);
    expect(fullScale(4, 0.5)).toBe(1);
  });

  it("follows the quality modes (Auto: reduced while active, full at rest)", () => {
    const full = 3.5;
    expect(renderScale("full", "playing", full)).toBe(3.5);
    expect(renderScale("auto", "playing", full)).toBe(1);
    expect(renderScale("auto", "scrubbing", full)).toBe(1);
    expect(renderScale("auto", "settling", full)).toBe(1);
    expect(renderScale("auto", "idle", full)).toBe(3.5);
    expect(renderScale("proxy", "idle", full)).toBe(1);
    expect(renderScale("half", "playing", full)).toBe(0.5);
    expect(renderScale("quarter", "playing", 0.56)).toBeCloseTo(0.14, 6);
    expect(renderScale("half", "scrubbing", full)).toBe(1);
    expect(renderScale("half", "idle", full)).toBe(3.5);
    // At Fit nothing is reduced but 1/2 and 1/4 playback.
    expect(renderScale("auto", "playing", 0.56)).toBe(0.56);
  });

  it("uploads frames at the project long edge, more for detail, less for 1/2 and 1/4 playback, within the caps", () => {
    expect(uploadLongEdge(1920, "auto", "playing", 0.56, 8192)).toBe(1920);
    expect(uploadLongEdge(1920, "auto", "idle", 2, 8192)).toBe(3840);
    expect(uploadLongEdge(1920, "full", "idle", 3.5, 8192)).toBe(DETAIL_MAX_SIZE);
    expect(uploadLongEdge(1920, "full", "idle", 3.5, 2048)).toBe(2048);
    expect(uploadLongEdge(1920, "half", "playing", 0.28, 8192)).toBe(538);
    expect(uploadLongEdge(1920, "half", "idle", 0.56, 8192)).toBe(1920);
  });

  it("labels the status strip", () => {
    expect(qualityLabel("auto", { full: 3.5, render: 3.5 })).toBe("Auto: full");
    expect(qualityLabel("auto", { full: 3.5, render: 1 })).toBe("Auto: reduced");
    expect(qualityLabel("auto", { full: 0.56, render: 0.56 })).toBe("Auto: full");
    expect(qualityLabel("full", { full: 2, render: 2 })).toBe("Full");
    expect(qualityLabel("proxy", { full: 2, render: 1 })).toBe("Proxy: reduced");
    expect(qualityLabel("half", { full: 0.56, render: 0.28 })).toBe("1/2: half");
    expect(qualityLabel("quarter", { full: 3, render: 1 })).toBe("1/4: reduced");
    expect(qualityLabel("auto", { full: 0.56, render: 0.56 }, true)).toBe("Auto: proxy");
    expect(qualityLabel("proxy", { full: 2, render: 1 }, true)).toBe("Proxy: proxy");
    expect(qualityLabel("full", { full: 2, render: 2 }, true)).toBe("Full");
  });
});

describe("wantedLod (spec §7.5, §8, §9.5)", () => {
  it("Auto: proxies while playing and scrubbing, full once either ends", () => {
    expect(wantedLod("auto", "playing")).toBe("proxy");
    expect(wantedLod("auto", "scrubbing")).toBe("proxy");
    expect(wantedLod("auto", "settling")).toBe("full");
    expect(wantedLod("auto", "idle")).toBe("full");
  });

  it("Proxy always, Full never", () => {
    for (const activity of ["playing", "scrubbing", "settling", "idle"] as const) {
      expect(wantedLod("proxy", activity)).toBe("proxy");
      expect(wantedLod("full", activity, true)).toBe("full");
    }
  });

  it("1/2 and 1/4 decode the full file, and switch a media that falls behind while playing", () => {
    expect(wantedLod("half", "playing")).toBe("full");
    expect(wantedLod("half", "playing", true)).toBe("proxy");
    expect(wantedLod("quarter", "playing", true)).toBe("proxy");
    expect(wantedLod("quarter", "idle", true)).toBe("full");
    expect(wantedLod("half", "scrubbing")).toBe("full");
  });
});

describe("exportLongEdge (Export frame at full resolution)", () => {
  it("uploads a video at its own size down to twice its size on the frame", () => {
    // 4K at scale 1 in a 1080 x 1920 frame: one source px per project px.
    expect(exportLongEdge(3840, 1, 4096)).toBe(3840);
    // Enlarged, or drawn at half its size: its own size.
    expect(exportLongEdge(1920, 0.5, 4096)).toBe(1920);
    expect(exportLongEdge(3840, 2, 4096)).toBe(3840);
    // 4K fitted to 1080 px wide (3.56 source px per project px): twice the 1080 px it covers.
    expect(exportLongEdge(3840, 3840 / 1080, 4096)).toBe(2160);
    // The cap (DETAIL_MAX_SIZE and the device limit).
    expect(exportLongEdge(7680, 1, 4096)).toBe(4096);
  });

  it("measures one layer's source detail", () => {
    const layer = { transform: [1080, 0, 0, 607.5, 0, 656] as const, crop: { u0: 0, v0: 0, u1: 1, v1: 1 } };
    expect(layerDetail(layer, 3840, 2160)).toBeCloseTo(3840 / 1080, 6);
    expect(layerDetail({ ...layer, crop: { u0: 0, v0: 0, u1: 0.5, v1: 1 } }, 3840, 2160)).toBeCloseTo(Math.sqrt(0.5) * (3840 / 1080), 6);
    expect(layerDetail(layer, 0, 2160)).toBe(0);
  });
});

describe("SVG detail (Batch 34)", () => {
  const full = { u0: 0, v0: 0, u1: 1, v1: 1 };

  it("counts an SVG as vector: as much detail as its raster can hold", () => {
    expect(vectorDetailSize(300, 150)).toEqual({ width: DETAIL_MAX_SIZE, height: DETAIL_MAX_SIZE / 2 });
    // A 300 px logo shown 300 project px wide can be zoomed to 4096 / 300 before its raster runs out.
    const layer = { transform: [300, 0, 0, 150, 0, 0] as const, crop: full };
    const { width, height } = vectorDetailSize(300, 150);
    expect(layerDetail(layer, width, height)).toBeCloseTo(DETAIL_MAX_SIZE / 300, 6);
  });

  it("rasterizes at the size it is drawn at the render scale, in half-octave steps, at most 4096", () => {
    const layer = { transform: [300, 0, 0, 150, 0, 0] as const, crop: full };
    expect(vectorLongEdge(layer, 300, 150, 1)).toBe(363);
    expect(vectorLongEdge(layer, 300, 150, 4)).toBe(1449);
    expect(vectorLongEdge(layer, 300, 150, 40)).toBe(DETAIL_MAX_SIZE);
    expect(vectorLongEdge(layer, 300, 150, 0.001)).toBe(1);
    // Turned 90° and cropped to its left half: the whole image is 600 px wide on the frame.
    const turned = { transform: [0, 300, -150, 0, 0, 0] as const, crop: { u0: 0, v0: 0, u1: 0.5, v1: 1 } };
    expect(vectorLongEdge(turned, 300, 150, 1)).toBe(725);
  });
});
