import { useLayoutEffect, useRef, type ReactNode } from "react";
import { shallowEqual } from "../core/store/createStore.js";
import type { PanelId } from "../core/store/layoutStore.js";
import styles from "./CanvasHost.module.css";
import { layoutStore } from "./services.js";

/**
 * Mount point for a framework-free canvas view. Sized from the layout store (not by CSS) so the views
 * of later batches drop in without layout changes.
 * TODO(batch 07): the timeline view mounts here and reallocates its backing stores at devicePixelRatio.
 */
export function CanvasHost({ panel, children }: { panel: PanelId; children?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const host = ref.current;
    if (!host) return;
    return layoutStore.select(
      (state) => state.panels[panel],
      (size) => {
        host.style.width = `${size.width}px`;
        host.style.height = `${size.height}px`;
      },
      { equals: shallowEqual, fireImmediately: true },
    );
  }, [panel]);

  return (
    <div ref={ref} className={`canvas-host ${styles.host}`} data-panel={panel}>
      {children}
    </div>
  );
}
