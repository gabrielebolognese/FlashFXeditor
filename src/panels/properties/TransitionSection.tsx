import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Blend, Timer, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { documentStore, sessionStore, themeBridge } from "../../app/services.js";
import { hoverAlignment } from "../../app/transitionPreview.js";
import { EASE_LABELS } from "../../core/document/keyframes.js";
import { alignedSides, alignmentOf, HAS_ANGLE, HAS_CENTER, HAS_DIRECTION, HAS_SOFTNESS, repeatedFrames, TRANSITION_GROUPS, TRANSITION_LABELS, type TransitionAlignment } from "../../core/document/transitions.js";
import { EASE_IDS, type EaseId, type Project, type Transition, type TransitionDirection, type TransitionKind } from "../../core/document/types.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import { transitionAt, updateTransition, type Cut, type TransitionParams } from "../../timeline/edit/transitions.js";
import { IconButton } from "../../ui/IconButton.js";
import { NumberField, valueBinding } from "../../ui/NumberField.js";
import { Select } from "../../ui/Select.js";
import { drawTransitionSample } from "./transitionSample.js";
import { TRANSITION_ICONS } from "./transitionIcons.js";
import { Row } from "./Section.js";
import styles from "./Section.module.css";

// The Transition section (spec §11 "Transition (kind, duration, alignment)", Batch 36) of the selected
// transition: its kind (chips; an audio crossfade has no other kind), its length in frames (a scrub
// applies on release; the alignment stays, a one-sided split keeps its proportions) and where it sits
// on the cut (centered, starting at the cut, ending at it). Each edit is one command, the linked
// crossfade following with Linked selection on. A hint says when edge frames repeat (short handles).

const DIRECTIONS: readonly { id: TransitionDirection; label: string; icon: LucideIcon }[] = [
  { id: "left", label: "Left", icon: ArrowLeft },
  { id: "right", label: "Right", icon: ArrowRight },
  { id: "up", label: "Up", icon: ArrowUp },
  { id: "down", label: "Down", icon: ArrowDown },
];
const EASE_OPTIONS: readonly { value: EaseId | "mix"; label: string }[] = [{ value: "mix", label: "Linear mix" }, ...EASE_IDS.filter((id) => id !== "linear" && id !== "bezier" && id !== "spring").map((id) => ({ value: id, label: EASE_LABELS[id] }))];

/**
 * The preview row (always there, so no row moves): the current kind at its midpoint, animating the
 * hovered chip kind while the pointer rests on it (one rAF loop, only while hovering).
 */
function SamplePreview({ kind, hovered }: { kind: TransitionKind; hovered: TransitionKind | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const shown = hovered ?? kind;
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const box = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(box.width * dpr));
    canvas.height = Math.max(1, Math.round(box.height * dpr));
    const color = themeBridge.theme.color;
    const colors = { from: color.surface5, to: color.accent, dark: color.bgSunken, light: color.textPrimary };
    const draw = (t: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, box.width, box.height);
      drawTransitionSample(ctx, shown, t, box.width, box.height, colors);
    };
    if (hovered === null) {
      draw(0.5);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      draw(((now - start) % 1200) / 1200);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [shown, hovered]);
  return <canvas ref={ref} className={styles.transitionSample} aria-hidden="true" />;
}
const ALIGNMENTS: readonly { id: Exclude<TransitionAlignment, "custom">; label: string; tooltip: string }[] = [
  { id: "center", label: "Center", tooltip: "Center on the cut" },
  { id: "start", label: "Start", tooltip: "Start at the cut" },
  { id: "end", label: "End", tooltip: "End at the cut" },
];

const linked = () => sessionStore.state.getState().linkedSelection;

/** The sides of a `length`-frame transition keeping how the current one sits on its cut. */
function sidesFor(current: { before: number; after: number }, length: number): { before: number; after: number } {
  const alignment = alignmentOf(current);
  if (alignment !== "custom") return alignedSides(length, alignment);
  const before = Math.round((length * current.before) / (current.before + current.after));
  return { before, after: length - before };
}

export function TransitionSection({ cut }: { cut: Cut }) {
  const select = useCallback((project: Project) => transitionAt(project, cut), [cut]);
  const transition = useStoreSelector(documentStore, select);
  const audio = useStoreSelector(documentStore, (project: Project) => project.clips[cut.left]?.kind === "audio");
  const repeated = useStoreSelector(documentStore, (project: Project) => {
    const left = project.clips[cut.left];
    const right = project.clips[cut.right];
    const current = transitionAt(project, cut);
    if (!left || !right || !current) return 0;
    const frames = repeatedFrames(project, left, right, current);
    return frames.before + frames.after;
  });
  const [hovered, setHovered] = useState<TransitionKind | null>(null);
  const paramBinding = useCallback(
    (read: (transition: Transition) => number, write: (value: number) => TransitionParams) =>
      valueBinding(
        {
          read: () => {
            const current = transitionAt(documentStore.getState(), cut);
            return current ? read(current) : null;
          },
          subscribe: (listener) => documentStore.subscribe(() => listener(), { affects: ["clips"] }),
        },
        (value) => {
          const command = updateTransition(documentStore.getState(), cut, write(value), { linked: linked() });
          if (command) documentStore.dispatch(command);
        },
      ),
    [cut],
  );
  const angleBinding = useMemo(() => paramBinding((t) => t.angle ?? 0, (value) => ({ angle: value })), [paramBinding]);
  const softnessBinding = useMemo(() => paramBinding((t) => Math.round((t.softness ?? 0) * 100), (value) => ({ softness: value / 100 })), [paramBinding]);
  const centerXBinding = useMemo(() => paramBinding((t) => Math.round((t.center?.x ?? 0.5) * 100), (value) => ({ center: { x: value / 100, y: transitionAt(documentStore.getState(), cut)?.center?.y ?? 0.5 } })), [paramBinding, cut]);
  const centerYBinding = useMemo(() => paramBinding((t) => Math.round((t.center?.y ?? 0.5) * 100), (value) => ({ center: { x: transitionAt(documentStore.getState(), cut)?.center?.x ?? 0.5, y: value / 100 } })), [paramBinding, cut]);
  const binding = useMemo(
    () =>
      valueBinding(
        {
          read: () => {
            const current = transitionAt(documentStore.getState(), cut);
            return current ? current.before + current.after : null;
          },
          subscribe: (listener) => documentStore.subscribe(() => listener(), { affects: ["clips"] }),
        },
        (value) => {
          const current = transitionAt(documentStore.getState(), cut);
          if (!current) return;
          const command = updateTransition(documentStore.getState(), cut, sidesFor(current, Math.max(1, Math.round(value))), { linked: linked() });
          if (command) documentStore.dispatch(command);
        },
      ),
    [cut],
  );
  // The section going away (another selection) ends a split it started.
  useEffect(() => () => hoverAlignment(null), []);
  if (!transition) return null;
  const alignment = alignmentOf(transition);
  const hint = repeated > 0 ? `Not enough media: ${repeated} ${repeated === 1 ? "frame repeats" : "frames repeat"} an edge frame` : "";
  const setParams = (patch: TransitionParams) => {
    const command = updateTransition(documentStore.getState(), cut, patch, { linked: linked() });
    if (command) documentStore.dispatch(command);
  };
  const setKind = (kind: TransitionKind) => {
    const command = updateTransition(documentStore.getState(), cut, { kind }, { linked: linked() });
    if (command) documentStore.dispatch(command);
  };
  const previewChoice = (group: HTMLElement, target: EventTarget) => {
    const button = target instanceof Element ? target.closest("button") : null;
    const entry = button ? ALIGNMENTS[[...group.children].indexOf(button)] : undefined;
    hoverAlignment(entry ? { cut, alignment: entry.id } : null);
  };
  const align = (id: Exclude<TransitionAlignment, "custom">) => {
    const command = updateTransition(documentStore.getState(), cut, alignedSides(transition.before + transition.after, id), { linked: linked(), label: "Align transition" });
    if (command) documentStore.dispatch(command);
  };
  return (
    <>
      <Row label="Kind">
        <div className={styles.chips} role="group" aria-label="Transition kind">
          {audio && <IconButton control icon={Blend} text="Crossfade" label="Audio crossfade (equal power)" pressed />}
        </div>
      </Row>
      {!audio &&
        TRANSITION_GROUPS.map((group) => (
          <Row key={group.label} label={group.label}>
            <div className={styles.chips} role="group" aria-label={`${group.label} transitions`} onPointerLeave={() => setHovered(null)} onBlur={() => setHovered(null)}>
              {group.kinds.map((kind) => (
                <span key={kind} onPointerEnter={() => setHovered(kind)} onFocus={() => setHovered(kind)}>
                  <IconButton control icon={TRANSITION_ICONS[kind]} text={TRANSITION_LABELS[kind]} label={TRANSITION_LABELS[kind]} pressed={transition.kind === kind} onClick={() => setKind(kind)} />
                </span>
              ))}
            </div>
          </Row>
        ))}
      {!audio && (
        <Row label="Preview">
          <SamplePreview kind={transition.kind} hovered={hovered} />
        </Row>
      )}
      {!audio && HAS_DIRECTION.has(transition.kind) && (
        <Row label="Direction">
          <div className={styles.chips} role="group" aria-label="Transition direction">
            {DIRECTIONS.map((entry) => (
              <IconButton control key={entry.id} icon={entry.icon} label={`Travel ${entry.label.toLowerCase()}`} pressed={(transition.direction ?? "left") === entry.id} onClick={() => setParams({ direction: entry.id })} />
            ))}
          </div>
        </Row>
      )}
      {!audio && HAS_ANGLE.has(transition.kind) && (
        <Row label="Angle">
          <NumberField label="∠" unit="°" binding={angleBinding} precision={0} step={5} ariaLabel="Wipe angle in degrees" />
        </Row>
      )}
      {!audio && HAS_SOFTNESS.has(transition.kind) && (
        <Row label="Softness">
          <NumberField unit="%" binding={softnessBinding} precision={0} step={5} min={0} max={100} ariaLabel="Edge softness in percent" />
        </Row>
      )}
      {!audio && HAS_CENTER.has(transition.kind) && (
        <Row label="Center">
          <NumberField label="X" unit="%" binding={centerXBinding} precision={0} step={5} ariaLabel="Iris center x in percent" />
          <NumberField label="Y" unit="%" binding={centerYBinding} precision={0} step={5} ariaLabel="Iris center y in percent" />
        </Row>
      )}
      {!audio && (
        <Row label="Easing">
          <Select label="Transition easing" value={transition.ease ?? "mix"} options={EASE_OPTIONS} onChange={(value) => setParams({ ease: value === "mix" ? null : value })} />
        </Row>
      )}
      <Row label="Duration">
        <NumberField label={<Timer aria-hidden="true" />} unit="f" binding={binding} precision={0} step={1} min={1} ariaLabel="Transition duration in frames" />
      </Row>
      {/* Always there, one line tall: only its text changes with the duration (no row moves, spec §17). */}
      <span className={`${styles.hint} ${styles.hintLine}`} data-tooltip={hint || undefined}>
        {hint}
      </span>
      <Row label="Alignment">
        <div
          className={styles.chips}
          role="group"
          aria-label="Transition alignment"
          // Resting on a choice (pointer or keyboard focus) splits the preview at the transition's first and
          // last frames as that alignment places it (Batch 46); nothing changes until it is clicked.
          onPointerOver={(event) => previewChoice(event.currentTarget, event.target)}
          onPointerLeave={() => hoverAlignment(null)}
          onFocus={(event) => previewChoice(event.currentTarget, event.target)}
          onBlur={() => hoverAlignment(null)}
        >
          {ALIGNMENTS.map((entry) => (
            <IconButton control key={entry.id} text={entry.label} label={entry.tooltip} pressed={alignment === entry.id} onClick={() => align(entry.id)} />
          ))}
        </div>
      </Row>
    </>
  );
}
