import { ChevronLeft, ChevronRight, Diamond, Timer } from "lucide-react";
import { useEffect, useMemo, useRef, type MouseEvent } from "react";
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
// stopwatch (gold while the section is animated) and, while it is on, the navigator (previous key,
// add / remove at the playhead, next key) and the key count; in the section body, the Ease of the keys
// at the playhead. The stopwatch and the count follow the document through narrow selectors (a render
// when they change); the add / remove state and the Ease text follow the playhead through direct DOM
// writes (keyframeBinding.ts, P1).

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

/** The add / remove button: its pressed state and name follow the playhead outside React. */
function KeyButton({ ids, section }: { ids: readonly ClipId[]; section: KeyframeSection }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const button = ref.current;
    return button ? bindKeyButton(button, DEPS, ids, section) : undefined;
  }, [ids, section]);
  // The first paint matches the state (the binding keeps it so).
  const initial = useMemo(() => keyStateAt(documentStore.getState(), ids, section, sessionStore.state.getState().playhead).onKey, [ids, section]);
  const label = initial ? "Remove keyframe" : "Add keyframe";
  return (
    <button
      ref={ref}
      type="button"
      className={iconStyles.button}
      data-size="compact"
      aria-label={label}
      aria-pressed={initial}
      data-tooltip={label}
      data-command={`keyframes.toggle.${section}`}
      onMouseDown={keepFocus}
      onClick={() => actions.run(`keyframes.toggle.${section}`)}
    >
      <Diamond className={iconStyles.icon} aria-hidden="true" />
    </button>
  );
}

/** The header part: stopwatch, then (animated) previous / add-remove / next and the key count. */
export function KeyframeControls({ ids, section }: { ids: readonly ClipId[]; section: KeyframeSection }) {
  const on = useStopwatch(ids, section);
  const count = useClipsShared(ids, COUNT[section]);
  if (on === NONE) return null;
  const name = SECTION_LABELS[section].toLowerCase();
  const animated = on === true || on === MIXED;
  return (
    <span className={styles.controls}>
      {animated && (
        <>
          <IconButton icon={ChevronLeft} label="Previous keyframe" commandId={`keyframes.prev.${section}`} onClick={() => actions.run(`keyframes.prev.${section}`)} />
          <KeyButton ids={ids} section={section} />
          <IconButton icon={ChevronRight} label="Next keyframe" commandId={`keyframes.next.${section}`} onClick={() => actions.run(`keyframes.next.${section}`)} />
          {typeof count === "number" && (
            <span className={styles.count} aria-label={`${count} ${count === 1 ? "keyframe" : "keyframes"}`}>
              {count}
            </span>
          )}
        </>
      )}
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

/** The Ease row (spec §11 "ease selector for the keyframe at the playhead"), shown while the section is animated. */
export function EaseRow({ ids, section }: { ids: readonly ClipId[]; section: KeyframeSection }) {
  const on = useStopwatch(ids, section);
  if (on !== true && on !== MIXED) return null;
  const entries = () => {
    const state = keyStateAt(documentStore.getState(), ids, section, sessionStore.state.getState().playhead);
    return EASE_IDS.map((ease) => ({ kind: "item" as const, id: ease, label: EASE_LABELS[ease], active: state.ease === ease, disabled: !state.onKey }));
  };
  return (
    <Row label="Ease">
      <span className={styles.easeCell}>
        <MenuButton label="Ease of the keyframe at the playhead" values entries={entries} onSelect={(id) => setEaseAtPlayhead(section, id as EaseId)}>
          <EaseText ids={ids} section={section} />
        </MenuButton>
      </span>
    </Row>
  );
}
