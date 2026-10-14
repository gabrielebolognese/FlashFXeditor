// App-wide singletons. Created once; React components and canvas views import them directly.
import { KeyDispatcher } from "../core/keyboard/KeyDispatcher.js";
import { FocusScopeTracker } from "../core/keyboard/focusScope.js";
import { DEFAULT_KEYMAP } from "../core/keyboard/keymap.js";
import { detectPlatform } from "../core/keyboard/keys.js";
import { FrameScheduler } from "../core/scheduler/FrameScheduler.js";
import { IdleQueue } from "../core/scheduler/IdleQueue.js";
import { createLayoutStore } from "../core/store/layoutStore.js";
import { ThemeBridge } from "../core/theme/theme.js";
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

/** Starts the global listeners (keyboard, focus scopes, theme, tooltips). Returns a stop function. */
export function startServices(): () => void {
  const theme = themeBridge.refresh();
  console.debug("[theme]", theme);

  const keyDispatcher = new KeyDispatcher({
    keymap: DEFAULT_KEYMAP,
    platform: detectPlatform(),
    getScope: () => focusScopes.scope,
    // TODO(batch 02): dispatch to the command registry instead of logging.
    onAction: (id, context) => {
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
