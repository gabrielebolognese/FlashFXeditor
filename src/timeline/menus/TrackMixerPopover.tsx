import { useCallback, useLayoutEffect, useRef } from "react";
import { closeTrackMixer, setTrackMixValue, toggleTrackMixFlag, trackMixer } from "../../app/trackController.js";
import { documentStore, sessionStore, themeBridge } from "../../app/services.js";
import { timelineView } from "../../app/timelineController.js";
import { MAX_GAIN_DB, MIN_GAIN_DB } from "../../core/document/limits.js";
import type { Project, Track } from "../../core/document/types.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import { Toggle } from "../../ui/Toggle.js";
import { trackMix } from "../edit/mixer.js";
import styles from "./TrackMixerPopover.module.css";

// The track mixer (spec §21.21, Batch 77): a compact popover under an audio track's header with the gain
// fader (-60 to +12 dB), the pan (-1 to 1) and Mute and Solo. The faders are plain inputs written outside
// React (the readouts change by DOM writes) and apply live, coalescing into one undo step per drag
// (command `track.audio`); a double-click on a fader resets it. Escape, a click outside or a timeline
// scroll closes it.

const formatDb = (db: number) => (db <= MIN_GAIN_DB ? "-inf dB" : `${db > 0 ? "+" : ""}${db.toFixed(1)} dB`);
const formatPan = (pan: number) => (Math.abs(pan) < 0.005 ? "C" : `${pan < 0 ? "L" : "R"}${Math.round(Math.abs(pan) * 100)}`);

function Mixer({ trackId }: { trackId: string }) {
  const panel = useRef<HTMLDivElement>(null);
  const gainOut = useRef<HTMLSpanElement>(null);
  const panOut = useRef<HTMLSpanElement>(null);
  const selectTrack = useCallback((project: Project): Track | undefined => project.tracks.find((track) => track.id === trackId), [trackId]);
  const track = useStoreSelector(documentStore, selectTrack);
  const mix = track ? trackMix(track) : { gainDb: 0, pan: 0 };

  useLayoutEffect(() => {
    const element = panel.current;
    if (!element) return;
    const rect = timelineView.trackNameRect(trackId);
    if (!rect) {
      closeTrackMixer();
      return;
    }
    const { space } = themeBridge.theme;
    const hostWidth = element.parentElement?.clientWidth ?? 0;
    const width = element.offsetWidth;
    element.style.left = `${Math.max(space[1], Math.min(rect.x, hostWidth - width - space[1]))}px`;
    element.style.top = `${rect.y + rect.height + space[1]}px`;
    element.style.visibility = "visible";
    const onPointerDown = (event: PointerEvent) => {
      if (!element.contains(event.target as Node)) closeTrackMixer();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      closeTrackMixer();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    const stop = sessionStore.state.select((state) => state.timeline.scrollY, closeTrackMixer);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
      stop();
    };
  }, [trackId]);

  if (!track) return null;
  const onGain = (value: number) => {
    if (gainOut.current) gainOut.current.textContent = formatDb(value);
    setTrackMixValue(trackId, { gainDb: value });
  };
  const onPan = (value: number) => {
    if (panOut.current) panOut.current.textContent = formatPan(value);
    setTrackMixValue(trackId, { pan: value });
  };
  const reset = (field: "gain" | "pan", input: HTMLInputElement) => {
    input.value = "0";
    if (field === "gain") onGain(0);
    else onPan(0);
  };
  return (
    <div ref={panel} className={styles.popover} role="dialog" aria-label={`${track.name} mixer`} data-scope="dialog">
      <div className={styles.title}>{track.name}</div>
      <label className={styles.label} htmlFor="mixer-gain">
        Gain
      </label>
      <div className={styles.field}>
        <input
          id="mixer-gain"
          className={styles.slider}
          type="range"
          min={MIN_GAIN_DB}
          max={MAX_GAIN_DB}
          step={0.1}
          defaultValue={mix.gainDb}
          aria-label="Track gain in dB"
          onInput={(event) => onGain(Number(event.currentTarget.value))}
          onDoubleClick={(event) => reset("gain", event.currentTarget)}
        />
        <span ref={gainOut} className={styles.readout}>
          {formatDb(mix.gainDb)}
        </span>
      </div>
      <label className={styles.label} htmlFor="mixer-pan">
        Pan
      </label>
      <div className={styles.field}>
        <input
          id="mixer-pan"
          className={styles.slider}
          type="range"
          min={-1}
          max={1}
          step={0.01}
          defaultValue={mix.pan}
          aria-label="Track pan, -1 left to 1 right"
          onInput={(event) => onPan(Number(event.currentTarget.value))}
          onDoubleClick={(event) => reset("pan", event.currentTarget)}
        />
        <span ref={panOut} className={styles.readout}>
          {formatPan(mix.pan)}
        </span>
      </div>
      <span className={styles.label}>Mute</span>
      <span className={styles.switch}>
        <Toggle checked={track.muted} onChange={(value) => toggleTrackMixFlag(trackId, "muted", value)} label="Mute the track" />
      </span>
      <span className={styles.label}>Solo</span>
      <span className={styles.switch}>
        <Toggle checked={track.solo} onChange={(value) => toggleTrackMixFlag(trackId, "solo", value)} label="Solo the track" />
      </span>
    </div>
  );
}

/** Rendered by the timeline panel; shows the mixer only while one is open. */
export function TrackMixerPopover() {
  const trackId = useStoreSelector(trackMixer, (state) => state);
  return trackId !== null ? <Mixer key={trackId} trackId={trackId} /> : null;
}
