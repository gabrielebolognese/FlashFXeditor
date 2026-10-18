// App settings that reach framework-free code (Batch 42): the default durations, the default
// transition and "keyframes follow source" go to the edits (timeline/edit/editDefaults.ts) at startup
// and on every change.
import { shallowEqual } from "../core/store/createStore.js";
import { editDefaultsOf } from "../project/appSettings.js";
import { setEditDefaults } from "../timeline/edit/editDefaults.js";
import { appSettings } from "./services.js";

export function installSettingsController(): () => void {
  return appSettings.select(editDefaultsOf, setEditDefaults, { equals: shallowEqual, fireImmediately: true });
}
