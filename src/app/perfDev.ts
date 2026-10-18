// The dev performance overlay's toggle (Batch 45), on its own so the app bar's dev button needs
// nothing else of the dev tooling (app/perfController.ts, loaded in dev builds only).
import { createStore } from "../core/store/createStore.js";

export const perfDev = createStore<{ stats: boolean }>({ stats: false });
