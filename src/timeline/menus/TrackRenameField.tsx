import { useCallback, useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { documentStore, sessionStore, themeBridge } from "../../app/services.js";
import { timelineView } from "../../app/timelineController.js";
import { finishTrackRename, MAX_TRACK_NAME, trackRename } from "../../app/trackController.js";
import type { TrackId } from "../../core/document/types.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
// The same DS input over the canvases as the clip rename field.
import styles from "./ClipRenameField.module.css";

// Inline track rename (spec §6.1: double-click the header name; F2 on a selected track; track menu
// Rename): an input over the header's name, placed once when it opens (the view first scrolls the row
// into view). Enter or blur commits (one undoable command), Escape cancels; scrolling the timeline
// commits, since the header moves away from the field.

function RenameInput({ trackId }: { trackId: TrackId }) {
  const input = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  const finish = useCallback(
    (value: string | null) => {
      if (done.current) return;
      done.current = true;
      finishTrackRename(trackId, value);
    },
    [trackId],
  );

  // Placed after the render with direct style writes: finding the row may scroll the timeline.
  useLayoutEffect(() => {
    const element = input.current;
    if (!element) return;
    const rect = timelineView.trackNameRect(trackId);
    if (!rect) {
      finish(null);
      return;
    }
    const height = themeBridge.theme.control.compact;
    element.style.left = `${rect.x}px`;
    element.style.top = `${rect.y + (rect.height - height) / 2}px`;
    element.style.width = `${rect.width}px`;
    element.style.height = `${height}px`;
    element.style.visibility = "visible";
    element.focus();
    element.select();
    return sessionStore.state.select(
      (state) => state.timeline.scrollY,
      () => finish(element.value),
    );
  }, [trackId, finish]);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") finish(event.currentTarget.value);
    else if (event.key === "Escape") finish(null);
  };
  return (
    <input
      ref={input}
      className={styles.input}
      defaultValue={documentStore.getState().tracks.find((track) => track.id === trackId)?.name ?? ""}
      maxLength={MAX_TRACK_NAME}
      aria-label="Track name"
      spellCheck={false}
      onKeyDown={onKeyDown}
      onBlur={(event) => finish(event.currentTarget.value)}
    />
  );
}

/** Rendered by the timeline panel; shows the field only while a track is being renamed. */
export function TrackRenameField() {
  const trackId = useStoreSelector(trackRename, (state) => state);
  return trackId !== null ? <RenameInput key={trackId} trackId={trackId} /> : null;
}
