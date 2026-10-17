import { Droplet, FlipHorizontal2, FlipVertical2, Link2, RotateCw, Unlink2 } from "lucide-react";
import { useMemo, useState } from "react";
import { liveEdit } from "../../app/liveEdit.js";
import { documentStore, sessionStore } from "../../app/services.js";
import type { Clip, ClipId } from "../../core/document/types.js";
import { isLayerClip, scaleYOf } from "../../timeline/edit/transform.js";
import { IconButton } from "../../ui/IconButton.js";
import { NumberField } from "../../ui/NumberField.js";
import { layerBinding, type BindingDeps } from "./bindings.js";
import { EaseRow } from "./KeyframeControls.js";
import { ANCHOR_X, ANCHOR_Y, MAX_SCALE_PERCENT, MIN_SCALE_PERCENT, OPACITY, POSITION_X, POSITION_Y, ROTATION, scaleProp } from "./layerProps.js";
import { Row } from "./Section.js";
import styles from "./Section.module.css";
import { SKIP, useClipsShared } from "./useShared.js";

// The Transform and Opacity sections (spec §11): position (project px from the frame center), scale
// W / H in % with the aspect lock, rotation in degrees, anchor in % of the layer (moving it keeps the
// picture in place), the flips; opacity in %. Every number field is bound to one property of the
// selected layers outside React (bindings.ts): a label scrub moves the layers live with no React render
// and commits one undo step on release; arrow steps coalesce; with several layers selected a field
// whose values differ shows `--`, typing sets them all and a scrub or a step moves each from its own.
// With the section's stopwatch on (Batch 35) the fields show and key the values at the playhead, and
// an Ease row comes first (the keyframe controls are in the header, KeyframeControls.tsx).

// Keyed clips show and take their values at the playhead (spec §11 stopwatch, Batch 35).
const DEPS: BindingDeps = {
  document: documentStore,
  live: liveEdit,
  playhead: { get: () => sessionStore.state.getState().playhead, subscribe: (listener) => sessionStore.state.select((state) => state.playhead, listener) },
};

const getFlipH = (clip: Clip) => (isLayerClip(clip) ? clip.transform.flipH : SKIP);
const getFlipV = (clip: Clip) => (isLayerClip(clip) ? clip.transform.flipV : SKIP);

/** The scale lock starts closed unless a selected layer is scaled unevenly (its own aspect then shows). */
function uniform(ids: readonly ClipId[]): boolean {
  const project = documentStore.getState();
  return ids.every((id) => {
    const clip = project.clips[id];
    return !clip || !isLayerClip(clip) || scaleYOf(clip.transform) === clip.transform.scale;
  });
}

export function TransformSection({ ids }: { ids: readonly ClipId[] }) {
  const [locked, setLocked] = useState(() => uniform(ids));
  const bindings = useMemo(
    () => ({
      x: layerBinding(DEPS, POSITION_X, ids),
      y: layerBinding(DEPS, POSITION_Y, ids),
      rotation: layerBinding(DEPS, ROTATION, ids),
      anchorX: layerBinding(DEPS, ANCHOR_X, ids),
      anchorY: layerBinding(DEPS, ANCHOR_Y, ids),
    }),
    [ids],
  );
  const scale = useMemo(() => ({ x: layerBinding(DEPS, scaleProp("x", locked), ids), y: layerBinding(DEPS, scaleProp("y", locked), ids) }), [ids, locked]);
  const flipH = useClipsShared(ids, getFlipH);
  const flipV = useClipsShared(ids, getFlipV);
  return (
    <>
      <EaseRow ids={ids} section="transform" />
      <Row label="Position">
        <div className={styles.pair}>
          <NumberField label="X" unit="px" binding={bindings.x} precision={1} ariaLabel="Position X" />
          <NumberField label="Y" unit="px" binding={bindings.y} precision={1} ariaLabel="Position Y" />
        </div>
      </Row>
      <Row label="Scale">
        <div className={styles.locked}>
          <NumberField label="W" unit="%" binding={scale.x} precision={1} min={MIN_SCALE_PERCENT} max={MAX_SCALE_PERCENT} ariaLabel="Scale width" />
          <IconButton control icon={locked ? Link2 : Unlink2} label={locked ? "Unlock the aspect" : "Lock the aspect"} pressed={locked} onClick={() => setLocked((current) => !current)} />
          <NumberField label="H" unit="%" binding={scale.y} precision={1} min={MIN_SCALE_PERCENT} max={MAX_SCALE_PERCENT} ariaLabel="Scale height" />
        </div>
      </Row>
      <Row label="Rotation">
        <NumberField label={<RotateCw aria-hidden="true" />} unit="°" binding={bindings.rotation} precision={1} ariaLabel="Rotation" />
      </Row>
      <Row label="Anchor">
        <div className={styles.pair}>
          <NumberField label="X" unit="%" binding={bindings.anchorX} precision={1} ariaLabel="Anchor X" />
          <NumberField label="Y" unit="%" binding={bindings.anchorY} precision={1} ariaLabel="Anchor Y" />
        </div>
      </Row>
      <Row label="Flip">
        <div className={styles.buttons}>
          <IconButton icon={FlipHorizontal2} label="Flip horizontal" commandId="transform.flipH" pressed={flipH === true} />
          <IconButton icon={FlipVertical2} label="Flip vertical" commandId="transform.flipV" pressed={flipV === true} />
        </div>
      </Row>
    </>
  );
}

export function OpacitySection({ ids }: { ids: readonly ClipId[] }) {
  const binding = useMemo(() => layerBinding(DEPS, OPACITY, ids), [ids]);
  return (
    <>
      <EaseRow ids={ids} section="opacity" />
      <Row label="Opacity">
        <NumberField label={<Droplet aria-hidden="true" />} unit="%" binding={binding} precision={1} min={0} max={100} ariaLabel="Opacity" />
      </Row>
    </>
  );
}
