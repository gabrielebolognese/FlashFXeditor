import { describe, expect, it } from "vitest";
import type { Effect } from "../document/types.js";
import { balanceFromGains, colorCorrectUniforms, contrastCurve, correctPixel, NEUTRAL_CORRECTION, shadowsHighlights, whiteBalanceGains } from "../effects/colorCorrect.js";
import { chromaThreshold, denoisePasses, lumaThreshold } from "../effects/denoisePlan.js";
import { DENOISE_METHODS, effectIssues, newEffect } from "../effects/effectParams.js";
import { enhancedEffects } from "./apply.js";
import { DEFAULT_PRESET, ENHANCE_PRESETS, matchClips, planEnhancement, predict, solveClip } from "./solve.js";
import { addNoiseStats, addToneStats, emptyStats, finishStats, measureNoise, percentile, type ClipSummary } from "./stats.js";

/** A deterministic generator (mulberry32) and a standard normal from it. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const normal = (next: () => number) => Math.sqrt(-2 * Math.log(Math.max(1e-9, next()))) * Math.cos(2 * Math.PI * next());

/** A w x h picture: a soft ramp times `gain` and `cast`, with white noise of `sigma`. */
function picture(w: number, h: number, gain: number, cast: [number, number, number], sigma: number, seed = 1): Uint8ClampedArray {
  const next = random(seed);
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const base = (0.15 + 0.7 * (x / w)) * gain;
      const n = sigma > 0 ? normal(next) * sigma : 0;
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) data[i + c] = Math.round(Math.min(1, Math.max(0, base * (cast[c] as number) + n)) * 255);
      data[i + 3] = 255;
    }
  }
  return data;
}

function summaryOf(gain: number, cast: [number, number, number], sigma = 0): ClipSummary {
  const stats = emptyStats();
  const data = picture(128, 128, gain, cast, sigma);
  addToneStats(stats, data);
  addNoiseStats(stats, data, 128, 128);
  return finishStats(stats);
}

describe("color correction math (v1.3)", () => {
  it("leaves a pixel alone when neutral", () => {
    const u = colorCorrectUniforms(NEUTRAL_CORRECTION);
    const out = correctPixel([0.2, 0.5, 0.8], u);
    expect(out[0]).toBeCloseTo(0.2, 6);
    expect(out[1]).toBeCloseTo(0.5, 6);
    expect(out[2]).toBeCloseTo(0.8, 6);
  });

  it("white balance gains keep a gray's brightness and invert to their temperature and tint", () => {
    const gains = whiteBalanceGains(40, -25);
    expect(0.2126 * gains[0] + 0.7152 * gains[1] + 0.0722 * gains[2]).toBeCloseTo(1, 6);
    expect(gains[0]).toBeGreaterThan(gains[2]);
    const back = balanceFromGains(gains);
    expect(back.temperature).toBeCloseTo(40, 4);
    expect(back.tint).toBeCloseTo(-25, 4);
  });

  it("gamma above 1 brightens the middle and keeps black and white", () => {
    const u = colorCorrectUniforms({ ...NEUTRAL_CORRECTION, gamma: 1.5 });
    expect(correctPixel([0.5, 0.5, 0.5], u)[0]).toBeGreaterThan(0.6);
    expect(correctPixel([0, 0, 0], u)[0]).toBe(0);
    expect(correctPixel([1, 1, 1], u)[0]).toBeCloseTo(1, 6);
  });

  it("levels stretch the range between the black and white points", () => {
    const u = colorCorrectUniforms({ ...NEUTRAL_CORRECTION, black: 0.1, white: 0.9 });
    expect(correctPixel([0.1, 0.1, 0.1], u)[0]).toBeCloseTo(0, 6);
    expect(correctPixel([0.9, 0.9, 0.9], u)[0]).toBeCloseTo(1, 6);
    expect(correctPixel([0.5, 0.5, 0.5], u)[0]).toBeCloseTo(0.5, 6);
  });

  it("contrast is an S curve around the middle; shadows lift the dark end only", () => {
    expect(contrastCurve(0.25, 1)).toBeLessThan(0.25);
    expect(contrastCurve(0.75, 1)).toBeGreaterThan(0.75);
    expect(contrastCurve(0.5, 1)).toBeCloseTo(0.5, 6);
    expect(contrastCurve(0.2, -1)).toBeGreaterThan(0.2);
    expect(shadowsHighlights(0.2, 1, 0) - 0.2).toBeGreaterThan(shadowsHighlights(0.8, 1, 0) - 0.8);
    expect(shadowsHighlights(0.8, 0, -1)).toBeLessThan(0.8);
  });

  it("a saturation boost fades out in the deep shadows; a cut applies everywhere", () => {
    const up = colorCorrectUniforms({ ...NEUTRAL_CORRECTION, saturation: 50 });
    const dark = correctPixel([0.03, 0.01, 0.01], up);
    expect(dark[0] - dark[1]).toBeCloseTo(0.02, 2);
    const mid = correctPixel([0.6, 0.4, 0.4], up);
    expect(mid[0] - mid[1]).toBeGreaterThan(0.28);
    const down = colorCorrectUniforms({ ...NEUTRAL_CORRECTION, saturation: -100 });
    const gray = correctPixel([0.03, 0.01, 0.01], down);
    expect(gray[0]).toBeCloseTo(gray[1], 6);
  });
});

describe("denoise plan (v1.3)", () => {
  it("every method ends its passes within its family and scales the steps with the stage", () => {
    for (const method of DENOISE_METHODS) {
      const passes = denoisePasses({ method, luma: 0.5, chroma: 0.7, noise: 0.01 }, 1);
      expect(passes.length).toBeGreaterThan(1);
      const doubled = denoisePasses({ method, luma: 0.5, chroma: 0.7, noise: 0.01 }, 2);
      expect(doubled.map((p) => p.step)).toEqual(passes.map((p) => p.step * 2));
    }
    expect(denoisePasses({ method: "hybrid", luma: 0.5, chroma: 0.7, noise: 0.01 }, 1).map((p) => p.filter)).toEqual(["nlm", "atrous", "atrous", "atrous"]);
    expect(denoisePasses({ method: "wavelet", luma: 0.5, chroma: 0.7, noise: 0.01 }, 1).map((p) => p.step)).toEqual([1, 2, 4, 8, 16]);
    // A shrunk clip still filters neighboring stage pixels.
    expect(denoisePasses({ method: "nlm", luma: 0.5, chroma: 0.7, noise: 0.01 }, 0.25)[0]?.step).toBe(1);
  });

  it("thresholds follow the noise level and the strengths; no strength, no passes", () => {
    expect(lumaThreshold(1, 0.01)).toBeCloseTo(0.04, 6);
    expect(lumaThreshold(0, 0.01)).toBeCloseTo(0.006, 6);
    expect(chromaThreshold(1, 0.01)).toBeCloseTo(0.09, 6);
    expect(denoisePasses({ method: "hybrid", luma: 0, chroma: 0, noise: 0.01 }, 1)).toEqual([]);
    const chromaOnly = denoisePasses({ method: "hybrid", luma: 0, chroma: 1, noise: 0.01 }, 1);
    expect(chromaOnly.every((p) => p.luma === 0 && p.chroma > 0)).toBe(true);
    const wavelet = denoisePasses({ method: "wavelet", luma: 1, chroma: 1, noise: 0.01 }, 1);
    for (let i = 1; i < wavelet.length; i++) expect((wavelet[i] as { luma: number }).luma).toBeLessThan((wavelet[i - 1] as { luma: number }).luma);
  });
});

describe("clip statistics (v1.3)", () => {
  it("measures white noise within a fifth and reads a clean picture as clean", () => {
    for (const sigma of [0.01, 0.03]) {
      const data = picture(256, 256, 1, [1, 1, 1], sigma, 7);
      const noise = measureNoise(data, 256, 256);
      expect(noise.luma).toBeGreaterThan(sigma * 0.8);
      expect(noise.luma).toBeLessThan(sigma * 1.2);
    }
    expect(measureNoise(picture(256, 256, 1, [1, 1, 1], 0), 256, 256).luma).toBeLessThan(0.003);
  });

  it("an edge does not count as noise", () => {
    const data = picture(256, 256, 1, [1, 1, 1], 0.01, 3);
    for (let y = 0; y < 256; y++) for (let x = 120; x < 136; x++) for (let c = 0; c < 3; c++) data[(y * 256 + x) * 4 + c] = x < 128 ? 0 : 255;
    expect(measureNoise(data, 256, 256).luma).toBeLessThan(0.013);
  });

  it("finds the scene light of a tinted gray picture and the histogram's percentiles", () => {
    const warm = summaryOf(1, [1, 0.9, 0.75]);
    expect(warm.illuminant[0]).toBeCloseTo(1, 6);
    expect(warm.illuminant[1]).toBeCloseTo(0.9, 1);
    expect(warm.illuminant[2]).toBeCloseTo(0.75, 1);
    expect(warm.hist.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    expect(percentile(warm.hist, 0.5)).toBeGreaterThan(percentile(warm.hist, 0.1));
    expect(warm.meanLuma).toBeGreaterThan(0.35);
  });

  it("skips transparent pixels", () => {
    const stats = emptyStats();
    addToneStats(stats, new Uint8ClampedArray([255, 255, 255, 0, 128, 128, 128, 255]));
    expect(stats.count).toBe(1);
  });
});

describe("enhance solver (v1.3)", () => {
  const preset = ENHANCE_PRESETS.find((p) => p.id === DEFAULT_PRESET);
  if (!preset) throw new Error("no default preset");

  it("has ten presets with unique ids, the default among them", () => {
    expect(ENHANCE_PRESETS).toHaveLength(10);
    expect(new Set(ENHANCE_PRESETS.map((p) => p.id)).size).toBe(10);
    expect(new Set(ENHANCE_PRESETS.map((p) => p.denoise.method))).toEqual(new Set(DENOISE_METHODS));
  });

  it("brings a dark clip and a bright clip to the look's brightness", () => {
    for (const gain of [0.5, 1.2]) {
      const summary = summaryOf(gain, [1, 1, 1]);
      const params = solveClip(summary, preset.color);
      expect(predict(summary, params).luma).toBeCloseTo(preset.color.brightness, 2);
    }
    expect(solveClip(summaryOf(0.5, [1, 1, 1]), preset.color).gamma).toBeGreaterThan(solveClip(summaryOf(1.2, [1, 1, 1]), preset.color).gamma);
  });

  it("cools a warm clip and warms a cool one", () => {
    expect(solveClip(summaryOf(1, [1, 0.9, 0.75]), preset.color).temperature).toBeLessThan(-5);
    expect(solveClip(summaryOf(1, [0.75, 0.9, 1]), preset.color).temperature).toBeGreaterThan(5);
    expect(Math.abs(solveClip(summaryOf(1, [1, 1, 1]), preset.color).temperature)).toBeLessThan(1);
  });

  it("matches clips: after it their predicted brightness and cast are closer than before", () => {
    const summaries = [summaryOf(0.45, [1, 0.92, 0.8]), summaryOf(1, [1, 1, 1]), summaryOf(1.25, [0.85, 0.95, 1])];
    // Corrections that leave the clips apart (as a clamp would): matching must close the gap.
    const apart = summaries.map((_, i) => ({ ...NEUTRAL_CORRECTION, gamma: 1 + i * 0.05 }));
    const spread = (params: typeof apart, key: "luma" | "cr") => {
      const values = params.map((p, i) => predict(summaries[i] as ClipSummary, p)[key]);
      return Math.max(...values) - Math.min(...values);
    };
    const matched = matchClips(summaries, apart);
    expect(spread(matched, "luma")).toBeLessThan(spread(apart, "luma") * 0.1);
    expect(spread(matched, "cr")).toBeLessThan(spread(apart, "cr") * 0.5);
    // The brightest clip comes down, the darkest goes up.
    expect((matched[2] as { gamma: number }).gamma).toBeLessThan((apart[2] as { gamma: number }).gamma);
    expect((matched[0] as { gamma: number }).gamma).toBeGreaterThan((apart[0] as { gamma: number }).gamma);
    expect(matchClips(summaries.slice(0, 1), apart.slice(0, 1))).toEqual(apart.slice(0, 1));
  });

  it("plans values the effects accept, with the measured noise, and honors the options", () => {
    const clips = [
      { clipId: "a", summary: summaryOf(0.5, [1, 0.9, 0.8], 0.02) },
      { clipId: "b", summary: summaryOf(1.1, [1, 1, 1], 0.005) },
    ];
    const plan = planEnhancement(clips);
    expect(plan.map((item) => item.clipId)).toEqual(["a", "b"]);
    expect(plan[0]?.denoise?.noise).toBeGreaterThan(plan[1]?.denoise?.noise as number);
    for (const item of plan) {
      const effects = enhancedEffects(undefined, item);
      expect(effects.map((e) => e.type)).toEqual(["denoise", "colorCorrect"]);
      expect(effectIssues(effects, "effects")).toEqual([]);
    }
    const brightness = plan.map((item) => item.predicted?.brightness as number);
    expect(Math.abs((brightness[0] as number) - (brightness[1] as number))).toBeLessThan(0.02);
    expect(planEnhancement(clips, { color: false }).every((item) => item.color === null && item.denoise !== null)).toBe(true);
    expect(planEnhancement(clips, { denoise: false }).every((item) => item.denoise === null && item.color !== null)).toBe(true);
    expect(() => planEnhancement(clips, { preset: "nope" })).toThrow(/Unknown enhance preset/);
    for (const p of ENHANCE_PRESETS) for (const item of planEnhancement(clips, { preset: p.id })) expect(effectIssues(enhancedEffects(undefined, item), "effects")).toEqual([]);
  });
});

describe("writing an enhancement into a stack (v1.3)", () => {
  const plan = planEnhancement([{ clipId: "a", summary: summaryOf(0.6, [1, 0.95, 0.9], 0.01) }])[0];
  if (!plan) throw new Error("no plan");

  it("adds the denoise first, then the correction, before the other effects", () => {
    const glow = newEffect("glow", "fx1");
    const out = enhancedEffects([glow], plan);
    expect(out.map((e) => e.type)).toEqual(["denoise", "colorCorrect", "glow"]);
    expect(new Set(out.map((e) => e.id)).size).toBe(3);
    expect(out[2]).toEqual(glow);
  });

  it("updates the effects that are there (and switches them on), keeping their place and id", () => {
    const old: Effect[] = [newEffect("vignette", "v"), { ...newEffect("colorCorrect", "cc"), enabled: false }, { ...newEffect("denoise", "dn"), params: { ...newEffect("denoise", "dn").params, method: "median" } }];
    const out = enhancedEffects(old, plan);
    expect(out.map((e) => e.id)).toEqual(["v", "cc", "dn"]);
    expect(out[1]?.enabled).toBe(true);
    expect(out[1]?.params.gamma).toBe(plan.color?.gamma);
    expect(out[2]?.params.method).toBe(plan.denoise?.method);
    // The input is not changed.
    expect(old[1]?.enabled).toBe(false);
  });

  it("writes only what the plan holds", () => {
    expect(enhancedEffects(undefined, { denoise: plan.denoise, color: null }).map((e) => e.type)).toEqual(["denoise"]);
    expect(enhancedEffects([newEffect("denoise", "dn")], { denoise: null, color: plan.color }).map((e) => e.type)).toEqual(["denoise", "colorCorrect"]);
    expect(enhancedEffects([newEffect("glow", "g")], { denoise: null, color: null })).toEqual([newEffect("glow", "g")]);
  });
});
