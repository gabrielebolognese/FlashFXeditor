import { useLayoutEffect, type RefObject } from "react";
import { shallowEqual } from "../core/store/createStore.js";
import { effectiveRatios, type PanelId } from "../core/store/layoutStore.js";
import { layoutStore } from "./services.js";

/**
 * Reports the workspace size to the layout store and writes the effective splitter ratios to CSS
 * variables on the workspace element. Runs outside React renders (P1): dragging a splitter never
 * re-renders a component.
 */
export function useWorkspaceLayout(ref: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) layoutStore.setWorkspace({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    const stop = layoutStore.select(
      (state) => effectiveRatios(state.ratios, state.workspace),
      (ratios) => {
        element.style.setProperty("--layout-left", String(ratios.left));
        element.style.setProperty("--layout-top", String(ratios.top));
        element.style.setProperty("--layout-media", String(ratios.media));
      },
      { equals: shallowEqual, fireImmediately: true },
    );
    return () => {
      observer.disconnect();
      stop();
    };
  }, [ref]);
}

/** Reports an element's content size as the size of a panel. */
export function usePanelSize(id: PanelId, ref: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) layoutStore.setPanelSize(id, { width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [id, ref]);
}
