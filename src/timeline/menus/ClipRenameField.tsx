import { useCallback, useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { clipRename, finishClipRename, MAX_CLIP_NAME } from "../../app/cutController.js";
import { documentStore, sessionStore, themeBridge } from "../../app/services.js";
import { timelineView } from "../../app/timelineController.js";
import type { ClipId } from "../../core/document/types.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import styles from "./ClipRenameField.module.css";

// Inline clip rename (F2, clip context menu Rename): an input over the clip's label bar in the timeline
// canvas host, placed once when it opens (the view first pages to the clip when it is off screen).
// Enter or blur commits (one undoable command), Escape cancels; scrolling or zooming the timeline
// commits, since the clip moves away from the field.

function RenameInput({ clipId }: { clipId: ClipId }) {
  const input = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  const finish = useCallback(
    (value: string | null) => {
      if (done.current) return;
      done.current = true;
      finishClipRename(clipId, value);
    },
    [clipId],
  );

  // Placed after the render with direct style writes: finding the clip may scroll the timeline.
  useLayoutEffect(() => {
    const element = input.current;
    if (!element) return;
    const { control } = themeBridge.theme;
    const rect = timelineView.clipLabelRect(clipId, 6 * control.default);
    if (!rect) {
      finish(null);
      return;
    }
    element.style.left = `${rect.x}px`;
    element.style.top = `${rect.y}px`;
    element.style.width = `${rect.width}px`;
    element.style.height = `${Math.max(rect.height, control.compact)}px`;
    element.style.visibility = "visible";
    element.focus();
    element.select();
    return sessionStore.state.select(
      (state) => state.timeline,
      () => finish(element.value),
    );
  }, [clipId, finish]);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") finish(event.currentTarget.value);
    else if (event.key === "Escape") finish(null);
  };
  return (
    <input
      ref={input}
      className={styles.input}
      defaultValue={documentStore.getState().clips[clipId]?.name ?? ""}
      maxLength={MAX_CLIP_NAME}
      aria-label="Clip name"
      spellCheck={false}
      onKeyDown={onKeyDown}
      onBlur={(event) => finish(event.currentTarget.value)}
    />
  );
}

/** Rendered by the timeline panel; shows the field only while a clip is being renamed. */
export function ClipRenameField() {
  const clipId = useStoreSelector(clipRename, (state) => state);
  return clipId !== null ? <RenameInput key={clipId} clipId={clipId} /> : null;
}
