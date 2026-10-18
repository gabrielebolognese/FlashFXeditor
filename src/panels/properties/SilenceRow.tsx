import { useLayoutEffect, useMemo, useRef } from "react";
import { bindSilenceStatus, bindThresholdSlider, SILENCE_FIELDS, silenceFieldBinding } from "../../app/silenceController.js";
import { Button } from "../../ui/Button.js";
import { NumberField } from "../../ui/NumberField.js";
import { useFocusReturn } from "./focusReturn.js";
import styles from "./SilenceRow.module.css";

// Remove silence's parameter row (spec §14, Batch 38), under the quick actions while it is open: the
// threshold slider with its dB readout, the minimum silence and the padding in ms, the count of the
// silences found, Cancel and Apply. Rendered once when it opens: the slider, the fields and the count
// are bound outside React (silenceController.ts), so dragging and scrubbing them render nothing (P1).
// Closed from inside (Cancel, Apply, Esc), it gives the focus back to the quick row's Remove silence.

const opener = ({ panel }: { panel: Element | null }) => panel?.querySelector('[data-command="audio.removeSilence"]');

export function SilenceRow() {
  const row = useRef<HTMLDivElement>(null);
  useFocusReturn(row, opener);
  const slider = useRef<HTMLInputElement>(null);
  const readout = useRef<HTMLSpanElement>(null);
  const count = useRef<HTMLSpanElement>(null);
  const bindings = useMemo(() => ({ min: silenceFieldBinding("silenceMinMs"), padding: silenceFieldBinding("silencePaddingMs") }), []);
  useLayoutEffect(() => {
    const input = slider.current;
    const text = readout.current;
    const status = count.current;
    if (!input || !text || !status) return undefined;
    const stops = [bindThresholdSlider(input, text), bindSilenceStatus(status)];
    return () => {
      for (const stop of stops) stop();
    };
  }, []);
  const { silenceMinMs: min, silencePaddingMs: padding } = SILENCE_FIELDS;
  return (
    <div ref={row} className={styles.row} role="group" aria-label="Remove silence">
      <span className={styles.title}>Remove silence</span>
      <span className={styles.label}>Threshold</span>
      <span className={styles.threshold} data-tooltip="Sound quieter than this counts as silence">
        <input ref={slider} type="range" className={styles.slider} aria-label="Silence threshold" />
        <span ref={readout} className={styles.readout} aria-hidden="true" />
      </span>
      <span className={styles.label}>Silence</span>
      <div className={styles.pair}>
        <NumberField label="Min" unit="ms" binding={bindings.min} precision={0} step={10} min={min.min} max={min.max} ariaLabel="Minimum silence in milliseconds" />
        <NumberField label="Pad" unit="ms" binding={bindings.padding} precision={0} step={10} min={padding.min} max={padding.max} ariaLabel="Padding kept around speech in milliseconds" />
      </div>
      <div className={styles.footer}>
        <span ref={count} className={styles.count} aria-live="polite" />
        <Button size="compact" commandId="audio.removeSilence.cancel">
          Cancel
        </Button>
        <Button size="compact" variant="primary" tooltip="Cut the hatched silences out and close the gaps (one undo step)" commandId="audio.removeSilence.apply">
          Apply
        </Button>
      </div>
    </div>
  );
}
