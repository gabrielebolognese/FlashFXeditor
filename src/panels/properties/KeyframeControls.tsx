import { ChevronLeft, ChevronRight, Diamond, Timer } from "lucide-react";
import { useEffect, useRef, type MouseEvent } from "react";
import { setEaseAtPlayhead } from "../../app/keyframeController.js";
import { actions, documentStore, sessionStore } from "../../app/services.js";
import { EASE_LABELS, SECTION_LABELS, type KeyframeSection } from "../../core/document/keyframes.js";
import { EASE_IDS, type Clip, type ClipId, type EaseId } from "../../core/document/types.js";
import { keyCount, stopwatchOn } from "../../timeline/edit/keyframes.js";
import { IconButton } from "../../ui/IconButton.js";
import iconStyles from "../../ui/IconButton.module.css";
import { MenuButton } from "../../ui/MenuButton.js";
import { bindEaseLabel, bindKeyButton, keyStateAt, type KeyBindingDeps } from "./keyframeBinding.js";
import { Row } from "./Section.js";
import styles from "./KeyframeControls.module.css";
import { MIXED, NONE, SKIP, useClipsShared } from "./useShared.js";

// The keyframe controls of an animatable section (spec §11; Batch 35): in the section header, the
// navigator (previous key, add / remove at the playhead, next key), the key count and the stopwatch
// (gold while the section is animated); in the section body, the Ease of the keys at the playhead.
// The navigator, the count and the Ease work while the stopwatch is on; off, they are disabled, never
// hidden (spec §17, Batch 46), so turning it on moves nothing. The stopwatch and the count follow the
// document through narrow selectors (a render when they change); the add / remove state and the Ease
// text follow the playhead through direct DOM writes (keyframeBinding.ts, P1).

const DEPS: KeyBindingDeps = {
  document: documentStore,
  playhead: { get: () => sessionStore.state.getState().playhead, subscribe: (listener) => sessionStore.state.select((state) => state.playhead, listener) },
};

const keepFocus = (event: MouseEvent) => event.preventDefault();

const STOPWATCH: Record<KeyframeSection, (clip: Clip) => boolean | typeof SKIP> = {
  transform: (clip) => ("transform" in clip ? stopwatchOn(clip, "transform") : SKIP),
  opacity: (clip) => ("opacity" in clip ? stopwatchOn(clip, "opacity") : SKIP),
  volume: (clip) => ("volume" in clip ? stopwatchOn(clip, "volume") : SKIP),
};

const COUNT: Record<KeyframeSection, (clip: Clip) => number | typeof SKIP> = {
  transform: (clip) => ("transform" in clip ? keyCount(clip, "transform") : SKIP),
  opacity: (clip) => ("opacity" in clip ? keyCount(clip, "opacity") : SKIP),
  volume: (clip) => ("volume" in clip ? keyCount(clip, "volume") : SKIP),
};

/** Whether the section is animated on every target (true), on none (false), or on some (mixed). */
export function useStopwatch(ids: readonly ClipId[], section: KeyframeSection): boolean | typeof MIXED | typeof NONE {
  return useClipsShared(ids, STOPWATCH[section]);
}

/** Why the navigator and the Ease are disabled while the stopwatch is off. */
const offReason = (section: KeyframeSection) => `turn on the ${SECTION_LABELS[section].toLowerCase()} stopwatch first`;

/** The add / remove button: its pressed state and name follow the playhead outside React. */
function KeyButton({ ids, section, disabled }: { ids: readonly ClipId[]; section: KeyframeSection; disabled: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const button = ref.current;
    return button ? bindKeyButton(button, DEPS, ids, section) : undefined;
  }, [ids, section]);
  // Each paint matches the state at that time (the binding keeps it so between renders, which happen
  // only when the stopwatch or the count change).
  const onKey = keyStateAt(documentStore.getState(), ids, section, sessionStore.state.getState().playhead).onKey;
  const label = onKey ? "Remove keyframe" : "Add keyframe";
  return (
    <button
      ref={ref}
      type="button"
      className={iconStyles.button}
      data-size="compact"
      aria-label={label}
      aria-pressed={onKey}
      // aria-disabled, not disabled: the button keeps its focus and its tooltip. (Off, no key is at the
      // playhead, so the binding never rewrites this tooltip.)
      aria-disabled={disabled || undefined}
      data-tooltip={disabled ? `${label}: ${offReason(section)}` : label}
      data-command={`keyframes.toggle.${section}`}
      onMouseDown={keepFocus}
      onClick={disabled ? undefined : () => actions.run(`keyframes.toggle.${section}`)}
    >
      <Diamond className={iconStyles.icon} aria-hidden="true" />
    </button>
  );
}

/** The key count badge: a fixed width for 3 digits, `--` when the targets have different counts. */
function KeyCount({ count, off }: { count: number | typeof MIXED | typeof NONE; off: boolean }) {
  const text = typeof count === "number" ? String(count) : "--";
  const tooltip = typeof count === "number" ? `${count} ${count === 1 ? "keyframe" : "keyframes"}` : "The selected clips have different numbers of keyframes";
  return (
    <span className={styles.count} role="img" aria-label={tooltip} data-tooltip={tooltip} data-off={off || undefined}>
      {text}
    </span>
  );
}

/** The header part: previous / add-remove / next and the key count (disabled while the stopwatch is off), then the stopwatch. */
export function KeyframeControls({ ids, section }: { ids: readonly ClipId[]; section: KeyframeSection }) {
  const on = useStopwatch(ids, section);
  const count = useClipsShared(ids, COUNT[section]);
  if (on === NONE) return null;
  const name = SECTION_LABELS[section].toLowerCase();
  const animated = on === true || on === MIXED;
  const off = animated ? "" : `: ${offReason(section)}`;
  return (
    <span className={styles.controls}>
      {/* Disabled, never hidden (spec §17): the header keeps its layout as the stopwatch turns on. */}
      <IconButton icon={ChevronLeft} label={`Previous keyframe${off}`} commandId={`keyframes.prev.${section}`} disabled={!animated} onClick={() => actions.run(`keyframes.prev.${section}`)} />
      <KeyButton ids={ids} section={section} disabled={!animated} />
      <IconButton icon={ChevronRight} label={`Next keyframe${off}`} commandId={`keyframes.next.${section}`} disabled={!animated} onClick={() => actions.run(`keyframes.next.${section}`)} />
      <KeyCount count={count} off={!animated} />
      <IconButton
        icon={Timer}
        label={on === true ? `Stop animating ${name} (removes its keyframes)` : `Animate ${name}`}
        commandId={`keyframes.stopwatch.${section}`}
        pressed={on === true}
        onClick={() => actions.run(`keyframes.stopwatch.${section}`)}
      />
    </span>
  );
}

/** The Ease dropdown's text, written by its subscription (P1). */
function EaseText({ ids, section }: { ids: readonly ClipId[]; section: KeyframeSection }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const text = ref.current;
    return text ? bindEaseLabel(text, DEPS, ids, section) : undefined;
  }, [ids, section]);
  return <span ref={ref} className={styles.ease} />;
}

/** The Ease row (spec §11 "ease selector for the keyframe at the playhead"): disabled while the section is not animated. */
export function EaseRow({ ids, section }: { ids: readonly ClipId[]; section: KeyframeSection }) {
  const on = useStopwatch(ids, section);
  const animated = on === true || on === MIXED;
  const entries = () => {
    const state = keyStateAt(documentStore.getState(), ids, section, sessionStore.state.getState().playhead);
    return EASE_IDS.map((ease) => ({ kind: "item" as const, id: ease, label: EASE_LABELS[ease], active: state.ease === ease, disabled: !state.onKey }));
  };
  return (
    <Row label="Ease">
      <span className={styles.easeCell}>
        <MenuButton
          label={animated ? "Ease of the keyframe at the playhead" : `Ease of the keyframe at the playhead: ${offReason(section)}`}
          values
          disabled={!animated}
          entries={entries}
          onSelect={(id) => setEaseAtPlayhead(section, id as EaseId)}
        >
          <EaseText ids={ids} section={section} />
        </MenuButton>
      </span>
    </Row>
  );
}
