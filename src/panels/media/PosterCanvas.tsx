import { useEffect, useRef } from "react";
import { posterStore } from "../../app/mediaController.js";
import type { MediaId } from "../../core/document/types.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import styles from "./MediaTab.module.css";

/**
 * The poster of one media item. Draws the shared ImageBitmap itself when it arrives (no React state);
 * `data-ready` reveals it over the kind-icon placeholder.
 */
export function PosterCanvas({ id }: { id: MediaId }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const posters = useStoreSelector(posterStore, (store) => store);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !posters) return;
    return posters.observe(id, (bitmap) => {
      if (!bitmap) {
        delete canvas.dataset.ready;
        return;
      }
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
      canvas.dataset.ready = "";
    });
  }, [id, posters]);
  return <canvas ref={ref} className={styles.poster} aria-hidden="true" />;
}
