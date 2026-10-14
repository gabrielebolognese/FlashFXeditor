import { PanelFrame, PanelTitle } from "../app/PanelFrame.js";
import { sessionStore } from "../app/services.js";
import type { Selection } from "../core/store/selection.js";
import { useStoreSelector } from "../core/store/useStoreSelector.js";
import { Placeholder } from "./Placeholder.js";
import { ProjectSection } from "./properties/ProjectSection.js";
import styles from "./PropertiesPanel.module.css";

const selectNothingSelected = (selection: Selection) => selection.kind === "none";

// TODO(batch 25): properties framework and the sections for clips, tracks and cues.
export function PropertiesPanel() {
  const nothingSelected = useStoreSelector(sessionStore.selection, selectNothingSelected);
  return (
    <PanelFrame id="properties" header={<PanelTitle>Edit Properties</PanelTitle>}>
      <div className={styles.scroll}>{nothingSelected ? <ProjectSection /> : <Placeholder name="Edit Properties" detail="Selection properties arrive with the properties framework" />}</div>
    </PanelFrame>
  );
}
