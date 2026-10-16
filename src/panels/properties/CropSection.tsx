import { Crop as CropIcon, Frame, Link2, RotateCcw, Unlink2 } from "lucide-react";
import { useMemo } from "react";
import { liveEdit } from "../../app/liveEdit.js";
import { cropMode } from "../../app/previewController.js";
import { toggleCropLock } from "../../app/propertiesController.js";
import { actions, documentStore } from "../../app/services.js";
import type { ClipId } from "../../core/document/types.js";
import { createStore } from "../../core/store/createStore.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import type { CropModeState } from "../../render/preview/cropGizmo.js";
import { Button } from "../../ui/Button.js";
import { IconButton } from "../../ui/IconButton.js";
import { NumberField } from "../../ui/NumberField.js";
import { layerBinding, type BindingDeps } from "./bindings.js";
import { cropProp, type CropUnit } from "./layerProps.js";
import { Row } from "./Section.js";
import styles from "./Section.module.css";

// The Crop section (spec §11, Batch 26): the four crop edges of the selected video and image layers in
// media px or % of the media, the aspect lock (a locked edge keeps the visible aspect, the other axis
// follows around its center; the canvas crop handles use the same lock, Shift inverts it there), Crop
// to frame and Reset. Its header toggles crop mode on the canvas (§7.3) for a single layer. The fields
// are bound outside React (bindings.ts): a label scrub crops live with no React render and commits one
// undo step; a crop handle drag on the canvas shows in the fields as it runs (live crops).

const DEPS: BindingDeps = { document: documentStore, live: liveEdit };

/** The crop fields' units, for the session (not persisted): media px first. */
const cropUnits = createStore<CropUnit>("px");

const selectUnit = (unit: CropUnit) => unit;
const selectLock = (state: CropModeState) => state.aspectLock;
const selectTarget = (state: CropModeState) => state.target;

export function CropSection({ ids }: { ids: readonly ClipId[] }) {
  const unit = useStoreSelector(cropUnits, selectUnit);
  const lock = useStoreSelector(cropMode, selectLock);
  const bindings = useMemo(
    () => ({
      left: layerBinding(DEPS, cropProp("left", unit, lock), ids),
      top: layerBinding(DEPS, cropProp("top", unit, lock), ids),
      right: layerBinding(DEPS, cropProp("right", unit, lock), ids),
      bottom: layerBinding(DEPS, cropProp("bottom", unit, lock), ids),
    }),
    [ids, unit, lock],
  );
  const precision = unit === "%" ? 1 : 0;
  const max = unit === "%" ? 100 : undefined;
  return (
    <>
      <Row label="Left / Right">
        <div className={styles.pair}>
          <NumberField label="L" unit={unit} binding={bindings.left} precision={precision} min={0} max={max} ariaLabel="Crop left" />
          <NumberField label="R" unit={unit} binding={bindings.right} precision={precision} min={0} max={max} ariaLabel="Crop right" />
        </div>
      </Row>
      <Row label="Top / Bottom">
        <div className={styles.pair}>
          <NumberField label="T" unit={unit} binding={bindings.top} precision={precision} min={0} max={max} ariaLabel="Crop top" />
          <NumberField label="B" unit={unit} binding={bindings.bottom} precision={precision} min={0} max={max} ariaLabel="Crop bottom" />
        </div>
      </Row>
      <Row label="Units">
        <div className={styles.buttons}>
          <IconButton text="px" label="Crop in media pixels" pressed={unit === "px"} onClick={() => cropUnits.set("px")} />
          <IconButton text="%" label="Crop in percent of the media" pressed={unit === "%"} onClick={() => cropUnits.set("%")} />
        </div>
      </Row>
      <Row label="Aspect">
        <div className={styles.buttons}>
          <IconButton icon={lock ? Link2 : Unlink2} label={lock ? "Unlock the crop aspect" : "Lock the crop aspect"} pressed={lock} onClick={toggleCropLock} />
        </div>
      </Row>
      <Row label="">
        <div className={styles.textButtons}>
          <Button size="compact" icon={Frame} tooltip="Crop to the frame at the current transform" onClick={() => void actions.run("crop.toFrame")}>
            Crop to frame
          </Button>
          <Button size="compact" icon={RotateCcw} tooltip="Reset crop" onClick={() => void actions.run("crop.reset")}>
            Reset
          </Button>
        </div>
      </Row>
    </>
  );
}

/** The Crop section header's crop mode toggle (spec §7.3): for one video or image layer selected alone. */
export function CropModeToggle({ ids, single }: { ids: readonly ClipId[]; single: boolean }) {
  const target = useStoreSelector(cropMode, selectTarget);
  const on = target !== null && ids.includes(target);
  return (
    <IconButton
      icon={CropIcon}
      label={single ? (on ? "Leave crop mode (Esc)" : "Crop on the canvas (or double-click the layer)") : "Crop on the canvas: select one layer"}
      pressed={on}
      disabled={!single}
      onClick={() => void actions.run("crop.toggleMode")}
    />
  );
}
