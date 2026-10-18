// Keeps the keyboard focus in its panel when the control that has it goes away (Batch 46, keyboard-only
// use): an inline row closed from inside (Save as preset's name field, Remove silence's Cancel and
// Apply), the quick actions after Delete, the sections of the previous selection, the Export tab closed
// with Esc, a queue card cancelled. Without this the focus falls to the page and the next Tab starts over
// at the top of the app. The panel's body marks itself as the place the focus goes by default.
import { useLayoutEffect, useRef, type RefObject } from "react";

/** The attribute of a panel's focus home (a `tabIndex={-1}` element that stays while its content changes). */
export const FOCUS_HOME = "data-focus-home";

/** What the element had around it when it went: its panel and its siblings (they may have gone with it). */
export interface FocusSurroundings {
  panel: Element | null;
  previous: Element | null;
  next: Element | null;
}

const home = ({ panel }: FocusSurroundings) => panel?.querySelector<HTMLElement>(`[${FOCUS_HOME}]`);

/**
 * When the component unmounts with the focus inside `ref`'s element, the focus goes to what `target`
 * finds (default: the panel's focus home) once the element has left the page, so a target that mounts
 * in the same commit (the Edit Properties body after the Export tab) can take it. A dev StrictMode
 * remount leaves the element in the page: nothing moves then.
 */
export function useFocusReturn(ref: RefObject<HTMLElement | null>, target: (around: FocusSurroundings) => Element | null | undefined = home): void {
  const latest = useRef(target);
  useLayoutEffect(() => {
    latest.current = target;
  });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    return () => {
      // A layout cleanup runs before the element leaves the page: the focus is still inside to see.
      if (!element.contains(document.activeElement)) return;
      const around = { panel: element.closest("[data-panel]"), previous: element.previousElementSibling, next: element.nextElementSibling };
      const find = latest.current;
      queueMicrotask(() => {
        if (element.isConnected) return;
        const next = find(around);
        if (next instanceof HTMLElement && next.isConnected) next.focus({ preventScroll: true });
      });
    };
  }, [ref]);
}
