import { useMemo } from "react";
import { setLabelColor } from "../../app/cutController.js";
import { renameClips, retime } from "../../app/propertiesController.js";
import { actions, documentStore, sessionStore } from "../../app/services.js";
import { formatTimecode, frameToUs, parseTimecode, usToFrame } from "../../core/document/time.js";
import type { Clip, ClipId, LabelColor, Project, Rational } from "../../core/document/types.js";
import type { SessionState } from "../../core/store/sessionStore.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import { hasSourceRange, type ClipTimeField } from "../../timeline/edit/clipProps.js";
import { labelSwatches } from "../../timeline/menus/labelSwatches.js";
import { Swatches } from "../../ui/Swatches.js";
import { TextField } from "../../ui/TextField.js";
import { Toggle } from "../../ui/Toggle.js";
import { Row } from "./Section.js";
import styles from "./Section.module.css";
import { MIXED, NONE, SKIP, useClipsShared, type Shared } from "./useShared.js";

// The Clip section (spec §11): name, label color, enabled, and the start / end / duration timecodes
// (End is the exclusive end: Start + Duration) with the source in / out of video and audio clips.
// The time fields take a timecode in the preview's format (relative input as in the toolbar field) and
// trim without ripple (linked partners with them while Linked selection is on), clamped by the media
// and the neighbors. With several clips selected, values they do not share show `--` and an edit
// applies to every clip (each trimmed to the typed time).

const getName = (clip: Clip) => clip.name;
const getColor = (clip: Clip) => clip.color ?? null;
const getEnabled = (clip: Clip) => clip.enabled;
const getStart = (clip: Clip) => clip.start;
const getEnd = (clip: Clip) => clip.start + clip.duration;
const getDuration = (clip: Clip) => clip.duration;
const getSourceIn = (clip: Clip) => (hasSourceRange(clip) ? clip.in : SKIP);
const getSourceOut = (clip: Clip) => (hasSourceRange(clip) ? clip.out : SKIP);
const selectFps = (project: Project): Rational => project.settings.fps;
const selectFormat = (state: SessionState) => state.timecodeFormat;

interface TimeRowProps {
  label: string;
  field: ClipTimeField;
  ids: readonly ClipId[];
  value: Shared<number>;
  fps: Rational;
  mode: SessionState["timecodeFormat"];
}

/** A timecode field: frames, or source µs shown as the frame of media time at the project rate. */
function TimeRow({ label, field, ids, value, fps, mode }: TimeRowProps) {
  const source = field === "sourceIn" || field === "sourceOut";
  const frame = typeof value === "number" ? (source ? usToFrame(value, fps) : value) : null;
  const commit = (text: string) => {
    const typed = parseTimecode(text, fps, { mode, ...(frame !== null && { current: frame }) });
    if (typed !== null) retime(ids, field, source ? frameToUs(typed, fps) : typed);
  };
  return (
    <Row label={label}>
      <TextField value={frame === null ? "" : formatTimecode(frame, fps, mode)} placeholder={value === MIXED ? "--" : undefined} onCommit={commit} ariaLabel={`Clip ${label.toLowerCase()}`} mono />
    </Row>
  );
}

export function ClipSection({ ids }: { ids: readonly ClipId[] }) {
  const name = useClipsShared(ids, getName);
  const color = useClipsShared(ids, getColor);
  const enabled = useClipsShared(ids, getEnabled);
  const start = useClipsShared(ids, getStart);
  const end = useClipsShared(ids, getEnd);
  const duration = useClipsShared(ids, getDuration);
  const sourceIn = useClipsShared(ids, getSourceIn);
  const sourceOut = useClipsShared(ids, getSourceOut);
  const fps = useStoreSelector(documentStore, selectFps);
  const mode = useStoreSelector(sessionStore.state, selectFormat);
  // A clip's kind never changes: the clips with a source range are fixed for this selection.
  const sourceIds = useMemo(() => ids.filter((id) => {
    const clip = documentStore.getState().clips[id];
    return clip !== undefined && hasSourceRange(clip);
  }), [ids]);
  const current = typeof color === "string" ? (color as LabelColor) : null;
  const time = { fps, mode };
  return (
    <>
      <Row label="Name">
        <TextField value={typeof name === "string" ? name : ""} placeholder={name === MIXED ? "--" : undefined} onCommit={(text) => renameClips(ids, text)} ariaLabel="Clip name" />
      </Row>
      <Row label="Color">
        <span className={styles.swatches} role="radiogroup" aria-label="Clip label color">
          {/* The active swatch again removes the label (as in the clip menu). */}
          <Swatches swatches={labelSwatches(current, { removable: true })} onPick={(picked) => setLabelColor(picked === current ? null : (picked as LabelColor))} />
        </span>
      </Row>
      <Row label="Enabled">
        <span className={styles.switchCell}>
          {/* The Enable / Disable command (spec §6.16), so the tooltip shows its shortcut. */}
          <Toggle checked={enabled === true} mixed={enabled === MIXED} onChange={() => void actions.run("clip.toggleEnabled")} label="Clip enabled" commandId="clip.toggleEnabled" />
        </span>
      </Row>
      <TimeRow label="Start" field="start" ids={ids} value={start} {...time} />
      <TimeRow label="End" field="end" ids={ids} value={end} {...time} />
      <TimeRow label="Duration" field="duration" ids={ids} value={duration} {...time} />
      {sourceIn !== NONE && <TimeRow label="Source in" field="sourceIn" ids={sourceIds} value={sourceIn} {...time} />}
      {sourceOut !== NONE && <TimeRow label="Source out" field="sourceOut" ids={sourceIds} value={sourceOut} {...time} />}
    </>
  );
}
