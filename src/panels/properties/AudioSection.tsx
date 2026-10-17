import { AudioLines, ChevronsDown, TrendingDown, TrendingUp, Unlink2, Volume2 } from "lucide-react";
import { useMemo } from "react";
import { actions, documentStore, sessionStore } from "../../app/services.js";
import type { Clip, ClipId } from "../../core/document/types.js";
import { MAX_GAIN_DB, MIN_GAIN_DB } from "../../timeline/edit/volume.js";
import { Button } from "../../ui/Button.js";
import { NumberField } from "../../ui/NumberField.js";
import { Toggle } from "../../ui/Toggle.js";
import { fadeBinding, gainBinding, type AudioBindingDeps } from "./audioBinding.js";
import { EaseRow } from "./KeyframeControls.js";
import { Row } from "./Section.js";
import styles from "./Section.module.css";
import { MIXED, SKIP, useClipsShared } from "./useShared.js";

// The Audio section (spec §11, Batch 37) of the selected audio clips and the audio linked to the selected
// video clips: the gain in dB (-60 to +12, spec §14) with the Volume stopwatch in the header (keys at the
// playhead, the Ease row first while keyed: the same keys the rubber band shows), Mute, the fades in
// frames, and the one-click actions Normalize (peak to -1 dBFS), Auto-duck music (dips under the audio
// on the tracks above) and Detach audio (a video's sound becomes its own clip). The fields are bound
// outside React (audioBinding.ts): a label scrub applies once on release.

const DEPS: AudioBindingDeps = {
  document: documentStore,
  playhead: { get: () => sessionStore.state.getState().playhead, subscribe: (listener) => sessionStore.state.select((state) => state.playhead, listener) },
};

const getMuted = (clip: Clip) => (clip.kind === "audio" ? clip.volume.muted : SKIP);

const run = (id: string) => void actions.run(id);

export function AudioSection({ ids, detach }: { ids: readonly ClipId[]; detach: readonly ClipId[] }) {
  const bindings = useMemo(() => ({ gain: gainBinding(DEPS, ids), fadeIn: fadeBinding(DEPS, ids, "in"), fadeOut: fadeBinding(DEPS, ids, "out") }), [ids]);
  const muted = useClipsShared(ids, getMuted);
  const audio = ids.length > 0;
  return (
    <>
      {audio && <EaseRow ids={ids} section="volume" />}
      {audio && (
        <Row label="Volume">
          <NumberField label={<Volume2 aria-hidden="true" />} unit="dB" binding={bindings.gain} precision={1} min={MIN_GAIN_DB} max={MAX_GAIN_DB} ariaLabel="Clip volume" />
        </Row>
      )}
      {audio && (
        <Row label="Mute">
          <span className={styles.switchCell}>
            <Toggle checked={muted === true} mixed={muted === MIXED} onChange={() => run("clip.mute")} label="Mute the clip's sound" />
          </span>
        </Row>
      )}
      {audio && (
        <Row label="Fades">
          <div className={styles.pair}>
            <NumberField label={<TrendingUp aria-hidden="true" />} unit="f" binding={bindings.fadeIn} precision={0} step={1} min={0} ariaLabel="Audio fade in in frames" />
            <NumberField label={<TrendingDown aria-hidden="true" />} unit="f" binding={bindings.fadeOut} precision={0} step={1} min={0} ariaLabel="Audio fade out in frames" />
          </div>
        </Row>
      )}
      <Row label="Actions">
        <div className={styles.textButtons}>
          {audio && (
            <Button size="compact" icon={AudioLines} tooltip="Normalize: set the gain so the clip's loudest point is -1 dBFS" onClick={() => run("audio.normalize")}>
              Normalize
            </Button>
          )}
          {audio && (
            <Button size="compact" icon={ChevronsDown} tooltip="Auto-duck music: lower this clip by 12 dB wherever audio plays on the tracks above it" onClick={() => run("audio.autoDuck")}>
              Auto-duck
            </Button>
          )}
          {detach.length > 0 && (
            <Button size="compact" icon={Unlink2} tooltip="Detach audio: the video's sound becomes a clip of its own" onClick={() => run("audio.detach")}>
              Detach audio
            </Button>
          )}
        </div>
      </Row>
    </>
  );
}
