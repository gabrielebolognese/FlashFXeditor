import { CanvasHost } from "../app/CanvasHost.js";
import { PanelFrame, PanelTitle } from "../app/PanelFrame.js";
import styles from "./Well.module.css";
import { Placeholder } from "./Placeholder.js";

// TODO(batch 08): the WebGPU preview canvas mounts in the canvas host.
export function PreviewPanel() {
  return (
    <PanelFrame id="preview" header={<PanelTitle>Preview</PanelTitle>}>
      <div className={styles.well}>
        <CanvasHost panel="preview">
          <Placeholder name="Preview" detail="9:16 program monitor" />
        </CanvasHost>
      </div>
    </PanelFrame>
  );
}
