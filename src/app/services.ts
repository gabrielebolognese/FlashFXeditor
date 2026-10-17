// App-wide singletons. Created once; React components and canvas views import them directly.
import { version as appVersion } from "../../package.json";
import { AudioClock } from "../audio/AudioClock.js";
import { ActionRegistry } from "../core/commands/ActionRegistry.js";
import { createProject } from "../core/document/project.js";
import { FontLibrary } from "../render/text/FontLibrary.js";
import { KeyDispatcher } from "../core/keyboard/KeyDispatcher.js";
import { FocusScopeTracker } from "../core/keyboard/focusScope.js";
import { DEFAULT_KEYMAP } from "../core/keyboard/keymap.js";
import { detectPlatform } from "../core/keyboard/keys.js";
import { plannedMessage } from "../core/keyboard/planned.js";
import { FrameScheduler } from "../core/scheduler/FrameScheduler.js";
import { IdleQueue } from "../core/scheduler/IdleQueue.js";
import { createStore } from "../core/store/createStore.js";
import { DocumentStore } from "../core/store/DocumentStore.js";
import { createLayoutStore } from "../core/store/layoutStore.js";
import { createSessionStore } from "../core/store/sessionStore.js";
import { ThemeBridge } from "../core/theme/theme.js";
import { WorkerPool } from "../media/workers/WorkerPool.js";
import { createAppSettings } from "../project/appSettings.js";
import { INITIAL_SAVE_STATUS, type SaveStatus } from "../project/Autosaver.js";
import { idbKeyValueStore } from "../project/kv.js";
import { RecentProjects } from "../project/recentProjects.js";
import { showToast } from "../ui/toasts.js";
import { installTooltips } from "../ui/tooltipController.js";

function localStorageOrNull(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export const themeBridge = new ThemeBridge(document.documentElement);
export const scheduler = new FrameScheduler();
export const idleQueue = new IdleQueue();
export const focusScopes = new FocusScopeTracker();
export const layoutStore = createLayoutStore(localStorageOrNull());
export const sessionStore = createSessionStore();
// A placeholder document until a project folder is opened (projectController loads the real one).
export const documentStore = new DocumentStore(
  createProject({ id: crypto.randomUUID(), name: "Untitled project", now: new Date().toISOString(), appVersion }),
  { session: sessionStore },
);
export const actions = new ActionRegistry();
/** The master clock of playback: an AudioContext created on the first pointer or key press (spec §8). */
export const audioClock = new AudioClock();
/** IndexedDB key-value store of global things: recent projects, settings, global text presets (spec §3.1). */
export const keyValueStore = idbKeyValueStore();
export const recentProjects = new RecentProjects(keyValueStore);
export const appSettings = createAppSettings(keyValueStore);
/** Media workers (spec §3.5), each created on its first request (transcribe: Batch 33, the Transcribe dialog). */
export const workerPool = new WorkerPool({
  decode: () => new Worker(new URL("../media/workers/decode.worker.ts", import.meta.url), { type: "module", name: "decode" }),
  analysis: () => new Worker(new URL("../media/workers/analysis.worker.ts", import.meta.url), { type: "module", name: "analysis" }),
  proxy: () => new Worker(new URL("../media/workers/proxy.worker.ts", import.meta.url), { type: "module", name: "proxy" }),
  transcribe: () => new Worker(new URL("../media/workers/transcribe.worker.ts", import.meta.url), { type: "module", name: "transcribe" }),
});
/** The fonts text can use: bundled, the open project's, installed (spec §10.1). */
export const fontLibrary = new FontLibrary(typeof document === "undefined" ? null : document.fonts);
/** Save state of the open project, for the app bar dot and the read-only banner. */
export const saveStatus = createStore<SaveStatus>(INITIAL_SAVE_STATUS);
export { appVersion };

actions.register("history.undo", () => {
  documentStore.undo();
});
actions.register("history.redo", () => {
  documentStore.redo();
});

/** Starts the global listeners (keyboard, focus scopes, theme, tooltips). Returns a stop function. */
export function startServices(): () => void {
  const theme = themeBridge.refresh();
  console.debug("[theme]", theme);

  const keyDispatcher = new KeyDispatcher({
    keymap: DEFAULT_KEYMAP,
    platform: detectPlatform(),
    getScope: () => focusScopes.scope,
    isAvailable: (id) => actions.has(id),
    onAction: (id, context) => {
      if (actions.has(id)) return actions.run(id, context);
      // Bound but not built yet (spec §18 is bound in full): keep consuming the key; dev builds say
      // which batch brings the command.
      const message = import.meta.env.DEV && context.phase === "down" && !context.repeat ? plannedMessage(id) : null;
      if (message) showToast({ tone: "info", message, detail: "Dev builds only: the shortcut is bound, its command comes in that batch." });
      else console.debug("[cmd]", id, context);
    },
  });

  const stops = [
    themeBridge.watch(),
    themeBridge.subscribe((next) => console.debug("[theme] changed", next)),
    focusScopes.attach(document),
    // Before the key dispatcher: the first key press creates the AudioContext, then plays.
    audioClock.attach(window),
    keyDispatcher.attach(window),
    installTooltips(document, theme.tooltipDelay),
  ];
  return () => {
    for (const stop of stops) stop();
  };
}
