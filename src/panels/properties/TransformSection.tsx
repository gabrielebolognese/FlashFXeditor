import { Droplet, EyeOff, FlipHorizontal2, FlipVertical2, Layers, Link2, Navigation, Rotate3d, RotateCw, Spline, Unlink2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { liveEdit } from "../../app/liveEdit.js";
import { changeParent, smoothPath, toggleAutoOrient, toggleMotionPath } from "../../app/propertiesController.js";
import { documentStore, sessionStore } from "../../app/services.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import type { Clip, ClipId, Project } from "../../core/document/types.js";
import { onMotionPath, parentCandidates } from "../../timeline/edit/rig.js";
import { depthSortOf } from "../../timeline/edit/depth.js";
import { isLayerClip, isTransformClip, scaleYOf } from "../../timeline/edit/transform.js";
import { Select } from "../../ui/Select.js";
import { IconButton } from "../../ui/IconButton.js";
import { NumberField } from "../../ui/NumberField.js";
import { layerBinding, type BindingDeps } from "./bindings.js";
import { EaseRow, KeyRows } from "./KeyframeControls.js";
import { ANCHOR_X, ANCHOR_Y, DEPTH, MAX_SCALE_PERCENT, MIN_SCALE_PERCENT, OPACITY, POSITION_X, POSITION_Y, ROTATION, ROTATION_X, ROTATION_Y, scaleProp } from "./layerProps.js";
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
// The 2.5D rows (spec §21.15, Batch 70): Rotation X / Y, Depth (z), Hide back side, and for compound
// clips Depth sort (their inner layers drawn by z instead of track order).

// Keyed clips show and take their values at the playhead (spec §11 stopwatch, Batch 35).
const DEPS: BindingDeps = {
  document: documentStore,
  live: liveEdit,
  playhead: { get: () => sessionStore.state.getState().playhead, subscribe: (listener) => sessionStore.state.select((state) => state.playhead, listener) },
};

const getParent = (clip: Clip) => (isTransformClip(clip) ? (clip.parentId ?? "") : SKIP);
const getMotionPath = (clip: Clip) => (isTransformClip(clip) ? onMotionPath(clip) : SKIP);
const getAutoOrient = (clip: Clip) => (isTransformClip(clip) ? clip.autoOrient === true : SKIP);
const NO_PARENT = "";

/** The clips every one of `ids` may follow, as JSON text (a primitive, so the selector is cheap). */
function candidateLines(project: Project, ids: readonly ClipId[]): string {
  let common: Clip[] | null = null;
  for (const id of ids) {
    if (!project.clips[id]) continue;
    const mine = parentCandidates(project, id);
    common = common === null ? mine : common.filter((clip) => mine.some((other) => other.id === clip.id));
  }
  return JSON.stringify((common ?? []).map((clip) => ({ value: clip.id, label: clip.name ?? clip.kind })));
}

/** Parent, Motion path and Auto-orient (Batch 69): what a layer follows and how its position moves. */
function RigRows({ ids }: { ids: readonly ClipId[] }) {
  const parent = useClipsShared(ids, getParent);
  const onPath = useClipsShared(ids, getMotionPath);
  const orient = useClipsShared(ids, getAutoOrient);
  const lines = useStoreSelector(documentStore, useCallback((project: Project) => candidateLines(project, ids), [ids]));
  const options = useMemo(() => {
    const list: { value: string; label: string }[] = JSON.parse(lines) as { value: string; label: string }[];
    return [{ value: NO_PARENT, label: "None" }, ...list];
  }, [lines]);
  const value = typeof parent === "string" && options.some((option) => option.value === parent) ? parent : NO_PARENT;
  return (
    <>
      <Row label="Parent">
        <Select label="Parent" value={value} options={options} onChange={(next) => changeParent(next === NO_PARENT ? null : next)} />
      </Row>
      <Row label="Motion path">
        <div className={styles.buttons}>
          <IconButton control icon={Spline} label={onPath === true ? "Back to X and Y keys" : "Move along a path"} pressed={onPath === true} onClick={toggleMotionPath} />
          <IconButton control icon={Navigation} label="Auto-orient" pressed={orient === true} onClick={toggleAutoOrient} />
          <IconButton commandId="clip.smoothPath" label="Smooth path" icon={Spline} disabled={onPath !== true} onClick={smoothPath} />
        </div>
      </Row>
    </>
  );
}

const getBackface = (clip: Clip) => (isTransformClip(clip) ? clip.backfaceHidden === true : SKIP);

/** Hide back side, and Depth sort for compounds (spec §21.15). */
function DepthRows({ ids }: { ids: readonly ClipId[] }) {
  const backface = useClipsShared(ids, getBackface);
  const depthSort = useStoreSelector(documentStore, useCallback((project: Project) => depthSortOf(project, ids), [ids]));
  return (
    <>
      <Row label="Back side">
        <div className={styles.buttons}>
          <IconButton icon={EyeOff} label="Hide back side" commandId="clip.backface" pressed={backface === true} />
          <IconButton icon={Rotate3d} label="Reset 3D rotation" commandId="transform.reset3d" />
        </div>
      </Row>
      {depthSort !== null && (
        <Row label="Depth sort">
          <div className={styles.buttons}>
            <IconButton icon={Layers} label="Sort inner layers by depth" commandId="compound.depthSort" pressed={depthSort} />
          </div>
        </Row>
      )}
    </>
  );
}

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
      rotationX: layerBinding(DEPS, ROTATION_X, ids),
      rotationY: layerBinding(DEPS, ROTATION_Y, ids),
      z: layerBinding(DEPS, DEPTH, ids),
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
      <Row label="3D rotation">
        <div className={styles.pair}>
          <NumberField label="X" unit="°" binding={bindings.rotationX} precision={1} ariaLabel="Rotation X" />
          <NumberField label="Y" unit="°" binding={bindings.rotationY} precision={1} ariaLabel="Rotation Y" />
        </div>
      </Row>
      <Row label="Depth">
        <NumberField label="Z" unit="px" binding={bindings.z} precision={1} ariaLabel="Depth" />
      </Row>
      <Row label="Anchor">
        <div className={styles.pair}>
          <NumberField label="X" unit="%" binding={bindings.anchorX} precision={1} ariaLabel="Anchor X" />
          <NumberField label="Y" unit="%" binding={bindings.anchorY} precision={1} ariaLabel="Anchor Y" />
        </div>
      </Row>
      <KeyRows ids={ids} section="anchor" />
      <DepthRows ids={ids} />
      <RigRows ids={ids} />
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
