import { useEffect, useRef } from "react";
import { posterPainter, posterStore } from "../../app/mediaController.js";
import type { MediaId } from "../../core/document/types.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import styles from "./MediaTab.module.css";

/**
 * The poster of one media item. The canvas is handed to `posterPainter`, which draws the shared
 * ImageBitmap in the FrameScheduler loop (no React state); `data-ready` reveals it over the kind-icon
 * placeholder.
 */
export function PosterCanvas({ id }: { id: MediaId }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const posters = useStoreSelector(posterStore, (store) => store);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !posters) return;
    return posterPainter.attach(canvas, posters, id);
  }, [id, posters]);
  return <canvas ref={ref} className={styles.poster} aria-hidden="true" />;
}
