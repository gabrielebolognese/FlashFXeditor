// Fullscreen preview (spec §7.8 "F key: preview fills the window, Esc returns"): the preview panel
// fills the browser window over the other panels, whose layout (splitters, sizes) is left as it is.
// The panel's header and footer float over the picture and hide after a while without pointer
// movement (the cursor hides with them over the picture). App state, not persisted: a reload starts
// in the panel layout. Framework-free: the attributes are written here, React never renders for it
// (P1).
import { createStore } from "../core/store/createStore.js";

/** True while the preview fills the window. */
export const previewFullscreen = createStore(false);

export function toggleFullscreen(): void {
  previewFullscreen.set(!previewFullscreen.getState());
}

/** Back to the panel layout; false when it was not fullscreen (Esc goes on to others). */
export function exitFullscreen(): boolean {
  if (!previewFullscreen.getState()) return false;
  previewFullscreen.set(false);
  return true;
}

/**
 * Writes `data-fullscreen` on the preview panel and, while it is set, `data-chrome="hidden"` after
 * `hideDelay()` ms without pointer movement, unless the pointer rests on the chrome (`isChrome`).
 */
export function bindFullscreen(panel: HTMLElement, isChrome: (target: EventTarget | null) => boolean, hideDelay: () => number): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let onChrome = false;
  const clear = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const show = () => {
    clear();
    if (panel.dataset.chrome !== "shown") panel.dataset.chrome = "shown";
    if (!onChrome) timer = setTimeout(() => (panel.dataset.chrome = "hidden"), hideDelay());
  };
  const onMove = (event: PointerEvent) => {
    onChrome = isChrome(event.target);
    show();
  };
  const onLeave = () => {
    onChrome = false;
  };
  const apply = (on: boolean) => {
    if (on) {
      panel.dataset.fullscreen = "";
      panel.addEventListener("pointermove", onMove);
      panel.addEventListener("pointerleave", onLeave);
      show();
    } else {
      clear();
      delete panel.dataset.fullscreen;
      delete panel.dataset.chrome;
      panel.removeEventListener("pointermove", onMove);
      panel.removeEventListener("pointerleave", onLeave);
    }
  };
  const stop = previewFullscreen.select((on) => on, apply, { fireImmediately: true });
  return () => {
    stop();
    apply(false);
  };
}
