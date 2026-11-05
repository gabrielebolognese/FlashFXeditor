import { ChevronLeft, ChevronRight, Diamond, Timer } from "lucide-react";
import { useEffect, useRef, type MouseEvent } from "react";
import { easeAtPlayhead, setEaseAtPlayhead } from "../../app/keyframeController.js";
import { actions, documentStore, sessionStore } from "../../app/services.js";
import { KEYFRAME_SECTIONS, SECTION_LABELS, type KeyframeSection } from "../../core/document/keyframes.js";
import { type Clip, type ClipId } from "../../core/document/types.js";
import { keyable, keyCount, stopwatchOn } from "../../timeline/edit/keyframes.js";
import { IconButton } from "../../ui/IconButton.js";
import iconStyles from "../../ui/IconButton.module.css";
import { EasePopover } from "../../ui/easePopover/EasePopover.js";
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

// Selectors per section, made once so they stay stable for the store hook. A clip the section cannot
// key (an audio clip for Transform, a solid without a stroke for Stroke) is skipped.
const STOPWATCH = Object.fromEntries(KEYFRAME_SECTIONS.map((section) => [section, (clip: Clip) => (keyable(clip, section) ? stopwatchOn(clip, section) : SKIP)])) as Record<KeyframeSection, (clip: Clip) => boolean | typeof SKIP>;
const COUNT = Object.fromEntries(KEYFRAME_SECTIONS.map((section) => [section, (clip: Clip) => (keyable(clip, section) ? keyCount(clip, section) : SKIP)])) as Record<KeyframeSection, (clip: Clip) => number | typeof SKIP>;

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

/** The Ease row (spec §11 "ease selector for the keyframe at the playhead", §21.9 popover): disabled while the section is not animated. */
export function EaseRow({ ids, section }: { ids: readonly ClipId[]; section: KeyframeSection }) {
  const on = useStopwatch(ids, section);
  const animated = on === true || on === MIXED;
  return (
    <Row label="Ease">
      <span className={styles.easeCell}>
        <EasePopover
          label={animated ? "Ease of the keyframe at the playhead" : `Ease of the keyframe at the playhead: ${offReason(section)}`}
          disabled={!animated}
          current={() => easeAtPlayhead(section)}
          onChange={(ease, params) => setEaseAtPlayhead(section, ease, params)}
        >
          <EaseText ids={ids} section={section} />
        </EasePopover>
      </span>
    </Row>
  );
}

/**
 * The stopwatch row and the Ease row of a look section (Batch 61: anchor, size, crop, corners, fill,
 * stroke, shadow, text), placed in the section's body over its fields. Nothing shows when no selected
 * clip can key the section (a solid without a stroke has no Stroke stopwatch).
 */
export function KeyRows({ ids, section }: { ids: readonly ClipId[]; section: KeyframeSection }) {
  const on = useStopwatch(ids, section);
  if (on === NONE) return null;
  return (
    <>
      <Row label={`${SECTION_LABELS[section]} keys`}>
        <KeyframeControls ids={ids} section={section} />
      </Row>
      <EaseRow ids={ids} section={section} />
    </>
  );
}
