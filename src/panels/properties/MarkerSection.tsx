import { useCallback } from "react";
import { moveMarker, setMarkerFields } from "../../app/markerController.js";
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
import { Row } from "./Section.js";
import styles from "./Section.module.css";

const selectFps = (project: Project): Rational => project.settings.fps;
const selectFormat = (state: SessionState) => state.timecodeFormat;

/**
 * The Marker section (spec §11: label, color, frame), shown while a timeline marker is selected (a click
 * on it in the ruler). Each edit is one undo step; the time field takes a timecode (relative input as
 * in the toolbar field) in the preview's format.
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
    <>
      <Row label="Label">
        <TextField value={marker.label} onCommit={(text) => setMarkerFields(marker.id, { label: text })} ariaLabel="Marker label" maxLength={MAX_MARKER_LABEL} placeholder="No label" />
      </Row>
      <Row label="Color">
        <span className={styles.swatches} role="radiogroup" aria-label="Marker color">
          <Swatches swatches={labelSwatches(marker.color)} onPick={(color) => setMarkerFields(marker.id, { color: color as LabelColor })} />
        </span>
      </Row>
      <Row label="Time">
        <TextField value={formatTimecode(marker.frame, fps, mode)} onCommit={setTime} ariaLabel="Marker time" mono />
      </Row>
      <span />
      <span>
        <Button size="compact" commandId="marker.delete">
          Delete marker
        </Button>
      </span>
    </>
  );
}
