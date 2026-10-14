import type { PointerEvent as ReactPointerEvent } from "react";
import type { SplitterId } from "../core/store/layoutStore.js";
import { layoutStore } from "./services.js";
import styles from "./Splitter.module.css";

export interface SplitterProps {
  id: SplitterId;
  /** "x": a vertical line dragged left/right; "y": a horizontal line dragged up/down. */
  axis: "x" | "y";
}

/**
 * Absolutely positioned over the boundary between two panels of its parent container. Dragging writes
 * the ratio to the layout store (applied as CSS variables, no React render) and persists on release.
 * Double-click restores the default split.
 */
export function Splitter({ id, axis }: SplitterProps) {
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const handle = event.currentTarget;
    const container = handle.parentElement;
    if (!container) return;
    event.preventDefault();
    // Measured once per gesture (P9).
    const rect = container.getBoundingClientRect();
    handle.setPointerCapture(event.pointerId);
    handle.dataset.dragging = "";

    const move = (e: PointerEvent) => {
      const ratio = axis === "x" ? (e.clientX - rect.left) / rect.width : (e.clientY - rect.top) / rect.height;
      layoutStore.setRatio(id, ratio);
    };
    const end = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      delete handle.dataset.dragging;
      layoutStore.persist();
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  };

  const onDoubleClick = () => {
    layoutStore.resetRatio(id);
    layoutStore.persist();
  };

  return (
    <div
      className={styles.splitter}
      data-axis={axis}
      data-splitter={id}
      role="separator"
      aria-orientation={axis === "x" ? "vertical" : "horizontal"}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
    />
  );
}
