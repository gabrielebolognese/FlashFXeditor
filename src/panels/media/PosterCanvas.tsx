import { useEffect, useRef } from "react";
import { cardImages, posterPainter } from "../../app/mediaController.js";
import type { MediaId } from "../../core/document/types.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import styles from "./MediaTab.module.css";

/**
 * The picture of one media item (a video's first thumbnail, an image's poster). The canvas is handed to
 * `posterPainter`, which draws the shared ImageBitmap in the FrameScheduler loop (no React state);
 * `data-ready` reveals it over the kind-icon placeholder.
 */
export function PosterCanvas({ id }: { id: MediaId }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const posters = useStoreSelector(cardImages, (store) => store);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !posters) return;
    return posterPainter.attach(canvas, posters, id);
  }, [id, posters]);
  return <canvas ref={ref} className={styles.poster} aria-hidden="true" />;
}
