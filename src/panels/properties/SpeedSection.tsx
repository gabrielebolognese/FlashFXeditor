import { Gauge, Link2, Snowflake, Unlink2 } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { actions, documentStore, sessionStore } from "../../app/services.js";
import { applySpeed, applySpeedDuration, setSpeedRipple, speedFocus, speedOptions, toggleSpeedLink } from "../../app/speedController.js";
import { formatTimecode, parseTimecode } from "../../core/document/time.js";
import { isFreeze, type Clip, type ClipId, type Project, type Rational } from "../../core/document/types.js";
import type { SessionState } from "../../core/store/sessionStore.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import { MAX_SPEED, MIN_SPEED } from "../../timeline/edit/trim.js";
import { Button } from "../../ui/Button.js";
import { IconButton } from "../../ui/IconButton.js";
import { NumberField } from "../../ui/NumberField.js";
import { TextField } from "../../ui/TextField.js";
import { Toggle } from "../../ui/Toggle.js";
import { Row } from "./Section.js";
import styles from "./Section.module.css";
import { speedBinding, type SpeedBindingDeps } from "./speedBinding.js";
import { MIXED, useClipsShared } from "./useShared.js";

// The Speed section (spec §11, Batch 27) of the selected video and audio clips: the speed in % (25% to
// 400%, spec §14) with the duration link (Premiere's chain: linked, the duration follows the speed;
// unlinked, the duration stays and the source range follows), the duration as a timecode (linked, a
// rate stretch; unlinked or for a freeze frame, a trim of the out point), Ripple (later clips move with
// the change of duration; the options are for the session) and Freeze frame. The speed field is bound
// outside React (speedBinding.ts); a label scrub applies once on release. Keyframe timing follows a
// speed change (speed.ts: frames scaled, keys on one frame merged, Batch 35). Reverse is not built
// (spec §11 "if available").

const DEPS: SpeedBindingDeps = { document: documentStore, apply: applySpeed };

const getDuration = (clip: Clip) => clip.duration;
const getFrozen = (clip: Clip) => isFreeze(clip);
const selectFps = (project: Project): Rational => project.settings.fps;
const selectFormat = (state: SessionState) => state.timecodeFormat;
const selectOptions = (state: { link: boolean; ripple: boolean }) => state;

export function SpeedSection({ ids }: { ids: readonly ClipId[] }) {
  const { link, ripple } = useStoreSelector(speedOptions, selectOptions);
  const binding = useMemo(() => speedBinding(DEPS, ids), [ids]);
  const duration = useClipsShared(ids, getDuration);
  const frozen = useClipsShared(ids, getFrozen);
  const fps = useStoreSelector(documentStore, selectFps);
  const mode = useStoreSelector(sessionStore.state, selectFormat);
  const fieldRef = useRef<HTMLDivElement>(null);

  // "Speed..." in the clip menu: the field takes the focus once the menu has closed.
  useEffect(() => {
    const focus = () => {
      if (speedFocus.getState() === 0) return;
      speedFocus.set(0);
      requestAnimationFrame(() => {
        const input = fieldRef.current?.querySelector("input");
        input?.focus();
        input?.select();
      });
    };
    focus();
    return speedFocus.subscribe(focus);
  }, []);

  const frames = typeof duration === "number" ? duration : null;
  const commitDuration = (text: string) => {
    const typed = parseTimecode(text, fps, { mode, ...(frames !== null && { current: frames }) });
    if (typed !== null && typed > 0) applySpeedDuration(ids, typed);
  };
  return (
    <>
      <Row label="Speed">
        <div ref={fieldRef} className={styles.withAction}>
          <NumberField label={<Gauge aria-hidden="true" />} unit="%" binding={binding} precision={1} min={MIN_SPEED * 100} max={MAX_SPEED * 100} disabled={frozen === true} ariaLabel="Clip speed" />
          <IconButton icon={link ? Link2 : Unlink2} label={link ? "Unlink the duration from the speed" : "Link the duration to the speed"} pressed={link} onClick={toggleSpeedLink} />
        </div>
      </Row>
      {frozen === true && <span className={styles.hint}>Freeze frame: one picture held</span>}
      <Row label="Duration">
        <TextField value={frames === null ? "" : formatTimecode(frames, fps, mode)} placeholder={duration === MIXED ? "--" : undefined} onCommit={commitDuration} ariaLabel="Speed duration" mono />
      </Row>
      <Row label="Ripple">
        <span className={styles.switchCell}>
          <Toggle checked={ripple} onChange={setSpeedRipple} label="Move later clips with the duration" />
        </span>
      </Row>
      <Row label="">
        <div className={styles.textButtons}>
          <Button size="compact" icon={Snowflake} commandId="edit.freezeFrame" tooltip="Freeze the frame at the playhead for 2 s" onClick={() => void actions.run("edit.freezeFrame")}>
            Freeze frame
          </Button>
        </div>
      </Row>
    </>
  );
}
