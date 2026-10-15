import { PanelFrame, PanelTitle } from "../app/PanelFrame.js";
import { sessionStore } from "../app/services.js";
import type { Selection } from "../core/store/selection.js";
import { useStoreSelector } from "../core/store/useStoreSelector.js";
import { Placeholder } from "./Placeholder.js";
import { MarkerSection } from "./properties/MarkerSection.js";
import { ProjectSection } from "./properties/ProjectSection.js";
import { TrackSection } from "./properties/TrackSection.js";
import styles from "./PropertiesPanel.module.css";

const selectKind = (selection: Selection) => selection.kind;

// The panel shows sections by selection kind (spec §11): the project with nothing selected, the
// track section for a track selection (Batch 16), the marker section for a selected marker (Batch 19;
// a marker selection excludes the others).
// TODO(batch 25): properties framework and the sections for clips and cues.
export function PropertiesPanel() {
  const kind = useStoreSelector(sessionStore.selection, selectKind);
  const markerId = useStoreSelector(sessionStore.marker, (id) => id);
  return (
    <PanelFrame id="properties" header={<PanelTitle>Edit Properties</PanelTitle>}>
      <div className={styles.scroll}>
        {markerId !== null ? (
          <MarkerSection key={markerId} markerId={markerId} />
        ) : kind === "none" ? (
          <ProjectSection />
        ) : kind === "track" ? (
          <TrackSection />
        ) : (
          <Placeholder name="Edit Properties" detail="Selection properties arrive with the properties framework" />
        )}
      </div>
    </PanelFrame>
  );
}
