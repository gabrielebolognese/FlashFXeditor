import { useCallback } from "react";
import { deleteMarker, moveMarker, setMarkerFields } from "../../app/markerController.js";
import { documentStore, sessionStore } from "../../app/services.js";
import { MAX_MARKER_LABEL } from "../../core/commands/markerCommands.js";
import { formatTimecode, parseTimecode } from "../../core/document/time.js";
import type { LabelColor, Marker, Project, Rational } from "../../core/document/types.js";
import type { SessionState } from "../../core/store/sessionStore.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import { labelSwatches } from "../../timeline/menus/labelSwatches.js";
import { Button } from "../../ui/Button.js";
import { Swatches } from "../../ui/Swatches.js";
import { TextField } from "../../ui/TextField.js";
// The section layout of the properties panel (shared until the Batch 25 framework).
import styles from "./ProjectSection.module.css";

const selectFps = (project: Project): Rational => project.settings.fps;
const selectFormat = (state: SessionState) => state.timecodeFormat;

/**
 * The Marker section (spec §11: label, color, frame), shown while a timeline marker is selected (a click
 * on it in the ruler). Each edit is one undo step; the time field takes a timecode (relative input as
 * in the toolbar field) in the preview's format.
 * TODO(batch 25): the collapsible section framework.
 */
export function MarkerSection({ markerId }: { markerId: string }) {
  const select = useCallback((project: Project): Marker | undefined => project.markers.find((marker) => marker.id === markerId), [markerId]);
  const marker = useStoreSelector(documentStore, select);
  const fps = useStoreSelector(documentStore, selectFps);
  const mode = useStoreSelector(sessionStore.state, selectFormat);
  if (!marker) return null;
  const setTime = (text: string) => {
    const frame = parseTimecode(text, fps, { current: marker.frame, mode });
    if (frame !== null) moveMarker(marker.id, frame);
  };
  return (
    <section className={styles.section} aria-labelledby="marker-section-title">
      <h3 id="marker-section-title" className={styles.title}>
        Marker
      </h3>
      <div className={styles.grid}>
        <span className={styles.label}>Label</span>
        <TextField value={marker.label} onCommit={(text) => setMarkerFields(marker.id, { label: text })} ariaLabel="Marker label" maxLength={MAX_MARKER_LABEL} placeholder="No label" />
        <span className={styles.label}>Color</span>
        <span className={styles.swatches} role="radiogroup" aria-label="Marker color">
          <Swatches swatches={labelSwatches(marker.color)} onPick={(color) => setMarkerFields(marker.id, { color: color as LabelColor })} />
        </span>
        <span className={styles.label}>Time</span>
        <TextField value={formatTimecode(marker.frame, fps, mode)} onCommit={setTime} ariaLabel="Marker time" mono />
        <span />
        <span>
          <Button size="compact" onClick={() => deleteMarker(marker.id)}>
            Delete marker
          </Button>
        </span>
      </div>
    </section>
  );
}
