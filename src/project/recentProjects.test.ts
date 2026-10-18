import { describe, expect, it, vi } from "vitest";
import { createAppSettings, DEFAULT_APP_SETTINGS, editDefaultsOf, MAX_RECENT_FONTS, proxySettings, pushRecentFont, toggleFavoriteFont } from "./appSettings.js";
import { DEFAULT_CUSTOM_SETTINGS } from "../export/presets.js";
import { memoryKeyValueStore } from "./kv.js";
import { RECENT_LIMIT, RecentProjects, type RecentProject } from "./recentProjects.js";

const entry = (id: string, extra: Partial<RecentProject> = {}) => ({
  id,
  name: `Project ${id}`,
  pathHint: `folder-${id}`,
  modified: "2026-10-14T10:00:00.000Z",
  handle: { folder: id },
  ...extra,
});

describe("RecentProjects", () => {
  it("adds entries newest first and moves a reopened one to the top", async () => {
    const kv = memoryKeyValueStore();
    const recent = new RecentProjects(kv);
    await recent.touch(entry("a"));
    await recent.touch(entry("b"));
    await recent.touch(entry("a", { name: "Renamed elsewhere" }));
    expect(recent.list.getState().map((e) => [e.id, e.name])).toEqual([
      ["a", "Renamed elsewhere"],
      ["b", "Project b"],
    ]);
    expect(recent.list.getState()[0]?.thumbnail).toBeNull();
    expect(kv.data.get("recent-projects.v1")).toEqual(recent.list.getState());
  });

  it("keeps at most RECENT_LIMIT entries", async () => {
    const recent = new RecentProjects(memoryKeyValueStore());
    for (let i = 0; i < RECENT_LIMIT + 3; i++) await recent.touch(entry(String(i)));
    expect(recent.list.getState()).toHaveLength(RECENT_LIMIT);
    expect(recent.list.getState()[0]?.id).toBe(String(RECENT_LIMIT + 2));
  });

  it("updates the name and modified date in place; unknown ids and no-op patches write nothing", async () => {
    const kv = memoryKeyValueStore();
    const recent = new RecentProjects(kv);
    await recent.touch(entry("a"));
    await recent.touch(entry("b"));
    await recent.update("a", { name: "New name", modified: "2026-10-15T00:00:00.000Z" });
    expect(recent.list.getState()[1]).toMatchObject({ id: "a", name: "New name", modified: "2026-10-15T00:00:00.000Z" });
    const set = vi.spyOn(kv, "set");
    const before = recent.list.getState();
    await recent.update("zzz", { name: "x" });
    await recent.update("a", { name: "New name" });
    expect(recent.list.getState()).toBe(before);
    expect(set).not.toHaveBeenCalled();
  });

  it("removes an entry", async () => {
    const recent = new RecentProjects(memoryKeyValueStore());
    await recent.touch(entry("a"));
    await recent.touch(entry("b"));
    await recent.remove("a");
    expect(recent.list.getState().map((e) => e.id)).toEqual(["b"]);
  });

  it("loads what was stored, dropping malformed entries", async () => {
    const kv = memoryKeyValueStore();
    kv.data.set("recent-projects.v1", [entry("a"), { id: "broken" }, null, entry("b", { handle: null })]);
    const recent = new RecentProjects(kv);
    await recent.load();
    expect(recent.list.getState().map((e) => e.id)).toEqual(["a"]);
  });

  it("survives a storage failure", async () => {
    const kv = memoryKeyValueStore();
    kv.set = () => Promise.reject(new Error("quota"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const recent = new RecentProjects(kv);
    await recent.touch(entry("a"));
    expect(recent.list.getState()).toHaveLength(1);
    expect(warn).toHaveBeenCalled();
  });
});

describe("app settings", () => {
  it("loads, updates and persists the autosave delay, rejecting values outside the list", async () => {
    const kv = memoryKeyValueStore();
    const settings = createAppSettings(kv);
    await settings.load();
    expect(settings.getState()).toEqual(DEFAULT_APP_SETTINGS);
    await settings.update({ autosaveDelayMs: 5000 });
    expect(kv.data.get("settings.v1")).toEqual({ autosaveDelayMs: 5000, importMode: "copy", monitorVolumeDb: 0, monitorMuted: false, proxyAuto: true, proxyRule: "heavy", proxyShortEdge: 540, recentColors: [], punchZoomScale: 1.2, punchZoomAnimate: true, favoriteFonts: [], recentFonts: [], matchClipUnderPlayhead: true, defaultTitlePreset: "starter-title", defaultSubtitlePreset: "starter-subtitle", recentPresets: [], presetOrder: {}, transcribeModel: "base", transcribeLanguage: null, duckDepthDb: 12, duckRampFrames: 10, silenceThresholdDb: -40, silenceMinMs: 500, silencePaddingMs: 150, keymap: {}, recentCommands: [], stillDurationMs: 5000, titleDurationMs: 3000, solidDurationMs: 5000, freezeDurationMs: 2000, transitionFrames: 15, transitionKind: "crossDissolve", keyframesFollowSource: true, exportPresetId: "reels", exportCustom: DEFAULT_CUSTOM_SETTINGS, exportPresets: [], exportFileTemplate: "{project}-{preset}-{date}.mp4", exportDestination: "project", exportAudioFormat: "wav", exportCaptionFormat: "srt" });
    await settings.update({ autosaveDelayMs: 1234 });
    expect(settings.getState().autosaveDelayMs).toBe(5000);

    kv.data.set("settings.v1", { autosaveDelayMs: 10_000 });
    const reloaded = createAppSettings(kv);
    await reloaded.load();
    expect(reloaded.getState().autosaveDelayMs).toBe(10_000);
  });

  it("keeps the Transcribe dialog's model and language, rejecting unknown ones", async () => {
    const kv = memoryKeyValueStore();
    kv.data.set("settings.v1", { transcribeModel: "small", transcribeLanguage: "it" });
    const settings = createAppSettings(kv);
    await settings.load();
    expect(settings.getState()).toMatchObject({ transcribeModel: "small", transcribeLanguage: "it" });
    await settings.update({ transcribeLanguage: null });
    expect(settings.getState().transcribeLanguage).toBeNull();
    kv.data.set("settings.v1", { transcribeModel: "large", transcribeLanguage: "klingon" });
    const reloaded = createAppSettings(kv);
    await reloaded.load();
    expect(reloaded.getState()).toMatchObject({ transcribeModel: "base", transcribeLanguage: null });
  });

  it("keeps the import mode setting (reference mode is stubbed until Batch 41)", async () => {
    const kv = memoryKeyValueStore();
    kv.data.set("settings.v1", { autosaveDelayMs: 1000, importMode: "reference" });
    const settings = createAppSettings(kv);
    await settings.load();
    expect(settings.getState().importMode).toBe("reference");
    await settings.update({ importMode: "link" as never });
    expect(settings.getState().importMode).toBe("reference");
  });

  it("keeps the default durations and the default transition in range (Batch 42)", async () => {
    const kv = memoryKeyValueStore();
    kv.data.set("settings.v1", { stillDurationMs: 2500.4, titleDurationMs: 5, solidDurationMs: 10e6, freezeDurationMs: "long", transitionFrames: 0, transitionKind: "wipe", keyframesFollowSource: false });
    const settings = createAppSettings(kv);
    await settings.load();
    expect(settings.getState()).toMatchObject({ stillDurationMs: 2500, titleDurationMs: 100, solidDurationMs: 60_000, freezeDurationMs: 2000, transitionFrames: 1, transitionKind: "crossDissolve", keyframesFollowSource: false });
    expect(editDefaultsOf(settings.getState())).toEqual({ stillMs: 2500, titleMs: 100, solidMs: 60_000, freezeMs: 2000, transitionFrames: 1, transitionKind: "crossDissolve", keyframesFollowSource: false });
    await settings.update({ transitionFrames: 999, transitionKind: "dipToBlack" });
    expect(settings.getState()).toMatchObject({ transitionFrames: 120, transitionKind: "dipToBlack" });
  });

  it("keeps the Export tab's choices and one's own presets (Batch 44)", async () => {
    const kv = memoryKeyValueStore();
    const mine = { id: "u1", name: "Master", settings: { codec: "hevc", scale: 50 } };
    kv.data.set("settings.v1", { exportPresetId: "u1", exportCustom: { codec: "av1", keyframeSeconds: 9 }, exportPresets: [mine, { id: "", name: "x" }], exportFileTemplate: "{project}.mp4", exportDestination: "pick", exportAudioFormat: "m4a", exportCaptionFormat: "vtt" });
    const settings = createAppSettings(kv);
    await settings.load();
    const state = settings.getState();
    expect(state).toMatchObject({ exportPresetId: "u1", exportFileTemplate: "{project}.mp4", exportDestination: "pick", exportAudioFormat: "m4a", exportCaptionFormat: "vtt" });
    expect(state.exportCustom).toMatchObject({ codec: "av1", keyframeSeconds: 2 });
    expect(state.exportPresets.map((p) => [p.id, p.settings.codec, p.settings.scale])).toEqual([["u1", "hevc", 50]]);
    await settings.update({ exportFileTemplate: "   ", exportDestination: "cloud" as never, exportAudioFormat: "flac" as never });
    expect(settings.getState()).toMatchObject({ exportFileTemplate: "{project}.mp4", exportDestination: "pick", exportAudioFormat: "m4a" });
  });

  it("keeps Remove silence's parameters in range and in whole units (Batch 38)", async () => {
    const kv = memoryKeyValueStore();
    kv.data.set("settings.v1", { silenceThresholdDb: -35.4, silenceMinMs: 20, silencePaddingMs: "a lot" });
    const settings = createAppSettings(kv);
    await settings.load();
    expect(settings.getState()).toMatchObject({ silenceThresholdDb: -35, silenceMinMs: 100, silencePaddingMs: 150 });
    await settings.update({ silenceThresholdDb: -90, silenceMinMs: 9000, silencePaddingMs: 250 });
    expect(settings.getState()).toMatchObject({ silenceThresholdDb: -60, silenceMinMs: 5000, silencePaddingMs: 250 });
    await settings.update({ silenceThresholdDb: Number.NaN });
    expect(settings.getState().silenceThresholdDb).toBe(-60);
  });

  it("keeps the monitoring volume in range and the mute flag", async () => {
    const kv = memoryKeyValueStore();
    kv.data.set("settings.v1", { monitorVolumeDb: -12.5, monitorMuted: true });
    const settings = createAppSettings(kv);
    await settings.load();
    expect(settings.getState()).toMatchObject({ monitorVolumeDb: -12.5, monitorMuted: true });
    await settings.update({ monitorVolumeDb: 20 });
    expect(settings.getState().monitorVolumeDb).toBe(0);
    await settings.update({ monitorVolumeDb: Number.NaN, monitorMuted: "yes" as never });
    expect(settings.getState()).toMatchObject({ monitorVolumeDb: 0, monitorMuted: true });
  });

  it("keeps the proxy settings, rejecting unknown rules and sizes", async () => {
    const kv = memoryKeyValueStore();
    kv.data.set("settings.v1", { proxyAuto: false, proxyRule: "all", proxyShortEdge: 720 });
    const settings = createAppSettings(kv);
    await settings.load();
    expect(proxySettings(settings.getState())).toEqual({ auto: false, rule: "all", shortEdge: 720 });
    await settings.update({ proxyRule: "sometimes" as never, proxyShortEdge: 500 as never, proxyAuto: 1 as never });
    expect(proxySettings(settings.getState())).toEqual({ auto: false, rule: "all", shortEdge: 720 });
    expect(proxySettings(DEFAULT_APP_SETTINGS)).toEqual({ auto: true, rule: "heavy", shortEdge: 540 });
  });

  it("keeps the color picker's recent colors (hex only, at most 8)", async () => {
    const kv = memoryKeyValueStore();
    // eslint-disable-next-line no-restricted-syntax -- hex strings are the stored data here, not UI colors
    kv.data.set("settings.v1", { recentColors: ["#d9a521", "red", 3, "#11223344", ...Array.from({ length: 9 }, (_, i) => `#00000${i}`)] });
    const settings = createAppSettings(kv);
    await settings.load();
    // eslint-disable-next-line no-restricted-syntax -- as above
    expect(settings.getState().recentColors).toEqual(["#d9a521", "#11223344", "#000000", "#000001", "#000002", "#000003", "#000004", "#000005"]);
    await settings.update({ recentColors: "x" as never });
    expect(settings.getState().recentColors).toHaveLength(8);
  });

  it("keeps the punch zoom scale in range and the animated flag, on by default (Batches 27, 35)", async () => {
    const kv = memoryKeyValueStore();
    // The reserved `punchZoomAnimated: false` stored before Batch 35 is dropped: the animated zoom is on.
    kv.data.set("settings.v1", { punchZoomScale: 9, punchZoomAnimated: false, punchZoomAnimate: "yes" });
    const settings = createAppSettings(kv);
    await settings.load();
    expect(settings.getState()).toMatchObject({ punchZoomScale: 3, punchZoomAnimate: true });
    expect(settings.getState()).not.toHaveProperty("punchZoomAnimated");
    await settings.update({ punchZoomScale: 1.5, punchZoomAnimate: false });
    expect(settings.getState()).toMatchObject({ punchZoomScale: 1.5, punchZoomAnimate: false });
    await settings.update({ punchZoomScale: Number.NaN });
    expect(settings.getState().punchZoomScale).toBe(1.5);
    expect(DEFAULT_APP_SETTINGS).toMatchObject({ punchZoomScale: 1.2, punchZoomAnimate: true });
  });

  it("keeps the favorite fonts: names once, in order, at most 50 (Batch 28)", async () => {
    const kv = memoryKeyValueStore();
    kv.data.set("settings.v1", { favoriteFonts: ["Inter", 3, "", "Oswald", "Inter"] });
    const settings = createAppSettings(kv);
    await settings.load();
    expect(settings.getState().favoriteFonts).toEqual(["Inter", "Oswald"]);
    expect(toggleFavoriteFont(["Inter", "Oswald"], "Inter")).toEqual(["Oswald"]);
    expect(toggleFavoriteFont(["Inter"], "Caveat")).toEqual(["Inter", "Caveat"]);
    // The font browser's Recent section (Batch 51): the last 8, newest first, once each.
    expect(pushRecentFont(["Inter", "Anton"], "anton")).toEqual(["anton", "Inter"]);
    expect(pushRecentFont(Array.from({ length: 10 }, (_, i) => `F${i}`), "New")).toHaveLength(MAX_RECENT_FONTS);
    kv.data.set("settings.v1", { recentFonts: ["Inter", 3, "", "Inter", "Anton"] });
    const recent = createAppSettings(kv);
    await recent.load();
    expect(recent.getState().recentFonts).toEqual(["Inter", "Anton"]);
  });

  it("keeps the preset bar's Recent set and set orders (Batch 52), valid ids only", async () => {
    const kv = memoryKeyValueStore();
    kv.data.set("settings.v1", {
      recentPresets: ["a", 3, "", "a", "b", ...Array.from({ length: 20 }, (_, i) => `p${i}`)],
      presetOrder: { favorites: ["x", 2, "y", "x"], "tag:Promo": [], "": ["z"], bad: "x", titles: "nope" },
    });
    const settings = createAppSettings(kv);
    await settings.load();
    expect(settings.getState().recentPresets).toEqual(["a", "b", ...Array.from({ length: 10 }, (_, i) => `p${i}`)]);
    expect(settings.getState().presetOrder).toEqual({ favorites: ["x", "y"], "tag:Promo": [] });
  });

  it("matches titles to the clip under the playhead by default (Batch 29)", async () => {
    const kv = memoryKeyValueStore();
    kv.data.set("settings.v1", { matchClipUnderPlayhead: "no" });
    const settings = createAppSettings(kv);
    await settings.load();
    expect(settings.getState().matchClipUnderPlayhead).toBe(true);
    await settings.update({ matchClipUnderPlayhead: false });
    expect(settings.getState().matchClipUnderPlayhead).toBe(false);
  });

  it("starts with the starter Title and Subtitle as the default presets; null means built-in (Batch 30)", async () => {
    const kv = memoryKeyValueStore();
    kv.data.set("settings.v1", { defaultTitlePreset: 4, defaultSubtitlePreset: null });
    const settings = createAppSettings(kv);
    await settings.load();
    expect(settings.getState()).toMatchObject({ defaultTitlePreset: "starter-title", defaultSubtitlePreset: null });
    await settings.update({ defaultTitlePreset: "mine" });
    expect(settings.getState().defaultTitlePreset).toBe("mine");
  });
  it("keeps the shortcut editor's overrides and the palette's recent commands, dropping invalid entries", async () => {
    const kv = memoryKeyValueStore();
    kv.data.set("settings.v1", {
      keymap: { "edit.split": ["Mod+J", "Hyper+Q", 7], "edit.lift": [], "bad id!": ["K"], "edit.extract": "E" },
      recentCommands: ["edit.closeAllGaps", "edit.closeAllGaps", 3, "timeline.zoomFit"],
    });
    const settings = createAppSettings(kv);
    await settings.load();
    expect(settings.getState().keymap).toEqual({ "edit.split": ["Mod+J"], "edit.lift": [] });
    expect(settings.getState().recentCommands).toEqual(["edit.closeAllGaps", "timeline.zoomFit"]);
    await settings.update({ keymap: [] as never, recentCommands: "x" as never });
    expect(settings.getState().keymap).toEqual({ "edit.split": ["Mod+J"], "edit.lift": [] });
    expect(settings.getState().recentCommands).toEqual(["edit.closeAllGaps", "timeline.zoomFit"]);
  });
});
