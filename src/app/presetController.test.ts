import { afterEach, describe, expect, it, vi } from "vitest";
import type { CaptionClip, TextPreset } from "../core/document/types.js";
import type { FsDir } from "../project/fs.js";
import { createMemoryDir } from "../project/memoryFs.js";
import { projectPresetsDir, readPresetFolder } from "../project/presetFiles.js";
import { addCaptionTrack, makeCaptionClip, makeProject, makeTextClip, makeTrack, withClips } from "../core/document/fixtures.js";
import { selectClips, selectTracks } from "../core/store/selection.js";
import { cueStyleOf } from "../timeline/edit/captions.js";
import { resetSelectedCueStyles } from "./captionController.js";
import { liveEdit } from "./liveEdit.js";
import { formatPresetFile, formatPresetsFile, presetFileName, presetLook, tagSetKey } from "../text/presets.js";
import { STARTER_PACK_VERSION, starterPresets } from "../text/starterPresets.js";
import { DEFAULT_TEXT_STYLE } from "../text/style.js";
import {
  appliesToCaptions,
  applyBarButton,
  applyPresetById,
  attachPresets,
  barPresets,
  detachPresets,
  findPreset,
  hoverPreset,
  importPresets,
  installPresetController,
  movePresetInSet,
  presetLibrary,
  presetRenaming,
  presetTagging,
  setPresetTags,
  showBarSet,
  togglePresetInSet,
} from "./presetController.js";
import { actions, appSettings, documentStore, keyValueStore, sessionStore } from "./services.js";

// The real services open IndexedDB at import time, which jsdom lacks: same singletons, memory-backed.
vi.mock("./services.js", async () => {
  const { CommandRegistry } = await import("../core/commands/CommandRegistry.js");
  const { createProject: createDocument } = await import("../core/document/project.js");
  const { FocusScopeTracker } = await import("../core/keyboard/focusScope.js");
  const { createStore } = await import("../core/store/createStore.js");
  const { DocumentStore } = await import("../core/store/DocumentStore.js");
  const { createLayoutStore } = await import("../core/store/layoutStore.js");
  const { createSessionStore } = await import("../core/store/sessionStore.js");
  const { createAppSettings } = await import("../project/appSettings.js");
  const { INITIAL_SAVE_STATUS } = await import("../project/Autosaver.js");
  const { memoryKeyValueStore } = await import("../project/kv.js");
  const { RecentProjects } = await import("../project/recentProjects.js");
  const { IdleQueue } = await import("../core/scheduler/IdleQueue.js");
  const { FrameScheduler } = await import("../core/scheduler/FrameScheduler.js");
  const { ThemeBridge } = await import("../core/theme/theme.js");
  const { AudioClock } = await import("../audio/AudioClock.js");
  const { FontLibrary } = await import("../render/text/FontLibrary.js");
  const sessionStore = createSessionStore();
  return {
    actions: new CommandRegistry(),
    appSettings: createAppSettings(memoryKeyValueStore()),
    appVersion: "test",
    audioClock: new AudioClock(),
    documentStore: new DocumentStore(createDocument({ id: "placeholder", name: "Placeholder", now: "x", appVersion: "x" }), { session: sessionStore, validate: true }),
    focusScopes: new FocusScopeTracker(),
    fontLibrary: new FontLibrary(null),
    idleQueue: new IdleQueue(
      () => 0,
      () => undefined,
    ),
    keyValueStore: memoryKeyValueStore(),
    layoutStore: createLayoutStore(null),
    recentProjects: new RecentProjects(memoryKeyValueStore()),
    saveStatus: createStore(INITIAL_SAVE_STATUS),
    scheduler: new FrameScheduler(
      () => 0,
      () => undefined,
    ),
    sessionStore,
    themeBridge: new ThemeBridge(document.documentElement, () => () => "0"),
    workerPool: { request: () => new Promise(() => undefined) },
  };
});

const NOW = "2026-10-16T10:00:00.000Z";
const preset = (id: string): TextPreset => ({
  id,
  name: id.toUpperCase(),
  style: structuredClone(DEFAULT_TEXT_STYLE),
  box: { mode: "auto", width: 900 },
  applyPosition: false,
  tags: [],
  favorite: false,
  createdAt: NOW,
  updatedAt: NOW,
});

/** `root` whose folder lookups wait until `open()`: the project's presets are still being read. */
function slowRoot(root: FsDir) {
  let open = () => undefined as void;
  const gate = new Promise<void>((resolve) => (open = resolve));
  const dir = new Proxy(root, {
    get(target, prop) {
      if (prop === "dir") {
        return async (name: string, options?: { create?: boolean }) => {
          await gate;
          return target.dir(name, options);
        };
      }
      const value: unknown = Reflect.get(target, prop, target);
      return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    },
  });
  return { dir, open };
}

/** The open picker returns a file holding `text`. */
function stubOpenPicker(text: string): void {
  Object.assign(window, { showOpenFilePicker: () => Promise.resolve([{ getFile: () => Promise.resolve({ text: () => Promise.resolve(text) }) }]) });
}

const settle = async () => {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
};
const ids = (presets: readonly TextPreset[]) => presets.map((item) => item.id).sort();

afterEach(() => {
  detachPresets();
  delete (window as { showOpenFilePicker?: unknown }).showOpenFilePicker;
});

describe("project presets", () => {
  it("keeps the presets read from presets/text when one is imported while the folder is read", async () => {
    const root = createMemoryDir();
    const folder = await projectPresetsDir(root, true);
    if (!folder) throw new Error("no folder");
    await folder.writeText(presetFileName("a"), formatPresetFile(preset("a")));
    await folder.writeText(presetFileName("b"), formatPresetFile(preset("b")));
    sessionStore.state.set((state) => ({ ...state, mediaPanel: { ...state.mediaPanel, presetScope: "project" } }));

    const slow = slowRoot(root);
    attachPresets(slow.dir, () => true);
    stubOpenPicker(formatPresetsFile([preset("c")]));
    await importPresets();
    expect(ids(presetLibrary.getState().project)).toEqual(["c"]);

    slow.open();
    await vi.waitFor(() => expect(ids(presetLibrary.getState().project)).toEqual(["a", "b", "c"]));
    await settle();
    expect(ids(presetLibrary.getState().project)).toEqual(["a", "b", "c"]);
    expect(ids((await readPresetFolder(folder, NOW)).presets)).toEqual(["a", "b", "c"]);
  });
});

describe("preset bar (Batch 52)", () => {
  /** The 9 favorites of the starter pack in card order (the first start's Favorites set). */
  const FAVORITES = starterPresets().filter((preset) => preset.favorite);
  const order = (presets: readonly TextPreset[]) => presets.map((item) => item.id);

  function threeTexts(): string[] {
    const clips = ["t1", "t2", "t3"].map((id, i) => makeTextClip({ id, trackId: "v1", start: i * 30, duration: 30 }));
    documentStore.load(withClips({ ...makeProject(), tracks: [makeTrack("v1")] }, clips));
    sessionStore.selection.set(selectClips(["t1", "t2", "t3"]));
    return ["t1", "t2", "t3"];
  }

  it("seeds the starter pack on the first start, stores its version and shows its favorites", async () => {
    const stop = installPresetController();
    try {
      await vi.waitFor(() => expect(presetLibrary.getState().loaded).toBe(true));
      await vi.waitFor(async () => expect(await keyValueStore.get("textPresets.starterPack")).toBe(STARTER_PACK_VERSION));
      expect(presetLibrary.getState().global).toHaveLength(starterPresets().length);
      expect(order(barPresets("favorites"))).toEqual(order(FAVORITES));
      expect(barPresets("titles").length).toBeGreaterThanOrEqual(15);
      expect(barPresets("recent")).toEqual([]);

      // Sets: shown in the session; anything else is ignored.
      showBarSet("captions");
      expect(sessionStore.state.getState().presetBar.set).toBe("captions");
      showBarSet("nope");
      actions.run("presetBar.set.favorites");
      expect(sessionStore.state.getState().presetBar.set).toBe("favorites");

      // Alt+3 = the third button: three selected text clips restyled in one undo step, and it is Recent.
      const texts = threeTexts();
      const third = FAVORITES[2] as TextPreset;
      const undoBefore = documentStore.history.getState();
      expect(actions.run("presetBar.apply3")).not.toBe(false);
      const project = documentStore.getState();
      const look = presetLook(third, project.settings);
      for (const id of texts) {
        const clip = project.clips[id];
        expect(clip?.kind === "text" && clip.presetId).toBe(third.id);
        expect(clip?.kind === "text" && clip.style).toEqual(look.style);
      }
      expect(documentStore.history.getState().undoLabel).toBe(`Apply "${third.name}"`);
      expect(documentStore.history.getState()).not.toBe(undoBefore);
      documentStore.undo();
      for (const id of texts) expect(documentStore.getState().clips[id]?.kind === "text" && documentStore.getState().clips[id]).toMatchObject({ style: DEFAULT_TEXT_STYLE });
      expect(appSettings.getState().recentPresets[0]).toBe(third.id);
      expect(order(barPresets("recent"))).toEqual([third.id]);
      // A button the set does not have: declined.
      expect(applyBarButton(99)).toBe(false);

      // Reordering a set keeps its order in the app settings; Recent and All have none.
      movePresetInSet("favorites", third.id, 0);
      await vi.waitFor(() => expect(order(barPresets("favorites"))[0]).toBe(third.id));
      expect(appSettings.getState().presetOrder.favorites?.[0]).toBe(third.id);
      movePresetInSet("all", third.id, 5);
      expect(appSettings.getState().presetOrder.all).toBeUndefined();

      // Sets and tags from the card menu.
      const plain = FAVORITES[0] as TextPreset;
      togglePresetInSet(plain.id, "captions");
      expect(findPreset(plain.id)?.preset.sets).toEqual(["titles", "captions"]);
      setPresetTags(plain.id, "Promo, client");
      expect(order(barPresets(tagSetKey("promo")))).toEqual([plain.id]);
      // Rename and Tags from the bar's menu open the field on the card in the Presets tab.
      actions.run("preset.editTags", null, plain.id);
      expect(sessionStore.state.getState().mediaPanel.tab).toBe("presets");
      expect(presetTagging.getState()).toBe(plain.id);
      actions.run("preset.rename", null, plain.id);
      expect(presetRenaming.getState()).toBe(plain.id);
    } finally {
      presetRenaming.set(null);
      presetTagging.set(null);
      stop();
    }
  });

  it("toggles the bar in the session", () => {
    const stop = installPresetController();
    try {
      expect(sessionStore.state.getState().presetBar.visible).toBe(true);
      actions.run("preview.togglePresetBar");
      expect(sessionStore.state.getState().presetBar.visible).toBe(false);
      actions.run("preview.togglePresetBar");
      expect(sessionStore.state.getState().presetBar.visible).toBe(true);
    } finally {
      stop();
    }
  });
});


describe("presets on caption cues (spec §20.3, Batch 53)", () => {
  function captions(): void {
    const p = addCaptionTrack({ ...makeProject(), tracks: [makeTrack("v1")] });
    const cues = ["q1", "q2", "q3"].map((id, i) => makeCaptionClip({ id, trackId: "cc", start: i * 30, duration: 30, text: id }));
    documentStore.load(withClips(p, cues));
  }

  it("styles the selected cues (one undo step), hover shows them live; with the track selected it sets the track's style", async () => {
    const stop = installPresetController();
    try {
      await vi.waitFor(() => expect(presetLibrary.getState().loaded).toBe(true));
      captions();
      const track = documentStore.getState().captionTracks.cc!.style;
      const preset = starterPresets().find((item) => item.highlight && item.sets?.includes("captions")) as TextPreset;
      sessionStore.selection.set(selectClips(["q1", "q2"]));
      expect(appliesToCaptions()).toBe(true);

      hoverPreset(preset.id);
      expect([...(liveEdit.getState().cueStyles?.keys() ?? [])]).toEqual(["q1", "q2"]);
      expect(documentStore.getState().clips.q1).not.toHaveProperty("styleOverride");
      hoverPreset(null);
      expect(liveEdit.getState().cueStyles).toBeNull();

      applyPresetById(preset.id);
      const project = documentStore.getState();
      const look = presetLook(preset, project.settings);
      for (const id of ["q1", "q2"]) {
        const cue = project.clips[id] as CaptionClip;
        expect(cue.presetId).toBe(preset.id);
        expect(cueStyleOf(project, cue).text.fontFamily).toBe(look.style.fontFamily);
        expect(cueStyleOf(project, cue).highlight).toEqual(preset.highlight);
      }
      expect(project.clips.q3).not.toHaveProperty("styleOverride");
      expect(project.captionTracks.cc!.style).toBe(track);
      expect(documentStore.history.getState().undoLabel).toBe(`Apply "${preset.name}" to captions`);

      // Reset to track style: the cues are the track's again.
      resetSelectedCueStyles();
      expect(documentStore.getState().clips.q1).not.toHaveProperty("styleOverride");
      expect(documentStore.getState().clips.q2).not.toHaveProperty("presetId");
      documentStore.undo();
      expect((documentStore.getState().clips.q1 as CaptionClip).presetId).toBe(preset.id);

      // The caption track selected: its style.
      sessionStore.selection.set(selectTracks(["cc"]));
      applyPresetById(preset.id);
      expect(documentStore.getState().captionTracks.cc!.style.text.fontFamily).toBe(look.style.fontFamily);
    } finally {
      stop();
    }
  });
});
