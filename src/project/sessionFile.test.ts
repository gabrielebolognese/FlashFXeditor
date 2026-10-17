import { describe, expect, it } from "vitest";
import { DEFAULT_RATIOS } from "../core/store/layoutStore.js";
import { DEFAULT_SESSION } from "../core/store/sessionStore.js";
import { defaultSessionFile, parseSessionFile, serializeSession, type SessionFileData } from "./sessionFile.js";

describe("session file", () => {
  it("round-trips session state, selection and layout", () => {
    const data: SessionFileData = {
      state: {
        ...DEFAULT_SESSION,
        playhead: 120,
        inPoint: 10,
        outPoint: 200,
        // scrollY is relative to the resting divider and may be negative (scrolled up).
        timeline: { pxPerFrame: 2.5, scrollFrame: 40, scrollY: -36 },
        preview: {
          zoom: 1.5,
          panX: -20,
          panY: 4,
          quality: "half",
          safeZone: "tiktok",
          grid: "custom",
          gridDivisions: 6,
          centerCross: true,
          safeMargins: true,
          rulers: true,
          pixelGrid: false,
          guides: false,
        },
        activeTool: "razor",
        snap: false,
        loop: true,
        timecodeFormat: "ms",
        mediaPanel: { tab: "captions", view: "list", sort: "resolution", descending: true, presetScope: "project" },
        collapsedSections: { transform: true, crop: false },
      },
      selection: { clipIds: ["a", "b"], primary: "b", kind: "clips" },
      layout: { left: 0.6, top: 0.45, media: 0.5 },
    };
    expect(parseSessionFile(serializeSession(data))).toEqual(data);
  });

  it("gives the defaults for no file, garbage, or another version", () => {
    for (const text of [null, "", "{", "[]", "42", JSON.stringify({ version: 99, state: { playhead: 5 } })]) {
      expect(parseSessionFile(text)).toEqual(defaultSessionFile());
    }
  });

  it("keeps valid fields and drops invalid ones one by one", () => {
    const text = JSON.stringify({
      version: 1,
      state: {
        playhead: 1.5,
        inPoint: 30,
        outPoint: -4,
        timeline: { pxPerFrame: 0, scrollFrame: 9 },
        preview: { zoom: "fit", quality: "ultra", safeZone: "reels", grid: "dots", gridDivisions: 40, centerCross: true, rulers: "on" },
        activeTool: "lasso",
        snap: "yes",
        ripple: true,
        timecodeFormat: "seconds",
        mediaPanel: { tab: "presets", view: "table", sort: "size", descending: 1, presetScope: "local" },
        collapsedSections: { a: true, b: "no" },
      },
      selection: { clipIds: ["x", 3, "x"], primary: "missing", kind: "clips" },
      layout: { left: 2, top: 0.3 },
    });
    const parsed = parseSessionFile(text);
    expect(parsed.state).toEqual({
      ...DEFAULT_SESSION,
      inPoint: 30,
      timeline: { ...DEFAULT_SESSION.timeline, scrollFrame: 9 },
      preview: { ...DEFAULT_SESSION.preview, safeZone: "reels", centerCross: true },
      ripple: true,
      mediaPanel: { ...DEFAULT_SESSION.mediaPanel, tab: "presets" },
      collapsedSections: { a: true },
    });
    expect(parsed.selection).toEqual({ clipIds: ["x"], primary: "x", kind: "clips" });
    expect(parsed.layout).toEqual({ left: DEFAULT_RATIOS.left, top: 0.3, media: DEFAULT_RATIOS.media });
  });

  it("keeps a track selection's track ids; one without any is no selection", () => {
    const text = (selection: unknown) => JSON.stringify({ version: 1, selection });
    expect(parseSessionFile(text({ clipIds: [], primary: null, kind: "track", trackIds: ["v1", 3, "v1", "a1"] })).selection).toEqual({ clipIds: [], primary: null, kind: "track", trackIds: ["v1", "a1"] });
    expect(parseSessionFile(text({ clipIds: [], primary: null, kind: "track" })).selection).toEqual({ clipIds: [], primary: null, kind: "none" });
  });

  it("drops an out point at or before the in point (the out point is the range's exclusive end)", () => {
    const state = (inPoint: number, outPoint: number) => parseSessionFile(JSON.stringify({ version: 1, state: { inPoint, outPoint } })).state;
    expect(state(30, 30)).toMatchObject({ inPoint: 30, outPoint: null });
    expect(state(30, 10)).toMatchObject({ inPoint: 30, outPoint: null });
    expect(state(30, 31)).toMatchObject({ inPoint: 30, outPoint: 31 });
  });

  it("keeps valid source ranges (integer us, the out after the in, one end at least) and drops the rest", () => {
    const sourceRanges = {
      a: { inUs: 2_000_000, outUs: 5_000_000 },
      b: { inUs: null, outUs: 1_000_000 },
      c: { inUs: 3_000_000, outUs: null },
      empty: { inUs: null, outUs: null },
      reversed: { inUs: 5, outUs: 5 },
      fractional: { inUs: 1.5, outUs: 10 },
      zero: { inUs: null, outUs: 0 },
      junk: 7,
    };
    const { state } = parseSessionFile(JSON.stringify({ version: 1, state: { sourceRanges } }));
    expect(state.sourceRanges).toEqual({ a: sourceRanges.a, b: sourceRanges.b, c: sourceRanges.c, fractional: { inUs: null, outUs: 10 } });
    expect(parseSessionFile(serializeSession({ ...defaultSessionFile(), state: { ...defaultSessionFile().state, sourceRanges: { a: sourceRanges.a } } })).state.sourceRanges).toEqual({ a: sourceRanges.a });
  });

  it("keeps Show clip keyframes and the known keyframe lane sections (Batch 35)", () => {
    const keyframeLanes = { a: "opacity", b: "transform", c: "scale", d: 3 };
    const { state } = parseSessionFile(JSON.stringify({ version: 1, state: { clipKeyframes: true, keyframeLanes } }));
    expect(state.clipKeyframes).toBe(true);
    expect(state.keyframeLanes).toEqual({ a: "opacity", b: "transform" });
    expect(parseSessionFile(JSON.stringify({ version: 1, state: { clipKeyframes: "yes" } })).state).toMatchObject({ clipKeyframes: false, keyframeLanes: {} });
  });

  it("turns a clips selection without ids into no selection", () => {
    const text = JSON.stringify({ version: 1, selection: { clipIds: [], primary: null, kind: "clips" } });
    expect(parseSessionFile(text).selection).toEqual({ clipIds: [], primary: null, kind: "none" });
  });

  it("does not share the default objects", () => {
    const a = defaultSessionFile();
    a.state.collapsedSections.x = true;
    expect(defaultSessionFile().state.collapsedSections).toEqual({});
  });
});
