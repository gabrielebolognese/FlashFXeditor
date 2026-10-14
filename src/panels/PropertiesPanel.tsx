import { PanelFrame, PanelTitle } from "../app/PanelFrame.js";
import { Placeholder } from "./Placeholder.js";

// TODO(batch 25): properties framework and sections for the current selection.
export function PropertiesPanel() {
  return (
    <PanelFrame id="properties" header={<PanelTitle>Edit Properties</PanelTitle>}>
      <Placeholder name="Edit Properties" detail="Selection context; nothing selected shows project settings" />
    </PanelFrame>
  );
}
