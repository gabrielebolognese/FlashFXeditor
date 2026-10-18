// The font library's catalog in the app (spec §20.1 Performance: "the catalog loads once, lazily, on
// the first browser open, and never delays app start"). Fetched and checked once (`loadFontCatalog`)
// and handed to the font library: the library families become known (their files load on demand) and
// the Missing badges of texts that use them go. It is also read in idle time when the open document
// names a family no other source knows (a project whose library fonts have no copy in `fonts/`, e.g.
// one opened read-only), so such a project draws right without the browser being opened.
import { createStore } from "../core/store/createStore.js";
import { errorMessage } from "../project/errorMessage.js";
import { appBaseUrl } from "../render/text/bundledFonts.js";
import { CATALOG_FILE, LIBRARY_DIR, parseCatalog, type FontCatalog } from "../text/fonts/catalog.js";
import { projectTextStyles } from "../text/fonts.js";
import { documentStore, fontLibrary, idleQueue } from "./services.js";

export interface CatalogState {
  status: "idle" | "loading" | "ready" | "error";
  catalog: FontCatalog | null;
  message?: string;
  /** How long the fetch and the check took (ms). */
  ms?: number;
}

export const fontCatalog = createStore<CatalogState>({ status: "idle", catalog: null });

let pending: Promise<FontCatalog | null> | null = null;

/** The catalog (read once; a failed read is tried again on the next call). */
export function loadFontCatalog(): Promise<FontCatalog | null> {
  pending ??= (async () => {
    fontCatalog.set({ status: "loading", catalog: null });
    const started = performance.now();
    try {
      const response = await fetch(new URL(`${LIBRARY_DIR}${CATALOG_FILE}`, appBaseUrl()).href);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const catalog = parseCatalog(await response.json());
      fontLibrary.setCatalog(catalog);
      fontCatalog.set({ status: "ready", catalog, ms: performance.now() - started });
      return catalog;
    } catch (error) {
      console.warn("[fonts] cannot read the font library's catalog", error);
      pending = null;
      fontCatalog.set({ status: "error", catalog: null, message: errorMessage(error) });
      return null;
    }
  })();
  return pending;
}

/** Reads the catalog in idle time when the document draws with a family nothing else knows. Returns a stop function. */
export function installCatalogController(): () => void {
  let cancel: (() => void) | null = null;
  const check = () => {
    if (fontCatalog.getState().status !== "idle" || cancel) return;
    const unknown = projectTextStyles(documentStore.getState()).some((style) => fontLibrary.source(style.fontFamily) === "missing");
    if (!unknown) return;
    cancel = idleQueue.enqueue(() => {
      cancel = null;
      void loadFontCatalog();
    });
  };
  const stop = documentStore.subscribe(check, { affects: ["text", "clips", "captions"] });
  check();
  return () => {
    stop();
    cancel?.();
  };
}
