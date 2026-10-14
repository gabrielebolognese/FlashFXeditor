import { useLayoutEffect, type RefObject } from "react";

/**
 * Calls `onDismiss` on a pointer down outside every element in `refs`, or on Escape (which it
 * consumes). Include the trigger button in `refs` so pressing it toggles instead of re-opening.
 */
export function useDismiss(refs: readonly RefObject<HTMLElement | null>[], onDismiss: () => void, active = true): void {
  useLayoutEffect(() => {
    if (!active) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!refs.some((ref) => ref.current?.contains(target))) onDismiss();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onDismiss();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
    // `refs` is a fresh array each render; the refs inside are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onDismiss, active]);
}
