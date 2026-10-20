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
        preview: { zoom: 1.5, panX: -20, panY: 4, quality: "half", safeZone: "tiktok" },
        activeTool: "razor",
        snap: false,
        loop: true,
        mediaPanel: { tab: "captions", view: "list", sort: "resolution", descending: true },
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
        preview: { zoom: "fit", quality: "ultra", safeZone: "reels" },
        activeTool: "lasso",
        snap: "yes",
        ripple: true,
        mediaPanel: { tab: "presets", view: "table", sort: "size", descending: 1 },
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
      preview: { ...DEFAULT_SESSION.preview, safeZone: "reels" },
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
