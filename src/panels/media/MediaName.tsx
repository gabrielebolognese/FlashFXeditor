import { useRef, type KeyboardEvent } from "react";
import { finishRename, mediaPanel, startRename } from "../../app/mediaController.js";
import { MAX_MEDIA_NAME } from "../../core/commands/mediaCommands.js";
import type { MediaId } from "../../core/document/types.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import styles from "./MediaTab.module.css";

/** Inline rename: Enter or blur commits (one undoable command), Escape cancels. */
function RenameInput({ id, name }: { id: MediaId; name: string }) {
  const done = useRef(false);
  const finish = (value: string | null) => {
    if (done.current) return;
    done.current = true;
    finishRename(id, value);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") finish(event.currentTarget.value);
    else if (event.key === "Escape") finish(null);
  };
  return (
    <input
      className={styles.renameInput}
      defaultValue={name}
      maxLength={MAX_MEDIA_NAME}
      aria-label="Media name"
      spellCheck={false}
      autoFocus
      onFocus={(event) => event.currentTarget.select()}
      onKeyDown={onKeyDown}
      onBlur={(event) => finish(event.currentTarget.value)}
      // Clicks inside the field must not select or rename other cards.
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    />
  );
}

/** The media name; double-click (or F2 in the panel) renames it in place. */
export function MediaName({ id, name }: { id: MediaId; name: string }) {
  const renaming = useStoreSelector(mediaPanel, (state) => state.renaming === id);
  if (renaming) return <RenameInput id={id} name={name} />;
  return (
    <span
      className={styles.name}
      data-tooltip={name}
      onDoubleClick={(event) => {
        // Rename, not insert: the card's double-click handler must not see this one.
        event.stopPropagation();
        startRename(id);
      }}
    >
      {name}
    </span>
  );
}
