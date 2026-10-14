import { CanvasHost } from "../app/CanvasHost.js";
import { PanelFrame } from "../app/PanelFrame.js";
import { TimelineToolbar } from "../timeline/toolbar/TimelineToolbar.js";
import styles from "./Well.module.css";
import { Placeholder } from "./Placeholder.js";

// The toolbar strip is the panel's header. TODO(batch 07): the timeline canvases mount in the canvas host.
export function TimelinePanel() {
  return (
    <PanelFrame id="timeline" header={<TimelineToolbar />}>
      <div className={styles.well}>
        <CanvasHost panel="timeline">
          <Placeholder name="Timeline" detail="Track headers, ruler, tracks" />
        </CanvasHost>
      </div>
    </PanelFrame>
  );
}
