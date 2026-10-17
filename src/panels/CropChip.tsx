import { Check, Crop, RotateCcw } from "lucide-react";
import { cropMode } from "../app/previewController.js";
import { useStoreSelector } from "../core/store/useStoreSelector.js";
import type { CropModeState } from "../render/preview/cropGizmo.js";
import { IconButton } from "../ui/IconButton.js";
import styles from "./CropChip.module.css";

// The crop tool chip (Batch 26, spec §7.3 crop mode): floats at the top of the preview canvas while a
// layer is in crop mode, naming the mode, with Reset (the layer's crop) and Done (leaves crop mode, as
// Esc and a double-click on the layer do). It renders only when crop mode starts or ends, never during
// a handle drag (P1).

const selectOn = (state: CropModeState) => state.target !== null;

export function CropChip() {
  const on = useStoreSelector(cropMode, selectOn);
  if (!on) return null;
  return (
    <div className={styles.chip} role="toolbar" aria-label="Crop mode">
      <Crop className={styles.icon} aria-hidden="true" />
      <span className={styles.title}>Crop</span>
      <span className={styles.rule} aria-hidden="true" />
      <IconButton icon={RotateCcw} label="Reset crop" commandId="crop.reset" />
      <IconButton icon={Check} text="Done" label="Leave crop mode (Esc)" commandId="crop.toggleMode" />
    </div>
  );
}
