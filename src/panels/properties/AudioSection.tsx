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
// playhead, the Ease row first, live while keyed: the same keys the rubber band shows), Mute, the fades
// in frames, and the one-click actions Normalize (peak to -1 dBFS), Auto-duck music (dips under the audio
// on the tracks above) and Detach audio (a video's sound becomes its own clip). Every row is always there,
// disabled with the reason in its tooltip when the selection cannot take it (spec §17: a video whose
// sound has no clip yet shows Detach audio live and the rest off). The fields are bound outside React
// (audioBinding.ts): a label scrub applies once on release.

const DEPS: AudioBindingDeps = {
  document: documentStore,
  playhead: { get: () => sessionStore.state.getState().playhead, subscribe: (listener) => sessionStore.state.select((state) => state.playhead, listener) },
};

const getMuted = (clip: Clip) => (clip.kind === "audio" ? clip.volume.muted : SKIP);

const run = (id: string) => void actions.run(id);

/** Why the rows that edit audio clips are off: the selection has a video whose sound is not a clip yet. */
const NO_AUDIO = "detach the video's audio first (it has no audio clip yet)";

export function AudioSection({ ids, detach }: { ids: readonly ClipId[]; detach: readonly ClipId[] }) {
  const bindings = useMemo(() => ({ gain: gainBinding(DEPS, ids), fadeIn: fadeBinding(DEPS, ids, "in"), fadeOut: fadeBinding(DEPS, ids, "out") }), [ids]);
  const muted = useClipsShared(ids, getMuted);
  const audio = ids.length > 0;
  const canDetach = detach.length > 0;
  // Disabled, never hidden (spec §17): the rows keep their place whatever the selection can take.
  return (
    <>
      <EaseRow ids={ids} section="volume" />
      <Row label="Volume">
        <NumberField label={<Volume2 aria-hidden="true" />} unit="dB" binding={bindings.gain} precision={1} min={MIN_GAIN_DB} max={MAX_GAIN_DB} disabled={!audio} ariaLabel="Clip volume" />
      </Row>
      <Row label="Mute">
        <span className={styles.switchCell}>
          <Toggle
            checked={muted === true}
            mixed={muted === MIXED}
            onChange={() => run("clip.mute")}
            label="Mute the clip's sound"
            tooltip={audio ? undefined : `Mute: ${NO_AUDIO}`}
            commandId="clip.mute"
            disabled={!audio}
          />
        </span>
      </Row>
      <Row label="Fades">
        <div className={styles.pair}>
          <NumberField label={<TrendingUp aria-hidden="true" />} unit="f" binding={bindings.fadeIn} precision={0} step={1} min={0} disabled={!audio} ariaLabel="Audio fade in in frames" />
          <NumberField label={<TrendingDown aria-hidden="true" />} unit="f" binding={bindings.fadeOut} precision={0} step={1} min={0} disabled={!audio} ariaLabel="Audio fade out in frames" />
        </div>
      </Row>
      <Row label="Actions">
        <div className={styles.textButtons}>
          <Button
            size="compact"
            icon={AudioLines}
            tooltip={audio ? "Normalize: set the gain so the clip's loudest point is -1 dBFS" : `Normalize: ${NO_AUDIO}`}
            commandId="audio.normalize"
            disabled={!audio}
          >
            Normalize
          </Button>
          <Button
            size="compact"
            icon={ChevronsDown}
            tooltip={audio ? "Auto-duck music: lower this clip by 12 dB wherever audio plays on the tracks above it" : `Auto-duck music: ${NO_AUDIO}`}
            commandId="audio.autoDuck"
            disabled={!audio}
          >
            Auto-duck
          </Button>
          <Button
            size="compact"
            icon={Unlink2}
            tooltip={canDetach ? "Detach audio: the video's sound becomes a clip of its own" : "Detach audio: select an unlocked video clip with sound"}
            commandId="audio.detach"
            disabled={!canDetach}
          >
            Detach audio
          </Button>
        </div>
      </Row>
    </>
  );
}
