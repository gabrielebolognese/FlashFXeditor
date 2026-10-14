// Panel layout state (spec §2.1): splitter ratios (persisted) and live panel sizes reported by
// ResizeObserver. Ratios are applied to the DOM as CSS variables by a subscription, never by React.
import { createStore, type Store } from "./createStore.js";

export type PanelId = "media" | "properties" | "preview" | "timeline";
export type SplitterId = "left" | "top" | "media";

export interface Size {
  width: number;
  height: number;
}

/** left: left group / workspace width; top: top row / workspace height; media: media / top row width. */
export type LayoutRatios = Record<SplitterId, number>;

export interface LayoutState {
  /** Preferred ratios (what the user dragged); the effective ones are clamped to the workspace. */
  ratios: LayoutRatios;
  workspace: Size;
  panels: Record<PanelId, Size>;
}

export const DEFAULT_RATIOS: LayoutRatios = { left: 0.68, top: 0.5, media: 0.49 };

/** Functional minimum sizes from spec §2.1, in CSS px. */
export const MIN_SIZES = { media: 280, properties: 320, preview: 300, timeline: 220, topRow: 220 } as const;

const STORAGE_KEY = "layout.v1";

/** Clamps `ratio` so that the part before the split is >= minBefore and the part after >= minAfter. */
export function clampRatio(ratio: number, total: number, minBefore: number, minAfter: number): number {
  if (total <= 0) return ratio;
  const min = minBefore / total;
  const max = 1 - minAfter / total;
  // Too small to satisfy both minimums: share the space in proportion to them.
  if (min > max) return minBefore / (minBefore + minAfter);
  return Math.min(max, Math.max(min, ratio));
}

export function effectiveRatios(ratios: LayoutRatios, workspace: Size): LayoutRatios {
  const left = clampRatio(ratios.left, workspace.width, MIN_SIZES.media + MIN_SIZES.properties, MIN_SIZES.preview);
  const top = clampRatio(ratios.top, workspace.height, MIN_SIZES.topRow, MIN_SIZES.timeline);
  const media = clampRatio(ratios.media, workspace.width * left, MIN_SIZES.media, MIN_SIZES.properties);
  return { left, top, media };
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function loadRatios(storage: StorageLike | null): LayoutRatios {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_RATIOS };
    const parsed = JSON.parse(raw) as Partial<Record<SplitterId, unknown>>;
    const pick = (key: SplitterId) => {
      const value = parsed[key];
      return typeof value === "number" && value > 0 && value < 1 ? value : DEFAULT_RATIOS[key];
    };
    return { left: pick("left"), top: pick("top"), media: pick("media") };
  } catch {
    return { ...DEFAULT_RATIOS };
  }
}

const ZERO: Size = { width: 0, height: 0 };

export interface LayoutStore extends Store<LayoutState> {
  /** Sets a splitter ratio, clamped to the minimum sizes for the current workspace. */
  setRatio(id: SplitterId, ratio: number): void;
  setWorkspace(size: Size): void;
  setPanelSize(id: PanelId, size: Size): void;
  /** Writes the ratios to storage (called once at the end of a splitter drag). */
  persist(): void;
  resetRatio(id: SplitterId): void;
}

// TODO(batch 03): persist splitter positions per project as well (session.json), global stays the fallback.
export function createLayoutStore(storage: StorageLike | null): LayoutStore {
  const store = createStore<LayoutState>({
    ratios: loadRatios(storage),
    workspace: ZERO,
    panels: { media: ZERO, properties: ZERO, preview: ZERO, timeline: ZERO },
  });

  const setRatio = (id: SplitterId, ratio: number) =>
    store.set((s) => {
      const clamped = effectiveRatios({ ...s.ratios, [id]: ratio }, s.workspace)[id];
      return s.ratios[id] === clamped ? s : { ...s, ratios: { ...s.ratios, [id]: clamped } };
    });

  return {
    ...store,
    setRatio,
    setWorkspace(size) {
      store.set((s) =>
        s.workspace.width === size.width && s.workspace.height === size.height ? s : { ...s, workspace: size },
      );
    },
    setPanelSize(id, size) {
      store.set((s) => {
        const prev = s.panels[id];
        if (prev.width === size.width && prev.height === size.height) return s;
        return { ...s, panels: { ...s.panels, [id]: size } };
      });
    },
    persist() {
      try {
        storage?.setItem(STORAGE_KEY, JSON.stringify(store.get().ratios));
      } catch {
        // Storage full or blocked: layout simply does not persist.
      }
    },
    resetRatio(id) {
      setRatio(id, DEFAULT_RATIOS[id]);
    },
  };
}
