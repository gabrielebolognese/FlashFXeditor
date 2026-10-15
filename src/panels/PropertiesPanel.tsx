import { PanelFrame, PanelTitle } from "../app/PanelFrame.js";
import { sessionStore } from "../app/services.js";
import type { Selection } from "../core/store/selection.js";
import { useStoreSelector } from "../core/store/useStoreSelector.js";
import { Placeholder } from "./Placeholder.js";
import { ProjectSection } from "./properties/ProjectSection.js";
import { TrackSection } from "./properties/TrackSection.js";
import styles from "./PropertiesPanel.module.css";

const selectKind = (selection: Selection) => selection.kind;

// The panel shows sections by selection kind (spec §11): the project with nothing selected, the
// track section for a track selection (Batch 16).
// TODO(batch 25): properties framework and the sections for clips and cues.
export function PropertiesPanel() {
  const kind = useStoreSelector(sessionStore.selection, selectKind);
  return (
    <PanelFrame id="properties" header={<PanelTitle>Edit Properties</PanelTitle>}>
      <div className={styles.scroll}>
        {kind === "none" ? <ProjectSection /> : kind === "track" ? <TrackSection /> : <Placeholder name="Edit Properties" detail="Selection properties arrive with the properties framework" />}
      </div>
    </PanelFrame>
  );
}
