import { Blend, Moon, Sun, Timer, type LucideIcon } from "lucide-react";
import { useCallback, useMemo } from "react";
import { documentStore, sessionStore } from "../../app/services.js";
import { alignedSides, alignmentOf, repeatedFrames, TRANSITION_LABELS, type TransitionAlignment } from "../../core/document/transitions.js";
import { TRANSITION_KINDS, type Project, type TransitionKind } from "../../core/document/types.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import { transitionAt, updateTransition, type Cut } from "../../timeline/edit/transitions.js";
import { IconButton } from "../../ui/IconButton.js";
import { NumberField, valueBinding } from "../../ui/NumberField.js";
import { Row } from "./Section.js";
import styles from "./Section.module.css";

// The Transition section (spec §11 "Transition (kind, duration, alignment)", Batch 36) of the selected
// transition: its kind (chips; an audio crossfade has no other kind), its length in frames (a scrub
// applies on release; the alignment stays, a one-sided split keeps its proportions) and where it sits
// on the cut (centered, starting at the cut, ending at it). Each edit is one command, the linked
// crossfade following with Linked selection on. A hint says when edge frames repeat (short handles).

const KIND_ICONS: Readonly<Record<TransitionKind, LucideIcon>> = { crossDissolve: Blend, dipToBlack: Moon, dipToWhite: Sun };
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
  if (!transition) return null;
  const alignment = alignmentOf(transition);
  const setKind = (kind: TransitionKind) => {
    const command = updateTransition(documentStore.getState(), cut, { kind }, { linked: linked() });
    if (command) documentStore.dispatch(command);
  };
  const align = (id: Exclude<TransitionAlignment, "custom">) => {
    const command = updateTransition(documentStore.getState(), cut, alignedSides(transition.before + transition.after, id), { linked: linked(), label: "Align transition" });
    if (command) documentStore.dispatch(command);
  };
  return (
    <>
      <Row label="Kind">
        <div className={styles.chips} role="group" aria-label="Transition kind">
          {audio ? (
            <IconButton icon={Blend} text="Crossfade" label="Audio crossfade (equal power)" pressed />
          ) : (
            TRANSITION_KINDS.map((kind) => <IconButton key={kind} icon={KIND_ICONS[kind]} text={TRANSITION_LABELS[kind]} label={TRANSITION_LABELS[kind]} pressed={transition.kind === kind} onClick={() => setKind(kind)} />)
          )}
        </div>
      </Row>
      <Row label="Duration">
        <NumberField label={<Timer aria-hidden="true" />} unit="f" binding={binding} precision={0} step={1} min={1} ariaLabel="Transition duration in frames" />
      </Row>
      {repeated > 0 && <span className={styles.hint}>{`Not enough media: ${repeated} ${repeated === 1 ? "frame repeats" : "frames repeat"} an edge frame`}</span>}
      <Row label="Alignment">
        <div className={styles.chips} role="group" aria-label="Transition alignment">
          {ALIGNMENTS.map((entry) => (
            <IconButton key={entry.id} text={entry.label} label={entry.tooltip} pressed={alignment === entry.id} onClick={() => align(entry.id)} />
          ))}
        </div>
      </Row>
    </>
  );
}
