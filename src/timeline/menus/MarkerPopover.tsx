import { Trash2 } from "lucide-react";
import { useCallback, useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { closeMarkerEditor, markerEditor, setMarkerFields } from "../../app/markerController.js";
import { actions, documentStore, sessionStore, themeBridge } from "../../app/services.js";
import { timelineView } from "../../app/timelineController.js";
import { MAX_MARKER_LABEL } from "../../core/commands/markerCommands.js";
import type { LabelColor, Marker, Project } from "../../core/document/types.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import { IconButton } from "../../ui/IconButton.js";
import { Swatches } from "../../ui/Swatches.js";
import { labelSwatches } from "./labelSwatches.js";
import styles from "./MarkerPopover.module.css";

// The inline marker editor (spec §6.13: "double-click a marker in the ruler to edit label and color
// inline (small popover)"): the label field, the 8 label colors and Delete, under the marker's apex.
// Enter, a click outside or a timeline scroll commits the label (one undo step when it changed), Escape
// cancels it; a swatch sets the color at once (its own undo step) and keeps the popover open.

function Editor({ markerId }: { markerId: string }) {
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  const selectMarker = useCallback((project: Project): Marker | undefined => project.markers.find((marker) => marker.id === markerId), [markerId]);
  const marker = useStoreSelector(documentStore, selectMarker);
  const finish = useCallback(
    (commit: boolean) => {
      if (done.current) return;
      done.current = true;
      if (commit && input.current) setMarkerFields(markerId, { label: input.current.value });
      closeMarkerEditor();
    },
    [markerId],
  );

  // Placed once after the render with direct style writes: finding the marker may page the timeline.
  useLayoutEffect(() => {
    const element = panel.current;
    if (!element) return;
    const anchor = timelineView.markerAnchor(markerId);
    if (!anchor) {
      finish(false);
      return;
    }
    const { space } = themeBridge.theme;
    const hostWidth = element.parentElement?.clientWidth ?? 0;
    const width = element.offsetWidth;
    element.style.left = `${Math.max(space[1], Math.min(anchor.x - width / 2, hostWidth - width - space[1]))}px`;
    element.style.top = `${anchor.y + space[1]}px`;
    element.style.visibility = "visible";
    input.current?.focus();
    input.current?.select();
    const onPointerDown = (event: PointerEvent) => {
      if (!element.contains(event.target as Node)) finish(true);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      finish(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    const stop = sessionStore.state.select(
      (state) => state.timeline,
      () => finish(true),
    );
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
      stop();
    };
  }, [markerId, finish]);

  if (!marker) return null;
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") finish(true);
  };
  const pickColor = (color: string) => setMarkerFields(markerId, { color: color as LabelColor });
  // The editor selected its marker: `marker.delete` deletes it.
  const remove = () => {
    done.current = true;
    actions.run("marker.delete");
    closeMarkerEditor();
  };
  return (
    <div ref={panel} className={styles.popover} role="dialog" aria-label="Edit marker" data-scope="dialog">
      <input
        ref={input}
        className={styles.input}
        defaultValue={marker.label}
        maxLength={MAX_MARKER_LABEL}
        placeholder="Marker label"
        aria-label="Marker label"
        spellCheck={false}
        onKeyDown={onKeyDown}
      />
      <div className={styles.row} role="radiogroup" aria-label="Marker color">
        <Swatches swatches={labelSwatches(marker.color)} onPick={pickColor} />
        <span className={styles.spacer} />
        <IconButton icon={Trash2} label="Delete marker" commandId="marker.delete" onClick={remove} />
      </div>
    </div>
  );
}

/** Rendered by the timeline panel; shows the editor only while a marker is being edited. */
export function MarkerPopover() {
  const markerId = useStoreSelector(markerEditor, (state) => state);
  return markerId !== null ? <Editor key={markerId} markerId={markerId} /> : null;
}
