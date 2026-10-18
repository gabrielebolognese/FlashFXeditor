import { Clapperboard, Import, Type } from "lucide-react";
import { useEffect, useRef } from "react";
import { CanvasHost } from "../app/CanvasHost.js";
import { PanelFrame } from "../app/PanelFrame.js";
import { documentStore } from "../app/services.js";
import { timelineDev, timelineView } from "../app/timelineController.js";
import { useStoreSelector } from "../core/store/useStoreSelector.js";
import { ClipRenameField } from "../timeline/menus/ClipRenameField.js";
import { MarkerPopover } from "../timeline/menus/MarkerPopover.js";
import { TimelineContextMenu } from "../timeline/menus/TimelineContextMenu.js";
import { TrackRenameField } from "../timeline/menus/TrackRenameField.js";
import { TimelineToolbar } from "../timeline/toolbar/TimelineToolbar.js";
import { Button } from "../ui/Button.js";
import { EmptyState } from "../ui/EmptyState.js";
import styles from "./TimelinePanel.module.css";
import wellStyles from "./Well.module.css";

const selectStats = (state: { stats: boolean }) => state.stats;
const selectEmpty = (project: { clips: Readonly<Record<string, unknown>> }) => Object.keys(project.clips).length === 0;

/**
 * No clips yet (Batch 46): a hint over the track area with the actions that fill it. Pointer events go
 * through to the canvas (drops, the marquee), its buttons aside; it renders only when the timeline turns
 * empty or stops being empty, never during a gesture (P1).
 */
function EmptyTimeline() {
  return (
    <div className={styles.empty}>
      <EmptyState icon={Clapperboard} title="No clips yet" text="Drag media here from the Media panel or from your files, or add a title." passThrough>
        <Button variant="primary" icon={Import} commandId="media.import">
          Import media
        </Button>
        <Button icon={Type} commandId="add.title">
          Add title
        </Button>
      </EmptyState>
    </div>
  );
}

/** Dev stats text, written by the timeline view after each draw. */
function StatsOverlay() {
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    timelineView.attachStats(ref.current);
    return () => timelineView.attachStats(null);
  }, []);
  return <pre ref={ref} className={styles.stats} aria-label="Timeline stats" />;
}

/**
 * The toolbar strip is the panel's header; the two timeline canvases mount once in the canvas host,
 * with the inline clip and track rename fields and the marker editor over them; the context menus
 * float above everything.
 */
export function TimelinePanel() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const stats = useStoreSelector(timelineDev, selectStats);
  const empty = useStoreSelector(documentStore, selectEmpty);
  useEffect(() => {
    const host = canvasRef.current;
    return host ? timelineView.mount(host) : undefined;
  }, []);
  return (
    <PanelFrame id="timeline" header={<TimelineToolbar />}>
      <div className={wellStyles.well}>
        <CanvasHost panel="timeline">
          <div ref={canvasRef} className={styles.canvas} />
          <ClipRenameField />
          <TrackRenameField />
          <MarkerPopover />
          {empty && <EmptyTimeline />}
          {stats && <StatsOverlay />}
        </CanvasHost>
      </div>
      <TimelineContextMenu />
    </PanelFrame>
  );
}
