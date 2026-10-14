// App-wide singletons. Created once; React components and canvas views import them directly.
import { version as appVersion } from "../../package.json";
import { ActionRegistry } from "../core/commands/ActionRegistry.js";
import { createProject } from "../core/document/project.js";
import { KeyDispatcher } from "../core/keyboard/KeyDispatcher.js";
import { FocusScopeTracker } from "../core/keyboard/focusScope.js";
import { DEFAULT_KEYMAP } from "../core/keyboard/keymap.js";
import { detectPlatform } from "../core/keyboard/keys.js";
import { FrameScheduler } from "../core/scheduler/FrameScheduler.js";
import { IdleQueue } from "../core/scheduler/IdleQueue.js";
import { createStore } from "../core/store/createStore.js";
import { DocumentStore } from "../core/store/DocumentStore.js";
import { createLayoutStore } from "../core/store/layoutStore.js";
import { createSessionStore } from "../core/store/sessionStore.js";
import { ThemeBridge } from "../core/theme/theme.js";
import { createAppSettings } from "../project/appSettings.js";
import { INITIAL_SAVE_STATUS, type SaveStatus } from "../project/Autosaver.js";
import { idbKeyValueStore } from "../project/kv.js";
import { RecentProjects } from "../project/recentProjects.js";
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
const keyValueStore = idbKeyValueStore();
export const recentProjects = new RecentProjects(keyValueStore);
export const appSettings = createAppSettings(keyValueStore);
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
    onAction: (id, context) => {
      if (actions.has(id)) return actions.run(id, context);
      // Not wired yet: log it and keep consuming the key, as before.
      console.debug("[cmd]", id, context);
    },
  });

  const stops = [
    themeBridge.watch(),
    themeBridge.subscribe((next) => console.debug("[theme] changed", next)),
    focusScopes.attach(document),
    keyDispatcher.attach(window),
    installTooltips(document, theme.tooltipDelay),
  ];
  return () => {
    for (const stop of stops) stop();
  };
}
