import { useRef, useState } from "react";

/**
 * Edit buffer for fields that commit on Enter or blur and revert on Escape. Enter and Escape blur
 * the input, and that blur runs synchronously with the handlers of the same render, before React
 * re-renders. So the pending text also lives in a ref: `take` hands it out at most once, and
 * `set(null)` cancels it before the blur sees it.
 */
export function useDraft(): { draft: string | null; set: (next: string | null) => void; take: () => string | null } {
  const [draft, setDraft] = useState<string | null>(null);
  const pending = useRef<string | null>(null);
  const set = (next: string | null) => {
    pending.current = next;
    setDraft(next);
  };
  const take = () => {
    const text = pending.current;
    if (text !== null) set(null);
    return text;
  };
  return { draft, set, take };
}
